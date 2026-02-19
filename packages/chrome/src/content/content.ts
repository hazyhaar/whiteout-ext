/**
 * Whiteout Chrome Extension - Content Script.
 *
 * Runs in the context of every web page. Listens for messages from the
 * service worker and performs DOM operations: text extraction, entity
 * highlighting, and text substitution.
 */

import type { Entity } from "@whiteout/core";
import { highlightEntities, removeHighlights } from "./highlighter.js";

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

// -- Text extraction --

/**
 * Extract the visible text content from the page body.
 * Strips script/style content and collapses whitespace.
 */
function extractVisibleText(): string {
  // Clone the body to avoid side effects
  const clone = document.body.cloneNode(true) as HTMLElement;

  // Remove elements that do not contribute visible text
  const removable = clone.querySelectorAll(
    "script, style, noscript, svg, canvas, [aria-hidden='true']",
  );
  for (const el of removable) {
    el.remove();
  }

  const raw = clone.innerText ?? clone.textContent ?? "";
  // Collapse excessive whitespace but preserve paragraph breaks
  return raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// -- Substitution --

/**
 * Apply entity alias substitutions directly in the DOM.
 *
 * Uses a TreeWalker to find text nodes containing entity terms and replaces
 * them in-place. Only entities that have an acceptedAlias are substituted.
 */
function applySubstitution(entities: Entity[]): void {
  // First remove highlights so we work on clean text nodes
  removeHighlights();

  const toReplace = entities.filter(
    (e) => e.acceptedAlias != null && e.acceptedAlias !== e.text,
  );
  if (toReplace.length === 0) return;

  // Build replacement map (case-insensitive)
  const replacements = new Map<string, string>();
  for (const entity of toReplace) {
    replacements.set(entity.text.toLowerCase(), entity.acceptedAlias!);
  }

  // Build regex
  const terms = [...replacements.keys()];
  terms.sort((a, b) => b.length - a.length);
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  // Walk all text nodes
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node): number {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    if (!text || !pattern.test(text)) {
      pattern.lastIndex = 0;
      continue;
    }
    pattern.lastIndex = 0;

    const replaced = text.replace(pattern, (match) => {
      return replacements.get(match.toLowerCase()) ?? match;
    });

    if (replaced !== text) {
      textNode.nodeValue = replaced;
    }
  }
}

// Signal that the content script is loaded
console.log("[Whiteout] Content script loaded on", window.location.href);
