import {
  pipeline,
  substitute,
  type Entity,
  type PipelineResult,
  type PipelineOptions,
  MemoryStore,
} from "@whiteout/core";
import { IDBStore } from "../adapters/idb-store.js";
import { BrowserFetch } from "../adapters/fetch-adapter.js";

// State
let currentResult: PipelineResult | null = null;
let entities: Entity[] = [];
let originalText = "";
let sessionId = `sess_${Date.now().toString(36)}`;

// Adapters
const store = typeof indexedDB !== "undefined" ? new IDBStore() : new MemoryStore();
const fetchPort = new BrowserFetch();

// DOM elements
const inputText = document.getElementById("input-text") as HTMLTextAreaElement;
const processBtn = document.getElementById("process-btn") as HTMLButtonElement;
const languageIndicator = document.getElementById("language-indicator")!;
const reviewPanel = document.getElementById("review-panel")!;
const reviewText = document.getElementById("review-text")!;
const entityCounter = document.getElementById("entity-counter")!;
const acceptAllBtn = document.getElementById("accept-all") as HTMLButtonElement;
const skipUnconfirmedBtn = document.getElementById("skip-unconfirmed") as HTMLButtonElement;
const generateBtn = document.getElementById("generate-btn") as HTMLButtonElement;
const outputPanel = document.getElementById("output-panel")!;
const outputText = document.getElementById("output-text") as HTMLTextAreaElement;
const copyBtn = document.getElementById("copy-btn") as HTMLButtonElement;
const downloadBtn = document.getElementById("download-btn") as HTMLButtonElement;
const downloadCsvBtn = document.getElementById("download-csv-btn") as HTMLButtonElement;
const newDocBtn = document.getElementById("new-doc-btn") as HTMLButtonElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const settingsPanel = document.getElementById("settings-panel")!;
const settingsClose = document.getElementById("settings-close") as HTMLButtonElement;
const touchstoneUrlInput = document.getElementById("touchstone-url") as HTMLInputElement;
const decoyRatioInput = document.getElementById("decoy-ratio") as HTMLInputElement;
const decoyRatioVal = document.getElementById("decoy-ratio-val")!;
const aliasStyleSelect = document.getElementById("alias-style") as HTMLSelectElement;

// Load pending text from context menu
chrome.storage?.local?.get("pendingText", (data) => {
  if (data.pendingText) {
    inputText.value = data.pendingText;
    chrome.storage.local.remove("pendingText");
  }
});

// Load saved settings
chrome.storage?.local?.get(["touchstoneUrl", "decoyRatio", "aliasStyle"], (data) => {
  if (data.touchstoneUrl) touchstoneUrlInput.value = data.touchstoneUrl;
  if (data.decoyRatio) {
    decoyRatioInput.value = data.decoyRatio;
    decoyRatioVal.textContent = `${data.decoyRatio}%`;
  }
  if (data.aliasStyle) aliasStyleSelect.value = data.aliasStyle;
});

// --- Event handlers ---

processBtn.addEventListener("click", async () => {
  const text = inputText.value.trim();
  if (!text) return;

  originalText = text;
  document.body.classList.add("loading");

  const options: PipelineOptions = {
    touchstone: {
      baseUrl: touchstoneUrlInput.value || "http://localhost:8420",
      timeout: 5000,
      maxBatchSize: 100,
    },
    decoyRatio: parseInt(decoyRatioInput.value) / 100,
    aliasStyle: aliasStyleSelect.value as "realistic" | "generic",
  };

  try {
    currentResult = await pipeline(text, fetchPort, store, sessionId, options);
    entities = currentResult.entities;

    // Show language
    const langFlags: Record<string, string> = { fr: "FR", en: "EN", de: "DE" };
    languageIndicator.textContent = langFlags[currentResult.language] ?? currentResult.language;

    // Render review
    renderReview();
    reviewPanel.hidden = false;
    outputPanel.hidden = true;
  } catch (err) {
    console.error("Pipeline error:", err);
    alert("Erreur lors du traitement. Voir la console.");
  } finally {
    document.body.classList.remove("loading");
  }
});

acceptAllBtn.addEventListener("click", () => {
  for (const e of entities) {
    e.acceptedAlias = e.acceptedAlias ?? e.proposedAlias;
  }
  renderReview();
});

skipUnconfirmedBtn.addEventListener("click", () => {
  for (const e of entities) {
    if (e.confidence === "low") {
      e.acceptedAlias = e.text; // keep original
    }
  }
  renderReview();
});

generateBtn.addEventListener("click", () => {
  // Accept all entities that haven't been explicitly skipped
  for (const e of entities) {
    if (!e.acceptedAlias) {
      e.acceptedAlias = e.proposedAlias;
    }
  }

  const result = substitute(originalText, entities);
  outputText.value = result;
  outputPanel.hidden = false;
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(outputText.value);
  copyBtn.textContent = "Copié !";
  setTimeout(() => (copyBtn.textContent = "Copier"), 1500);
});

downloadBtn.addEventListener("click", () => {
  download(outputText.value, "anonymise.txt", "text/plain");
});

downloadCsvBtn.addEventListener("click", () => {
  const rows = ["Original,Alias,Type,Confiance"];
  for (const e of entities) {
    const alias = e.acceptedAlias ?? e.proposedAlias;
    rows.push(`"${esc(e.text)}","${esc(alias)}","${e.type}","${e.confidence}"`);
  }
  download(rows.join("\n"), "alias-table.csv", "text/csv");
});

newDocBtn.addEventListener("click", () => {
  inputText.value = "";
  originalText = "";
  entities = [];
  currentResult = null;
  sessionId = `sess_${Date.now().toString(36)}`;
  reviewPanel.hidden = true;
  outputPanel.hidden = true;
  reviewText.innerHTML = "";
  outputText.value = "";
  languageIndicator.textContent = "";
});

settingsBtn.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

settingsClose.addEventListener("click", () => {
  settingsPanel.hidden = true;
  // Save settings
  chrome.storage?.local?.set({
    touchstoneUrl: touchstoneUrlInput.value,
    decoyRatio: decoyRatioInput.value,
    aliasStyle: aliasStyleSelect.value,
  });
});

decoyRatioInput.addEventListener("input", () => {
  decoyRatioVal.textContent = `${decoyRatioInput.value}%`;
});

// --- Rendering ---

function renderReview() {
  // Sort entities by start offset
  const sorted = [...entities].sort((a, b) => a.start - b.start);

  let html = "";
  let cursor = 0;

  for (const entity of sorted) {
    // Text before this entity
    if (entity.start > cursor) {
      html += escHtml(originalText.slice(cursor, entity.start));
    }

    const isSkipped = entity.acceptedAlias === entity.text;
    const cls = `entity entity-${entity.type}${isSkipped ? " skipped" : ""}`;
    const alias = entity.acceptedAlias ?? entity.proposedAlias;

    html += `<span class="${cls}" data-idx="${sorted.indexOf(entity)}" title="${entity.type} (${entity.confidence}) → ${escHtml(alias)}">${escHtml(entity.text)}</span>`;

    cursor = entity.end;
  }

  // Remaining text
  if (cursor < originalText.length) {
    html += escHtml(originalText.slice(cursor));
  }

  reviewText.innerHTML = html;

  // Counter
  const accepted = entities.filter((e) => e.acceptedAlias && e.acceptedAlias !== e.text).length;
  const skipped = entities.filter((e) => e.acceptedAlias === e.text).length;
  entityCounter.textContent = `${entities.length} entités, ${accepted} acceptées, ${skipped} ignorées`;

  // Click handlers for entity popovers
  reviewText.querySelectorAll(".entity").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const idx = parseInt((el as HTMLElement).dataset.idx ?? "0");
      showPopover(el as HTMLElement, sorted[idx]);
    });
  });
}

function showPopover(anchor: HTMLElement, entity: Entity) {
  // Remove existing popovers
  document.querySelectorAll(".entity-popover").forEach((p) => p.remove());

  const alias = entity.acceptedAlias ?? entity.proposedAlias;
  const popover = document.createElement("div");
  popover.className = "entity-popover";
  popover.innerHTML = `
    <div class="field"><label>Type</label><span>${entity.type}</span></div>
    <div class="field"><label>Confiance</label><span>${entity.confidence}</span></div>
    <div class="field"><label>Sources</label><span>${entity.sources.join(", ")}</span></div>
    <label>Alias</label>
    <input type="text" class="alias-input" value="${escHtml(alias)}" />
    <div class="popover-actions">
      <button class="btn btn-sm btn-accept">Accepter</button>
      <button class="btn btn-sm btn-skip">Ignorer</button>
    </div>
  `;

  anchor.style.position = "relative";
  anchor.appendChild(popover);

  const aliasInput = popover.querySelector(".alias-input") as HTMLInputElement;

  popover.querySelector(".btn-accept")!.addEventListener("click", (ev) => {
    ev.stopPropagation();
    entity.acceptedAlias = aliasInput.value;
    popover.remove();
    renderReview();
  });

  popover.querySelector(".btn-skip")!.addEventListener("click", (ev) => {
    ev.stopPropagation();
    entity.acceptedAlias = entity.text; // keep original = skip
    popover.remove();
    renderReview();
  });

  // Close on outside click
  const closeHandler = (ev: MouseEvent) => {
    if (!popover.contains(ev.target as Node)) {
      popover.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 0);
}

// --- Utilities ---

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function esc(s: string): string {
  return s.replace(/"/g, '""');
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
