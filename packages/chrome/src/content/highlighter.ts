/**
 * DOM highlighter for detected entities.
 *
 * Walks the document tree, finds text nodes that contain entity terms,
 * and wraps them in <mark> elements with CSS classes per entity type.
 * Can remove all highlights on cleanup.
 */

import type { Entity, EntityType } from "@whiteout/core";

const HIGHLIGHT_ATTR = "data-whiteout-highlight";
const HIGHLIGHT_CLASS = "whiteout-highlight";

/** CSS class by entity type. */
const TYPE_CLASSES: Record<EntityType, string> = {
  person: "whiteout-hl-person",
  company: "whiteout-hl-company",
  address: "whiteout-hl-city",
  city: "whiteout-hl-city",
  email: "whiteout-hl-sensitive",
  phone: "whiteout-hl-sensitive",
  iban: "whiteout-hl-sensitive",
  ssn: "whiteout-hl-sensitive",
  url: "whiteout-hl-sensitive",
  unknown: "whiteout-hl-unknown",
};

/** Inject the highlight CSS once into the document head. */
function ensureStylesheet(): void {
  if (document.getElementById("whiteout-highlight-css")) return;

  const style = document.createElement("style");
  style.id = "whiteout-highlight-css";
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      border-radius: 2px;
      padding: 0 2px;
      cursor: pointer;
      font-weight: 600;
    }
    .whiteout-hl-person {
      background-color: rgba(100, 180, 255, 0.4);
      border-bottom: 2px solid #3a8fd6;
    }
    .whiteout-hl-company {
      background-color: rgba(100, 220, 150, 0.4);
      border-bottom: 2px solid #2ca060;
    }
    .whiteout-hl-city {
      background-color: rgba(255, 180, 80, 0.4);
      border-bottom: 2px solid #d98020;
    }
    .whiteout-hl-sensitive {
      background-color: rgba(255, 100, 100, 0.4);
      border-bottom: 2px solid #cc3333;
    }
    .whiteout-hl-unknown {
      background-color: rgba(180, 180, 180, 0.3);
      border-bottom: 2px solid #999;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Highlight all occurrences of detected entities in the DOM.
 * Uses TreeWalker to find text nodes and wraps matches in <mark>.
 */
export function highlightEntities(entities: Entity[]): void {
  ensureStylesheet();
  removeHighlights();

  if (entities.length === 0) return;

  // Build a case-insensitive regex matching all entity terms
  const terms = [...new Set(entities.map((e) => e.text))];
  // Sort by length descending so longer terms match first
  terms.sort((a, b) => b.length - a.length);

  const escaped = terms.map((t) => escapeRegExp(t));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  // Build a lookup from lowercase term to entity type
  const typeMap = new Map<string, EntityType>();
  for (const entity of entities) {
    typeMap.set(entity.text.toLowerCase(), entity.type);
  }

  // Walk text nodes
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node): number {
        // Skip script, style, and already-highlighted nodes
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.hasAttribute(HIGHLIGHT_ATTR)) {
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

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index)),
        );
      }

      // The highlighted term
      const mark = document.createElement("mark");
      mark.setAttribute(HIGHLIGHT_ATTR, "true");
      const entityType = typeMap.get(match[0].toLowerCase()) ?? "unknown";
      const typeClass = TYPE_CLASSES[entityType as EntityType] ?? "whiteout-hl-unknown";
      mark.className = `${HIGHLIGHT_CLASS} ${typeClass}`;
      mark.textContent = match[0];
      mark.title = `Type: ${entityType}`;
      fragment.appendChild(mark);

      lastIndex = match.index + match[0].length;
    }

    // Remaining text after last match
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

/**
 * Remove all Whiteout highlights from the DOM, restoring original text nodes.
 */
export function removeHighlights(): void {
  const marks = document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`);
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;

    const text = document.createTextNode(mark.textContent ?? "");
    parent.replaceChild(text, mark);

    // Merge adjacent text nodes
    parent.normalize();
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
