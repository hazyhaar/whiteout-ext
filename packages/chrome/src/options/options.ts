/**
 * Whiteout Chrome Extension - Options page.
 *
 * Manages user preferences stored in chrome.storage.sync:
 *  - Touchstone API URL
 *  - Preferred jurisdictions
 *  - Decoy ratio (0-1 scale)
 *  - Alias style (realistic / generic)
 *  - Language detection toggle / default language
 */

// -- DOM references --

const touchstoneUrl = document.getElementById("touchstone-url") as HTMLInputElement;
const jurisdictionsContainer = document.getElementById("jurisdictions") as HTMLElement;
const decoyRatio = document.getElementById("decoy-ratio") as HTMLInputElement;
const decoyRatioValue = document.getElementById("decoy-ratio-value") as HTMLElement;
const aliasStyle = document.getElementById("alias-style") as HTMLSelectElement;
const autoLangToggle = document.getElementById("auto-lang-toggle") as HTMLElement;
const autoLangLabel = document.getElementById("auto-lang-label") as HTMLElement;
const defaultLangGroup = document.getElementById("default-lang-group") as HTMLElement;
const defaultLang = document.getElementById("default-lang") as HTMLSelectElement;
const btnSave = document.getElementById("btn-save") as HTMLButtonElement;
const saveStatus = document.getElementById("save-status") as HTMLElement;

// -- State --

let autoDetectLanguage = true;

// -- Load options on page open --

async function loadOptions(): Promise<void> {
  const stored = await chrome.storage.sync.get(null);

  touchstoneUrl.value = stored["touchstone.baseUrl"] ?? "http://localhost:8420";

  // Jurisdictions
  const jurisdictions: string[] = stored.jurisdictions ?? ["fr"];
  const checkboxes = jurisdictionsContainer.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  for (const cb of checkboxes) {
    cb.checked = jurisdictions.includes(cb.value);
  }

  // Decoy ratio (stored as 0-1)
  const ratio = stored.decoyRatio ?? 0.35;
  decoyRatio.value = String(ratio);
  decoyRatioValue.textContent = ratio.toFixed(2);

  // Alias style
  aliasStyle.value = stored.aliasStyle ?? "realistic";

  // Language detection
  autoDetectLanguage = stored.autoDetectLanguage ?? true;
  updateToggleUI();

  // Default language
  defaultLang.value = stored.defaultLanguage ?? "fr";
}

// -- Toggle UI --

function updateToggleUI(): void {
  if (autoDetectLanguage) {
    autoLangToggle.classList.add("active");
    autoLangLabel.textContent = "Detection automatique activee";
    defaultLangGroup.style.display = "none";
  } else {
    autoLangToggle.classList.remove("active");
    autoLangLabel.textContent = "Detection automatique desactivee";
    defaultLangGroup.style.display = "block";
  }
}

autoLangToggle.addEventListener("click", () => {
  autoDetectLanguage = !autoDetectLanguage;
  updateToggleUI();
});

// -- Decoy ratio slider --

decoyRatio.addEventListener("input", () => {
  decoyRatioValue.textContent = parseFloat(decoyRatio.value).toFixed(2);
});

// -- Save --

btnSave.addEventListener("click", async () => {
  // Collect jurisdictions
  const checkboxes = jurisdictionsContainer.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  const selectedJurisdictions: string[] = [];
  for (const cb of checkboxes) {
    if (cb.checked) {
      selectedJurisdictions.push(cb.value);
    }
  }

  const options: Record<string, unknown> = {
    "touchstone.baseUrl": touchstoneUrl.value.trim() || "http://localhost:8420",
    jurisdictions: selectedJurisdictions,
    decoyRatio: parseFloat(decoyRatio.value),
    aliasStyle: aliasStyle.value,
    autoDetectLanguage,
    defaultLanguage: defaultLang.value,
  };

  await chrome.storage.sync.set(options);

  // Show confirmation
  saveStatus.classList.add("visible");
  setTimeout(() => {
    saveStatus.classList.remove("visible");
  }, 2000);
});

// -- Init --

loadOptions();
