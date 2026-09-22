"use strict";

/* ==========================================================
   Configuration
   ========================================================== */
const API_BASE_URL = "https://meantal-health-score-2-dkvh.onrender.com"; // change if your FastAPI runs elsewhere
const PREDICT_URL = `${API_BASE_URL}/predict`;
const REQUEST_TIMEOUT_MS = 30000;

const COUNTRIES = [
  "India", "USA", "Canada", "Australia", "UK", "Germany", "Mexico", "Turkey", "France",
  "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Austria", "Azerbaijan",
  "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bhutan", "Bolivia", "Bosnia",
  "Brazil", "Bulgaria", "Chile", "China", "Colombia", "Costa Rica", "Croatia", "Cyprus",
  "Czech Republic", "Denmark", "Ecuador", "Egypt", "Estonia", "Finland", "Georgia",
  "Ghana", "Greece", "Hong Kong", "Hungary", "Iceland", "Indonesia", "Iraq", "Ireland",
  "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait",
  "Latvia", "Lebanon", "Malaysia", "Maldives", "Malta", "Moldova", "Nepal", "Netherlands",
  "New Zealand", "Nigeria", "Norway", "Oman", "Pakistan", "Panama", "Paraguay", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Saudi Arabia",
  "Singapore", "Slovakia", "Slovenia", "South Africa", "South Korea", "Spain", "Sri Lanka",
  "Sweden", "Switzerland", "Taiwan", "Thailand", "Ukraine", "United Arab Emirates",
  "Uruguay", "Uzbekistan", "Vietnam", "Yemen", "Other",
];

/* Client-side rules that mirror the Pydantic StudentData model */
const FIELDS = {
  age:                     { label: "Age", type: "int", min: 10, max: 100 },
  gender:                  { label: "Gender", type: "select" },
  country:                 { label: "Country", type: "text" },
  academic_level:          { label: "Academic level", type: "select" },
  most_used_platform:      { label: "Most used platform", type: "select" },
  purpose_of_use:          { label: "Main purpose", type: "select" },
  avg_daily_usage_hours:   { label: "Daily usage", type: "float", min: 0, max: 24 },
  daily_unlocks:           { label: "Phone unlocks", type: "int", min: 0 },
  study_hours:             { label: "Study hours", type: "float", min: 0, max: 24 },
  physical_activity_hours: { label: "Physical activity", type: "float", min: 0, max: 3 },
  sleep_hours_per_night:   { label: "Sleep hours", type: "float", min: 0, max: 24 },
  stress_level:            { label: "Stress level", type: "select" },
};

/* Score bands (model predicts a score on a 1-10 scale, higher = better) */
const BANDS = [
  { max: 4,  label: "Needs attention", color: "var(--band-low)",
    message: "The model expects a low score. Sleep, stress and screen time are good places to look first." },
  { max: 6,  label: "Moderate", color: "var(--band-mid)",
    message: "A middle-of-the-road score. Small changes to daily habits could make a difference." },
  { max: 8,  label: "Good", color: "var(--band-good)",
    message: "The habits entered point to a healthy mental wellbeing score." },
  { max: 10, label: "Excellent", color: "var(--band-great)",
    message: "A high score. These routines look well balanced." },
];

/* ==========================================================
   DOM references
   ========================================================== */
const form = document.getElementById("predict-form");
const submitBtn = document.getElementById("submit-btn");
const retryBtn = document.getElementById("retry-btn");
const panel = document.querySelector(".result-panel");

const states = {
  empty:   document.getElementById("state-empty"),
  loading: document.getElementById("state-loading"),
  result:  document.getElementById("state-result"),
  error:   document.getElementById("state-error"),
};

const ringValue = document.getElementById("ring-value");
const scoreNumber = document.getElementById("score-number");
const scoreBand = document.getElementById("score-band");
const scoreMessage = document.getElementById("score-message");
const errorTitle = document.getElementById("error-title");
const errorMessage = document.getElementById("error-message");
const errorList = document.getElementById("error-list");

const RING_LENGTH = 2 * Math.PI * 52; // circumference of the SVG circle (r = 52)

/* ==========================================================
   Setup
   ========================================================== */
document.getElementById("api-url").textContent = API_BASE_URL;

const countryList = document.getElementById("country-list");
COUNTRIES.forEach((name) => {
  const option = document.createElement("option");
  option.value = name;
  countryList.appendChild(option);
});

form.addEventListener("submit", handleSubmit);
form.addEventListener("reset", () => {
  clearAllErrors();
  showState("empty");
});
retryBtn.addEventListener("click", () => {
  showState("empty");
  form.requestSubmit();
});

// Clear a field's error as soon as the user edits it
form.addEventListener("input", (e) => {
  if (e.target.name) clearFieldError(e.target.name);
});

/* ==========================================================
   UI state helpers
   ========================================================== */
function showState(name) {
  Object.entries(states).forEach(([key, el]) => { el.hidden = key !== name; });
  panel.setAttribute("aria-busy", String(name === "loading"));
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "Predicting…" : "Predict score";
}

function setFieldError(name, message) {
  const input = form.elements[name];
  const slot = form.querySelector(`[data-error-for="${name}"]`);
  if (input) input.setAttribute("aria-invalid", "true");
  if (slot) slot.textContent = message;
}

function clearFieldError(name) {
  const input = form.elements[name];
  const slot = form.querySelector(`[data-error-for="${name}"]`);
  if (input) input.removeAttribute("aria-invalid");
  if (slot) slot.textContent = "";
}

function clearAllErrors() {
  Object.keys(FIELDS).forEach(clearFieldError);
}

/* ==========================================================
   Validation
   ========================================================== */
function collectAndValidate() {
  const payload = {};
  let firstInvalid = null;

  for (const [name, rule] of Object.entries(FIELDS)) {
    const input = form.elements[name];
    const raw = input.value.trim();
    let message = "";

    if (raw === "") {
      message = rule.type === "select" ? "Please choose an option." : "This field is required.";
    } else if (rule.type === "int" || rule.type === "float") {
      const value = Number(raw);
      if (Number.isNaN(value)) {
        message = "Enter a valid number.";
      } else if (rule.type === "int" && !Number.isInteger(value)) {
        message = "Enter a whole number.";
      } else if (rule.min !== undefined && value < rule.min) {
        message = `Must be at least ${rule.min}.`;
      } else if (rule.max !== undefined && value > rule.max) {
        message = `Must be at most ${rule.max}.`;
      } else {
        payload[name] = value;
      }
    } else {
      payload[name] = raw;
    }

    if (message) {
      setFieldError(name, message);
      firstInvalid = firstInvalid || input;
    }
  }

  if (firstInvalid) {
    firstInvalid.focus();
    return null;
  }
  return payload;
}

/* ==========================================================
   Submit + API call
   ========================================================== */
async function handleSubmit(event) {
  event.preventDefault();
  clearAllErrors();

  const payload = collectAndValidate();
  if (!payload) return;

  setLoading(true);
  showState("loading");
  scrollPanelIntoViewOnMobile();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(PREDICT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await parseJson(response);

    if (response.ok) {
      renderResult(data.predicted_mental_health_score);
    } else if (response.status === 422) {
      handleValidationError(data);
    } else {
      showError(
        "The server couldn't make a prediction",
        (data && typeof data.detail === "string" && data.detail) ||
          `The API responded with status ${response.status}. Check the terminal running uvicorn for details.`
      );
    }
  } catch (err) {
    if (err.name === "AbortError") {
      showError("The request timed out", "The API took too long to respond. Try again in a moment.");
    } else {
      showError(
        "Can't reach the API",
        `Make sure the FastAPI server is running at ${API_BASE_URL} (uvicorn main:app --reload) and try again.`
      );
    }
  } finally {
    clearTimeout(timer);
    setLoading(false);
  }
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/* ==========================================================
   Result + error rendering
   ========================================================== */
function renderResult(rawScore) {
  const score = Number(rawScore);

  if (Number.isNaN(score)) {
    showError("Unexpected response", "The API returned a score the page couldn't read.");
    return;
  }

  const clamped = Math.min(Math.max(score, 0), 10);
  const band = BANDS.find((b) => clamped <= b.max) || BANDS[BANDS.length - 1];

  scoreNumber.textContent = Number.isInteger(score) ? score : score.toFixed(1);
  scoreBand.textContent = band.label;
  scoreBand.style.background = band.color;
  scoreMessage.textContent = band.message;
  ringValue.style.setProperty("--ring-color", band.color);

  // Reset the ring, show the card, then animate to the new value
  ringValue.style.transition = "none";
  ringValue.style.strokeDashoffset = RING_LENGTH;
  showState("result");
  void ringValue.getBoundingClientRect(); // force reflow so the transition restarts
  ringValue.style.transition = "";
  ringValue.style.strokeDashoffset = RING_LENGTH * (1 - clamped / 10);
}

function showError(title, message, details = []) {
  errorTitle.textContent = title;
  errorMessage.textContent = message;

  errorList.replaceChildren();
  errorList.hidden = details.length === 0;
  details.forEach(({ label, text }) => {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    li.append(strong, document.createTextNode(text));
    errorList.appendChild(li);
  });

  showState("error");
}

/* FastAPI 422 -> { detail: [{ loc: ["body","age"], msg: "...", type: "..." }] } */
function handleValidationError(data) {
  const items = Array.isArray(data?.detail) ? data.detail : [];
  const details = [];

  items.forEach((item) => {
    const fieldName = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
    const label = FIELDS[fieldName]?.label || String(fieldName || "Input");
    const text = item.msg || "Invalid value.";

    if (FIELDS[fieldName]) setFieldError(fieldName, text);
    details.push({ label, text });
  });

  showError(
    "Some values were rejected",
    "The server found problems with the submitted details. Fix the highlighted fields and try again.",
    details
  );

  const firstBad = items.map((i) => i.loc?.[i.loc.length - 1]).find((n) => FIELDS[n]);
  if (firstBad) form.elements[firstBad].focus({ preventScroll: true });
}

function scrollPanelIntoViewOnMobile() {
  if (window.matchMedia("(max-width: 900px)").matches) {
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
