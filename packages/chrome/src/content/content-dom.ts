/**
 * Pure DOM functions extracted from content.ts for testability.
 *
 * These functions operate on the DOM but do not depend on chrome.runtime,
 * making them testable with happy-dom or jsdom.
 */

import type { Entity } from "@whiteout/core";
import { removeHighlights } from "./highlighter.js";

/**
 * Extract the visible text content from the page body.
 * Strips script/style content and collapses whitespace.
 */
export function extractVisibleText(): string {
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

/**
 * Apply entity alias substitutions directly in the DOM.
 *
 * Uses a TreeWalker to find text nodes containing entity terms and replaces
 * them in-place. Only entities that have an acceptedAlias are substituted.
 */
export function applySubstitution(entities: Entity[]): void {
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
