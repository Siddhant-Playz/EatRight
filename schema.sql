PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL UNIQUE,
    name       TEXT,
    pw_hash    BLOB NOT NULL,
    salt       BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    age       INTEGER NOT NULL CHECK (age BETWEEN 13 AND 100),
    sex       TEXT NOT NULL,
    height_cm REAL NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
    weight_kg REAL NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
    activity  INTEGER NOT NULL CHECK (activity BETWEEN 1 AND 4),
    place     TEXT NOT NULL CHECK (place IN ('home', 'gym'))
);

-- diet: 0 vegan, 1 vegetarian, 2 vegetarian + eggs, 3 non-vegetarian
CREATE TABLE IF NOT EXISTS plans (
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    diet         TEXT,
    other_avoid  TEXT NOT NULL DEFAULT '',
    body         TEXT,
    goal         TEXT,
    current_day  INTEGER NOT NULL DEFAULT 1 CHECK (current_day BETWEEN 1 AND 30)
);

CREATE TABLE IF NOT EXISTS user_allergies (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    allergen TEXT NOT NULL,
    PRIMARY KEY (user_id, allergen)
);

-- Legacy 30-day progress table kept temporarily for compatibility with older data.
CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     INTEGER NOT NULL CHECK (day BETWEEN 1 AND 30),
    slot    INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 5),
    PRIMARY KEY (user_id, day, slot)
);

/* ---------- subscription foundation ---------- */
CREATE TABLE IF NOT EXISTS subscription_plans (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    price        REAL,
    currency     TEXT NOT NULL DEFAULT 'INR',
    is_trial     INTEGER NOT NULL DEFAULT 0 CHECK (is_trial IN (0,1)),
    active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id          INTEGER NOT NULL REFERENCES subscription_plans(id),
    status           TEXT NOT NULL CHECK (status IN ('trial','active','pending','expired','cancelled')),
    starts_at        TEXT NOT NULL,
    ends_at          TEXT NOT NULL,
    trial            INTEGER NOT NULL DEFAULT 0 CHECK (trial IN (0,1)),
    payment_status   TEXT NOT NULL DEFAULT 'not_required' CHECK (payment_status IN ('not_required','pending','paid','failed','refunded')),
    payment_provider TEXT,
    payment_reference TEXT,
    created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_dates ON subscriptions(status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS payments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id   INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount            REAL NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'INR',
    status            TEXT NOT NULL CHECK (status IN ('pending','paid','failed','refunded')),
    provider          TEXT,
    provider_reference TEXT,
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

/* Date-based progress replaces the old 1-30-day progress model. */
CREATE TABLE IF NOT EXISTS daily_progress (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    progress_date TEXT NOT NULL,
    slot        INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 5),
    completed   INTEGER NOT NULL DEFAULT 1 CHECK (completed IN (0,1)),
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, progress_date, slot)
);

CREATE INDEX IF NOT EXISTS idx_daily_progress_user_date ON daily_progress(user_id, progress_date);

/* ---------- seed subscription products ---------- */
INSERT OR IGNORE INTO subscription_plans (name, duration_days, price, currency, is_trial, active)
VALUES ('Free Trial', 3, NULL, 'INR', 1, 1);

INSERT OR IGNORE INTO subscription_plans (name, duration_days, price, currency, is_trial, active)
VALUES ('30 Days', 30, NULL, 'INR', 0, 1);

INSERT OR IGNORE INTO subscription_plans (name, duration_days, price, currency, is_trial, active)
VALUES ('90 Days', 90, NULL, 'INR', 0, 1);

INSERT OR IGNORE INTO subscription_plans (name, duration_days, price, currency, is_trial, active)
VALUES ('365 Days', 365, NULL, 'INR', 0, 1);
/* ---------- EatRight meal ordering ---------- */
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Meal',
  price_paise INTEGER NOT NULL CHECK(price_paise >= 0),
  calories INTEGER NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  vegetarian INTEGER NOT NULL DEFAULT 1 CHECK(vegetarian IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'placed' CHECK(status IN ('placed','confirmed','preparing','ready_for_pickup','out_for_delivery','delivered','cancelled')),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cod','online')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','failed','refunded')),
  subtotal_paise INTEGER NOT NULL,
  delivery_fee_paise INTEGER NOT NULL,
  total_paise INTEGER NOT NULL,
  address TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 30)
);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
