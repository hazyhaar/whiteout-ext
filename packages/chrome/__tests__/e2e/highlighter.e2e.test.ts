/**
 * E2E tests for highlightEntities / removeHighlights — DOM level.
 *
 * Uses happy-dom as the DOM environment (configured in vitest.config.ts).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { highlightEntities, removeHighlights } from "../../src/content/highlighter.js";
import type { Entity } from "@whiteout/core";

function makeEntity(text: string, type: Entity["type"], start = 0): Entity {
  return {
    text,
    start,
    end: start + text.length,
    type,
    confidence: "high",
    sources: ["test"],
    proposedAlias: `Alias_${text}`,
  };
}

describe("highlightEntities — DOM", () => {
  beforeEach(() => {
    document.body.innerHTML = "<p>M. Dupont habite à Lyon.</p>";
    // Clean up any leftover stylesheets
    const style = document.getElementById("whiteout-highlight-css");
    if (style) style.remove();
  });

  it("creates <mark> elements with data-whiteout-highlight and the type class", () => {
    const entities = [makeEntity("Dupont", "person", 3)];
    highlightEntities(entities);

    const marks = document.querySelectorAll("[data-whiteout-highlight]");
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe("Dupont");
    expect(marks[0].classList.contains("whiteout-highlight")).toBe(true);
    expect(marks[0].classList.contains("whiteout-hl-person")).toBe(true);
  });

  it("handles multiple entities of different types in the same paragraph", () => {
    const entities = [
      makeEntity("Dupont", "person", 3),
      makeEntity("Lyon", "city", 20),
    ];
    highlightEntities(entities);

    const marks = document.querySelectorAll("[data-whiteout-highlight]");
    expect(marks.length).toBe(2);

    const texts = Array.from(marks).map((m) => m.textContent);
    expect(texts).toContain("Dupont");
    expect(texts).toContain("Lyon");

    const personMark = Array.from(marks).find((m) => m.textContent === "Dupont")!;
    const cityMark = Array.from(marks).find((m) => m.textContent === "Lyon")!;
    expect(personMark.classList.contains("whiteout-hl-person")).toBe(true);
    expect(cityMark.classList.contains("whiteout-hl-city")).toBe(true);
  });

  it("removeHighlights restores the original text without <mark>", () => {
    const entities = [makeEntity("Dupont", "person", 3)];
    highlightEntities(entities);

    expect(document.querySelectorAll("[data-whiteout-highlight]").length).toBe(1);

    removeHighlights();

    expect(document.querySelectorAll("[data-whiteout-highlight]").length).toBe(0);
    expect(document.body.textContent).toContain("Dupont");
    // Text should be intact
    expect(document.querySelector("p")?.textContent).toBe("M. Dupont habite à Lyon.");
  });

  it("does not insert marks inside <script> or <style>", () => {
    document.body.innerHTML =
      "<p>Dupont</p><script>var Dupont = 1;</script><style>.Dupont{}</style>";
    const entities = [makeEntity("Dupont", "person")];
    highlightEntities(entities);

    const marks = document.querySelectorAll("[data-whiteout-highlight]");
    // Only the <p> should get a mark, not script or style
    expect(marks.length).toBe(1);
    expect(marks[0].closest("p")).not.toBeNull();
  });

  it("injects the stylesheet only once after two calls", () => {
    const entities = [makeEntity("Dupont", "person", 3)];
    highlightEntities(entities);
    highlightEntities(entities);

    const stylesheets = document.querySelectorAll("#whiteout-highlight-css");
    expect(stylesheets.length).toBe(1);
  });
});
