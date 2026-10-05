/* =========================================================
   EatRight meal engine
   - loads the dish library from ./menu/*.txt
   - builds a personal, repeat-free meal plan for each user
   Pure Node, no network, no extra dependencies.
   ========================================================= */
const fs = require("fs");
const path = require("path");

const MENU_DIR = path.join(__dirname, "menu");
const FILES = [
  ["breakfast.txt", "breakfast"],
  ["lunch.txt", "lunch"],
  ["dinner.txt", "dinner"],
  ["snacks.txt", "snack"]
];

/* Day layout. Must match slots 0-4 used by the front end. */
const SLOTS = [
  { slot: 0, type: "breakfast", name: "Breakfast",         share: 0.25 },
  { slot: 1, type: "snack",     name: "Mid-morning Snack", share: 0.10 },
  { slot: 2, type: "lunch",     name: "Lunch",             share: 0.30 },
  { slot: 3, type: "snack",     name: "Evening Snack",     share: 0.10 },
  { slot: 4, type: "dinner",    name: "Dinner",            share: 0.25 }
];

const DIET_LEVEL = { vegan: 0, vegetarian: 1, eggetarian: 2, "non-vegetarian": 3 };
const CATEGORY = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

/* ---------- library ---------- */
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function priceFor(d) {
  const base = { breakfast: 99, snack: 59, lunch: 149, dinner: 139 }[d.type];
  let p = base + d.protein_g * 2.2;
  if (d.diet === 3) p += 30;
  if (/F|C/.test(d.allergens) && d.diet === 3) p += 30;       // fish and prawns cost more
  if (/mutton/i.test(d.name)) p += 40;
  p = Math.round(p / 10) * 10 - 1;                              // e.g. 249
  return Math.max(49, p) * 100;                                  // paise
}

function parseLine(line, type) {
  const f = line.split("|").map(x => x.trim());
  if (f.length < 8) return null;
  const [name, description, kcal, protein, carbs, diet, allergens, cuisine] = f;
  const k = Number(kcal), p = Number(protein), c = Number(carbs);
  const fat = Math.max(0, Math.round(((k - 4 * p - 4 * c) / 9) * 10) / 10);
  const dish = {
    id: slugify(name), name, description, type,
    category: CATEGORY[type],
    kcal: k, protein_g: p, carbs_g: c, fat_g: fat,
    diet: Number(diet),
    allergens: allergens === "-" ? "" : allergens,
    cuisine
  };
  dish.price_paise = priceFor(dish);
  return dish;
}

let LIBRARY = null;
function loadMenu() {
  if (LIBRARY) return LIBRARY;
  const all = [];
  const seen = new Set();
  for (const [file, type] of FILES) {
    const text = fs.readFileSync(path.join(MENU_DIR, file), "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const dish = parseLine(line, type);
      if (!dish || seen.has(dish.id)) continue;
      seen.add(dish.id);
      all.push(dish);
    }
  }
  LIBRARY = all;
  return all;
}

/* ---------- allergy and avoid-list matching ---------- */
const ALLERGEN_WORDS = {
  D: ["dairy", "milk", "lactose", "curd", "yogurt", "yoghurt", "paneer", "cheese", "ghee", "butter", "cream", "whey", "casein"],
  G: ["gluten", "wheat", "atta", "maida", "barley", "rye", "semolina", "suji", "rava", "celiac", "coeliac"],
  N: ["nut", "almond", "cashew", "walnut", "pistachio", "hazelnut", "pecan", "badam", "kaju"],
  P: ["peanut", "groundnut", "moongphali", "nut"],
  S: ["soy", "soya", "tofu", "edamame"],
  E: ["egg", "anda"],
  F: ["fish", "seafood", "tuna", "salmon"],
  C: ["shellfish", "prawn", "shrimp", "crab", "lobster", "seafood"],
  T: ["sesame", "til", "tahini"]
};
const ALIASES = [
  ["brinjal", "eggplant", "aubergine", "baingan"],
  ["coriander", "cilantro"],
  ["chickpea", "chana", "chole", "garbanzo"],
  ["pea", "matar"],
  ["okra", "bhindi"],
  ["cauliflower", "gobi"],
  ["potato", "aloo"]
];
const STOP = new Set(["and", "the", "all", "free", "allergy", "allergic", "allergies", "intolerant",
  "intolerance", "avoid", "avoids", "no", "dont", "don", "t", "not", "to", "of", "any", "foods",
  "food", "i", "am", "have", "with", "sensitive", "sensitivity", "or"]);

const stem = w => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const words = s => String(s || "").toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem);

function avoidProfile(allergyList, otherText) {
  const text = [...(allergyList || []), otherText || ""].join(" , ");
  const tokens = words(text).filter(t => t.length > 1 && !STOP.has(t));
  const codes = new Set();
  for (const [code, list] of Object.entries(ALLERGEN_WORDS)) {
    if (list.some(w => tokens.includes(stem(w)))) codes.add(code);
  }
  const terms = new Set(tokens);
  for (const group of ALIASES) {
    const g = group.map(stem);
    if (g.some(w => terms.has(w))) g.forEach(w => terms.add(w));
  }
  return { codes, terms };
}

function dishAllowed(d, level, avoid) {
  if (d.diet > level) return false;
  for (const c of d.allergens) if (avoid.codes.has(c)) return false;
  if (avoid.terms.size) {
    const dishWords = new Set(words(`${d.name} ${d.description}`));
    for (const t of avoid.terms) if (dishWords.has(t)) return false;
  }
  return true;
}

/* ---------- calorie target ---------- */
function calorieTarget(profile, plan) {
  const age = Number(profile.age || profile.a || 30);
  const weight = Number(profile.weight || profile.w || 65);
  const height = Number(profile.height || profile.h || 165);
  const male = String(profile.sex || "").toLowerCase().startsWith("m");
  const act = Number(profile.act || profile.activity || 2);
  const bmr = 10 * weight + 6.25 * height - 5 * age + (male ? 5 : -161);
  const tdee = bmr * ({ 1: 1.2, 2: 1.375, 3: 1.55, 4: 1.725 }[act] || 1.375);
  let target = tdee;
  const goal = plan && plan.goal;
  if (goal === "lose" && age >= 18) target = tdee - 400;   // modest deficit, never for under-18s
  if (goal === "gain") target = tdee + 300;
  const floor = male ? 1500 : 1300;
  return Math.round(Math.max(floor, target) / 10) * 10;
}

/* ---------- seeded randomness ---------- */
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- plan generator ---------- */
const PLAN_DAYS = 365;
const cache = new Map();

function buildPlan({ userId, profile, plan, allergies }) {
  const level = DIET_LEVEL[String((plan && plan.diet) || "").toLowerCase()];
  const dietLevel = level === undefined ? 1 : level;               // unknown -> vegetarian (safest)
  const kcal = calorieTarget(profile || {}, plan || {});
  const avoid = avoidProfile(allergies || [], plan && plan.other);

  const signature = JSON.stringify([userId, dietLevel, plan && plan.goal, kcal,
    [...avoid.codes].sort(), [...avoid.terms].sort()]);
  if (cache.has(signature)) return cache.get(signature);

  const lib = loadMenu();
  const pools = {};
  for (const type of ["breakfast", "snack", "lunch", "dinner"]) {
    pools[type] = lib.filter(d => d.type === type && dishAllowed(d, dietLevel, avoid));
  }

  const rng = mulberry32(hashString(signature));
  const last = new Map();                       // dish id -> last day used
  const yesterdayCuisine = {};                  // slot -> cuisine
  const goal = plan && plan.goal;
  const days = [];

  for (let day = 1; day <= PLAN_DAYS; day++) {
    const usedToday = new Set();
    const cuisinesToday = [];
    const meals = [];

    for (const s of SLOTS) {
      const pool = pools[s.type];
      const target = kcal * s.share;
      if (!pool.length) {
        meals.push({ slot: s.slot, slot_name: s.name, id: null, name: "No matching dish in the menu",
          description: "Your allergies and food choices rule out every dish for this slot. Please contact support.",
          portion: 1, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cuisine: "", allergens: "", diet: 0 });
        continue;
      }

      // Strict rotation: never-served dishes come first. Only once the whole pool has been
      // served do we start again, oldest-served first, so nothing repeats before it has to.
      let cand = pool.filter(d => !last.has(d.id) && !usedToday.has(d.id));
      if (!cand.length) {
        cand = pool.filter(d => !usedToday.has(d.id))
          .sort((a, b) => last.get(a.id) - last.get(b.id));
        cand = cand.slice(0, Math.max(6, Math.ceil(pool.length * 0.4)));
      }

      // non-vegetarians still get plenty of vegetarian days
      if (dietLevel === 3 && (s.type === "lunch" || s.type === "dinner")) {
        const wantNon = rng() < 0.65;
        const narrowed = cand.filter(d => (d.diet === 3) === wantNon);
        if (narrowed.length) cand = narrowed;
      }

      let best = null, bestScore = -Infinity;
      for (const d of cand) {
        let score = rng() * 0.6;
        if (d.cuisine === yesterdayCuisine[s.slot]) score -= 0.5;
        if (cuisinesToday.includes(d.cuisine)) score -= 0.3;
        score -= Math.abs(Math.log(target / d.kcal)) * 0.8;          // prefer dishes near the target size
        const density = (d.protein_g * 4) / d.kcal;
        if (goal === "gain" || goal === "lose") score += density * 0.5;
        if (score > bestScore) { bestScore = score; best = d; }
      }

      usedToday.add(best.id);
      cuisinesToday.push(best.cuisine);
      last.set(best.id, day);
      yesterdayCuisine[s.slot] = best.cuisine;

      const portion = Math.round(Math.min(1.5, Math.max(0.7, target / best.kcal)) * 20) / 20;
      meals.push({
        slot: s.slot, slot_name: s.name, id: best.id, name: best.name, description: best.description,
        cuisine: best.cuisine, allergens: best.allergens, diet: best.diet, portion,
        kcal: Math.round(best.kcal * portion),
        protein_g: Math.round(best.protein_g * portion),
        carbs_g: Math.round(best.carbs_g * portion),
        fat_g: Math.round(best.fat_g * portion)
      });
    }
    days.push(meals);
  }

  const result = { calorie_target: kcal, diet_level: dietLevel, days };
  if (cache.size > 500) cache.clear();
  cache.set(signature, result);
  return result;
}

/* Meals for one day (1-based). Day numbers beyond the plan wrap around. */
function mealsForDay(ctx, day) {
  const p = buildPlan(ctx);
  const n = Math.max(1, Math.floor(Number(day) || 1));
  const idx = (n - 1) % p.days.length;
  const meals = p.days[idx];
  return {
    day: n,
    calorie_target: p.calorie_target,
    meals,
    totals: meals.reduce((t, m) => ({
      kcal: t.kcal + m.kcal, protein_g: t.protein_g + m.protein_g,
      carbs_g: t.carbs_g + m.carbs_g, fat_g: t.fat_g + m.fat_g
    }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
  };
}

/* Menu items filtered for one customer (shop). */
function menuForCustomer(plan, allergies) {
  const level = DIET_LEVEL[String((plan && plan.diet) || "").toLowerCase()];
  const avoid = avoidProfile(allergies || [], plan && plan.other);
  return loadMenu().filter(d => dishAllowed(d, level === undefined ? 3 : level, avoid));
}

module.exports = { DIET_LEVEL, SLOTS, loadMenu, buildPlan, mealsForDay, menuForCustomer, calorieTarget, avoidProfile, dishAllowed };
