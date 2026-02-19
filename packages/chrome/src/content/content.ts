/**
 * Whiteout Chrome Extension - Content Script.
 *
 * Runs in the context of every web page. Listens for messages from the
 * service worker and performs DOM operations: text extraction, entity
 * highlighting, and text substitution.
 */

import type { Entity } from "@whiteout/core";
import { highlightEntities, removeHighlights } from "./highlighter.js";
import { extractVisibleText, applySubstitution } from "./content-dom.js";

// -- Message listener --

chrome.runtime.onMessage.addListener(
  (message: Record<string, unknown>, _sender, sendResponse) => {
    switch (message.type) {
      case "EXTRACT_TEXT": {
        const text = extractVisibleText();
        const title = document.title || window.location.hostname;
        sendResponse({ text, title });
        break;
      }

      case "HIGHLIGHT_ENTITIES": {
        const entities = message.entities as Entity[];
        highlightEntities(entities);
        sendResponse({ ok: true });
        break;
      }

      case "APPLY_SUBSTITUTION": {
        const entities = message.entities as Entity[];
        applySubstitution(entities);
        sendResponse({ ok: true });
        break;
      }

      case "CLEAR_HIGHLIGHTS": {
        removeHighlights();
        sendResponse({ ok: true });
        break;
      }

      default: {
        sendResponse({ error: `Content script: unknown type "${message.type}"` });
      }
    }

    // Synchronous response (no async needed here).
    return false;
  },
);

// Signal that the content script is loaded
console.log("[Whiteout] Content script loaded on", window.location.href);
