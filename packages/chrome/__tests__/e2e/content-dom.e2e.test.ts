/**
 * E2E tests for extractVisibleText and applySubstitution — DOM level.
 *
 * Uses happy-dom as the DOM environment (configured in vitest.config.ts).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { extractVisibleText, applySubstitution } from "../../src/content/content-dom.js";
import type { Entity } from "@whiteout/core";

function makeEntity(
  text: string,
  type: Entity["type"],
  acceptedAlias?: string,
): Entity {
  return {
    text,
    start: 0,
    end: text.length,
    type,
    confidence: "high",
    sources: ["test"],
    proposedAlias: `Alias_${text}`,
    acceptedAlias,
  };
}

describe("extractVisibleText", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    // Clean up any leftover stylesheets
    const style = document.getElementById("whiteout-highlight-css");
    if (style) style.remove();
  });

  it("excludes the content of <script> and <style>", () => {
    document.body.innerHTML =
      "<p>Visible text.</p><script>var secret = 1;</script><style>.hidden{}</style>";

    const text = extractVisibleText();
    expect(text).toContain("Visible text.");
    expect(text).not.toContain("secret");
    expect(text).not.toContain(".hidden");
  });

  it("normalizes multiple spaces and excessive line breaks", () => {
    document.body.innerHTML = "<p>Mot   un     deux</p><p>\n\n\n\n\n</p><p>Trois</p>";

    const text = extractVisibleText();
    // Multiple spaces collapsed to single space
    expect(text).not.toMatch(/  /);
    // Excessive newlines collapsed
    expect(text).not.toMatch(/\n{3,}/);
  });

  it("excludes elements with aria-hidden='true'", () => {
    document.body.innerHTML =
      '<p>Visible.</p><div aria-hidden="true">Hidden content</div>';

    const text = extractVisibleText();
    expect(text).toContain("Visible.");
    expect(text).not.toContain("Hidden content");
  });
});

describe("applySubstitution", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    const style = document.getElementById("whiteout-highlight-css");
    if (style) style.remove();
  });

  it("replaces entity text with acceptedAlias in text nodes", () => {
    document.body.innerHTML = "<p>M. Dupont habite à Lyon.</p>";

    const entities = [
      makeEntity("Dupont", "person", "Personne 1"),
    ];
    applySubstitution(entities);

    expect(document.body.textContent).toContain("Personne 1");
    expect(document.body.textContent).not.toContain("Dupont");
  });

  it("performs case-insensitive matching", () => {
    document.body.innerHTML = "<p>dupont et DUPONT sont là.</p>";

    const entities = [
      makeEntity("Dupont", "person", "Personne 1"),
    ];
    applySubstitution(entities);

    const text = document.body.textContent!;
    expect(text).not.toMatch(/dupont/i);
    expect(text).toContain("Personne 1");
  });

  it("ignores entities whose acceptedAlias === text (skip)", () => {
    document.body.innerHTML = "<p>Dupont et Lyon.</p>";

    const entities = [
      makeEntity("Dupont", "person", "Dupont"), // same as text → skip
      makeEntity("Lyon", "city", "Ville 1"),
    ];
    applySubstitution(entities);

    // Dupont should remain unchanged, Lyon should be replaced
    expect(document.body.textContent).toContain("Dupont");
    expect(document.body.textContent).toContain("Ville 1");
    expect(document.body.textContent).not.toContain("Lyon");
  });

  it("calls removeHighlights before substitution", () => {
    // Set up a highlighted state
    document.body.innerHTML =
      '<p>M. <mark data-whiteout-highlight="true" class="whiteout-highlight whiteout-hl-person">Dupont</mark> habite à Lyon.</p>';

    const entities = [
      makeEntity("Dupont", "person", "Personne 1"),
    ];
    applySubstitution(entities);

    // Highlights should be gone
    expect(document.querySelectorAll("[data-whiteout-highlight]").length).toBe(0);
    // Substitution should have been applied
    expect(document.body.textContent).toContain("Personne 1");
  });
});
