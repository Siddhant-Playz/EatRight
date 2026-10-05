let me = null;
let isAdminUser = false;

/* subscription live-status / expiry state */
let planClockOffset = 0;            // server time minus browser time (ms)
let subscriptionUpgradeMode = false; // plans page opened as an upgrade (no trial card)
let planLockAck = false;             // user pressed "Upgrade plan" on the expiry popup

let userData = {
  p: null,
  diet: null,
  body: null,
  goal: null,
  calories: null,
  protein: null,
  carbs: null,
  fats: null,

  al: [],

  subscription: null,
  plan_day: null,
    needs_subscription: true,
  last_subscription: null,
  done: {}
};

let view = "login";

/* Converts FormData to a JSON request (the server only reads JSON). */
function jsonBody(formData) {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(formData.entries()))
  };
}



/* =========================================================
   THEME SYSTEM — LIGHT + DARK ONLY
   ========================================================= */

let theme =
  localStorage.getItem("stride.theme") || "light";


function applyTheme(
  nextTheme,
  animate = true
) {

  if (
    nextTheme !== "light" &&
    nextTheme !== "dark"
  ) {
    nextTheme = "light";
  }

  if (animate) {

    document.documentElement.classList.add(
      "theme-changing"
    );

  }

  document.documentElement.dataset.theme =
    nextTheme;

  theme =
    nextTheme;

  localStorage.setItem(
    "stride.theme",
    nextTheme
  );

  if (animate) {

    setTimeout(
      () => {

        document.documentElement.classList.remove(
          "theme-changing"
        );

      },
      350
    );

  }

}


function toggleTheme() {

  const nextTheme =
    theme === "light"
      ? "dark"
      : "light";

  applyTheme(
    nextTheme,
    true
  );

  render();

}


/* Theme switch for the login page: changes the theme without
   re-rendering, so anything typed in the form is kept. */
function toggleThemeSoft() {
  applyTheme(theme === "light" ? "dark" : "light", true);
}

const savedTheme =
  localStorage.getItem(
    "stride.theme"
  );


if (
  savedTheme === "dark-obsidian" ||
  savedTheme === "dark-neon" ||
  savedTheme === "dark-plum"
) {

  theme = "dark";

} else {

  theme = "light";

}


applyTheme(
  theme,
  false
);


/* =========================================================
   JOURNEY PATH STYLES
   ========================================================= */

(function installJourneyPathStyles() {

  if (
    document.getElementById(
      "eatright-journey-path-styles"
    )
  ) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "eatright-journey-path-styles";


  style.textContent = `

    .meal-journey::after {
      display: none !important;
    }

    .journey-segment {
      position: relative;
      z-index: 1;

      width: 4px;
      height: 35px;

      margin-left: 23px;

      border-radius: 999px;

      background:
        var(--progress-bg);

      transition:
        background-color 350ms ease,
        box-shadow 350ms ease;
    }

    .journey-segment.completed {
      background:
        var(--primary);

      box-shadow:
        0 0 10px
        rgba(57, 255, 20, 0.12);
    }

    html[data-theme="light"]
    .journey-segment.completed {

      box-shadow:
        0 0 8px
        rgba(102, 115, 58, 0.16);

    }

    .journey-step.completed
    + .journey-segment {

      background:
        var(--primary);

    }

    @media (max-width: 640px) {

      .journey-segment {

        width: 3px;

        height: 32px;

        margin-left: 19px;

      }

    }

  `;


  document.head.appendChild(
    style
  );

})();


/* =========================================================
   BASIC DATA
   ========================================================= */

const MEALS = [

  {
    slot: 0,

    name: "Breakfast",

    time: "7:30 AM",

    icon: "🌅",

    description:
      "Start your day with a balanced, protein-rich meal.",

    detail:
      "Your first meal helps provide energy and supports your daily nutrition target."
  },

  {
    slot: 1,

    name: "Mid-morning Snack",

    time: "10:30 AM",

    icon: "🍎",

    description:
      "A light snack to keep your energy steady.",

    detail:
      "Choose a simple combination of protein, fruit or healthy fats."
  },

  {
    slot: 2,

    name: "Lunch",

    time: "1:00 PM",

    icon: "🥗",

    description:
      "A complete meal built around your daily targets.",

    detail:
      "Aim for a good balance of protein, carbohydrates and vegetables."
  },

  {
    slot: 3,

    name: "Evening Snack",

    time: "4:30 PM",

    icon: "🥜",

    description:
      "A controlled snack before your final meal.",

    detail:
      "This helps prevent excessive hunger before dinner."
  },

  {
    slot: 4,

    name: "Dinner",

    time: "8:00 PM",

    icon: "🌙",

    description:
      "Finish your meals with a balanced dinner.",

    detail:
      "Keep dinner aligned with the remaining calories and macros in your plan."
  }

];


const WORKOUT = {

  slot: 5,

  name: "Workout",

  time: "After Dinner",

  icon: "🏋️",

  description:
    "Complete today's workout after all five meals.",

  detail:
    "Your workout unlocks after every meal has been delivered."

};


/* =========================================================
   BODY TYPES
   ========================================================= */

const BODY_TYPES = [

  {
    id: "ectomorph",

    name: "Lean",

    icon: "🧍",

    description:
      "Naturally lean build with a faster metabolism."
  },

  {
    id: "mesomorph",

    name: "Athletic",

    icon: "🏃",

    description:
      "Athletic build with balanced muscle development."
  },

  {
    id: "endomorph",

    name: "Broad",

    icon: "💪",

    description:
      "Broader build with a tendency to store more body fat."
  }

];


/* =========================================================
   SELECTION IMAGES (body type + goal steps)
   Files live in ./images and are named:
     body-<id>-<sex>.svg   e.g. body-ectomorph-female.svg
     goal-<id>-<sex>.svg   e.g. goal-lose-male.svg
   To use your own pictures, put them in ./images with the same
   names and change IMAGE_EXT below (for example to ".jpg").
   If a picture is missing, the emoji icon is shown instead.
   ========================================================= */
function selectionMediaHTML(kind, id, icon, label) {
  const sex = (userData.p?.sex || "male").toLowerCase();
  const female = sex === "female";
  const variant = kind === "body" ? id : (id === "gain" ? "mesomorph" : id === "lose" ? "endomorph" : "ectomorph");
  const malePaths = {
    ectomorph: "M45.94 6.03 L46.8 5.6 Q50 4 53.2 5.6 L54.06 6.03 Q58 8 59.16 12.24 L59.84 14.76 Q61 19 60.14 23.31 L59.86 24.69 Q59 29 62.86 31.11 L66.14 32.89 Q70 35 73.84 36.92 L74.16 37.08 Q78 39 80 40.5 L80.4 40.8 Q82 42 82 45.2 L82 46 Q82 50 82.27 54.39 L83.73 78.61 Q84 83 81.67 86.73 L81.33 87.27 Q79 91 77.08 88.12 L76.92 87.88 Q75 85 74.84 80.6 L74.16 61.4 Q74 57 72.21 52.98 L71.79 52.02 Q70 48 69.69 52.39 L68.31 71.61 Q68 76 67.85 80.4 L67.15 100.6 Q67 105 67.55 109.37 L69.45 124.63 Q70 129 69.41 133.36 L67.59 146.64 Q67 151 67.27 155.39 L68.73 179.61 Q69 184 66.12 186.88 L65.88 187.12 Q63 190 59.16 190 L58.84 190 Q55 190 54.6 185.62 L52.4 161.38 Q52 157 51.76 152.61 L50.24 125.39 Q50 121 49.76 125.39 L48.24 152.61 Q48 157 47.6 161.38 L45.4 185.62 Q45 190 41.16 190 L40.84 190 Q37 190 34.12 187.12 L33.88 186.88 Q31 184 31.27 179.61 L32.73 155.39 Q33 151 32.41 146.64 L30.59 133.36 Q30 129 30.55 124.63 L32.45 109.37 Q33 105 32.85 100.6 L32.15 80.4 Q32 76 31.69 71.61 L30.31 52.39 Q30 48 28.21 52.02 L27.79 52.98 Q26 57 25.84 61.4 L25.16 80.6 Q25 85 23.08 87.88 L22.92 88.12 Q21 91 18.67 87.27 L18.33 86.73 Q16 83 16.27 78.61 L17.73 54.39 Q18 50 18 46 L18 45.2 Q18 42 19.6 40.8 L20 40.5 Q22 39 25.84 37.08 L26.16 36.92 Q30 35 33.86 32.89 L37.14 31.11 Q41 29 40.14 24.69 L39.86 23.31 Q39 19 40.16 14.76 L40.84 12.24 Q42 8 45.94 6.03 Z",
    mesomorph: "M43.14 6.5 L45.6 5.6 Q50 4 54.4 5.6 L56.86 6.5 Q61 8 62.16 12.24 L62.84 14.76 Q64 19 62.74 23.21 L62.26 24.79 Q61 29 65.14 30.48 L70.86 32.52 Q75 34 78.47 36.7 L80.53 38.3 Q84 41 85.5 45.14 L86.5 47.86 Q88 52 87.71 56.39 L86.29 77.61 Q86 82 83.86 85.85 L83.14 87.15 Q81 91 78.6 88.6 L78.4 88.4 Q76 86 76 81.6 L76 60.4 Q76 56 73.36 52.48 L72.64 51.52 Q70 48 70 52.4 L70 73.6 Q70 78 70 82.4 L70 102.6 Q70 107 70.75 111.33 L73.25 125.67 Q74 130 73.18 134.32 L70.82 146.68 Q70 151 70.27 155.39 L71.73 179.61 Q72 184 69.12 186.88 L68.88 187.12 Q66 190 61.6 190 L60.4 190 Q56 190 55.6 185.62 L53.4 161.38 Q53 157 52.63 152.62 L50.37 125.38 Q50 121 49.63 125.38 L47.37 152.62 Q47 157 46.6 161.38 L44.4 185.62 Q44 190 39.6 190 L38.4 190 Q34 190 31.12 187.12 L30.88 186.88 Q28 184 28.27 179.61 L29.73 155.39 Q30 151 29.18 146.68 L26.82 134.32 Q26 130 26.75 125.67 L29.25 111.33 Q30 107 30 102.6 L30 82.4 Q30 78 30 73.6 L30 52.4 Q30 48 27.36 51.52 L26.64 52.48 Q24 56 24 60.4 L24 81.6 Q24 86 21.6 88.4 L21.4 88.6 Q19 91 16.86 87.15 L16.14 85.85 Q14 82 13.71 77.61 L12.29 56.39 Q12 52 13.5 47.86 L14.5 45.14 Q16 41 19.47 38.3 L21.53 36.7 Q25 34 29.14 32.52 L34.86 30.48 Q39 29 37.74 24.79 L37.26 23.21 Q36 19 37.16 14.76 L37.84 12.24 Q39 8 43.14 6.5 Z",
    endomorph: "M43.14 6.5 L45.6 5.6 Q50 4 54.4 5.6 L56.86 6.5 Q61 8 62.16 12.24 L62.84 14.76 Q64 19 62.74 23.21 L62.26 24.79 Q61 29 65.14 30.48 L70.86 32.52 Q75 34 79.06 35.69 L82.2 37 Q87 39 87.4 43.8 L87.63 46.62 Q88 51 87.86 55.4 L87.14 77.6 Q87 82 84.86 85.85 L84.14 87.15 Q82 91 79.6 88.6 L79.4 88.4 Q77 86 76.85 81.6 L76.15 60.4 Q76 56 73.36 52.48 L72.64 51.52 Q70 48 70.3 52.39 L71.7 72.61 Q72 77 73.48 81.14 L75 85.4 Q77 91 76.2 97.8 L75.51 103.63 Q75 108 74.78 112.39 L74.22 123.61 Q74 128 73.25 132.33 L70.75 146.67 Q70 151 70.27 155.39 L71.73 179.61 Q72 184 69.12 186.88 L68.88 187.12 Q66 190 61.6 190 L60.4 190 Q56 190 55.6 185.62 L53.4 161.38 Q53 157 52.63 152.62 L50.37 125.38 Q50 121 49.63 125.38 L47.37 152.62 Q47 157 46.6 161.38 L44.4 185.62 Q44 190 39.6 190 L38.4 190 Q34 190 31.12 187.12 L30.88 186.88 Q28 184 28.27 179.61 L29.73 155.39 Q30 151 29.25 146.67 L26.75 132.33 Q26 128 25.78 123.61 L25.22 112.39 Q25 108 24.49 103.63 L23.8 97.8 Q23 91 25 85.4 L26.52 81.14 Q28 77 28.3 72.61 L29.7 52.39 Q30 48 27.36 51.52 L26.64 52.48 Q24 56 23.85 60.4 L23.15 81.6 Q23 86 20.6 88.4 L20.4 88.6 Q18 91 15.86 87.15 L15.14 85.85 Q13 82 12.86 77.6 L12.14 55.4 Q12 51 12.37 46.62 L12.6 43.8 Q13 39 17.8 37 L20.94 35.69 Q25 34 29.14 32.52 L34.86 30.48 Q39 29 37.74 24.79 L37.26 23.21 Q36 19 37.16 14.76 L37.84 12.24 Q39 8 43.14 6.5 Z"
  };
  const femalePaths = {
    ectomorph: "M45.94 6.03 L46.8 5.6 Q50 4 53.2 5.6 L54.06 6.03 Q58 8 59.16 12.24 L59.84 14.76 Q61 19 60.14 23.31 L59.86 24.69 Q59 29 62.85 31.14 L64.15 31.86 Q68 34 71 35 L71.6 35.2 Q74 36 74.8 39.2 L75 40 Q76 44 76.27 48.39 L77.73 71.61 Q78 76 76.21 80.02 L75.79 80.98 Q74 85 72.08 83.08 L71.92 82.92 Q70 81 69.83 76.6 L69.17 59.4 Q69 55 67.08 51.64 L66.92 51.36 Q65 48 64.84 52.4 L64.16 71.6 Q64 76 64.57 80.36 L66.43 94.64 Q67 99 67.86 103.31 L70.14 114.69 Q71 119 70.09 123.31 L67.91 133.69 Q67 138 67.19 142.4 L68.81 179.6 Q69 184 66.12 186.88 L65.88 187.12 Q63 190 59.16 190 L58.84 190 Q55 190 54.66 185.61 L52.34 155.39 Q52 151 51.73 146.61 L50.27 123.39 Q50 119 49.73 123.39 L48.27 146.61 Q48 151 47.66 155.39 L45.34 185.61 Q45 190 41.16 190 L40.84 190 Q37 190 34.12 187.12 L33.88 186.88 Q31 184 31.19 179.6 L32.81 142.4 Q33 138 32.09 133.69 L29.91 123.31 Q29 119 29.86 114.69 L32.14 103.31 Q33 99 33.57 94.64 L35.43 80.36 Q36 76 35.84 71.6 L35.16 52.4 Q35 48 33.08 51.36 L32.92 51.64 Q31 55 30.83 59.4 L30.17 76.6 Q30 81 28.08 82.92 L27.92 83.08 Q26 85 24.21 80.98 L23.79 80.02 Q22 76 22.27 71.61 L23.73 48.39 Q24 44 25 40 L25.2 39.2 Q26 36 28.4 35.2 L29 35 Q32 34 35.85 31.86 L37.15 31.14 Q41 29 40.14 24.69 L39.86 23.31 Q39 19 40.16 14.76 L40.84 12.24 Q42 8 45.94 6.03 Z",
    mesomorph: "M44.09 6.37 L46 5.6 Q50 4 54 5.6 L55.91 6.37 Q60 8 61.16 12.24 L61.84 14.76 Q63 19 61.74 23.21 L61.26 24.79 Q60 29 63.94 30.97 L66.06 32.03 Q70 34 74 35.5 L74.8 35.8 Q78 37 78.8 40.6 L79.05 41.7 Q80 46 80.44 50.38 L82.56 71.62 Q83 76 80.86 79.85 L80.14 81.15 Q78 85 76.08 83.08 L75.92 82.92 Q74 81 73.66 76.61 L72.34 59.39 Q72 55 70.08 51.64 L69.92 51.36 Q68 48 68 52.4 L68 72.6 Q68 77 68.42 81.38 L69.58 93.62 Q70 98 71.21 102.23 L74.79 114.77 Q76 119 74.74 123.21 L71.26 134.79 Q70 139 70.1 143.4 L70.9 179.6 Q71 184 68.12 186.88 L67.88 187.12 Q65 190 60.68 190 L60.32 190 Q56 190 55.66 185.61 L53.34 155.39 Q53 151 52.59 146.62 L50.41 123.38 Q50 119 49.59 123.38 L47.41 146.62 Q47 151 46.66 155.39 L44.34 185.61 Q44 190 39.68 190 L39.32 190 Q35 190 32.12 187.12 L31.88 186.88 Q29 184 29.1 179.6 L29.9 143.4 Q30 139 28.74 134.79 L25.26 123.21 Q24 119 25.21 114.77 L28.79 102.23 Q30 98 30.42 93.62 L31.58 81.38 Q32 77 32 72.6 L32 52.4 Q32 48 30.08 51.36 L29.92 51.64 Q28 55 27.66 59.39 L26.34 76.61 Q26 81 24.08 82.92 L23.92 83.08 Q22 85 19.86 81.15 L19.14 79.85 Q17 76 17.44 71.62 L19.56 50.38 Q20 46 20.95 41.7 L21.2 40.6 Q22 37 25.2 35.8 L26 35.5 Q30 34 33.94 32.03 L36.06 30.97 Q40 29 38.74 24.79 L38.26 23.21 Q37 19 38.16 14.76 L38.84 12.24 Q40 8 44.09 6.37 Z",
    endomorph: "M44.09 6.37 L46 5.6 Q50 4 54 5.6 L55.91 6.37 Q60 8 61.16 12.24 L61.84 14.76 Q63 19 61.74 23.21 L61.26 24.79 Q60 29 63.94 30.97 L66.06 32.03 Q70 34 74.14 35.5 L76.6 36.4 Q81 38 81.4 42 L81.56 43.62 Q82 48 82.31 52.39 L83.69 71.61 Q84 76 81.86 79.85 L81.14 81.15 Q79 85 77.08 83.08 L76.92 82.92 Q75 81 74.66 76.61 L73.34 59.39 Q73 55 71.08 51.64 L70.92 51.36 Q69 48 69 52.4 L69 72.6 Q69 77 70.97 80.94 L73.2 85.4 Q76 91 75.6 96.2 L75.34 99.61 Q75 104 76.07 108.27 L77.93 115.73 Q79 120 77.55 124.15 L73.45 135.85 Q72 140 71.9 144.4 L71.1 179.6 Q71 184 68.12 186.88 L67.88 187.12 Q65 190 60.68 190 L60.32 190 Q56 190 55.66 185.61 L53.34 155.39 Q53 151 52.59 146.62 L50.41 123.38 Q50 119 49.59 123.38 L47.41 146.62 Q47 151 46.66 155.39 L44.34 185.61 Q44 190 39.68 190 L39.32 190 Q35 190 32.12 187.12 L31.88 186.88 Q29 184 28.9 179.6 L28.1 144.4 Q28 140 26.55 135.85 L22.45 124.15 Q21 120 22.07 115.73 L23.93 108.27 Q25 104 24.66 99.61 L24.4 96.2 Q24 91 26.8 85.4 L29.03 80.94 Q31 77 31.15 72.6 L31.85 52.4 Q32 48 30.08 51.36 L29.92 51.64 Q28 55 27.5 59.37 L25.5 76.63 Q25 81 23.08 82.92 L22.92 83.08 Q21 85 18.86 81.15 L18.14 79.85 Q16 76 16.31 71.61 L17.69 52.39 Q18 48 18.44 43.62 L18.6 42 Q19 38 23.4 36.4 L25.86 35.5 Q30 34 33.94 32.03 L36.06 30.97 Q40 29 38.74 24.79 L38.26 23.21 Q37 19 38.16 14.76 L38.84 12.24 Q40 8 44.09 6.37 Z"
  };
  const path = (female ? femalePaths : malePaths)[variant] || (female ? femalePaths.ectomorph : malePaths.ectomorph);
  return `<span class="selection-media silhouette ${female ? "female" : "male"}" aria-label="${label} illustration"><svg viewBox="0 0 100 200" role="img" aria-hidden="true"><path d="${path}" class="silhouette-shape" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></svg></span>`;
}

/* =========================================================
   GOALS
   ========================================================= */

const GOALS = [

  {
    id: "lose",

    name: "Lose Weight",

    icon: "🔥",

    description:
      "Create a controlled calorie deficit while preserving muscle."
  },

  {
    id: "maintain",

    name: "Maintain Weight",

    icon: "⚖️",

    description:
      "Keep your current body weight while improving nutrition."
  },

  {
    id: "gain",

    name: "Build Muscle",

    icon: "💪",

    description:
      "Support muscle growth with enough calories and protein."
  }

];


/* =========================================================
   WORKOUT DATA
   ========================================================= */

const WORKOUT_EXERCISES = [

  {
    name: "Bodyweight Squats",
    sets: "3 × 12",
    icon: "🦵"
  },

  {
    name: "Push-ups",
    sets: "3 × 10",
    icon: "💪"
  },

  {
    name: "Walking Lunges",
    sets: "3 × 10 each leg",
    icon: "🏃"
  },

  {
    name: "Plank",
    sets: "3 × 30 sec",
    icon: "🧘"
  },

  {
    name: "Jumping Jacks",
    sets: "3 × 30",
    icon: "⚡"
  }

];


/* =========================================================
   UTILITY FUNCTIONS
   ========================================================= */

function escapeHTML(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}


function todayKey() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return (
    `${year}-${month}-${day}`
  );

}


function U() {

  return userData;

}


function showMessage(
  message,
  type = "info"
) {

  const existing =
    document.querySelector(
      ".stride-toast"
    );

  if (existing) {
    existing.remove();
  }

  const toast =
    document.createElement(
      "div"
    );

  toast.className =
    `stride-toast ${type}`;

  toast.textContent =
    message;

  document.body.appendChild(
    toast
  );

  setTimeout(
    () => {

      toast.classList.add(
        "hide"
      );

      setTimeout(
        () => {

          toast.remove();

        },
        300
      );

    },
    2800
  );

}


function number(
  value,
  fallback = 0
) {

  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : fallback;

}


/* =========================================================
   SERVER / AUTH
   ========================================================= */

async function refreshMe() {

  const response =
    await fetch(
      "/api/me"
    );

  if (!response.ok) {

    throw new Error(
      "Not logged in"
    );

  }

  const data =
    await response.json();


  me =
    data.user?.id ??
    data.user ??
    null;

  syncPlanClock(data.server_now);

  isAdminUser =
    data.is_admin === true ||
    String(data.user?.email || "").toLowerCase() === "admin@eatright.co";


  userData = {

    p:
      data.profile ||
      null,

    ...(data.plan || {}),

    al:
      data.allergies ||
      [],

    subscription:
      data.subscription ||
      null,

    plan_day:
      data.plan_day ||
      null,

        needs_subscription:
      data.needs_subscription ??
      true,
    last_subscription:
      data.last_subscription ||
      null,
    done: {}

  };


  return data;

}


async function loadPlans() {

  if (plan === "trial") {
    showMessage("The 3-day trial is configured in the plan options. Server-side trial activation still needs to be updated.", "info");
    return;
  }
  if (plan === "custom") {
    const meals = Math.max(1, Math.min(5, Number(document.getElementById("custom-meals")?.value || 3)));
    const days = Math.max(1, Math.min(365, Number(document.getElementById("custom-days")?.value || 14)));
    showMessage(`Custom plan selected: ${meals} meals per day for ${days} days. Checkout activation is not connected yet.`, "info");
    return;
  }

  try {

    const response =
      await fetch(
        "/api/subscription-plans"
      );

    if (!response.ok) {
      return [];
    }

    const data =
      await response.json();

    return Array.isArray(data)
      ? data
      : data.plans || [];

  } catch (error) {

    console.error(
      "PLANS LOAD ERROR:",
      error
    );

    return [];

  }

}


async function loadTodayProgress() {

  if (!me) {
    return;
  }

  try {

    const response =
      await fetch(
        "/api/progress?date=" +
        encodeURIComponent(
          todayKey()
        )
      );

    if (!response.ok) {
      return;
    }

    const data =
      await response.json();

    userData.done[
      todayKey()
    ] =
      Array.isArray(
        data.slots
      )
        ? data.slots
        : [];

  } catch (error) {

    console.error(
      "PROGRESS LOAD ERROR:",
      error
    );

  }

  /* Personal dishes for today, generated on the server from the EatRight menu. */
  try {
    const mealRes = await fetch("/api/meal-plan");
    if (mealRes.ok) {
      const mealData = await mealRes.json();
      userData.todayMeals = Array.isArray(mealData.meals) ? mealData.meals : [];
      userData.todayTotals = mealData.totals || null;
      userData.calorieTarget = mealData.calorie_target || null;
    }
  } catch (error) {
    console.error("MEAL PLAN LOAD ERROR:", error);
  }

}


/* =========================================================
   AUTH ACTIONS
   ========================================================= */

async function login(
  formData
) {

  const response =
    await fetch(
      "/api/login",
      {
        method: "POST",
        ...jsonBody(formData)
      }
    );


  const data =
    await response.json()
      .catch(
        () => ({})
      );


  if (!response.ok) {

    showMessage(
      data.error ||
      "Login failed.",
      "error"
    );

    return;

  }


  try {

    await refreshMe();

    if (isAdminUser) {
      await openAdminConsole();
      return;
    }

    planLockAck = false;
    subscriptionUpgradeMode = false;

    await loadTodayProgress();


    if (!userData.p) {

      view =
        "profile";

    }

    else if (
      userData.needs_subscription
    ) {

      view =
        "subscription";

    }

    else {

      view =
        "plan";

    }


    render();

  } catch (error) {

    showMessage(
      "Logged in, but your account could not be loaded.",
      "error"
    );

  }

}


async function register(
  formData
) {

  const response =
    await fetch(
      "/api/register",
      {
        method: "POST",
        ...jsonBody(formData)
      }
    );


  const data =
    await response.json()
      .catch(
        () => ({})
      );


  if (!response.ok) {

    showMessage(
      data.error ||
      "Registration failed.",
      "error"
    );

    return;

  }


  try {

    await refreshMe();

    view =
      "profile";

    render();

    showMessage(
      "Account created successfully.",
      "success"
    );

  } catch (error) {

    showMessage(
      "Account created. Please log in.",
      "success"
    );

    view =
      "login";

    render();

  }

}


async function logout() {

  try {

    await fetch(
      "/api/logout",
      {
        method: "POST"
      }
    );

  } catch (error) {

    console.error(
      "LOGOUT ERROR:",
      error
    );

  }


  me =
    null;


  userData = {

    p: null,

    diet: null,

    body: null,

    goal: null,

    calories: null,

    protein: null,

    carbs: null,

    fats: null,

    al: [],

    subscription: null,

    plan_day: null,

        needs_subscription: true,
    last_subscription: null,
    done: {}
  };
  planLockAck = false;
  subscriptionUpgradeMode = false;
  view =
    "login";


  render();

}


/* =========================================================
   PROFILE
   ========================================================= */

async function saveProfile(
  formData
) {

  const age = Number(formData.get("age"));
  if (!Number.isInteger(age) || age < 16 || age > 100) {
    showMessage("You must be 16 or older to create an account and use EatRight.", "error");
    return;
  }

  const response =
    await fetch(
      "/api/profile",
      {
        method: "POST",
        ...jsonBody(formData)
      }
    );


  const data =
    await response.json()
      .catch(
        () => ({})
      );


  if (!response.ok) {

    showMessage(
      data.error ||
      "Could not save profile.",
      "error"
    );

    return;

  }


  try {

    await refreshMe();

  } catch (error) {

    console.error(
      "PROFILE REFRESH ERROR:",
      error
    );

  }


  view =
    "food";


  render();


  showMessage(
    "Profile saved.",
    "success"
  );

}


/* =========================================================
   FOOD PREFERENCES
   ========================================================= */

async function saveFood(
  formData
) {

  const response =
    await fetch(
      "/api/plan",
      {
        method: "POST",
        ...jsonBody(formData)
      }
    );


  const data =
    await response.json()
      .catch(
        () => ({})
      );


  if (!response.ok) {

    showMessage(
      data.error ||
      "Could not save your food preferences.",
      "error"
    );

    return;

  }


  try {

    await refreshMe();

  } catch (error) {

    console.error(
      "FOOD REFRESH ERROR:",
      error
    );

  }


  view =
    "body";


  render();


  showMessage(
    "Food preferences saved.",
    "success"
  );

}


/* =========================================================
   JOURNEY PROGRESS
   ========================================================= */

function getJourneyProgress() {

  const date =
    todayKey();


  const slots =
    Array.isArray(
      userData.done?.[date]
    )
      ? userData.done[date]
      : [];


  return {

    meals: [

      slots.includes(0),

      slots.includes(1),

      slots.includes(2),

      slots.includes(3),

      slots.includes(4)

    ],

    workout:
      slots.includes(5)

  };

}


async function setProgress(
  slot,
  done = true
) {

  const date =
    todayKey();


  const current =
    Array.isArray(
      userData.done[date]
    )
      ? [
          ...userData.done[date]
        ]
      : [];


  if (done) {

    if (
      !current.includes(
        slot
      )
    ) {

      current.push(
        slot
      );

    }

  } else {

    const index =
      current.indexOf(
        slot
      );

    if (index !== -1) {

      current.splice(
        index,
        1
      );

    }

  }


  userData.done[date] =
    current;


  render();


  try {

    const response =
      await fetch(
        "/api/progress",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              date,
              slot,
              done
            })
        }
      );


    if (!response.ok) {

      throw new Error(
        "Progress save failed."
      );

    }

  } catch (error) {

    console.error(
      "PROGRESS SAVE ERROR:",
      error
    );

    showMessage(
      "Progress could not be saved.",
      "error"
    );

  }

}


/* =========================================================
   MEAL JOURNEY ACTIONS
   ========================================================= */

/* A meal the customer chose to pick themselves in the shop; the next shop order completes it. */
let pendingMealSlot = null;
let mealDialogBusy = false;

async function deliverMeal(
  index
) {

  const state =
    getJourneyProgress();

  const nextMeal =
    state.meals.findIndex(
      done => !done
    );

  if (
    nextMeal !== index
  ) {

    if (
      nextMeal === -1
    ) {

      showMessage(
        "All meals are already complete.",
        "info"
      );

    } else {

      showMessage(
        `Complete ${MEALS[nextMeal].name} first.`,
        "info"
      );

    }

    return;

  }

  openMealOptions(index);

}

function closeMealDialog() {

  document.getElementById("meal-dialog")?.remove();

  document.removeEventListener("keydown", mealDialogKeys);

  mealDialogBusy = false;

}

function mealDialogKeys(event) {

  if (event.key === "Escape" && !mealDialogBusy) {
    closeMealDialog();
  }

}

function chooseMealYourself(index) {

  closeMealDialog();

  pendingMealSlot = index;

  showMessage(
    `Pick your own ${MEALS[index].name.toLowerCase()} and place an order to complete it.`,
    "info"
  );

  openShop();

}

/* Step 1: show 2-3 options for this meal (from the whole menu) plus "something else". */
function mealOptionCard(option, i) {

  const contains = option.allergens
    ? option.allergens.split("").map(c => ALLERGEN_LABELS[c] || c).join(", ")
    : "";

  return `
    <button type="button" class="meal-option" data-option="${i}">
      <span class="meal-option-top">
        <strong>${escapeHTML(option.name)}</strong>
        <span class="meal-option-price">${escapeHTML(rupees(option.price_paise))}</span>
      </span>
      ${option.suggested ? '<span class="meal-option-badge">Our pick for you</span>' : ""}
      <span class="meal-option-desc">${escapeHTML(option.description)}</span>
      <span class="meal-option-facts">
        ${Number(option.calories)} kcal · ${Number(option.protein_g)}g protein
        ${contains ? " · Contains: " + escapeHTML(contains) : ""}
      </span>
    </button>`;

}

async function openMealOptions(index) {

  closeMealDialog();

  const meal = MEALS[index];

  const overlay = document.createElement("div");

  overlay.id = "meal-dialog";

  overlay.className = "meal-dialog-overlay";

  overlay.innerHTML = `
    <div class="meal-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-dialog-title">
      <div class="meal-dialog-body">
        <p class="meal-dialog-eyebrow">${meal.icon} ${escapeHTML(meal.name)} · ${escapeHTML(meal.time)}</p>
        <h2 id="meal-dialog-title">Choose your ${escapeHTML(meal.name.toLowerCase())}</h2>
        <p class="meal-dialog-desc" id="meal-options-status">Finding options for you…</p>
        <div class="meal-options" id="meal-options"></div>
        <button class="meal-dialog-close" type="button" id="meal-dialog-cancel">Not now</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  document.addEventListener("keydown", mealDialogKeys);

  overlay.querySelector("#meal-dialog-cancel").addEventListener("click", closeMealDialog);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeMealDialog();
  });

  let options = [];

  try {

    const res = await fetch(`/api/meal-options?slot=${index}`);

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Could not load meal options.");

    options = Array.isArray(data.options) ? data.options : [];

  } catch (error) {

    console.error("MEAL OPTIONS ERROR:", error);

  }

  // The dialog may have been closed while loading.
  if (!document.getElementById("meal-dialog")) return;

  if (!options.length) {

    showMessage("We couldn't find options for this meal. Choose one from the menu.", "info");

    chooseMealYourself(index);

    return;

  }

  document.getElementById("meal-options-status").textContent =
    "Pick one and we'll deliver it, or browse the full menu.";

  const list = document.getElementById("meal-options");

  list.innerHTML = options.map(mealOptionCard).join("") + `
    <button type="button" class="meal-option meal-option-other" data-option="other">
      <span class="meal-option-top"><strong>Something else</strong></span>
      <span class="meal-option-desc">Not feeling these? Browse the whole menu and pick any dish.</span>
    </button>`;

  list.addEventListener("click", (event) => {

    const button = event.target.closest(".meal-option");

    if (!button) return;

    if (button.dataset.option === "other") {
      chooseMealYourself(index);
      return;
    }

    const option = options[Number(button.dataset.option)];

    openMealDialog(index, {
      menu_id: option.id,
      name: option.name,
      description: option.description,
      price_paise: option.price_paise,
      kcal: option.calories,
      protein_g: option.protein_g,
      serving_kcal: option.calories,
      serving_protein_g: option.protein_g,
      allergens: option.allergens
    });

  });

}

/* Step 2: delivery details for the dish the customer picked. */
async function openMealDialog(index, dish) {

  closeMealDialog();

  const meal = MEALS[index];

  const fee = 4900;

  const total = Number(dish.price_paise || 0) + fee;

  const contains = dish.allergens
    ? dish.allergens.split("").map(c => ALLERGEN_LABELS[c] || c).join(", ")
    : "";

  const overlay = document.createElement("div");

  overlay.id = "meal-dialog";

  overlay.className = "meal-dialog-overlay";

  overlay.innerHTML = `
    <div class="meal-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-dialog-title">
      <div class="meal-dialog-body">
        <p class="meal-dialog-eyebrow">${meal.icon} ${escapeHTML(meal.name)} · ${escapeHTML(meal.time)}</p>
        <h2 id="meal-dialog-title">${escapeHTML(dish.name)}</h2>
        <p class="meal-dialog-desc">${escapeHTML(dish.description)}</p>
        <p class="meal-dialog-facts">
          ${Number(dish.serving_kcal || dish.kcal)} kcal ·
          ${Number(dish.serving_protein_g || dish.protein_g)}g protein
          ${contains ? " · Contains: " + escapeHTML(contains) : ""}
        </p>
        <p class="meal-dialog-ask">Deliver this ${escapeHTML(meal.name.toLowerCase())}?</p>

        <form class="meal-dialog-form" id="meal-dialog-form">
          <label>Delivery address
            <textarea name="address" required minlength="10" maxlength="500"
              placeholder="House/flat, street, area, city, PIN code"></textarea>
          </label>
          <label>Contact number
            <input name="phone" required type="tel" pattern="[+0-9()\\s-]{8,20}" placeholder="Phone number">
          </label>
          <label>Delivery notes (optional)
            <input name="notes" maxlength="500" placeholder="Landmark or instructions">
          </label>
          <label>Payment method
            <select name="payment_method">
              <option value="cod">Cash on delivery</option>
              ${onlinePaymentsEnabled?'<option value="online">Online payment (UPI, cards, netbanking)</option>':''}
            </select>
          </label>

          <div class="meal-dialog-total">
            <span>${escapeHTML(rupees(dish.price_paise))} meal + ${escapeHTML(rupees(fee))} delivery</span>
            <strong>${escapeHTML(rupees(total))}</strong>
          </div>

          <p class="meal-dialog-error" id="meal-dialog-error" role="alert" hidden></p>

          <div class="meal-dialog-actions">
            <button class="btn primary" type="submit" id="meal-dialog-confirm">Yes, deliver this</button>
            <button class="btn secondary" type="button" id="meal-dialog-change">← Other options</button>
          </div>
          <button class="meal-dialog-close" type="button" id="meal-dialog-cancel">Not now</button>
        </form>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  document.addEventListener("keydown", mealDialogKeys);

  const form = overlay.querySelector("#meal-dialog-form");

  overlay.querySelector("#meal-dialog-change").addEventListener("click", () => {
    if (!mealDialogBusy) openMealOptions(index);
  });

  overlay.querySelector("#meal-dialog-cancel").addEventListener("click", () => {
    if (!mealDialogBusy) closeMealDialog();
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && !mealDialogBusy) closeMealDialog();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    confirmMealDelivery(index, dish, new FormData(form));
  });

  // Pre-fill with the details from the customer's last order, if any.
  try {

    const res = await fetch("/api/orders");

    if (res.ok) {

      const orders = await res.json();

      const last = Array.isArray(orders) ? orders[0] : null;

      if (last && document.getElementById("meal-dialog")) {
        form.address.value = last.address || "";
        form.phone.value = last.customer_phone || "";
      }

    }

  } catch (error) {
    /* pre-fill is optional */
  }

  form.address.focus();

}

/* Order is saved (and paid, if online): mark this meal as delivered and show the receipt. */
async function completeMealOrder(index, dish, result, message) {

  await setProgress(index, true);

  const box = document.querySelector("#meal-dialog .meal-dialog-body");

  if (!box) return;

  box.innerHTML = `
    <p class="meal-dialog-eyebrow">${MEALS[index].icon} ${escapeHTML(MEALS[index].name)}</p>
    <h2>Order placed</h2>
    <p class="meal-dialog-desc">${escapeHTML(dish.name)} is on its way.</p>
    <p class="meal-dialog-facts">${escapeHTML(message || "")}<br>Order reference: <strong>${escapeHTML(result.order_code)}</strong></p>
    <div class="meal-dialog-actions">
      <button class="btn primary" type="button" id="meal-dialog-done">Done</button>
    </div>`;

  document.getElementById("meal-dialog-done").addEventListener("click", closeMealDialog);

}

/* The online payment was cancelled or failed: the order is saved but unpaid, so the meal stays incomplete. */
function showMealPaymentPending(index, dish, result, phone, errorText) {

  const box = document.querySelector("#meal-dialog .meal-dialog-body");

  if (!box) return;

  box.innerHTML = `
    <p class="meal-dialog-eyebrow">${MEALS[index].icon} ${escapeHTML(MEALS[index].name)}</p>
    <h2>Payment not completed</h2>
    <p class="meal-dialog-desc">Your order <strong>${escapeHTML(result.order_code)}</strong> is saved but not paid yet.</p>
    ${errorText ? `<p class="meal-dialog-error">${escapeHTML(errorText)}</p>` : ""}
    <p class="meal-dialog-facts">You can pay now, or finish later from Your orders on the menu page. If money was deducted, contact us with this order reference.</p>
    <div class="meal-dialog-actions">
      <button class="btn primary" type="button" id="meal-dialog-retry">Pay now</button>
      <button class="meal-dialog-close" type="button" id="meal-dialog-later">Close</button>
    </div>`;

  document.getElementById("meal-dialog-later").addEventListener("click", closeMealDialog);

  document.getElementById("meal-dialog-retry").addEventListener("click", async (event) => {

    event.target.disabled = true;

    try {

      const outcome = await payForOrder(result.id, phone);

      if (outcome.paid) {
        await completeMealOrder(index, dish, result, "Payment received. Thank you!");
      } else {
        showMealPaymentPending(index, dish, result, phone, outcome.error || "");
      }

    } catch (error) {

      showMealPaymentPending(index, dish, result, phone, error.message || "Could not start payment.");

    }

  });

}

async function confirmMealDelivery(index, dish, formData) {

  if (mealDialogBusy) return;

  const errorBox = document.getElementById("meal-dialog-error");

  const confirmButton = document.getElementById("meal-dialog-confirm");

  // The slot may have been completed in another tab while the dialog was open.
  if (getJourneyProgress().meals[index]) {
    closeMealDialog();
    showMessage(`${MEALS[index].name} is already complete.`, "info");
    return;
  }

  mealDialogBusy = true;

  confirmButton.disabled = true;

  confirmButton.textContent = "Placing order…";

  errorBox.hidden = true;

  try {

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: dish.menu_id, quantity: 1 }],
        address: formData.get("address"),
        phone: formData.get("phone"),
        notes: formData.get("notes"),
        payment_method: formData.get("payment_method")
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not place your order.");
    }

    let paid = !result.payment;   // cash on delivery has no payment step

    let paymentError = "";

    if (result.payment) {

      confirmButton.textContent = "Opening payment…";

      const outcome = await startRazorpayPayment(result.id, result.payment, { contact: formData.get("phone") });

      paid = !!outcome.paid;

      paymentError = outcome.error || "";

    }

    if (!paid) {

      showMealPaymentPending(index, dish, result, formData.get("phone"), paymentError);

      mealDialogBusy = false;

      return;

    }

    await completeMealOrder(index, dish, result, result.payment ? "Payment received. Thank you!" : result.message);

    mealDialogBusy = false;

  } catch (error) {

    mealDialogBusy = false;

    confirmButton.disabled = false;

    confirmButton.textContent = "Yes, deliver this";

    errorBox.textContent = error.message || "Could not place your order.";

    errorBox.hidden = false;

  }

}

async function completeWorkout() {

  const state =
    getJourneyProgress();


  const allMealsComplete =
    state.meals.every(
      Boolean
    );


  if (!allMealsComplete) {

    const nextMeal =
      state.meals.findIndex(
        done => !done
      );


    showMessage(
      `Complete ${MEALS[nextMeal].name} before starting your workout.`,
      "info"
    );


    return;

  }


  if (state.workout) {

    showMessage(
      "Today's workout is already complete.",
      "info"
    );

    return;

  }


  await setProgress(
    5,
    true
  );


  showMessage(
    "Workout completed. Great work!",
    "success"
  );

}


/* =========================================================
   CALCULATIONS
   ========================================================= */

function calculateTargets(
  profile
) {

  if (!profile) {
    return null;
  }


  const weight =
    number(
      profile.weight
    );


  const height =
    number(
      profile.height
    );


  const age =
    number(
      profile.age
    );


  const sex =
    String(
      profile.sex ||
      "male"
    ).toLowerCase();


  if (
    !weight ||
    !height ||
    !age
  ) {

    return null;

  }


  let bmr;


  if (
    sex === "female"
  ) {

    bmr =
      10 * weight +
      6.25 * height -
      5 * age -
      161;

  } else {

    bmr =
      10 * weight +
      6.25 * height -
      5 * age +
      5;

  }


  const activity =
    number(
      profile.act,
      1
    );


  const multipliers = [

    1,

    1.2,

    1.375,

    1.55,

    1.725

  ];


  const multiplier =
    multipliers[activity] ||
    1.2;


  let calories =
    bmr * multiplier;


  const goal =
    String(
      userData.goal ||
      profile.goal ||
      "maintain"
    ).toLowerCase();


  if (
    goal === "lose" ||
    goal === "loss" ||
    goal === "weight_loss"
  ) {

    calories -= 400;

  }

  else if (
    goal === "gain" ||
    goal === "muscle_gain"
  ) {

    calories += 300;

  }


  calories =
    Math.max(
      1200,
      Math.round(
        calories
      )
    );


  const protein =
    Math.round(
      weight *
      (
        goal === "gain"
          ? 1.8
          : 1.6
      )
    );


  const fats =
    Math.round(
      (
        calories *
        0.25
      ) / 9
    );


  const remainingCalories =
    calories -
    protein * 4 -
    fats * 9;


  const carbs =
    Math.max(
      0,
      Math.round(
        remainingCalories /
        4
      )
    );


  return {

    calories,

    protein,

    carbs,

    fats

  };

}


function getTargets() {

  if (
    userData.calories ||
    userData.protein ||
    userData.carbs ||
    userData.fats
  ) {

    return {

      calories:
        number(
          userData.calories
        ),

      protein:
        number(
          userData.protein
        ),

      carbs:
        number(
          userData.carbs
        ),

      fats:
        number(
          userData.fats
        )

    };

  }


  return calculateTargets(
    userData.p
  );

}


/* =========================================================
   HEADER
   ========================================================= */

function headerHTML() {

  if (!me) {
    return "";
  }


  const isDark =
    theme === "dark";


  return `

    <header class="top">

      <span class="brand-logo header-logo"><img class="logo-light" src="./logo-light.png" alt="EatRight"><img class="logo-dark" src="./logo-dark.png" alt="EatRight"></span>

      <div class="top-actions">
        ${isPlanExpired() ? "" : '<button class="btn secondary" type="button" onclick="openShop()">Order meals</button>'}

        <button
          class="theme-toggle"
          type="button"
          onclick="toggleTheme()"
          title="Switch light/dark theme"
          aria-label="Switch light/dark theme"
        >

          <span>
            ${
              isDark
                ? "🌙"
                : "☀️"
            }
          </span>

          <strong>
            ${
              isDark
                ? "Dark"
                : "Light"
            }
          </strong>

        </button>


        <button
          class="btn secondary"
          type="button"
          onclick="logout()"
        >
          Log out
        </button>

      </div>

    </header>

  `;

}


/* =========================================================
   AUTH VIEW
   ========================================================= */

function loginView() {

  return `

    <main class="auth-page">
      <button
        class="theme-toggle auth-theme-toggle"
        type="button"
        onclick="toggleThemeSoft()"
        title="Switch light/dark theme"
        aria-label="Switch light/dark theme"
      >
        <span class="theme-state-light"><span>☀️</span><strong>Light</strong></span>
        <span class="theme-state-dark"><span>🌙</span><strong>Dark</strong></span>
      </button>

      <section class="auth-visual">

        <div class="auth-visual-content">



          <h1>
            India, it's your
            <span>
              right choice.
            </span>
          </h1>


          <p>
            Your personalized meals,
            workouts and daily progress —
            all in one place.
          </p>


          <div class="auth-highlights">

            <div>

              <span>
                🥗
              </span>

              <p>
                Personalized meals
              </p>

            </div>


            <div>

              <span>
                🏋️
              </span>

              <p>
                Daily workouts
              </p>

            </div>


            <div>

              <span>
                📈
              </span>

              <p>
                Track your progress
              </p>

            </div>

          </div>

        </div>

      </section>


      <section class="auth-panel">

        <div class="auth-card">

          <div class="brand-logo auth-logo">
            <img class="logo-light" src="./logo-light.png" alt="EatRight">
            <img class="logo-dark" src="./logo-dark.png" alt="EatRight">
          </div>
          <div class="auth-tabs">

            <button
              type="button"
              class="auth-tab active"
              onclick="showAuthForm('login')"
              id="login-tab"
            >
              Log in
            </button>


            <button
              type="button"
              class="auth-tab"
              onclick="showAuthForm('register')"
              id="register-tab"
            >
              Create account
            </button>

          </div>


          <div id="auth-form-container">

            ${loginFormHTML()}

          </div>

        </div>

      </section>

    </main>

  `;

}


function loginFormHTML() {

  return `

    <div class="form-heading">

      <h2>
        Welcome back
      </h2>

      <p>
        Log in to continue your EatRight journey.
      </p>

    </div>


    <form
      data-act="auth"
      class="form-stack"
    >

      <input
        type="hidden"
        name="mode"
        value="login"
      >


      <label>

        Email

        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          required
        >

      </label>


      <label>

        Password

        <input
          type="password"
          name="password"
          placeholder="Your password"
          required
        >

      </label>


      <button
        class="primary-button"
        type="submit"
      >
        Log in
      </button>

    </form>

  `;

}


function registerFormHTML() {

  return `

    <div class="form-heading">

      <h2>
        Create your account
      </h2>

      <p>
        Start building your personalized routine.
      </p>

    </div>


    <form
      data-act="auth"
      class="form-stack"
    >

      <input
        type="hidden"
        name="mode"
        value="register"
      >


      <label>

        Name

        <input
          type="text"
          name="name"
          placeholder="Your name"
          required
        >

      </label>


      <label>

        Email

        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          required
        >

      </label>


      <label>

        Password

        <input
          type="password"
          name="password"
          placeholder="Create a password"
          minlength="6"
          required
        >

      </label>


      <button
        class="primary-button"
        type="submit"
      >
        Create account
      </button>

    </form>

  `;

}


function showAuthForm(
  mode
) {

  const container =
    document.getElementById(
      "auth-form-container"
    );


  if (!container) {
    return;
  }


  const loginTab =
    document.getElementById(
      "login-tab"
    );


  const registerTab =
    document.getElementById(
      "register-tab"
    );


  if (
    mode === "login"
  ) {

    container.innerHTML =
      loginFormHTML();


    loginTab?.classList.add(
      "active"
    );


    registerTab?.classList.remove(
      "active"
    );

  }

  else {

    container.innerHTML =
      registerFormHTML();


    registerTab?.classList.add(
      "active"
    );


    loginTab?.classList.remove(
      "active"
    );

  }

}


/* =========================================================
   PROFILE VIEW
   ========================================================= */

function profileView() {

  const p =
    userData.p || {};


  const currentAct =
    number(
      p.act,
      1
    );


  return `

    <main class="page-shell">

      <section class="page-intro">

        <div>

          <span class="eyebrow">
            STEP 1 OF 4
          </span>

          <h1>
            Tell us about yourself.
          </h1>

          <p>
            We'll use this information to
            personalize your daily plan.
          </p>

        </div>

      </section>


      <section class="setup-card">

        <form
          data-act="profile"
          class="form-stack"
        >

          <div class="form-grid">

            <label>

              Age

              <input
                type="number"
                name="age"
                min="16"
                max="100"
                value="${escapeHTML(p.age || "")}"
                required
              >

            </label>


            <label>

              Sex

              <select
                name="sex"
                required
              >

                <option
                  value="male"
                  ${
                    p.sex === "male"
                      ? "selected"
                      : ""
                  }
                >
                  Male
                </option>

                <option
                  value="female"
                  ${
                    p.sex === "female"
                      ? "selected"
                      : ""
                  }
                >
                  Female
                </option>

              </select>

            </label>


            <label>

              Height (cm)

              <input
                type="number"
                name="height"
                min="100"
                max="250"
                value="${escapeHTML(p.height || "")}"
                required
              >

            </label>


            <label>

              Weight (kg)

              <input
                type="number"
                name="weight"
                min="25"
                max="300"
                step="0.1"
                value="${escapeHTML(p.weight || "")}"
                required
              >

            </label>

          </div>


          <label>

            Daily activity

            <select
              name="act"
              required
            >

              <option
                value="1"
                ${
                  currentAct === 1
                    ? "selected"
                    : ""
                }
              >
                Mostly sitting
              </option>

              <option
                value="2"
                ${
                  currentAct === 2
                    ? "selected"
                    : ""
                }
              >
                Light movement
              </option>

              <option
                value="3"
                ${
                  currentAct === 3
                    ? "selected"
                    : ""
                }
              >
                On my feet a lot
              </option>

              <option
                value="4"
                ${
                  currentAct === 4
                    ? "selected"
                    : ""
                }
              >
                Very physical work
              </option>

            </select>

          </label>


          <button
            type="submit"
            class="primary-button"
          >
            Continue
          </button>

        </form>

        ${String(me?.user?.email || "").toLowerCase() === "admin@eatright.co" ? `
          <div class="admin-tools" style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border, #ddd)">
            <h3>Administrator tools</h3>
            <p>Clear saved profiles, goals, preferences, allergies and progress for all accounts. User accounts and login credentials will remain.</p>
            <button type="button" class="secondary-button" id="clear-all-profiles">Delete all saved user profiles</button>
          </div>
        ` : ""}

      </section>

    </main>

  `;

}


/* =========================================================
   FOOD VIEW
   ========================================================= */

function foodView() {

  const selectedDiet =
    userData.diet ||
    userData.p?.diet ||
    "";


  const allergies =
    Array.isArray(
      userData.al
    )
      ? userData.al.join(
          ", "
        )
      : "";


  return `

    <main class="page-shell">

      <section class="page-intro">

        <div>

          <span class="eyebrow">
            STEP 2 OF 4
          </span>

          <h1>
            Let's personalize your food.
          </h1>

          <p>
            Choose the eating style that works
            best for you.
          </p>

        </div>

      </section>


      <section class="setup-card">

        <form
          data-act="food"
          class="form-stack"
        >

          <label>

            Eating preference

            <select
              name="diet"
              required
            >

              <option
                value=""
                disabled
                ${
                  !selectedDiet
                    ? "selected"
                    : ""
                }
              >
                Select a preference
              </option>

              <option
                value="vegetarian"
                ${
                  selectedDiet === "vegetarian"
                    ? "selected"
                    : ""
                }
              >
                Vegetarian
              </option>

              <option
                value="non-vegetarian"
                ${
                  selectedDiet === "non-vegetarian"
                    ? "selected"
                    : ""
                }
              >
                Non-vegetarian
              </option>

              <option
                value="vegan"
                ${
                  selectedDiet === "vegan"
                    ? "selected"
                    : ""
                }
              >
                Vegan
              </option>

              <option
                value="eggetarian"
                ${
                  selectedDiet === "eggetarian"
                    ? "selected"
                    : ""
                }
              >
                Eggetarian
              </option>

            </select>

          </label>


          <label>

            Allergies or foods to avoid

            <textarea
              name="allergies"
              rows="4"
              placeholder="Example: peanuts, shellfish, dairy"
            >${escapeHTML(allergies)}</textarea>

          </label>


          <div class="info-box">

            <span>
              ℹ️
            </span>

            <p>
              Separate multiple allergies with commas.
              Your plan can use this information to
              avoid foods you don't want.
            </p>

          </div>


          <button
            type="submit"
            class="primary-button"
          >
            Continue
          </button>

        </form>

      </section>

    </main>

  `;

}


/* =========================================================
   BODY VIEW
   ========================================================= */

function bodyView() {

  const selected =
    userData.body ||
    userData.p?.body ||
    "";


  return `

    <main class="page-shell">

      <section class="page-intro">

        <div>

          <span class="eyebrow">
            STEP 3 OF 4
          </span>

          <h1>
            What's your body type?
          </h1>

          <p>
            Pick the description that feels
            closest to you.
          </p>

        </div>

      </section>


      <section class="selection-grid">

        ${
          BODY_TYPES
            .map(
              type => `

                <button
                  type="button"
                  class="selection-card ${
                    selected === type.id
                      ? "selected"
                      : ""
                  }"
                  data-id="${type.id}"
                  onclick="selectBodyType('${type.id}')"
                >

                  ${selectionMediaHTML("body", type.id, type.icon, type.name)}

                  <strong>
                    ${type.name}
                  </strong>

                  <p>
                    ${type.description}
                  </p>

                </button>

              `
            )
            .join("")
        }

      </section>


      <div class="setup-actions">

        <button
          type="button"
          class="secondary-button"
          onclick="navigate('food')"
        >
          Back
        </button>


        <button
          type="button"
          class="primary-button"
          onclick="continueFromBody()"
        >
          Continue
        </button>

      </div>

    </main>

  `;

}


/* Marks the chosen card in place. The page is NOT re-rendered, so the
   pictures do not reload and the cards do not jump when you click. */
function markSelectedCard(id) {
  document.querySelectorAll(".selection-card").forEach(card => {
    card.classList.toggle("selected", card.dataset.id === id);
  });
}

function selectBodyType(id) {
  userData.body = id;
  markSelectedCard(id);
}


function continueFromBody() {

  if (!userData.body) {

    showMessage(
      "Please select a body type.",
      "error"
    );

    return;

  }


  view =
    "goal";


  render();

}


/* =========================================================
   GOAL VIEW
   ========================================================= */

function goalView() {

  const selected =
    userData.goal ||
    userData.p?.goal ||
    "";


  return `

    <main class="page-shell">

      <section class="page-intro">

        <div>

          <span class="eyebrow">
            STEP 4 OF 4
          </span>

          <h1>
            What's your main goal?
          </h1>

          <p>
            Your goal helps us adjust your
            calories and nutrition targets.
          </p>

        </div>

      </section>


      <section class="selection-grid">

        ${
          GOALS
            .map(
              goal => `

                <button
                  type="button"
                  class="selection-card ${
                    selected === goal.id
                      ? "selected"
                      : ""
                  }"
                  data-id="${goal.id}"
                  onclick="selectGoal('${goal.id}')"
                >

                  ${selectionMediaHTML("goal", goal.id, goal.icon, goal.name)}

                  <strong>
                    ${goal.name}
                  </strong>

                  <p>
                    ${goal.description}
                  </p>

                </button>

              `
            )
            .join("")
        }

      </section>


      <div class="setup-actions">

        <button
          type="button"
          class="secondary-button"
          onclick="navigate('body')"
        >
          Back
        </button>


        <button
          type="button"
          class="primary-button"
          onclick="finishSetup()"
        >
          Create My Plan
        </button>

      </div>

    </main>

  `;

}


function selectGoal(id) {
  userData.goal = id;
  markSelectedCard(id);
}


async function finishSetup() {

  if (!userData.goal) {

    showMessage(
      "Please select your goal.",
      "error"
    );

    return;

  }


  const formData =
    new FormData();


  formData.append(
    "body",
    userData.body || ""
  );


  formData.append(
    "goal",
    userData.goal || ""
  );


  formData.append(
    "diet",
    userData.diet ||
    userData.p?.diet ||
    ""
  );


  const response =
    await fetch(
      "/api/plan",
      {
        method: "POST",
        ...jsonBody(formData)
      }
    );


  const data =
    await response.json()
      .catch(
        () => ({})
      );


  if (!response.ok) {

    showMessage(
      data.error ||
      "Could not create your plan.",
      "error"
    );

    return;

  }


  try {

    await refreshMe();

  } catch (error) {

    console.error(
      "PLAN REFRESH ERROR:",
      error
    );

  }


  view =
    "subscription";


  render();


  showMessage(
    "Your personalized plan is ready.",
    "success"
  );

}


/* =========================================================
   SUBSCRIPTION VIEW
   ========================================================= */

function subscriptionView() {
  const upgrading = subscriptionUpgradeMode || isPlanExpired();
  return `<main class="page-shell">
    ${subscriptionIntroHTML(upgrading)}
    <section class="subscription-grid">
      ${upgrading ? "" : `<article class="subscription-card featured"><div class="subscription-badge">3-DAY TRIAL</div>
        <div class="subscription-icon">🌱</div><h2>Trial</h2><p class="subscription-price">3 days</p>
        <ul><li>Explore your personalized plan</li><li>Daily meals and nutrition guidance</li><li>Progress tracking</li></ul>
        <button type="button" class="primary-button" onclick="chooseSubscription('trial')">Start 3-day trial</button>
      </article>`}
      <article class="subscription-card"><div class="subscription-icon">⚡</div><h2>EatRight Plus</h2>
        <p class="subscription-price">1 month · 30 days</p>
        <ul><li>Full daily meal plan</li><li>Detailed nutrition targets</li><li>Progress tracking</li><li>Complete workout journey</li></ul>
        <button type="button" class="primary-button" onclick="chooseSubscription('plus')">Choose Plus</button>
      </article>
      <article class="subscription-card family-plan-card"><div class="subscription-badge">FAMILY</div>
        <div class="subscription-icon">👨‍👩‍👧‍👦</div><h2>Family Plan</h2><p class="subscription-price">4 people · 90 days</p>
        <ul><li>For up to 4 people</li><li>90 days of access</li><li>Personalized nutrition plans</li><li>Workout and progress tracking</li></ul>
        <button type="button" class="primary-button" onclick="chooseSubscription('family')">Choose Family Plan</button>
      </article>
      <article class="subscription-card"><div class="subscription-icon">🛠️</div><h2>Custom Plan</h2>
        <p class="subscription-price">Build your own schedule</p>
        <label class="custom-plan-field">Number of meals per day
          <input id="custom-meals" type="number" min="1" max="5" value="3" oninput="updateCustomPlanSummary()"></label>
        <label class="custom-plan-field">Number of days
          <input id="custom-days" type="number" min="1" max="365" value="14" oninput="updateCustomPlanSummary()"></label>
        <p class="custom-plan-summary" id="custom-plan-summary">3 meals a day for 14 days</p>
        <button type="button" class="primary-button" onclick="chooseSubscription('custom')">Continue with custom plan</button>
      </article>
    </section></main>`;
}
function updateCustomPlanSummary() {
  const meals = Math.max(1, Math.min(5, Number(document.getElementById("custom-meals")?.value || 3)));
  const days = Math.max(1, Math.min(365, Number(document.getElementById("custom-days")?.value || 14)));
  const summary = document.getElementById("custom-plan-summary");
  if (summary) summary.textContent = `${meals} meals a day for ${days} days`;
}


async function chooseSubscription(plan) {
  // The trial is started automatically by the server after onboarding.
  if (plan === "trial") {
    try {
      await refreshMe();

      if (userData.subscription && !userData.needs_subscription) {
        view = "plan";
        render();
        showMessage("Your trial is active. Welcome to EatRight!", "success");
      } else {
        showMessage(
          "Your trial has not started yet. Please complete your profile and food preferences first.",
          "info"
        );
      }
    } catch (error) {
      console.error("TRIAL CHECK ERROR:", error);
      showMessage("Could not verify your trial status.", "error");
    }

    return;
  }

  // Custom plans need a dedicated backend implementation.
  if (plan === "custom") {
    const meals = Math.max(
      1,
      Math.min(
        5,
        Number(document.getElementById("custom-meals")?.value || 3)
      )
    );

    const days = Math.max(
      1,
      Math.min(
        365,
        Number(document.getElementById("custom-days")?.value || 14)
      )
    );

    showMessage(
      `Custom plan: ${meals} meals per day for ${days} days. Custom checkout is not connected yet.`,
      "info"
    );

    return;
  }

  if (plan === "free") {
    userData.subscription = {
      plan: "free",
      status: "active"
    };

    userData.needs_subscription = false;
    view = "plan";
    render();

    return;
  }

  try {
    // Retrieve the actual plan IDs from the database.
    const plansResponse = await fetch("/api/subscription-plans");

    if (!plansResponse.ok) {
      throw new Error("Could not load subscription plans.");
    }

    const plansData = await plansResponse.json();
    const availablePlans = Array.isArray(plansData)
      ? plansData
      : plansData.plans || [];

    // Match the selected plan by its name, not by a hardcoded ID.
    const selectedPlan = availablePlans.find((item) => {
      const name = String(item.name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      if (plan === "plus") {
        return name.includes("plus");
      }

      if (plan === "family") {
        return name.includes("family");
      }

      return false;
    });

    if (!selectedPlan) {
      showMessage(
        `The ${plan} plan could not be found in the database. Please check your subscription plan records.`,
        "error"
      );

      return;
    }

    const response = await fetch("/api/subscription/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        plan_id: Number(selectedPlan.id)
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showMessage(
        data.error || "Checkout is not available yet.",
        "error"
      );

      return;
    }

    if (data.url) {
      window.location.href = data.url;
      return;
    }

    showMessage("Subscription selected.", "success");

  } catch (error) {
    console.error("SUBSCRIPTION ERROR:", error);

    showMessage(
      "Could not start checkout. Please try again.",
      "error"
    );
  }
}


/* =========================================================
   DAILY TARGETS
   ========================================================= */

function targetsHTML() {

  const targets =
    getTargets();


  if (!targets) {

    return `

      <div class="empty-card">

        <span>
          📊
        </span>

        <h3>
          Nutrition targets unavailable
        </h3>

        <p>
          Complete your profile to calculate
          your daily targets.
        </p>

      </div>

    `;

  }


  return `

    <div class="target-grid">


      <div class="target-card">

        <span>
          🔥
        </span>

        <strong>
          ${targets.calories}
        </strong>

        <small>
          kcal
        </small>

      </div>


      <div class="target-card">

        <span>
          🥩
        </span>

        <strong>
          ${targets.protein}g
        </strong>

        <small>
          protein
        </small>

      </div>


      <div class="target-card">

        <span>
          🍚
        </span>

        <strong>
          ${targets.carbs}g
        </strong>

        <small>
          carbs
        </small>

      </div>


      <div class="target-card">

        <span>
          🥑
        </span>

        <strong>
          ${targets.fats}g
        </strong>

        <small>
          fats
        </small>

      </div>


    </div>

  `;

}


/* =========================================================
   JOURNEY VIEW
   ========================================================= */

/* =========================================================
   PERSONAL DISH TEXT FOR THE MEAL JOURNEY
   ========================================================= */
const ALLERGEN_LABELS = { D: "dairy", G: "gluten", N: "tree nuts", P: "peanuts", S: "soy", E: "egg", F: "fish", C: "shellfish", T: "sesame" };

function mealText(index, meal) {
  const dish = userData.todayMeals && userData.todayMeals[index];
  if (!dish || !dish.id) {
    return { description: meal.description, detail: meal.detail };
  }
  const contains = dish.allergens
    ? " · Contains: " + dish.allergens.split("").map(c => ALLERGEN_LABELS[c] || c).join(", ")
    : "";
  return {
    description: "<strong>" + escapeHTML(dish.name) + "</strong><br>" + escapeHTML(dish.description),
    detail: dish.kcal + " kcal · " + dish.protein_g + "g protein · " + dish.carbs_g + "g carbs · " +
      dish.fat_g + "g fat · portion " + dish.portion + "×" + escapeHTML(contains)
  };
}

function mealJourneyHTML() {

  const state =
    getJourneyProgress();


  const completedSteps =
    state.meals.filter(
      Boolean
    ).length +
    (
      state.workout
        ? 1
        : 0
    );


  const totalSteps =
    6;


  const nextMeal =
    state.meals.findIndex(
      done => !done
    );


  const allMealsComplete =
    state.meals.every(
      Boolean
    );


  /*
    Each completed meal gets its own green segment.
    This prevents the progress line from stopping at
    the wrong position when card heights differ.
  */

  const mealSteps =
    MEALS
      .map(
        (
          meal,
          index
        ) => {

          const done =
            state.meals[index];


          const unlocked =
            index === nextMeal;


          const locked =
            !done &&
            !unlocked;


          return `

            <div
              class="
                journey-step
                ${
                  done
                    ? "completed"
                    : ""
                }
                ${
                  unlocked
                    ? "current"
                    : ""
                }
                ${
                  locked
                    ? "locked"
                    : ""
                }
              "
              data-meal-index="${index}"
            >


              <div class="journey-node">

                <span>

                  ${
                    done
                      ? "✓"
                      : meal.icon
                  }

                </span>

              </div>


              <div class="journey-content">

                <div class="journey-time">
                  ${meal.time}
                </div>


                <h3>
                  ${meal.name}
                </h3>


                <p>
                  ${mealText(index, meal).description}
                </p>


                <small>
                  ${mealText(index, meal).detail}
                </small>


                ${
                  done

                    ? `

                      <div class="completed-label">
                        ✓ Meal delivered
                      </div>

                    `

                    : unlocked

                      ? `

                        <button
                          type="button"
                          class="deliver-btn"
                          onclick="deliverMeal(${index})"
                        >
                          Deliver ${meal.name}
                        </button>

                      `

                      : `

                        <div class="locked-label">
                          🔒 Complete the previous meal first
                        </div>

                      `
                }


              </div>

            </div>


            <div
              class="
                journey-segment
                ${
                  done
                    ? "completed"
                    : ""
                }
              "
              aria-hidden="true"
            ></div>

          `;

        }
      )
      .join("");


  const workoutDone =
    state.workout;


  const workoutUnlocked =
    allMealsComplete;


  return `

    <section class="meal-journey-card">


      <div class="journey-heading">


        <div>

          <span class="eyebrow">
            TODAY'S JOURNEY
          </span>


          <h2>
            Your day, one step at a time.
          </h2>


          <p>
            Meals unlock in order.
            Your workout becomes available
            after dinner.
          </p>

        </div>


        <div class="journey-counter">

          <strong>
            ${completedSteps}/${totalSteps}
          </strong>

          <span>
            complete
          </span>

        </div>


      </div>


      <div
        class="meal-journey"
        style="
          --journey-completed:${completedSteps};
          --journey-total:${totalSteps}
        "
      >


        ${mealSteps}


        <div
          class="
            journey-step
            workout-step
            ${
              workoutDone
                ? "completed"
                : ""
            }
            ${
              workoutUnlocked &&
              !workoutDone
                ? "current"
                : ""
            }
            ${
              !workoutUnlocked
                ? "locked"
                : ""
            }
          "
        >


          <div class="journey-node workout-node">

            <span>

              ${
                workoutDone
                  ? "✓"
                  : WORKOUT.icon
              }

            </span>

          </div>


          <div class="journey-content">

            <div class="journey-time">
              ${WORKOUT.time}
            </div>


            <h3>
              ${WORKOUT.name}
            </h3>


            <p>
              ${WORKOUT.description}
            </p>


            <small>
              ${WORKOUT.detail}
            </small>


            ${
              workoutDone

                ? `

                  <div class="completed-label">
                    ✓ Workout completed
                  </div>

                `

                : workoutUnlocked

                  ? `

                    <button
                      type="button"
                      class="deliver-btn workout-button"
                      onclick="completeWorkout()"
                    >
                      Start Workout
                    </button>

                  `

                  : `

                    <div class="locked-label">
                      🔒 Complete all five meals to unlock
                    </div>

                  `
            }

          </div>

        </div>

      </div>

    </section>

  `;

}


/* =========================================================
   WORKOUT CARD
   ========================================================= */

function workoutCardHTML() {

  return `

    <section class="content-card">

      <div class="section-heading">

        <div>

          <span class="eyebrow">
            TODAY'S WORKOUT
          </span>

          <h2>
            Strength & movement
          </h2>

        </div>

      </div>


      <div class="exercise-list">

        ${
          WORKOUT_EXERCISES
            .map(
              exercise => `

                <div class="exercise-row">

                  <span class="exercise-icon">
                    ${exercise.icon}
                  </span>

                  <div>

                    <strong>
                      ${exercise.name}
                    </strong>

                    <span>
                      ${exercise.sets}
                    </span>

                  </div>

                </div>

              `
            )
            .join("")
        }

      </div>

    </section>

  `;

}


/* =========================================================
   DASHBOARD
   ========================================================= */

function planView() {

  const p =
    userData.p || {};


  const goal =
    userData.goal ||
    p.goal ||
    "maintain";


  const goalObject =
    GOALS.find(
      item =>
        item.id === goal
    );


  const state =
    getJourneyProgress();


  return `

    <main class="dashboard-shell">


      <section class="dashboard-hero">


        <div>

          <span class="eyebrow">
            ${todayKey()}
          </span>


          <h1>

            Good day${
              p.name
                ? ", " +
                  escapeHTML(
                    p.name
                  )
                : ""
            }.

          </h1>


          <p>
            Stay consistent.
            Small steps add up.
          </p>

        </div>


        <div class="goal-pill">

          <span>
            ${
              goalObject?.icon ||
              "🎯"
            }
          </span>


          <div>

            <small>
              Current goal
            </small>

            <strong>
              ${
                goalObject?.name ||
                "Your goal"
              }
            </strong>

          </div>

        </div>


      </section>


      ${planStatusHTML()}

      <section>

        ${targetsHTML()}

      </section>


      ${mealJourneyHTML()}


      ${workoutCardHTML()}


      <section class="dashboard-bottom-grid">


        <article class="content-card">

          <div class="section-heading">

            <div>

              <span class="eyebrow">
                DAILY FOCUS
              </span>

              <h2>
                Keep it simple.
              </h2>

            </div>

          </div>


          <div class="focus-list">


            <div>

              <span>
                💧
              </span>

              <p>
                Stay hydrated throughout the day.
              </p>

            </div>


            <div>

              <span>
                🥗
              </span>

              <p>
                Follow your meal journey in order.
              </p>

            </div>


            <div>

              <span>
                🏃
              </span>

              <p>
                Complete your workout after dinner.
              </p>

            </div>


          </div>

        </article>


        <article class="content-card">


          <div class="section-heading">

            <div>

              <span class="eyebrow">
                PROGRESS
              </span>

              <h2>
                Today's completion
              </h2>

            </div>

          </div>


          <div class="big-progress">


            <div
              class="progress-ring"
              style="
                --progress:
                ${
                  (
                    (
                      state.meals.filter(
                        Boolean
                      ).length +
                      (
                        state.workout
                          ? 1
                          : 0
                      )
                    ) / 6
                  ) * 100
                }%;
              "
            >

              <strong>

                ${
                  Math.round(
                    (
                      (
                        state.meals.filter(
                          Boolean
                        ).length +
                        (
                          state.workout
                            ? 1
                            : 0
                        )
                      ) / 6
                    ) * 100
                  )
                }%

              </strong>

            </div>


            <p>
              Keep moving through your journey.
            </p>


          </div>


        </article>


      </section>


    </main>

  `;

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function navigate(
  nextView
) {

  if (!me) {

    view =
      "login";

    render();

    return;

  }


  if (
    nextView === "plan" &&
    userData.needs_subscription
  ) {

    view =
      "subscription";

    render();

    return;

  }


  view =
    nextView;


  render();

}


/* =========================================================
   EATRIGHT MEAL ORDERING — PHASE 1
   ========================================================= */
let shopMenu = [];
let shopOrders = [];
let shopCart = {};

/* ---------- Razorpay checkout (browser side) ---------- */
let onlinePaymentsEnabled = false;
fetch('/api/payment-config').then(r => r.json()).then(c => { onlinePaymentsEnabled = !!c.online; }).catch(() => {});

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const tag = document.createElement('script');
    tag.src = 'https://checkout.razorpay.com/v1/checkout.js';
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Could not open the payment window. Your order is saved; use "Pay now" under Your orders once you are online.'));
    document.head.appendChild(tag);
  });
}

/* Opens Razorpay Checkout. Resolves { paid:true } only after the server has verified the payment. */
async function startRazorpayPayment(orderId, session, prefill = {}) {
  await loadRazorpayScript();
  return new Promise(resolve => {
    const checkout = new window.Razorpay({
      key: session.key_id,
      amount: session.amount,
      currency: session.currency,
      order_id: session.order_id,
      name: session.name,
      description: session.description,
      prefill,
      handler: async (response) => {
        try {
          const verify = await fetch(`/api/orders/${orderId}/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          const data = await verify.json();
          resolve(verify.ok ? { paid: true } : { paid: false, error: data.error || 'Payment could not be verified.' });
        } catch (error) {
          resolve({ paid: false, error: 'Could not confirm the payment. If money was deducted, contact us with your order number.' });
        }
      },
      modal: { ondismiss: () => resolve({ paid: false, cancelled: true }) }
    });
    checkout.open();
  });
}

async function payForOrder(orderId, phone) {
  const response = await fetch(`/api/orders/${orderId}/payment-session`, { method: 'POST' });
  const session = await response.json();
  if (!response.ok) throw new Error(session.error || 'Could not start payment.');
  return startRazorpayPayment(orderId, session, { contact: phone || '' });
}

async function payShopOrder(id) {
  try {
    const order = shopOrders.find(o => o.id === id);
    const outcome = await payForOrder(id, order && order.customer_phone);
    if (outcome.paid) {
      if (pendingMealSlot !== null) {
        const slot = pendingMealSlot;
        pendingMealSlot = null;
        if (!getJourneyProgress().meals[slot]) await setProgress(slot, true);
      }
      alert('Payment received. Thank you!');
      await openShop();
    } else if (outcome.error) {
      alert(outcome.error);
    }
  } catch (error) {
    alert(error.message || 'Could not start payment.');
  }
}
const rupees = paise => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(paise||0)/100);
async function openShop() {
  if (isPlanExpired()) { render(); return; }
  try {
    const [menuRes,orderRes]=await Promise.all([fetch('/api/menu'),fetch('/api/orders')]);
    shopMenu=await menuRes.json();
    shopOrders=orderRes.ok?await orderRes.json():[];
    view='shop'; render();
  } catch(err) { alert('Could not load the meal shop. Please try again.'); }
}
function shopView() {
  const rows=shopMenu.map(item=>`<article class="shop-item"><div class="shop-item-icon">${item.vegetarian?'🥗':'🍽️'}</div><div class="shop-item-body"><div class="shop-item-top"><h3>${escapeShop(item.name)}</h3><strong>${rupees(item.price_paise)}</strong></div><p>${escapeShop(item.description)}</p><small>${item.calories} kcal · ${item.protein_g}g protein · ${item.category}</small><button class="btn primary shop-add" type="button" onclick="addShopItem(${item.id})">Add to cart</button></div></article>`).join('');
  const cartRows=Object.entries(shopCart).map(([id,qty])=>{const item=shopMenu.find(x=>x.id===Number(id));return item?`<div class="shop-cart-row"><span>${escapeShop(item.name)} × ${qty}</span><strong>${rupees(item.price_paise*qty)}</strong><button type="button" class="text-button" onclick="removeShopItem(${id})">Remove</button></div>`:''}).join('');
  const subtotal=Object.entries(shopCart).reduce((sum,[id,qty])=>sum+(shopMenu.find(x=>x.id===Number(id))?.price_paise||0)*qty,0);
  const fee=subtotal?4900:0;
  const orders=shopOrders.map(o=>`<article class="shop-order"><div class="shop-order-head"><strong>${escapeShop(o.order_code)}</strong><span class="order-status status-${o.status}">${o.status.replaceAll('_',' ')}</span></div><p>${o.items.map(i=>`${escapeShop(i.item_name)} × ${i.quantity}`).join(' · ')}</p><small>${o.payment_method==='cod'?'Cash on delivery':'Online payment ('+o.payment_status+')'} · ${rupees(o.total_paise)} · ${new Date(o.created_at+'Z').toLocaleString()}</small>${(!isShopAdmin()&&o.payment_method==='online'&&['pending','failed'].includes(o.payment_status)&&o.status!=='cancelled')?`<button class="btn primary" onclick="payShopOrder(${o.id})">Pay now</button>`:''}${isShopAdmin()?`<div class="shop-admin-actions"><select id="order-status-${o.id}">${['confirmed','preparing','ready_for_pickup','out_for_delivery','delivered','cancelled'].map(st=>`<option value="${st}" ${st===o.status?'selected':''}>${st.replaceAll('_',' ')}</option>`).join('')}</select><button class="btn secondary" onclick="updateShopOrder(${o.id})">Update status</button><small>Customer: ${escapeShop(o.customer_email||'')}</small></div>`:''}</article>`).join('');
  return `<main class="shop-page"><div class="shop-heading"><div><p class="eyebrow">EATRIGHT KITCHEN</p><h1>Order balanced meals</h1><p>Freshly prepared by our kitchen and delivered in our pilot service area.</p></div><button class="btn secondary" onclick="goBackFromShop()">Back to my plan</button></div><div class="shop-layout"><section class="shop-menu"><h2>Today's menu</h2><div class="shop-items">${rows||'<p>Menu is being updated. Please check back soon.</p>'}</div></section><aside class="shop-checkout"><h2>Your cart</h2>${cartRows||'<p class="muted">Your cart is empty. Add a meal to get started.</p>'}<div class="shop-total"><span>Subtotal</span><strong>${rupees(subtotal)}</strong></div><div class="shop-total"><span>Delivery fee</span><strong>${rupees(fee)}</strong></div><div class="shop-total shop-grand"><span>Total</span><strong>${rupees(subtotal+fee)}</strong></div><form data-act="checkout" class="shop-form"><label>Delivery address<textarea name="address" required minlength="10" maxlength="500" placeholder="House/flat, street, area, city, PIN code"></textarea></label><label>Contact number<input name="phone" required type="tel" pattern="[+0-9()\\s-]{8,20}" placeholder="Phone number"></label><label>Delivery notes (optional)<input name="notes" maxlength="500" placeholder="Landmark or instructions"></label><label>Payment method<select name="payment_method"><option value="cod">Cash on delivery</option>${onlinePaymentsEnabled?'<option value="online">Online payment (UPI, cards, netbanking)</option>':''}</select></label><button class="btn primary" type="submit" ${subtotal?'':'disabled'}>Place order · ${rupees(subtotal+fee)}</button><small>Ordering is currently a pilot. A third-party courier connection will be configured before live fulfilment.</small></form></aside></div><section class="shop-order-history"><h2>${isShopAdmin()?'All customer orders':'Your orders'}</h2>${orders||'<p class="muted">No orders yet.</p>'}</section></main>`;
}
function escapeShop(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function isShopAdmin(){return String(me?.email||'').toLowerCase()==='admin@eatright.co';}
function addShopItem(id){shopCart[id]=Math.min(30,(shopCart[id]||0)+1);render();}
function removeShopItem(id){delete shopCart[id];render();}
function goBackFromShop(){pendingMealSlot=null;view='plan';render();}
async function updateShopOrder(id){const status=document.getElementById(`order-status-${id}`)?.value;try{const r=await fetch(`/api/admin/orders/${id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});const d=await r.json();if(!r.ok)throw new Error(d.error);await openShop();}catch(e){alert(e.message||'Could not update order.');}}

/* =========================================================
   VIEW REGISTRY
   ========================================================= */

const V = {

  login:
    loginView,

  profile:
    profileView,

  food:
    foodView,

  body:
    bodyView,

  goal:
    goalView,

  subscription:
    subscriptionView,

  plan:
    planView,

  shop:
    shopView

};


/* =========================================================
   FORM ACTIONS
   ========================================================= */

const A = {

  async checkout(formData) {
    if (!Object.keys(shopCart).length) return alert('Your cart is empty.');
    const payload={items:Object.entries(shopCart).map(([id,quantity])=>({id:Number(id),quantity})),address:formData.get('address'),phone:formData.get('phone'),notes:formData.get('notes'),payment_method:formData.get('payment_method')};
    try { const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not place order.');shopCart={};let paid=!result.payment,note=result.message;if(result.payment){const outcome=await startRazorpayPayment(result.id,result.payment,{contact:payload.phone});paid=!!outcome.paid;note=paid?'Payment received. Thank you!':'Payment not completed. Your order is saved. Use "Pay now" under Your orders to finish it.'+(outcome.error?'\n'+outcome.error:'');}if(paid&&pendingMealSlot!==null){const slot=pendingMealSlot;pendingMealSlot=null;if(!getJourneyProgress().meals[slot])await setProgress(slot,true);}alert(`${note}\nOrder reference: ${result.order_code}`);await openShop(); } catch(error){alert(error.message||'Could not place order.');}
  },

  async auth(
    formData
  ) {

    const mode =
      formData.get(
        "mode"
      );


    if (
      mode === "register"
    ) {

      await register(
        formData
      );

    } else {

      await login(
        formData
      );

    }

  },


  async profile(
    formData
  ) {

    await saveProfile(
      formData
    );

  },


  async food(
    formData
  ) {

    const diet =
      formData.get(
        "diet"
      );


    const allergiesText =
      String(
        formData.get(
          "allergies"
        ) || ""
      );


    userData.diet =
      diet;


    userData.al =
      allergiesText
        .split(",")
        .map(
          item =>
            item.trim()
        )
        .filter(
          Boolean
        );


    const payload =
      new FormData();


    payload.append(
      "diet",
      diet || ""
    );


    payload.append(
      "allergies",
      allergiesText
    );


    await saveFood(
      payload
    );

  }

};


/* =========================================================
   FORM SUBMISSION DELEGATION
   ========================================================= */

document.addEventListener(
  "submit",
  event => {

    const form =
      event.target;


    if (
      !(form instanceof HTMLFormElement)
    ) {

      return;

    }


    const action =
      form.dataset.act;


    if (!action) {
      return;
    }


    event.preventDefault();


    if (A[action]) {

      A[action](
        new FormData(
          form
        )
      );

    }

  }
);


/* =========================================================
   CLICK HANDLING
   ========================================================= */

document.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        "button[data-no-action]"
      );


    if (button) {

      event.preventDefault();

    }

  }
);


/* =========================================================
   APPLICATION STARTUP
   ========================================================= */

async function startApp() {

  view =
    "login";


  render();


  try {

    const data =
      await refreshMe();


    if (isAdminUser) {
      await openAdminConsole();
      return;
    }

    planLockAck = false;
    subscriptionUpgradeMode = false;


    await loadTodayProgress();


    if (
      !data.profile
    ) {

      view =
        "profile";

    }

    else if (
      userData.needs_subscription
    ) {

      view =
        "subscription";

    }

    else {

      view =
        "plan";

    }


    render();


  } catch (error) {

    me =
      null;

    view =
      "login";

    render();

  }

}


/* =========================================================
   MAIN RENDER FUNCTION
   ========================================================= */

function renderCore() {

  const app =
    document.getElementById(
      "app"
    );


  if (!app) {
    return;
  }


  if (!me) {

    isAdminUser =
      false;

    app.innerHTML =
      V.login();

    return;

  }


  if (isAdminUser) {

    app.innerHTML =
      adminPageHTML();

    return;

  }


  const currentView =
    V[view]
      ? V[view]()
      : V.plan();


  app.innerHTML =
    headerHTML() +
    currentView;

}


function render() {
  renderCore();
  enforcePlanLock();
}

/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener("click", async (event) => {
  const button = event.target.closest("#clear-all-profiles");
  if (!button) return;
  const confirmed = window.confirm("Delete all saved profiles, goals, preferences, allergies and progress? User accounts will remain. This cannot be undone.");
  if (!confirmed) return;
  button.disabled = true;
  try {
    const response = await fetch("/api/admin/profiles", { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed.");
    alert("All saved profile data has been deleted. Accounts were preserved.");
    await startApp();
  } catch (error) {
    alert(error.message || "Could not delete profile data.");
  } finally {
    button.disabled = false;
  }
});

document.addEventListener(
  "DOMContentLoaded",
  () => {
    startApp();
  }
);

/* =========================================================
   ADMIN CONSOLE
   Separate page for admin@eatright.co: no customer pages,
   just account management (inspect, ban, erase all).
   ========================================================= */

const adminState = {
  users: [],
  detail: null
};

const ADMIN_ACTIVITY = {
  1: "Mostly sitting",
  2: "Light movement",
  3: "On my feet a lot",
  4: "Very physical work"
};

function adminEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function adminDate(value) {
  if (!value) return "—";
  let text = String(value);
  if (!/[TZ]/.test(text)) text = text.replace(" ", "T") + "Z";
  const date = new Date(text);
  return isNaN(date) ? adminEsc(value) : date.toLocaleString();
}

function adminRupees(paise) {
  return "₹" + (Number(paise || 0) / 100).toFixed(2);
}

async function adminFetch(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function openAdminConsole() {
  view = "admin";
  adminState.detail = null;
  try {
    adminState.users = await adminFetch("/api/admin/users");
  } catch (error) {
    adminState.users = [];
    alert(error.message || "Could not load customer accounts.");
  }
  render();
}

async function adminInspect(id) {
  try {
    adminState.detail = await adminFetch("/api/admin/users/" + Number(id));
    render();
    window.scrollTo(0, 0);
  } catch (error) {
    alert(error.message || "Could not load this account.");
  }
}

async function adminBack() {
  await openAdminConsole();
}

function adminFilter(text) {
  const q = String(text || "").trim().toLowerCase();
  document.querySelectorAll("[data-admin-row]").forEach((row) => {
    row.hidden = q !== "" && !row.dataset.adminRow.includes(q);
  });
}

async function adminBan(id) {
  const email = adminState.detail?.user?.email || "this account";
  const reason = window.prompt(
    "Ban " + email + "?\nThey will be logged out immediately and cannot log in again until unbanned.\n\nOptional reason (only you can see it):",
    ""
  );
  if (reason === null) return;
  try {
    await adminFetch("/api/admin/users/" + Number(id) + "/ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });
    await adminInspect(id);
  } catch (error) {
    alert(error.message || "Could not ban this account.");
  }
}

async function adminUnban(id) {
  if (!window.confirm("Allow this account to log in again?")) return;
  try {
    await adminFetch("/api/admin/users/" + Number(id) + "/unban", { method: "POST" });
    await adminInspect(id);
  } catch (error) {
    alert(error.message || "Could not unban this account.");
  }
}

async function adminEraseAll() {
  const typed = window.prompt(
    "This permanently deletes EVERY customer account and all their data (profiles, plans, subscriptions, progress, orders). Your admin account stays. This cannot be undone.\n\nType ERASE ALL to confirm:"
  );
  if (typed === null) return;
  if (typed !== "ERASE ALL") {
    alert("Confirmation text did not match. Nothing was deleted.");
    return;
  }
  try {
    const result = await adminFetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "ERASE ALL" })
    });
    alert(result.removed + " customer account(s) erased.");
    await openAdminConsole();
  } catch (error) {
    alert(error.message || "Could not erase customer accounts.");
  }
}

function adminHeaderHTML() {
  const isDark = theme === "dark";
  return `
    <header class="top">
      <span class="brand-logo header-logo"><img class="logo-light" src="./logo-light.png" alt="EatRight"><img class="logo-dark" src="./logo-dark.png" alt="EatRight"></span>
      <div class="top-actions">
        <span class="admin-badge">Administrator</span>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" title="Switch light/dark theme" aria-label="Switch light/dark theme">
          <span>${isDark ? "🌙" : "☀️"}</span>
          <strong>${isDark ? "Dark" : "Light"}</strong>
        </button>
        <button class="btn secondary" type="button" onclick="logout()">Log out</button>
      </div>
    </header>
  `;
}

function adminPageHTML() {
  return adminHeaderHTML() +
    '<main class="admin-page">' +
    (adminState.detail ? adminDetailHTML() : adminListHTML()) +
    "</main>";
}

function adminListHTML() {
  const users = adminState.users;
  const bannedCount = users.filter((u) => u.banned).length;

  const rows = users.map((u) => {
    const searchText = adminEsc((String(u.email) + " " + String(u.name || "")).toLowerCase());
    return `
      <tr data-admin-row="${searchText}">
        <td><strong>${adminEsc(u.email)}</strong>${u.name ? `<br><small>${adminEsc(u.name)}</small>` : ""}</td>
        <td>${adminDate(u.created_at)}</td>
        <td>${u.subscription ? adminEsc(u.subscription) : "<small>None</small>"}</td>
        <td>${Number(u.order_count)}</td>
        <td>${u.banned ? '<span class="admin-pill banned">Banned</span>' : '<span class="admin-pill ok">Active</span>'}</td>
        <td><button class="btn secondary" type="button" onclick="adminInspect(${Number(u.id)})">Inspect</button></td>
      </tr>`;
  }).join("");

  return `
    <div class="admin-heading">
      <div>
        <p class="eyebrow">ADMIN CONSOLE</p>
        <h1>Customer accounts</h1>
        <p>${users.length} customer account${users.length === 1 ? "" : "s"} · ${bannedCount} banned</p>
      </div>
    </div>

    <section class="admin-card">
      <input class="admin-search" type="search" placeholder="Search by email or name" oninput="adminFilter(this.value)" aria-label="Search accounts">
      ${users.length ? `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Account</th><th>Joined</th><th>Subscription</th><th>Orders</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : '<p class="muted">No customer accounts yet.</p>'}
    </section>

    <section class="admin-card admin-danger-zone">
      <h2>Danger zone</h2>
      <p>Erase every customer account and all of their data. Your administrator account, the menu and the subscription plans are kept. This cannot be undone.</p>
      <button class="btn danger" type="button" onclick="adminEraseAll()">Reset all accounts</button>
    </section>
  `;
}

function adminDetailHTML() {
  const d = adminState.detail;
  const u = d.user;
  const prof = d.profile;
  const plan = d.plan;

  const field = (label, value) =>
    `<div><dt>${label}</dt><dd>${value === null || value === undefined || value === "" ? "—" : adminEsc(value)}</dd></div>`;

  const subs = d.subscriptions.length
    ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Plan</th><th>Status</th><th>Starts</th><th>Ends</th><th>Payment</th></tr></thead><tbody>${
        d.subscriptions.map((s) => `<tr><td>${adminEsc(s.plan_name)}${s.trial ? " (trial)" : ""}</td><td>${adminEsc(s.status)}</td><td>${adminDate(s.starts_at)}</td><td>${adminDate(s.ends_at)}</td><td>${adminEsc(s.payment_status)}</td></tr>`).join("")
      }</tbody></table></div>`
    : '<p class="muted">No subscriptions.</p>';

  const payments = d.payments.length
    ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Provider</th></tr></thead><tbody>${
        d.payments.map((p) => `<tr><td>${adminDate(p.created_at)}</td><td>${adminEsc(p.currency)} ${Number(p.amount).toFixed(2)}</td><td>${adminEsc(p.status)}</td><td>${adminEsc(p.provider || "—")}</td></tr>`).join("")
      }</tbody></table></div>`
    : '<p class="muted">No payments.</p>';

  const orders = d.orders.length
    ? d.orders.map((o) => `
        <article class="admin-order">
          <div class="admin-order-head"><strong>${adminEsc(o.order_code)}</strong><span class="admin-pill">${adminEsc(String(o.status).replaceAll("_", " "))}</span></div>
          <p>${o.items.map((i) => adminEsc(i.item_name) + " × " + Number(i.quantity)).join(" · ")}</p>
          <small>${o.payment_method === "cod" ? "Cash on delivery" : "Online payment"} (${adminEsc(o.payment_status)}) · ${adminRupees(o.total_paise)} · ${adminDate(o.created_at)}</small><br>
          <small>${adminEsc(o.address)} · ${adminEsc(o.customer_phone)}${o.notes ? " · Notes: " + adminEsc(o.notes) : ""}</small>
        </article>`).join("")
    : '<p class="muted">No orders.</p>';

  return `
    <div class="admin-heading">
      <div>
        <p class="eyebrow">INSPECTING ACCOUNT</p>
        <h1>${adminEsc(u.email)}</h1>
        <p>${u.banned ? '<span class="admin-pill banned">Banned</span>' : '<span class="admin-pill ok">Active</span>'}</p>
      </div>
      <button class="btn secondary" type="button" onclick="adminBack()">Back to all accounts</button>
    </div>

    <section class="admin-card">
      <h2>Account</h2>
      <dl class="admin-fields">
        ${field("Email", u.email)}
        ${field("Name", u.name)}
        ${field("Account ID", u.id)}
        ${field("Joined", adminDate(u.created_at))}
        ${u.banned ? field("Banned on", adminDate(u.banned_at)) + field("Ban reason", u.ban_reason) : ""}
      </dl>
      <div class="admin-actions">
        ${u.banned
          ? `<button class="btn primary" type="button" onclick="adminUnban(${Number(u.id)})">Unban account</button>`
          : `<button class="btn danger" type="button" onclick="adminBan(${Number(u.id)})">Ban account</button>`}
      </div>
    </section>

    <section class="admin-card">
      <h2>Profile</h2>
      ${prof ? `<dl class="admin-fields">
        ${field("Name", prof.name)}
        ${field("Age", prof.age)}
        ${field("Sex", prof.sex)}
        ${field("Height", prof.height_cm + " cm")}
        ${field("Weight", prof.weight_kg + " kg")}
        ${field("Activity", ADMIN_ACTIVITY[prof.activity] || prof.activity)}
        ${field("Workout place", prof.place)}
      </dl>` : '<p class="muted">Profile not completed yet.</p>'}
    </section>

    <section class="admin-card">
      <h2>Plan &amp; preferences</h2>
      ${plan || d.allergies.length ? `<dl class="admin-fields">
        ${field("Diet", plan?.diet)}
        ${field("Body type", plan?.body)}
        ${field("Goal", plan?.goal)}
        ${field("Other foods avoided", plan?.other_avoid)}
        ${field("Allergies", d.allergies.join(", "))}
        ${field("Progress", (d.progress?.days_logged || 0) + " day(s) logged" + (d.progress?.last_date ? " · last " + d.progress.last_date : ""))}
      </dl>` : '<p class="muted">No plan saved yet.</p>'}
    </section>

    <section class="admin-card"><h2>Subscriptions</h2>${subs}</section>
    <section class="admin-card"><h2>Payments</h2>${payments}</section>
    <section class="admin-card"><h2>Orders</h2>${orders}</section>
  `;
}

/* =========================================================
   PLAN STATUS, UPGRADE AND EXPIRY LOCK
   ========================================================= */

function syncPlanClock(serverNow) {
  const t = Date.parse(serverNow);
  if (!isNaN(t)) planClockOffset = t - Date.now();
}

function planNow() {
  return Date.now() + planClockOffset;
}

function parseServerDate(value) {
  if (!value) return null;
  let text = String(value);
  if (!/[TZ]/.test(text)) text = text.replace(" ", "T") + "Z";
  const date = new Date(text);
  return isNaN(date) ? null : date;
}

function fmtPlanDate(date) {
  return date
    ? date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
}

function fmtPlanLeft(ms) {
  if (ms <= 0) return "Ended";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

/* True once a plan existed but has run out. */
function isPlanExpired() {
  return !!me && !isAdminUser && !!userData.needs_subscription && !!userData.last_subscription;
}

function planStatusSnapshot() {
  const sub = userData.subscription;
  if (!sub || userData.needs_subscription) return null;
  const start = parseServerDate(sub.starts_at);
  const end = parseServerDate(sub.ends_at);
  if (!start || !end) return null;
  const now = planNow();
  const total = Math.max(1, end - start);
  const left = end - now;
  const days = Number(sub.duration_days) || Math.max(1, Math.round(total / 86400000));
  return {
    sub, start, end, left, days,
    dayNo: Math.min(days, Math.max(1, Math.floor((now - start) / 86400000) + 1)),
    pct: Math.min(100, Math.max(0, ((now - start) / total) * 100)),
    soon: left <= 86400000,
    trial: !!(sub.trial || sub.is_trial)
  };
}

function planStatusHTML() {
  const s = planStatusSnapshot();
  if (!s) return "";
  return `
    <section class="plan-status${s.soon ? " ending-soon" : ""}" id="plan-status" aria-label="Plan status">
      <div class="plan-status-name">
        <span class="plan-status-dot" aria-hidden="true"></span>
        <div>
          <small>Your plan</small>
          <strong>${escapeHTML(s.sub.plan_name || "EatRight plan")}</strong>
          <span class="plan-status-chip" data-ps="chip">${s.soon ? "Ends soon" : s.trial ? "Free trial" : "Active"}</span>
        </div>
      </div>
      <div><small>Valid until</small><strong>${fmtPlanDate(s.end)}</strong></div>
      <div><small>Time left</small><strong data-ps="left">${fmtPlanLeft(s.left)}</strong></div>
      <div><small>Progress</small><strong data-ps="day">Day ${s.dayNo} of ${s.days}</strong></div>
      <button class="btn secondary plan-status-upgrade" type="button" onclick="openUpgrade()">Upgrade plan</button>
      <div class="plan-status-bar" aria-hidden="true"><span data-ps="bar" style="width:${s.pct.toFixed(1)}%"></span></div>
    </section>`;
}

function updateLiveStatus() {
  const box = document.getElementById("plan-status");
  const s = planStatusSnapshot();
  if (!box || !s) return;
  const set = (key, text) => {
    const el = box.querySelector(`[data-ps="${key}"]`);
    if (el && el.textContent !== text) el.textContent = text;
  };
  set("left", fmtPlanLeft(s.left));
  set("day", `Day ${s.dayNo} of ${s.days}`);
  set("chip", s.soon ? "Ends soon" : s.trial ? "Free trial" : "Active");
  const bar = box.querySelector('[data-ps="bar"]');
  if (bar) bar.style.width = s.pct.toFixed(1) + "%";
  box.classList.toggle("ending-soon", s.soon);
}

function openUpgrade() {
  subscriptionUpgradeMode = true;
  view = "subscription";
  render();
  window.scrollTo(0, 0);
}

function closeUpgrade() {
  if (isPlanExpired()) return;
  subscriptionUpgradeMode = false;
  view = "plan";
  render();
}

function subscriptionIntroHTML(upgrading) {
  if (!upgrading) {
    return `<section class="page-intro"><div><span class="eyebrow">YOUR PLAN</span>
      <h1>Choose your EatRight plan.</h1>
      <p>Pick the plan length and meal schedule that works for you.</p></div></section>`;
  }
  const expired = isPlanExpired();
  const sub = expired ? userData.last_subscription : userData.subscription;
  const name = escapeHTML((sub && sub.plan_name) || "plan");
  const when = fmtPlanDate(parseServerDate(sub && sub.ends_at));
  const note = !sub
    ? "Pick the plan length and meal schedule that works for you."
    : expired
      ? `Your ${name} ended on ${when}. Choose a plan below to continue.`
      : `You're on ${name}, valid until ${when}. Pick a plan to upgrade.`;
  return `<section class="page-intro with-action"><div><span class="eyebrow">${expired ? "PLAN ENDED" : "UPGRADE"}</span>
      <h1>Upgrade your EatRight plan.</h1>
      <p>${note}</p></div>
      ${expired ? "" : '<button class="btn secondary" type="button" onclick="closeUpgrade()">Back to my plan</button>'}</section>`;
}

/* ---- expiry popup: cannot be dismissed, only upgraded through or logged out of ---- */
function shouldShowPlanLock() {
  return isPlanExpired() && !(view === "subscription" && planLockAck);
}

function acknowledgePlanLock() {
  planLockAck = true;
  subscriptionUpgradeMode = true;
  view = "subscription";
  render();
  window.scrollTo(0, 0);
}

function planLockHTML() {
  const last = userData.last_subscription || {};
  const trial = !!(last.trial || last.is_trial);
  return `
    <div class="plan-lock-card" role="alertdialog" aria-modal="true" aria-labelledby="plan-lock-title" aria-describedby="plan-lock-text">
      <div class="plan-lock-icon" aria-hidden="true">⏳</div>
      <h2 id="plan-lock-title">${trial ? "Your free trial has ended" : "Your plan has ended"}</h2>
      <p id="plan-lock-text">Your ${escapeHTML(last.plan_name || "plan")} ended on ${fmtPlanDate(parseServerDate(last.ends_at))}.
        Upgrade to keep using your meal plan, workouts and daily tracking. Your profile and progress are saved.</p>
      <button type="button" class="primary-button" id="plan-lock-upgrade" onclick="acknowledgePlanLock()">Upgrade plan</button>
      <button type="button" class="plan-lock-logout" onclick="logout()">Log out</button>
    </div>`;
}

function enforcePlanLock() {
  const app = document.getElementById("app");
  if (!app) return;
  const need = shouldShowPlanLock();
  let lock = document.getElementById("plan-lock");

  if (!need) {
    if (lock) lock.remove();
    if (app.inert) app.inert = false;
    document.body.classList.remove("plan-locked");
    return;
  }

  if (!lock) {
    lock = document.createElement("div");
    lock.id = "plan-lock";
    document.body.appendChild(lock);
  }
  if (lock.className !== "plan-lock") lock.className = "plan-lock";
  if (lock.hidden) lock.hidden = false;
  if (lock.hasAttribute("style")) lock.removeAttribute("style");
  if (!lock.querySelector(".plan-lock-card")) {
    lock.innerHTML = planLockHTML();
    const first = lock.querySelector("#plan-lock-upgrade");
    if (first) first.focus();
  }
  if (!app.inert) app.inert = true;      // nothing behind the popup can be clicked or tabbed to
  document.body.classList.add("plan-locked");
  planLockObserver.observe(lock, { attributes: true, childList: true });
  planLockObserver.observe(app, { attributes: true, attributeFilter: ["inert"] });
}

/* Put the popup straight back if it is removed or hidden while it is required. */
const planLockObserver = new MutationObserver(() => {
  if (shouldShowPlanLock()) enforcePlanLock();
});
planLockObserver.observe(document.body, { childList: true });

/* ---- live updates ---- */
function applySubscriptionState(data) {
  syncPlanClock(data.server_now);
  userData.subscription = data.subscription || null;
  userData.plan_day = data.plan_day || null;
  userData.needs_subscription = data.needs_subscription ?? !data.subscription;
  userData.last_subscription = data.last_subscription || null;
}

let planSyncBusyUntil = 0;

async function syncSubscription() {
  if (!me || isAdminUser) return;
  try {
    const response = await fetch("/api/subscription");
    if (response.status === 401) { await startApp(); return; }
    if (!response.ok) return;
    const wasExpired = isPlanExpired();
    applySubscriptionState(await response.json());
    if (isPlanExpired() && !wasExpired) {
      planLockAck = false;
      subscriptionUpgradeMode = false;
      view = "subscription";
      render();
    } else {
      updateLiveStatus();
    }
  } catch (error) {
    console.error("PLAN SYNC ERROR:", error);
  }
}

setInterval(() => {
  if (!me || isAdminUser) return;
  const s = planStatusSnapshot();
  if (!s) return;
  if (s.left > 0) { updateLiveStatus(); return; }
  if (Date.now() < planSyncBusyUntil) return;
  planSyncBusyUntil = Date.now() + 5000;   // ask the server, but not more than once per 5s
  syncSubscription();
}, 1000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncSubscription();
});
