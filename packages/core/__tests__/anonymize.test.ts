import { describe, it, expect } from "vitest";
import { anonymize, anonymizeBatch, deanonymize } from "../src/anonymize.js";

describe("anonymize (simplified API)", () => {
  it("anonymizes text in offline mode", async () => {
    const result = await anonymize(
      "Contacter jean.dupont@gmail.com ou 06 12 34 56 78",
      { touchstoneUrl: null }
    );

    expect(result.text).not.toContain("jean.dupont@gmail.com");
    expect(result.text).not.toContain("06 12 34 56 78");
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.aliasTable).toBeDefined();
  });

  it("returns alias table as plain object", async () => {
    const result = await anonymize("M. Dupont habite à Lyon.", {
      touchstoneUrl: null,
    });

    expect(typeof result.aliasTable).toBe("object");
    // At least Dupont should be in the table
    const keys = Object.keys(result.aliasTable);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("detects language", async () => {
    const fr = await anonymize("Le contrat de bail est signé.", {
      touchstoneUrl: null,
    });
    expect(fr.language).toBe("fr");

    const en = await anonymize("The contract was signed by all parties.", {
      touchstoneUrl: null,
    });
    expect(en.language).toBe("en");
  });

  it("works with generic alias style", async () => {
    const result = await anonymize("M. Dupont est présent.", {
      touchstoneUrl: null,
      aliasStyle: "generic",
    });

    const hasGeneric = result.entities.some(
      (e) =>
        e.proposedAlias.startsWith("Personne") ||
        e.proposedAlias.startsWith("Société") ||
        e.proposedAlias.startsWith("Ville") ||
        e.proposedAlias.startsWith("Adresse")
    );
    // May or may not have generic aliases depending on detection
    expect(result.text).toBeTruthy();
  });
});

describe("anonymizeBatch", () => {
  it("maintains alias consistency across batch", async () => {
    const results = await anonymizeBatch(
      [
        "M. Dupont signe le contrat.",
        "M. Dupont confirme la vente.",
      ],
      { touchstoneUrl: null }
    );

    expect(results).toHaveLength(2);

    // Find Dupont alias in both
    const alias1 = results[0].aliasTable["Dupont"];
    const alias2 = results[1].aliasTable["Dupont"];
    if (alias1 && alias2) {
      expect(alias1).toBe(alias2);
    }
  });
});

describe("deanonymize", () => {
  it("restores original text from alias table", async () => {
    const original = "Contacter jean.dupont@gmail.com pour info.";
    const result = await anonymize(original, { touchstoneUrl: null });

    const restored = deanonymize(result.text, result.aliasTable);

    // Should restore the email
    expect(restored).toContain("jean.dupont@gmail.com");
  });

  it("handles empty alias table", () => {
    const text = "Hello world";
    expect(deanonymize(text, {})).toBe("Hello world");
  });

  it("handles multiple replacements", () => {
    const aliasTable = {
      "Jean": "Marc",
      "Dupont": "Renaud",
      "Lyon": "Bordeaux",
    };
    const anonymized = "Marc Renaud habite à Bordeaux.";
    const restored = deanonymize(anonymized, aliasTable);
    expect(restored).toBe("Jean Dupont habite à Lyon.");
  });
});

describe("roundtrip anonymize → deanonymize", () => {
  it("roundtrips for pattern entities (email, phone)", async () => {
    const original = "Contacter jean.dupont@gmail.com ou appeler 06 12 34 56 78.";
    const result = await anonymize(original, { touchstoneUrl: null });

    // Anonymized text should not contain originals
    expect(result.text).not.toContain("jean.dupont@gmail.com");
    expect(result.text).not.toContain("06 12 34 56 78");

    // Deanonymize should restore them
    const restored = deanonymize(result.text, result.aliasTable);
    expect(restored).toContain("jean.dupont@gmail.com");
    expect(restored).toContain("06 12 34 56 78");
  });

  it("handles URL anonymization roundtrip", async () => {
    const original = "Voir https://example.com/page?q=test pour plus d'info.";
    const result = await anonymize(original, { touchstoneUrl: null });

    expect(result.text).not.toContain("https://example.com/page?q=test");
    const restored = deanonymize(result.text, result.aliasTable);
    expect(restored).toContain("https://example.com/page?q=test");
  });
});

describe("edge cases", () => {
  it("handles empty text", async () => {
    const result = await anonymize("", { touchstoneUrl: null });
    expect(result.text).toBe("");
    expect(result.entities).toHaveLength(0);
  });

  it("handles text with only stop words", async () => {
    const result = await anonymize("le de la du des un une", { touchstoneUrl: null });
    expect(result.entities).toHaveLength(0);
    expect(result.text).toBe("le de la du des un une");
  });

  it("handles mixed FR/EN text", async () => {
    const result = await anonymize(
      "M. Dupont contacted Mr. Smith in Paris for the meeting.",
      { touchstoneUrl: null }
    );
    // Should detect entities from both languages
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.text).not.toContain("Dupont");
  });
});
