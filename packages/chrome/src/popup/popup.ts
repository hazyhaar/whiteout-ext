/**
 * Whiteout Chrome Extension - Popup script.
 *
 * Dual mode:
 * - Primary (default): scan the current page and open the review side panel
 * - Secondary (context menu): if pendingText exists in storage, show the
 *   copy-paste anonymization interface from the core pipeline
 */

import {
  pipeline,
  substitute,
  MemoryStore,
  type Entity,
  type PipelineResult,
  type PipelineOptions,
} from "@whiteout/core";
import { IDBStore } from "../adapters/idb-store.js";
import { BrowserFetch } from "../adapters/fetch-adapter.js";

// -- Mode detection --

const store = typeof indexedDB !== "undefined" ? new IDBStore() : new MemoryStore();
const fetchPort = new BrowserFetch();

// -- Primary mode DOM elements --

const primaryView = document.getElementById("primary-view")!;
const btnScan = document.getElementById("btn-scan") as HTMLButtonElement;
const btnPanel = document.getElementById("btn-panel") as HTMLButtonElement;
const linkOptions = document.getElementById("link-options") as HTMLAnchorElement;
const statusDot = document.getElementById("status-dot") as HTMLElement;
const statusTextEl = document.getElementById("status-text") as HTMLElement;

// -- Secondary mode DOM elements --

const secondaryView = document.getElementById("secondary-view")!;
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
const backToPrimary = document.getElementById("back-to-primary") as HTMLButtonElement;

// -- State --

let currentResult: PipelineResult | null = null;
let entities: Entity[] = [];
let originalText = "";
let sessionId = `sess_${Date.now().toString(36)}`;

// -- Mode selection on load --

chrome.storage?.local?.get("pendingText", (data) => {
  if (data.pendingText) {
    // Secondary mode: copy-paste interface
    primaryView.hidden = true;
    secondaryView.hidden = false;
    inputText.value = data.pendingText;
    chrome.storage.local.remove("pendingText");
  } else {
    // Primary mode: scan + panel
    primaryView.hidden = false;
    secondaryView.hidden = true;
  }
});

// ============================================================
// PRIMARY MODE
// ============================================================

type PopupStatus = "idle" | "scanning" | "done" | "error";

function setStatus(status: PopupStatus, detail?: string): void {
  statusDot.className = "status-dot";
  if (status !== "idle") {
    statusDot.classList.add(status);
  }

  const labels: Record<PopupStatus, string> = {
    idle: "Pret",
    scanning: "Analyse en cours...",
    done: "Analyse terminee",
    error: "Erreur",
  };

  statusTextEl.textContent = detail ?? labels[status];
  btnScan.disabled = status === "scanning";
}

btnScan.addEventListener("click", async () => {
  setStatus("scanning");

  try {
    const response = await chrome.runtime.sendMessage({ type: "SCAN_PAGE" });
    if (response?.error) {
      setStatus("error", response.error);
      return;
    }
    setStatus("done");
  } catch (err) {
    setStatus("error", String(err));
  }
});

btnPanel.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
  window.close();
});

linkOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ============================================================
// SECONDARY MODE (copy-paste pipeline)
// ============================================================

processBtn.addEventListener("click", async () => {
  const text = inputText.value.trim();
  if (!text) return;

  originalText = text;
  processBtn.disabled = true;
  processBtn.textContent = "Traitement...";

  const options: PipelineOptions = {
    touchstone: {
      baseUrl: "http://localhost:8420",
      timeout: 5000,
      maxBatchSize: 100,
    },
    decoyRatio: 0.35,
    aliasStyle: "realistic",
  };

  // Load saved settings
  try {
    const saved = await chrome.storage?.local?.get(["touchstoneUrl", "decoyRatio", "aliasStyle"]);
    if (saved?.touchstoneUrl) options.touchstone!.baseUrl = saved.touchstoneUrl;
    if (saved?.decoyRatio) options.decoyRatio = parseInt(saved.decoyRatio) / 100;
    if (saved?.aliasStyle) options.aliasStyle = saved.aliasStyle as "realistic" | "generic";
  } catch { /* use defaults */ }

  try {
    currentResult = await pipeline(text, fetchPort, store, sessionId, options);
    entities = currentResult.entities;

    const langFlags: Record<string, string> = { fr: "FR", en: "EN", de: "DE" };
    languageIndicator.textContent = langFlags[currentResult.language] ?? currentResult.language;

    renderReview();
    reviewPanel.hidden = false;
    outputPanel.hidden = true;
  } catch (err) {
    console.error("Pipeline error:", err);
    alert("Erreur lors du traitement. Voir la console.");
  } finally {
    processBtn.disabled = false;
    processBtn.textContent = "Anonymiser";
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
      e.acceptedAlias = e.text;
    }
  }
  renderReview();
});

generateBtn.addEventListener("click", () => {
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
  copyBtn.textContent = "Copie !";
  setTimeout(() => (copyBtn.textContent = "Copier"), 1500);
});

downloadBtn.addEventListener("click", () => {
  const blob = new Blob([outputText.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "anonymise.txt";
  a.click();
  URL.revokeObjectURL(url);
});

backToPrimary.addEventListener("click", () => {
  primaryView.hidden = false;
  secondaryView.hidden = true;
  // Reset secondary state
  inputText.value = "";
  originalText = "";
  entities = [];
  currentResult = null;
  reviewPanel.hidden = true;
  outputPanel.hidden = true;
  reviewText.innerHTML = "";
  outputText.value = "";
});

// -- Rendering --

function renderReview() {
  const sorted = [...entities].sort((a, b) => a.start - b.start);

  let html = "";
  let cursor = 0;

  for (const entity of sorted) {
    if (entity.start > cursor) {
      html += escHtml(originalText.slice(cursor, entity.start));
    }

    const isSkipped = entity.acceptedAlias === entity.text;
    const cls = `entity entity-${entity.type}${isSkipped ? " skipped" : ""}`;
    const alias = entity.acceptedAlias ?? entity.proposedAlias;

    html += `<span class="${cls}" title="${entity.type} (${entity.confidence}) -> ${escHtml(alias)}">${escHtml(entity.text)}</span>`;

    cursor = entity.end;
  }

  if (cursor < originalText.length) {
    html += escHtml(originalText.slice(cursor));
  }

  reviewText.innerHTML = html;

  const accepted = entities.filter((e) => e.acceptedAlias && e.acceptedAlias !== e.text).length;
  const skipped = entities.filter((e) => e.acceptedAlias === e.text).length;
  entityCounter.textContent = `${entities.length} entites, ${accepted} acceptees, ${skipped} ignorees`;
}

// -- Listen for status broadcasts --

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATUS") {
    setStatus(message.status, message.detail);
  }
});

// -- Utilities --

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
