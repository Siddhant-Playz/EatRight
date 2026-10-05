const express = require("express");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const engine = require("./meal-engine");

const app = express();
/* DB_PATH lets a host keep the database on a persistent volume (e.g. DB_PATH=/data/stride.db). */
const DB_FILE = process.env.DB_PATH || path.join(__dirname, "stride.db");
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);

app.use(express.json({ limit: "1mb" }));
/* SECURITY: never serve the database or server-side files to browsers. */
app.use((req, res, next) => {
  const blocked = /\.(db|sqlite|sqlite3|sql|db-wal|db-shm)$|^\/(server\.js|meal-engine\.js|test-engine\.js|package(-lock)?\.json)$|^\/(node_modules|menu)(\/|$)/i;
  if (blocked.test(decodeURIComponent(req.path))) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(__dirname));

/* ---------- database ---------- */
const schema = fs.readFileSync(
  path.join(__dirname, "schema.sql"),
  "utf8"
);

db.exec(schema);

/* Repair legacy orders table whose CHECK constraint contains a typo.
   Build a replacement table without renaming the original, so order_items
   keeps its foreign-key target (orders). Existing order data is preserved. */
function migrateOrderStatusConstraint() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get();
  if (!row || !row.sql.includes("ready_for_ pickup")) return;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE orders_repaired (
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
      )`);
      db.exec(`INSERT INTO orders_repaired
        (id,order_code,user_id,status,payment_method,payment_status,subtotal_paise,delivery_fee_paise,total_paise,address,customer_phone,notes,created_at)
        SELECT id,order_code,user_id,
          CASE WHEN status='ready_for_ pickup' THEN 'ready_for_pickup' ELSE status END,
          payment_method,payment_status,subtotal_paise,delivery_fee_paise,total_paise,address,customer_phone,notes,created_at
        FROM orders`);
      db.exec("DROP TABLE orders");
      db.exec("ALTER TABLE orders_repaired RENAME TO orders");
      db.exec("CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC)");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
migrateOrderStatusConstraint();

/* ---------- migration: account ban support ---------- */
function migrateUserBanColumns() {
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!cols.includes("banned")) db.exec("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0");
  if (!cols.includes("banned_at")) db.exec("ALTER TABLE users ADD COLUMN banned_at TEXT");
  if (!cols.includes("ban_reason")) db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''");
}
migrateUserBanColumns();

/* ---------- migration: allow the values the front end sends ---------- */
function tableSql(name) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return row ? row.sql : "";
}
function rebuildTable(name, createSql) {
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`ALTER TABLE ${name} RENAME TO ${name}_old`);
      db.exec(createSql);
      db.exec(`INSERT INTO ${name} SELECT * FROM ${name}_old`);
      db.exec(`DROP TABLE ${name}_old`);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
try {
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes("name")) db.exec("ALTER TABLE users ADD COLUMN name TEXT");

  if (tableSql("plans").includes("'slim'")) {
    rebuildTable("plans", `
      CREATE TABLE plans (
        user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        diet        TEXT,
        other_avoid TEXT NOT NULL DEFAULT '',
        body        TEXT,
        goal        TEXT,
        current_day INTEGER NOT NULL DEFAULT 1 CHECK (current_day BETWEEN 1 AND 30)
      )`);
  }
  if (tableSql("profiles").includes("BETWEEN 16 AND 75")) {
    rebuildTable("profiles", `
      CREATE TABLE profiles (
        user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        name      TEXT NOT NULL,
        age       INTEGER NOT NULL CHECK (age BETWEEN 13 AND 100),
        sex       TEXT NOT NULL,
        height_cm REAL NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
        weight_kg REAL NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
        activity  INTEGER NOT NULL CHECK (activity BETWEEN 1 AND 4),
        place     TEXT NOT NULL CHECK (place IN ('home', 'gym'))
      )`);
  }
} catch (error) {
  console.error("MIGRATION ERROR:", error);
}



/* ---------- subscription plan migration ---------- */

try {
  db.transaction(() => {

    // 1. Migrate the existing 90-day plan.
    // Rename only if the target name does not already exist.
    db.prepare(`
      UPDATE subscription_plans
      SET name = 'Family Plan — 4 People'
      WHERE duration_days = 90
        AND is_trial = 0
        AND NOT EXISTS (
          SELECT 1
          FROM subscription_plans
          WHERE name = 'Family Plan — 4 People'
        )
    `).run();

    // 2. Update trial duration without risking duplicate names.
    db.prepare(`
      UPDATE subscription_plans
      SET duration_days = 3
      WHERE is_trial = 1
    `).run();

    // Rename the trial only if the target name is available.
    db.prepare(`
      UPDATE subscription_plans
      SET name = '3-Day Trial'
      WHERE is_trial = 1
        AND name != '3-Day Trial'
        AND NOT EXISTS (
          SELECT 1
          FROM subscription_plans
          WHERE name = '3-Day Trial'
        )
    `).run();

    // If a correctly named trial already exists,
    // deactivate any duplicate trial offers.
    db.prepare(`
      UPDATE subscription_plans
      SET active = 0
      WHERE is_trial = 1
        AND name != '3-Day Trial'
        AND EXISTS (
          SELECT 1
          FROM subscription_plans
          WHERE name = '3-Day Trial'
            AND is_trial = 1
        )
    `).run();

    // 3. Migrate the 30-day plan safely.
    db.prepare(`
      UPDATE subscription_plans
      SET name = 'EatRight Plus',
          duration_days = 30
      WHERE duration_days = 30
        AND is_trial = 0
        AND name != 'EatRight Plus'
        AND NOT EXISTS (
          SELECT 1
          FROM subscription_plans
          WHERE name = 'EatRight Plus'
        )
    `).run();

  })();

  console.log("Subscription plan migration completed successfully.");

} catch (error) {
  console.error("SUBSCRIPTION PLAN MIGRATION ERROR:", error);
}

/* ---------- delivery ordering: EatRight menu library ----------
   The dishes live in ./menu/*.txt (written for EatRight, tagged by diet and allergen).
   They are copied into menu_items once, so the shop, prices and admin edits keep working.
   Existing rows are never overwritten; new dishes are only inserted when missing. */
function syncMenuLibrary() {
  const cols = db.prepare("PRAGMA table_info(menu_items)").all().map(c => c.name);
  const add = [
    ["dish_key", "TEXT"],
    ["meal_type", "TEXT NOT NULL DEFAULT ''"],
    ["allergens", "TEXT NOT NULL DEFAULT ''"],
    ["diet_level", "INTEGER NOT NULL DEFAULT 3"],   // 0 vegan, 1 vegetarian, 2 + eggs, 3 non-vegetarian
    ["cuisine", "TEXT NOT NULL DEFAULT ''"]
  ];
  for (const [name, ddl] of add) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE menu_items ADD COLUMN ${name} ${ddl}`);
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_dish_key ON menu_items(dish_key)");

  // Retire the six original placeholder dishes (hidden, not deleted, so old orders stay intact).
  const placeholders = ["Paneer Power Bowl", "Chickpea Rainbow Salad", "Grilled Chicken Plate",
    "Masala Egg Wrap", "Moong Dal Khichdi", "Fruit & Yogurt Cup"];
  const retire = db.prepare("UPDATE menu_items SET active = 0 WHERE name = ? AND dish_key IS NULL");
  const insert = db.prepare(`INSERT OR IGNORE INTO menu_items
    (dish_key,name,description,category,price_paise,calories,protein_g,carbs_g,fat_g,vegetarian,meal_type,allergens,diet_level,cuisine)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    placeholders.forEach(n => retire.run(n));
    for (const d of engine.loadMenu()) {
      insert.run(d.id, d.name, d.description, d.category, d.price_paise, d.kcal, d.protein_g,
        d.carbs_g, d.fat_g, d.diet <= 1 ? 1 : 0, d.type, d.allergens, d.diet, d.cuisine);
    }
  })();
}
try { syncMenuLibrary(); } catch (error) { console.error("MENU SYNC ERROR:", error); }

/* ---------- authentication ---------- */

const sessions = new Map();


function hashPassword(password, salt) {

  return crypto.scryptSync(
    password,
    salt,
    64
  );

}


function createPassword(password) {

  const salt =
    crypto.randomBytes(16);

  const hash =
    hashPassword(
      password,
      salt
    );

  return {
    hash,
    salt
  };

}


function verifyPassword(
  password,
  hash,
  salt
) {

  const calculated =
    hashPassword(
      password,
      salt
    );

  return crypto.timingSafeEqual(
    hash,
    calculated
  );

}


// Seed the project-provided login only if the account is absent.
// Never overwrite an existing account or its password.
const initialAdminEmail = "admin@eatright.co";
if (!db.prepare("SELECT id FROM users WHERE email = ?").get(initialAdminEmail)) {
  // The admin password comes from the ADMIN_PASSWORD environment variable (never hardcode it).
  // The old default is only allowed outside production, for local testing.
  const initialAdminPassword = process.env.ADMIN_PASSWORD ||
    (process.env.NODE_ENV === "production" ? "" : "EatRight.co");
  if (initialAdminPassword.length < 10) {
    throw new Error("Set the ADMIN_PASSWORD environment variable (at least 10 characters) before first start.");
  }
  const { hash, salt } = createPassword(initialAdminPassword);
  db.prepare(`INSERT INTO users (email, pw_hash, salt, name) VALUES (?, ?, ?, ?)`)
    .run(initialAdminEmail, hash, salt, "Admin");
  console.log("Initial EatRight login account created.");
}

function getToken(req) {

  const cookies =
    req.headers.cookie || "";

  const match =
    cookies
      .split(";")
      .map(x => x.trim())
      .find(
        x =>
          x.startsWith(
            "stride_session="
          )
      );

  return match
    ? decodeURIComponent(
        match.split("=")[1]
      )
    : null;

}


function currentUser(req) {

  const token =
    getToken(req);

  if (!token) {
    return null;
  }

  const userId =
    sessions.get(token);

  if (!userId) {
    return null;
  }

  const found = db
    .prepare(
      "SELECT id, email, banned FROM users WHERE id = ?"
    )
    .get(userId);

  if (
    !found ||
    (found.banned && String(found.email).toLowerCase() !== "admin@eatright.co")
  ) {
    sessions.delete(token);
    return null;
  }

  return found;

}


function requireUser(
  req,
  res
) {

  const user =
    currentUser(req);

  if (!user) {

    res.status(401).json({
      error: "Not logged in."
    });

    return null;
  }

  return user;

}


function cookieFor(
  token,
  maxAge
) {

  const secure =
    process.env.NODE_ENV === "production"
      ? "; Secure"
      : "";

  return (
    `stride_session=${encodeURIComponent(token)}; ` +
    `HttpOnly; SameSite=Lax; Path=/; ` +
    `Max-Age=${maxAge}${secure}`
  );

}


/* ---------- subscription helpers ---------- */

function expireOldSubscription(
  userId
) {

  db.prepare(`
    UPDATE subscriptions
    SET status = 'expired'
    WHERE user_id = ?
      AND status IN ('trial','active')
      AND julianday(ends_at) <= julianday('now')
  `).run(userId);

}


function getCurrentSubscription(
  userId
) {

  expireOldSubscription(
    userId
  );

  return db
    .prepare(`
      SELECT
        s.id,
        s.status,
        s.starts_at,
        s.ends_at,
        s.trial,
        s.payment_status,
        s.payment_provider,
        s.payment_reference,
        p.id AS plan_id,
        p.name AS plan_name,
        p.duration_days,
        p.price,
        p.currency,
        p.is_trial
      FROM subscriptions s
      JOIN subscription_plans p
        ON p.id = s.plan_id
      WHERE s.user_id = ?
        AND s.status IN ('trial','active')
        AND julianday(s.ends_at) > julianday('now')
      ORDER BY s.ends_at DESC
      LIMIT 1
    `)
    .get(userId) || null;

}


/* Most recent plan, used to tell the app which plan just ended. */
function getLastSubscription(
  userId
) {

  return db
    .prepare(`
      SELECT
        s.status,
        s.starts_at,
        s.ends_at,
        s.trial,
        p.name AS plan_name,
        p.duration_days,
        p.is_trial
      FROM subscriptions s
      JOIN subscription_plans p
        ON p.id = s.plan_id
      WHERE s.user_id = ?
        AND s.status IN ('trial','active','expired')
      ORDER BY julianday(s.ends_at) DESC
      LIMIT 1
    `)
    .get(userId) || null;

}


function hasSubscriptionHistory(
  userId
) {

  return !!db
    .prepare(
      "SELECT 1 FROM subscriptions WHERE user_id = ? LIMIT 1"
    )
    .get(userId);

}


function startTrialIfEligible(
  userId
) {

  const existing =
    getCurrentSubscription(
      userId
    );

  if (existing) {
    return existing;
  }

  if (
    hasSubscriptionHistory(
      userId
    )
  ) {
    return null;
  }

  const trialPlan =
    db
      .prepare(`
        SELECT *
        FROM subscription_plans
        WHERE is_trial = 1
          AND active = 1
        LIMIT 1
      `)
      .get();

  if (!trialPlan) {
    return null;
  }

  const startsAt =
    new Date();

  const endsAt =
    new Date(
      startsAt.getTime() +
      trialPlan.duration_days *
      86400000
    );

  db.prepare(`
    INSERT INTO subscriptions
      (
        user_id,
        plan_id,
        status,
        starts_at,
        ends_at,
        trial,
        payment_status
      )
    VALUES (
      ?,
      ?,
      'trial',
      ?,
      ?,
      1,
      'not_required'
    )
  `).run(
    userId,
    trialPlan.id,
    startsAt.toISOString(),
    endsAt.toISOString()
  );

  return getCurrentSubscription(
    userId
  );

}


function planDay(
  subscription
) {

  if (!subscription) {
    return null;
  }

  const start =
    new Date(
      subscription.starts_at
    );

  const now =
    new Date();

  const diff =
    Math.floor(
      (
        now - start
      ) / 86400000
    ) + 1;

  return Math.max(
    1,
    diff
  );

}


function getOnboarding(
  userId
) {

  const profile =
    db
      .prepare(`
        SELECT
          name AS n,
          name,
          age AS a,
          age,
          sex,
          height_cm AS h,
          height_cm AS height,
          weight_kg AS w,
          weight_kg AS weight,
          activity AS act,
          place
        FROM profiles
        WHERE user_id = ?
      `)
      .get(userId) || null;


  const plan =
    db
      .prepare(`
        SELECT
          diet,
          other_avoid AS other,
          body,
          goal
        FROM plans
        WHERE user_id = ?
      `)
      .get(userId) || null;


  const allergies =
    db
      .prepare(`
        SELECT allergen
        FROM user_allergies
        WHERE user_id = ?
        ORDER BY allergen
      `)
      .all(userId)
      .map(
        x => x.allergen
      );


  return {
    profile,
    plan,
    allergies
  };

}


function getMePayload(
  userId
) {

  const user =
    db
      .prepare(
        "SELECT id, email FROM users WHERE id = ?"
      )
      .get(userId);


  const onboarding =
    getOnboarding(
      userId
    );


  const subscription =
    getCurrentSubscription(
      userId
    );


  return {
    user,

    is_admin: isAdmin(user),

    ...onboarding,

    subscription,

    plan_day:
      planDay(subscription),

    needs_subscription:
      !subscription,

    last_subscription:
      subscription
        ? null
        : getLastSubscription(
            userId
          ),

    server_now:
      new Date().toISOString()
  };

}


/* ---------- register ---------- */

app.post(
  "/api/register",
  (req, res) => {

    try {

      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();

      const password =
        String(
          req.body.password || ""
        );


      if (
        !email ||
        !password
      ) {

        return res
          .status(400)
          .json({
            error:
              "Email and password are required."
          });

      }


      if (
        password.length < 6
      ) {

        return res
          .status(400)
          .json({
            error:
              "Password must be at least 6 characters."
          });

      }


      const existing =
        db
          .prepare(
            "SELECT id FROM users WHERE email = ?"
          )
          .get(email);


      if (existing) {

        return res
          .status(409)
          .json({
            error:
              "That email already has an account. Log in instead."
          });

      }


      const {
        hash,
        salt
      } =
        createPassword(
          password
        );


      const result =
        db
          .prepare(`
            INSERT INTO users
              (
                email,
                pw_hash,
                salt,
                name
              )
            VALUES (?, ?, ?, ?)
          `)
          .run(
            email,
            hash,
            salt,
            String(req.body.name || "").trim().slice(0, 80) || null
          );


      const userId =
        result.lastInsertRowid;


      const token =
        crypto
          .randomBytes(32)
          .toString("hex");


      sessions.set(
        token,
        userId
      );


      res.setHeader(
        "Set-Cookie",
        cookieFor(
          token,
          60 * 60 * 24 * 30
        )
      );


      res.json({
        success: true,
        user: {
          id: userId,
          email
        }
      });


    } catch (err) {

      console.error(err);

      res
        .status(500)
        .json({
          error:
            "Could not create account."
        });

    }

  }
);


/* ---------- login ---------- */

app.post(
  "/api/login",
  (req, res) => {

    try {

      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();

      const password =
        String(
          req.body.password || ""
        );


      const user =
        db
          .prepare(`
            SELECT
              id,
              email,
              pw_hash,
              salt,
              banned
            FROM users
            WHERE email = ?
          `)
          .get(email);


      if (!user) {

        return res
          .status(401)
          .json({
            error:
              "Email or password is incorrect."
          });

      }


      if (
        !verifyPassword(
          password,
          user.pw_hash,
          user.salt
        )
      ) {

        return res
          .status(401)
          .json({
            error:
              "Email or password is incorrect."
          });

      }


      if (
        user.banned &&
        String(user.email).toLowerCase() !== "admin@eatright.co"
      ) {

        return res
          .status(403)
          .json({
            error:
              "This account has been banned. Please contact EatRight support."
          });

      }


      const token =
        crypto
          .randomBytes(32)
          .toString("hex");


      sessions.set(
        token,
        user.id
      );


      res.setHeader(
        "Set-Cookie",
        cookieFor(
          token,
          60 * 60 * 24 * 30
        )
      );


      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email
        }
      });


    } catch (err) {

      console.error(err);

      res
        .status(500)
        .json({
          error:
            "Could not log in."
        });

    }

  }
);


/* ---------- current user + onboarding state ---------- */

app.get(
  "/api/me",
  (req, res) => {

    const user =
      currentUser(req);

    if (!user) {

      return res
        .status(401)
        .json({
          error:
            "Not logged in."
        });

    }

    res.json(
      getMePayload(
        user.id
      )
    );

  }
);


/* ---------- logout ---------- */

app.post(
  "/api/logout",
  (req, res) => {

    const token =
      getToken(req);

    if (token) {
      sessions.delete(
        token
      );
    }

    res.setHeader(
      "Set-Cookie",
      "stride_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    );

    res.json({
      success: true
    });

  }
);


/* ---------- test ---------- */

app.get(
  "/api/test",
  (req, res) => {

    res.json({
      success: true,
      message:
        "EatRight server and SQLite are connected!"
    });

  }
);


/* ---------- profile ---------- */

app.get(
  "/api/profile",
  (req, res) => {

    const user =
      requireUser(
        req,
        res
      );

    if (!user) {
      return;
    }

    res.json({
      profile:
        getOnboarding(
          user.id
        ).profile
    });

  }
);


app.post(
  "/api/profile",
  (req, res) => {
    const user = requireUser(req, res);
    if (!user) {
      return;
    }

    const p = req.body || {};
    const pick = (...keys) => {
      for (const k of keys) {
        if (p[k] !== undefined && p[k] !== null && p[k] !== "") return p[k];
      }
      return undefined;
    };

    const account = db.prepare("SELECT email, name FROM users WHERE id = ?").get(user.id);
    const name = String(
      pick("name", "n") || (account && account.name) ||
      (account && account.email.split("@")[0]) || "Friend"
    ).trim();

    const age = Number(pick("age", "a"));
    const height = Number(pick("height", "h"));
    const weight = Number(pick("weight", "w"));
    const activity = Number(pick("act", "activity"));
    const sex = String(pick("sex") || "").toLowerCase();
    const place = pick("place") === "gym" ? "gym" : "home";

    if (![age, height, weight, activity].every(Number.isFinite) || !sex) {
      return res.status(400).json({ error: "Please fill in every field." });
    }
    if (!Number.isInteger(age) || age < 16 || age > 100) {
      return res.status(400).json({ error: "You must be 16 or older to create an account and use EatRight." });
    }

    try {
      db.prepare(`
        INSERT INTO profiles
          (user_id, name, age, sex, height_cm, weight_kg, activity, place)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id)
        DO UPDATE SET
          name = excluded.name, age = excluded.age, sex = excluded.sex,
          height_cm = excluded.height_cm, weight_kg = excluded.weight_kg,
          activity = excluded.activity, place = excluded.place
      `).run(user.id, name, age, sex, height, weight, activity, place);
      res.json({ success: true });
    } catch (err) {
      console.error("PROFILE SAVE ERROR:", err);
      res.status(400).json({
        error: "Could not save profile. Check that your age, height and weight are realistic."
      });
    }
  }
);

/* ---------- diet/body/goal plan + allergies ---------- */

app.post(
  "/api/plan",
  (req, res) => {

    const user =
      requireUser(
        req,
        res
      );

    if (!user) {
      return;
    }


    const p =
      req.body || {};


    const allergyList =
      Array.isArray(p.allergies)
        ? p.allergies
        : typeof p.allergies === "string"
          ? p.allergies.split(",").map(x => x.trim()).filter(Boolean)
          : null;
    const diet =
      p.diet === undefined ||
      p.diet === null ||
      p.diet === ""
        ? null
        : String(
            p.diet
          );


    const other =
      String(
        p.other || ""
      ).trim();


    const body =
      p.body || null;


    const goal =
      p.goal || null;


    try {

      db.prepare(`
        INSERT INTO plans
          (
            user_id,
            diet,
            other_avoid,
            body,
            goal,
            current_day
          )
        VALUES (?, ?, ?, ?, ?, 1)

        ON CONFLICT(user_id)
        DO UPDATE SET
          diet =
            COALESCE(
              excluded.diet,
              plans.diet
            ),

          other_avoid =
            excluded.other_avoid,

          body =
            COALESCE(
              excluded.body,
              plans.body
            ),

          goal =
            COALESCE(
              excluded.goal,
              plans.goal
            )
      `).run(
        user.id,
        diet,
        other,
        body,
        goal
      );


      if (allergyList) {

        db.prepare(
          "DELETE FROM user_allergies WHERE user_id = ?"
        ).run(
          user.id
        );


        const add =
          db.prepare(`
            INSERT OR IGNORE INTO user_allergies
              (
                user_id,
                allergen
              )
            VALUES (?, ?)
          `);


        for (
          const allergen
          of allergyList
        ) {

          if (
            typeof allergen === "string" &&
            allergen.trim()
          ) {

            add.run(
              user.id,
              allergen.trim()
            );

          }

        }

      }


      let subscription =
        getCurrentSubscription(
          user.id
        );


      const onboarding =
        getOnboarding(
          user.id
        );


      if (
        onboarding.profile &&
        onboarding.plan &&
        onboarding.plan.diet !== null &&
        onboarding.plan.body &&
        onboarding.plan.goal
      ) {

        subscription =
          startTrialIfEligible(
            user.id
          ) || subscription;

      }


      res.json({
        success: true,

        subscription,

        plan_day:
          planDay(
            subscription
          )
      });


    } catch (err) {

      console.error(
        "PLAN SAVE ERROR:",
        err
      );

      res
        .status(400)
        .json({
          error:
            "Could not save your plan preferences."
        });

    }

  }
);


/* ---------- subscription plans ---------- */

app.get(
  "/api/subscription-plans",
  (req, res) => {

    const user =
      requireUser(
        req,
        res
      );

    if (!user) {
      return;
    }


    const plans =
      db
        .prepare(`
          SELECT
            id,
            name,
            duration_days,
            price,
            currency,
            is_trial
          FROM subscription_plans
          WHERE active = 1
          ORDER BY duration_days ASC
        `)
        .all();


    res.json({
      plans
    });

  }
);


app.get(
  "/api/subscription",
  (req, res) => {

    const user =
      requireUser(
        req,
        res
      );

    if (!user) {
      return;
    }


    const subscription =
      getCurrentSubscription(
        user.id
      );


    res.json({

      subscription,

      plan_day:
        planDay(
          subscription
        ),

      needs_subscription:
        !subscription,

      last_subscription:
        subscription
          ? null
          : getLastSubscription(
              user.id
            ),

      server_now:
        new Date().toISOString()

    });

  }
);


/*
   Paid subscription activation is deliberately not wired
   until a real payment provider is selected.
*/

app.post(
  "/api/subscription/checkout",
  (req, res) => {

    const user =
      requireUser(
        req,
        res
      );

    if (!user) {
      return;
    }


    const planId =
      Number(
        req.body.plan_id
      );


    const plan =
      db
        .prepare(`
          SELECT
            id,
            name,
            duration_days,
            price,
            currency,
            is_trial
          FROM subscription_plans
          WHERE id = ?
            AND active = 1
        `)
        .get(
          planId
        );


    if (!plan) {

      return res
        .status(404)
        .json({
          error:
            "Subscription plan not found."
        });

    }


    if (plan.is_trial) {

      return res
        .status(400)
        .json({
          error:
            "The free trial is started automatically after onboarding."
        });

    }


    res
      .status(501)
      .json({
        error:
          "Payments are not connected yet. This plan is ready for checkout once a payment provider is added."
      });

  }
);


/* ---------- date-based progress ---------- */

function validDate(
  value
) {

  return /^\d{4}-\d{2}-\d{2}$/
    .test(
      String(
        value || ""
      )
    );

}


app.get(
  "/api/progress",
  (req, res) => {

    const user =
      requireUser(
        req,
        res
      );

    if (!user) {
      return;
    }


    const date =
      String(
        req.query.date || ""
      );


    if (
      !validDate(
        date
      )
    ) {

      return res
        .status(400)
        .json({
          error:
            "Invalid date."
        });

    }


    const rows =
      db
        .prepare(`
          SELECT slot
          FROM daily_progress
          WHERE
            user_id = ?
            AND progress_date = ?
            AND completed = 1
          ORDER BY slot
        `)
        .all(
          user.id,
          date
        );


    res.json({
      date,

      slots:
        rows.map(
          x => x.slot
        )
    });

  }
);


app.post(
  "/api/progress",
  (req, res) => {

    const user =
      requireUser(
        req,
        res
      );

    if (!user) {
      return;
    }


    const date =
      String(
        req.body.date || ""
      );


    const slot =
      Number(
        req.body.slot
      );


    const done =
      !!req.body.done;


    if (
      !validDate(date) ||
      !Number.isInteger(slot) ||
      slot < 0 ||
      slot > 5
    ) {

      return res
        .status(400)
        .json({
          error:
            "Invalid progress data."
        });

    }


    if (done) {

      db.prepare(`
        INSERT INTO daily_progress
          (
            user_id,
            progress_date,
            slot,
            completed,
            updated_at
          )
        VALUES (
          ?,
          ?,
          ?,
          1,
          CURRENT_TIMESTAMP
        )

        ON CONFLICT(
          user_id,
          progress_date,
          slot
        )

        DO UPDATE SET
          completed = 1,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        user.id,
        date,
        slot
      );


    } else {

      db.prepare(`
        DELETE FROM daily_progress
        WHERE
          user_id = ?
          AND progress_date = ?
          AND slot = ?
      `).run(
        user.id,
        date,
        slot
      );

    }


    res.json({
      success: true
    });

  }
);



/* ---------- ordering API ---------- */
function isAdmin(user) { return !!user && String(user.email).toLowerCase() === "admin@eatright.co"; }
/* Active menu rows, narrowed to the signed-in customer's diet and allergies (showAll skips the filter). */
function menuRowsForUser(user, showAll) {
  const rows = db.prepare(`SELECT id,name,description,category,price_paise,calories,protein_g,carbs_g,fat_g,vegetarian,
      meal_type,allergens,diet_level,cuisine
    FROM menu_items WHERE active=1
    ORDER BY CASE category WHEN 'Breakfast' THEN 1 WHEN 'Lunch' THEN 2 WHEN 'Dinner' THEN 3 WHEN 'Snacks' THEN 4 ELSE 5 END, name`).all();
  if (user && !isAdmin(user) && !showAll) {
    const ob = getOnboarding(user.id);
    if (ob.plan && ob.plan.diet) {
      const level = engine.DIET_LEVEL[String(ob.plan.diet).toLowerCase()];
      const avoid = engine.avoidProfile(ob.allergies, ob.plan.other);
      return rows.filter(r => engine.dishAllowed(
        { diet: r.diet_level, allergens: r.allergens || "", name: r.name, description: r.description },
        level === undefined ? 3 : level, avoid));
    }
  }
  return rows;
}
app.get("/api/menu", (req, res) => {
  res.json(menuRowsForUser(currentUser(req), req.query.all === "1"));
});

/* ---------- 2-3 meal options for one delivery slot ---------- */
const SLOT_MEAL_TYPE = { 0: "breakfast", 1: "snack", 2: "lunch", 3: "snack", 4: "dinner" };

/* Pure helper: choose up to `count` dishes. The plan's own suggestion goes first (when it is on the menu),
   the rest are close in calories to it, vary in cuisine, and rotate by `seed` so each day/slot differs
   but re-opening the same slot shows the same options. */
function pickMealOptions(candidates, { preferredId = null, targetKcal = 0, seed = "", excludeIds = new Set(), count = 3 } = {}) {
  const rank = r => crypto.createHash("md5").update(`${seed}:${r.id}`).digest().readUInt32BE(0);
  const pool = candidates.filter(r => !excludeIds.has(r.id) || r.id === preferredId);
  const picked = [];
  const pref = pool.find(r => r.id === preferredId);
  if (pref) picked.push(pref);
  const target = Number(targetKcal) || (pref ? pref.calories : 0);
  let rest = pool.filter(r => r !== pref);
  if (target) {
    const near = rest.filter(r => Math.abs(r.calories - target) <= target * 0.3);
    rest = near.length >= count - picked.length
      ? near
      : [...rest].sort((a, b) => Math.abs(a.calories - target) - Math.abs(b.calories - target)).slice(0, Math.max(count * 4, 12));
  }
  rest.sort((a, b) => rank(a) - rank(b));
  const cuisines = new Set(picked.map(r => r.cuisine));
  for (const r of rest) {            // first pass: a different cuisine for each option
    if (picked.length >= count) break;
    if (!cuisines.has(r.cuisine)) { picked.push(r); cuisines.add(r.cuisine); }
  }
  for (const r of rest) {            // second pass: fill any gaps
    if (picked.length >= count) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked.slice(0, count);
}

app.get("/api/meal-options", (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const slot = Number(req.query.slot);
  const mealType = SLOT_MEAL_TYPE[slot];
  if (!mealType) return res.status(400).json({ error: "Choose a valid meal." });
  const ob = getOnboarding(user.id);
  if (!ob.profile || !ob.plan || !ob.plan.diet) {
    return res.status(409).json({ error: "Complete your profile and food preferences first." });
  }
  const sub = getCurrentSubscription(user.id);
  if (!sub) return res.status(403).json({ error: "An active plan is needed to order meals." });
  const day = planDay(sub) || 1;
  const plan = engine.mealsForDay({ userId: user.id, profile: ob.profile, plan: ob.plan, allergies: ob.allergies }, day);
  const lookup = db.prepare("SELECT id, calories FROM menu_items WHERE dish_key = ? AND active = 1");
  const todayRows = plan.meals.map(m => (m && m.id ? lookup.get(m.id) : null));
  const suggested = todayRows[slot] || null;
  // Don't offer a dish the plan already uses for another meal today.
  const excludeIds = new Set(todayRows.filter((r, i) => r && i !== slot).map(r => r.id));
  const candidates = menuRowsForUser(user, false).filter(r => r.meal_type === mealType);
  const options = pickMealOptions(candidates, {
    preferredId: suggested ? suggested.id : null,
    targetKcal: suggested ? suggested.calories : (plan.meals[slot] && plan.meals[slot].kcal) || 0,
    seed: `${user.id}:${day}:${slot}`,
    excludeIds, count: 3
  });
  res.json({
    slot, meal_type: mealType,
    options: options.map(r => ({
      id: r.id, name: r.name, description: r.description, price_paise: r.price_paise,
      calories: r.calories, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g,
      vegetarian: r.vegetarian, allergens: r.allergens || "", cuisine: r.cuisine,
      suggested: !!suggested && r.id === suggested.id
    }))
  });
});

/* ---------- personal meal plan (generated per user from the library) ---------- */
app.get("/api/meal-plan", (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const ob = getOnboarding(user.id);
  if (!ob.profile || !ob.plan || !ob.plan.diet) {
    return res.status(409).json({ error: "Complete your profile and food preferences first." });
  }
  const sub = getCurrentSubscription(user.id);
  if (!sub) return res.status(403).json({ error: "An active plan is needed to see your meals." });
  const asked = Number(req.query.day);
  const day = Number.isInteger(asked) && asked >= 1 && asked <= 365 ? asked : (planDay(sub) || 1);
  const result = engine.mealsForDay({ userId: user.id, profile: ob.profile, plan: ob.plan, allergies: ob.allergies }, day);
  // Attach the shop item behind each suggested dish so the app can order it with one tap.
  // menu_id is null when the dish is not (or no longer) on the active menu.
  const lookup = db.prepare("SELECT id, price_paise, calories, protein_g FROM menu_items WHERE dish_key = ? AND active = 1");
  result.meals = result.meals.map(m => {
    const row = m.id ? lookup.get(m.id) : null;
    return { ...m, menu_id: row ? row.id : null, price_paise: row ? row.price_paise : null,
      serving_kcal: row ? row.calories : null, serving_protein_g: row ? row.protein_g : null };
  });
  res.json(result);
});
app.get("/api/orders", (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  const orders = isAdmin(user)
    ? db.prepare(`SELECT o.*,u.email AS customer_email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC`).all()
    : db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC").all(user.id);
  const getItems = db.prepare("SELECT item_name,unit_price_paise,quantity FROM order_items WHERE order_id=?");
  res.json(orders.map(o => ({...o, items:getItems.all(o.id)})));
});
app.post("/api/orders", (req, res) => {
  const user = requireUser(req, res); if (!user) return;
  try {
    const {items,payment_method,address,phone,notes=""} = req.body || {};
    if (!Array.isArray(items) || !items.length || items.length > 30) return res.status(400).json({error:"Add at least one menu item."});
    if (!['cod','online'].includes(payment_method)) return res.status(400).json({error:"Choose a valid payment method."});
    const cleanAddress=String(address||'').trim(), cleanPhone=String(phone||'').trim();
    if (cleanAddress.length < 10 || cleanAddress.length > 500) return res.status(400).json({error:"Enter a complete delivery address."});
    if (!/^[+\d()\-\s]{8,20}$/.test(cleanPhone)) return res.status(400).json({error:"Enter a valid contact number."});
    const normalized = new Map();
    for (const row of items) {
      const id=Number(row.id), qty=Number(row.quantity);
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty<1 || qty>30) return res.status(400).json({error:"Invalid item quantity."});
      normalized.set(id,(normalized.get(id)||0)+qty);
    }
    const fetched = [...normalized].map(([id,quantity]) => {
      const item=db.prepare("SELECT id,name,price_paise FROM menu_items WHERE id=? AND active=1").get(id);
      if (!item) throw new Error("A selected menu item is no longer available.");
      return {...item,quantity};
    });
    if (fetched.some(x=>x.quantity>30)) return res.status(400).json({error:"Maximum quantity per item is 30."});
    const subtotal=fetched.reduce((sum,x)=>sum+x.price_paise*x.quantity,0);
    const deliveryFee=4900; // ₹49 flat pilot-area delivery fee
    const total=subtotal+deliveryFee;
    const orderCode=`ER-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const create=db.transaction(()=>{
      const result=db.prepare(`INSERT INTO orders (order_code,user_id,status,payment_method,payment_status,subtotal_paise,delivery_fee_paise,total_paise,address,customer_phone,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(orderCode,user.id,'placed',payment_method,'pending',subtotal,deliveryFee,total,cleanAddress,cleanPhone,String(notes).trim().slice(0,500));
      const add=db.prepare("INSERT INTO order_items (order_id,menu_item_id,item_name,unit_price_paise,quantity) VALUES (?,?,?,?,?)");
      fetched.forEach(x=>add.run(result.lastInsertRowid,x.id,x.name,x.price_paise,x.quantity));
      return result.lastInsertRowid;
    });
    const id=create();
    res.status(201).json({success:true,id,order_code:orderCode,message:payment_method==='online'?'Order saved. Online payment gateway setup is the next integration step; no payment has been charged.':'Order placed. Pay cash on delivery.'});
  } catch(error) { res.status(400).json({error:error.message||"Could not place order."}); }
});
app.patch("/api/admin/orders/:id/status", (req,res)=>{
  const user=currentUser(req); if(!isAdmin(user)) return res.status(403).json({error:"Administrator access required."});
  const allowed=['confirmed','preparing','ready_for_pickup','out_for_delivery','delivered','cancelled'];
  const status=String(req.body?.status||''); if(!allowed.includes(status)) return res.status(400).json({error:"Invalid order status."});
  const result=db.prepare("UPDATE orders SET status=? WHERE id=?").run(status,Number(req.params.id));
  if(!result.changes) return res.status(404).json({error:"Order not found."});
  res.json({success:true});
});

/* ---------- admin: clear saved profile data while retaining accounts ---------- */
app.delete("/api/admin/profiles", (req, res) => {
  const user = currentUser(req);
  if (!user || String(user.email).toLowerCase() !== "admin@eatright.co") {
    return res.status(403).json({ error: "Administrator access required." });
  }
  try {
    const clear = db.transaction(() => {
      db.prepare("DELETE FROM user_allergies").run();
      db.prepare("DELETE FROM daily_progress").run();
      db.prepare("DELETE FROM progress").run();
      db.prepare("DELETE FROM plans").run();
      db.prepare("DELETE FROM profiles").run();
    });
    clear();
    return res.json({ success: true, message: "Saved profile data cleared. User accounts were preserved." });
  } catch (error) {
    console.error("ADMIN PROFILE CLEAR ERROR:", error);
    return res.status(500).json({ error: "Could not clear saved profile data." });
  }
});

/* ---------- admin console: view, ban and erase customer accounts ---------- */
const ADMIN_EMAIL = "admin@eatright.co";

function requireAdmin(req, res) {
  const user = currentUser(req);
  if (!user) { res.status(401).json({ error: "Not logged in." }); return null; }
  if (!isAdmin(user)) { res.status(403).json({ error: "Administrator access required." }); return null; }
  return user;
}

function dropSessionsFor(userId) {
  for (const [token, id] of sessions) {
    if (Number(id) === Number(userId)) sessions.delete(token);
  }
}

app.get("/api/admin/users", (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = db.prepare(`
      SELECT u.id, u.email, u.name, u.created_at, u.banned, u.banned_at,
        (SELECT COUNT(*) FROM profiles p WHERE p.user_id = u.id) AS has_profile,
        (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count
      FROM users u
      WHERE lower(u.email) <> ?
      ORDER BY u.created_at DESC, u.id DESC
    `).all(ADMIN_EMAIL);
    res.json(rows.map(r => {
      const sub = getCurrentSubscription(r.id);
      return { ...r, subscription: sub ? `${sub.plan_name} (${sub.status})` : null };
    }));
  } catch (error) {
    console.error("ADMIN LIST ERROR:", error);
    res.status(500).json({ error: "Could not load customer accounts." });
  }
});

app.get("/api/admin/users/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid account id." });
  try {
    // pw_hash and salt are deliberately never selected.
    const user = db.prepare("SELECT id, email, name, created_at, banned, banned_at, ban_reason FROM users WHERE id = ?").get(id);
    if (!user || user.email.toLowerCase() === ADMIN_EMAIL) return res.status(404).json({ error: "Account not found." });
    const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(id);
    const getItems = db.prepare("SELECT item_name, unit_price_paise, quantity FROM order_items WHERE order_id = ?");
    res.json({
      user,
      profile: db.prepare("SELECT name, age, sex, height_cm, weight_kg, activity, place FROM profiles WHERE user_id = ?").get(id) || null,
      plan: db.prepare("SELECT diet, other_avoid, body, goal, current_day FROM plans WHERE user_id = ?").get(id) || null,
      allergies: db.prepare("SELECT allergen FROM user_allergies WHERE user_id = ? ORDER BY allergen").all(id).map(a => a.allergen),
      subscriptions: db.prepare(`
        SELECT s.status, s.starts_at, s.ends_at, s.trial, s.payment_status, p.name AS plan_name
        FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.user_id = ? ORDER BY s.created_at DESC, s.id DESC
      `).all(id),
      payments: db.prepare("SELECT amount, currency, status, provider, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC").all(id),
      progress: db.prepare("SELECT COUNT(DISTINCT progress_date) AS days_logged, MAX(progress_date) AS last_date FROM daily_progress WHERE user_id = ? AND completed = 1").get(id),
      orders: orders.map(o => ({ ...o, items: getItems.all(o.id) }))
    });
  } catch (error) {
    console.error("ADMIN INSPECT ERROR:", error);
    res.status(500).json({ error: "Could not load this account." });
  }
});

app.post("/api/admin/users/:id/ban", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid account id." });
  const target = db.prepare("SELECT id, email FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "Account not found." });
  if (target.email.toLowerCase() === ADMIN_EMAIL) return res.status(400).json({ error: "The administrator account cannot be banned." });
  const reason = String(req.body?.reason || "").trim().slice(0, 300);
  db.prepare("UPDATE users SET banned = 1, banned_at = CURRENT_TIMESTAMP, ban_reason = ? WHERE id = ?").run(reason, id);
  dropSessionsFor(id); // log them out immediately
  res.json({ success: true });
});

app.post("/api/admin/users/:id/unban", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid account id." });
  const result = db.prepare("UPDATE users SET banned = 0, banned_at = NULL, ban_reason = '' WHERE id = ? AND lower(email) <> ?").run(id, ADMIN_EMAIL);
  if (!result.changes) return res.status(404).json({ error: "Account not found." });
  res.json({ success: true });
});

/* Erase EVERY customer account and all of their data. Admin account, menu and plans stay. */
app.delete("/api/admin/users", (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (req.body?.confirm !== "ERASE ALL") {
    return res.status(400).json({ error: 'Confirmation text missing. Type "ERASE ALL" to continue.' });
  }
  try {
    db.pragma("foreign_keys = ON");
    const customers = "(SELECT id FROM users WHERE lower(email) <> ?)";
    let removed = 0;
    db.transaction(() => {
      db.prepare(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id IN ${customers})`).run(ADMIN_EMAIL);
      for (const table of ["orders", "payments", "subscriptions", "daily_progress", "progress", "user_allergies", "plans", "profiles"]) {
        db.prepare(`DELETE FROM ${table} WHERE user_id IN ${customers}`).run(ADMIN_EMAIL);
      }
      removed = db.prepare("DELETE FROM users WHERE lower(email) <> ?").run(ADMIN_EMAIL).changes;
    })();
    for (const [token, id] of sessions) {
      const u = db.prepare("SELECT 1 FROM users WHERE id = ?").get(id);
      if (!u) sessions.delete(token);
    }
    res.json({ success: true, removed });
  } catch (error) {
    console.error("ADMIN ERASE ERROR:", error);
    res.status(500).json({ error: "Could not erase customer accounts." });
  }
});

/* ---------- server ---------- */

const PORT =
  Number(
    process.env.PORT || 3000
  );


app.listen(
  PORT,
  () => {

    console.log(
      "Database initialized."
    );

    console.log(
      `EatRight running at http://localhost:${PORT}`
    );

  }
);