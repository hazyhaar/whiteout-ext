/**
 * Whiteout Chrome Extension - Sidebar (review panel).
 *
 * This is the main UI. It orchestrates the full anonymisation pipeline:
 *
 * 1. Request page text from the content script (via service worker)
 * 2. Run the core pipeline (tokenize, detect, classify, assemble, alias)
 * 3. Render detected entities grouped by normalized text
 * 4. Let the user choose aliases for each entity
 * 5. Apply substitutions back to the page DOM
 */

import {
  pipeline,
  MemoryStore,
} from "@whiteout/core";
import type {
  Entity,
  EntityType,
  PipelineResult,
  PipelineOptions,
} from "@whiteout/core";
import { BrowserFetch } from "../adapters/fetch-adapter.js";
import { IDBStore } from "../adapters/idb-store.js";

// -- DOM references --

const btnScan = document.getElementById("btn-scan") as HTMLButtonElement;
const btnRedactAll = document.getElementById("btn-redact-all") as HTMLButtonElement;
const btnApply = document.getElementById("btn-apply") as HTMLButtonElement;
const docTitle = document.getElementById("doc-title") as HTMLElement;
const docLang = document.getElementById("doc-lang") as HTMLElement;
const docEntities = document.getElementById("doc-entities") as HTMLElement;
const entityList = document.getElementById("entity-list") as HTMLElement;
const statusMessage = document.getElementById("status-message") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;

// -- State --

/** Current grouped entities, keyed by lowercase term. */
let entityGroups: Map<string, Entity[]> = new Map();

/** Flat list of all detected entities (for applying aliases). */
let allEntities: Entity[] = [];

/** User-selected alias per term (lowercase key). */
const selectedAliases = new Map<string, string>();

/** Session identifier for alias map persistence. */
let sessionId = `sess_${Date.now().toString(36)}`;

// -- Adapters --

const fetchPort = new BrowserFetch();
const store = typeof indexedDB !== "undefined" ? new IDBStore() : new MemoryStore();

// -- Options loading --

async function loadOptions(): Promise<PipelineOptions> {
  try {
    const stored = await chrome.storage.sync.get(null);
    return {
      touchstone: {
        baseUrl: stored["touchstone.baseUrl"] ?? "http://localhost:8420",
        timeout: 5000,
        maxBatchSize: 100,
        jurisdictions: stored.jurisdictions ?? ["fr"],
      },
      decoyRatio: stored.decoyRatio ?? 0.35,
      aliasStyle: stored.aliasStyle ?? "realistic",
      jurisdictions: stored.jurisdictions ?? ["fr"],
    };
  } catch {
    return {
      touchstone: {
        baseUrl: "http://localhost:8420",
        timeout: 5000,
        maxBatchSize: 100,
      },
      decoyRatio: 0.35,
      aliasStyle: "realistic",
    };
  }
}

// -- Status display --

function showStatus(
  state: "scanning" | "done" | "error",
  text: string,
): void {
  statusMessage.style.display = "block";
  statusMessage.className = `status-message ${state}`;
  statusText.textContent = text;
}

function hideStatus(): void {
  statusMessage.style.display = "none";
}

// -- Scan pipeline --

async function runScanPipeline(): Promise<void> {
  btnScan.disabled = true;
  btnRedactAll.disabled = true;
  btnApply.disabled = true;
  showStatus("scanning", "Extraction du texte de la page...");

  try {
    // Step 1: Get page text from the content script via the service worker
    const pageResponse = await chrome.runtime.sendMessage({ type: "SCAN_PAGE" });

    if (pageResponse?.error) {
      throw new Error(pageResponse.error);
    }

    const pageText: string = pageResponse.text;
    const pageTitle: string = pageResponse.title;

    if (!pageText || pageText.trim().length === 0) {
      showStatus("error", "Aucun texte exploitable sur cette page.");
      btnScan.disabled = false;
      return;
    }

    docTitle.textContent = pageTitle;

    // Step 2: Run the core pipeline
    showStatus("scanning", "Analyse en cours (detection, classification, alias)...");
    const options = await loadOptions();

    const result: PipelineResult = await pipeline(
      pageText,
      fetchPort,
      store,
      sessionId,
      options,
    );

    allEntities = result.entities;
    docLang.textContent = result.language.toUpperCase();

    if (allEntities.length === 0) {
      showStatus("done", "Aucune entite sensible detectee.");
      docEntities.textContent = "0 entites";
      entityList.innerHTML = '<p class="empty-state">Aucune entite sensible detectee sur cette page.</p>';
      btnScan.disabled = false;
      return;
    }

    // Step 3: Group and render
    entityGroups = groupEntities(allEntities);
    docEntities.textContent = `${allEntities.length} entites (${entityGroups.size} termes)`;
    selectedAliases.clear();

    renderEntityList(entityGroups);

    // Step 4: Highlight entities in the page
    chrome.runtime.sendMessage({
      type: "HIGHLIGHT_ENTITIES",
      entities: allEntities,
    });

    showStatus("done", `${allEntities.length} entites detectees dans ${entityGroups.size} termes.`);
    btnScan.disabled = false;
    btnRedactAll.disabled = false;
    btnApply.disabled = false;
  } catch (err) {
    console.error("[Whiteout Sidebar] Pipeline error:", err);
    showStatus("error", `Erreur: ${err instanceof Error ? err.message : String(err)}`);
    btnScan.disabled = false;
  }
}

// -- Entity grouping --

function groupEntities(entities: Entity[]): Map<string, Entity[]> {
  const groups = new Map<string, Entity[]>();
  for (const entity of entities) {
    const key = entity.text.toLowerCase();
    const group = groups.get(key);
    if (group) {
      group.push(entity);
    } else {
      groups.set(key, [entity]);
    }
  }
  return groups;
}

// -- Rendering --

function renderEntityList(groups: Map<string, Entity[]>): void {
  entityList.innerHTML = "";

  for (const [term, entities] of groups) {
    const representative = entities[0];
    const group = document.createElement("div");
    group.className = `entity-group type-${representative.type}`;

    // Header
    const header = document.createElement("div");
    header.className = "entity-group-header";

    const termSpan = document.createElement("span");
    termSpan.className = "entity-term";
    termSpan.textContent = representative.text;

    const badge = document.createElement("div");
    badge.className = "entity-badge";

    const typeSpan = document.createElement("span");
    typeSpan.className = "entity-type";
    typeSpan.textContent = representative.type;

    const confidenceSpan = document.createElement("span");
    confidenceSpan.className = "entity-confidence";
    confidenceSpan.textContent = representative.confidence;

    const countSpan = document.createElement("span");
    countSpan.className = "entity-count";
    countSpan.textContent = `${entities.length}x`;

    badge.appendChild(typeSpan);
    badge.appendChild(confidenceSpan);
    badge.appendChild(countSpan);
    header.appendChild(termSpan);
    header.appendChild(badge);
    group.appendChild(header);

    // Sources
    if (representative.sources && representative.sources.length > 0) {
      const sourcesDiv = document.createElement("div");
      sourcesDiv.className = "entity-sources";
      sourcesDiv.textContent = `Sources: ${representative.sources.join(", ")}`;
      group.appendChild(sourcesDiv);
    }

    // Alias choices
    const choices = document.createElement("div");
    choices.className = "alias-choices";

    const radioName = `alias-${encodeURIComponent(term)}`;

    // Option 1: Proposed alias (generated by the pipeline)
    const proposedChoice = createRadioChoice(
      radioName,
      representative.proposedAlias,
      term,
      false,
      true,
      "proposed",
    );
    choices.appendChild(proposedChoice);

    // Option 2: [REDACTED]
    const redactedChoice = createRadioChoice(
      radioName,
      "[REDACTED]",
      term,
      true,
      false,
    );
    choices.appendChild(redactedChoice);

    // Option 3: Custom input
    const customChoice = document.createElement("div");
    customChoice.className = "alias-choice";

    const customRadio = document.createElement("input");
    customRadio.type = "radio";
    customRadio.name = radioName;
    customRadio.value = "__custom__";
    customRadio.id = `${radioName}-custom`;

    const customLabel = document.createElement("label");
    customLabel.htmlFor = customRadio.id;
    customLabel.textContent = "Saisir manuellement...";

    customChoice.appendChild(customRadio);
    customChoice.appendChild(customLabel);
    choices.appendChild(customChoice);

    // Custom text input (shown when custom radio is selected)
    const customInputWrapper = document.createElement("div");
    customInputWrapper.className = "alias-custom-input";
    customInputWrapper.style.display = "none";

    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.placeholder = "Alias personnalise...";

    customInputWrapper.appendChild(customInput);
    choices.appendChild(customInputWrapper);

    // Radio change handler
    for (const radio of choices.querySelectorAll('input[type="radio"]')) {
      radio.addEventListener("change", () => {
        const value = (radio as HTMLInputElement).value;
        if (value === "__custom__") {
          customInputWrapper.style.display = "flex";
          customInput.focus();
        } else {
          customInputWrapper.style.display = "none";
          selectedAliases.set(term, value);
        }
      });
    }

    // Custom input handler
    customInput.addEventListener("input", () => {
      const value = customInput.value.trim();
      if (value.length > 0) {
        selectedAliases.set(term, value);
      } else {
        selectedAliases.delete(term);
      }
    });

    // Default: proposed alias selected
    selectedAliases.set(term, representative.proposedAlias);

    group.appendChild(choices);
    entityList.appendChild(group);
  }
}

function createRadioChoice(
  name: string,
  value: string,
  term: string,
  isRedacted: boolean,
  checked: boolean,
  labelClass?: string,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "alias-choice";

  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = name;
  radio.value = value;
  radio.id = `${name}-${encodeURIComponent(value)}`;
  radio.checked = checked;

  const label = document.createElement("label");
  label.htmlFor = radio.id;
  label.textContent = value;
  if (isRedacted) {
    label.className = "redacted";
  } else if (labelClass) {
    label.className = labelClass;
  }

  wrapper.appendChild(radio);
  wrapper.appendChild(label);
  return wrapper;
}

// -- Apply aliases to entities and send to content script --

function applyAliases(): void {
  if (allEntities.length === 0) return;

  // Apply the selected alias to each entity based on its term
  const entitiesWithAliases: Entity[] = allEntities.map((entity) => {
    const key = entity.text.toLowerCase();
    const alias = selectedAliases.get(key);
    return {
      ...entity,
      acceptedAlias: alias ?? entity.proposedAlias,
    };
  });

  chrome.runtime.sendMessage({
    type: "APPLY_ALIASES",
    entities: entitiesWithAliases,
  });

  showStatus("done", "Substitutions appliquees au document.");
}

// -- Redact all: set every entity to [REDACTED] and apply --

function redactAll(): void {
  if (allEntities.length === 0) return;

  // Set all aliases to [REDACTED]
  for (const [term] of entityGroups) {
    selectedAliases.set(term, "[REDACTED]");
  }

  // Update radio buttons in the UI
  for (const radio of entityList.querySelectorAll('input[type="radio"]')) {
    const input = radio as HTMLInputElement;
    input.checked = input.value === "[REDACTED]";
  }

  // Hide all custom input wrappers
  for (const wrapper of entityList.querySelectorAll(".alias-custom-input")) {
    (wrapper as HTMLElement).style.display = "none";
  }

  applyAliases();
}

// -- Event listeners --

btnScan.addEventListener("click", () => {
  runScanPipeline();
});

btnRedactAll.addEventListener("click", () => {
  redactAll();
});

btnApply.addEventListener("click", () => {
  applyAliases();
});

// -- Listen for status broadcasts from the service worker --

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATUS") {
    if (message.status === "error") {
      showStatus("error", message.detail ?? "Erreur inconnue");
    }
  }
});

// -- Initial state --

hideStatus();
