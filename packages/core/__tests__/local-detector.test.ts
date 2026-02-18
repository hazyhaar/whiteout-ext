import { describe, it, expect } from "vitest";
import { tokenize } from "../src/tokenizer.js";
import { detectLocal, detectLanguage } from "../src/local-detector.js";

describe("detectLanguage", () => {
  it("detects French text", () => {
    const tokens = tokenize("Le contrat de bail est signé par les parties");
    expect(detectLanguage(tokens)).toBe("fr");
  });

  it("detects English text", () => {
    const tokens = tokenize("The contract was signed by all the parties involved");
    expect(detectLanguage(tokens)).toBe("en");
  });

  it("detects German text", () => {
    const tokens = tokenize("Der Vertrag wurde von allen Parteien unterschrieben");
    expect(detectLanguage(tokens)).toBe("de");
  });
});

describe("detectLocal", () => {
  it("detects company with legal form prefix", () => {
    const tokens = tokenize("La SCI Les Lilas a été constituée");
    const groups = detectLocal(tokens);
    const company = groups.find((g) => g.localType === "company_candidate");
    expect(company).toBeDefined();
    expect(company!.text).toContain("SCI");
    expect(company!.text).toContain("Lilas");
  });

  it("detects SARL company", () => {
    const tokens = tokenize("La SARL Dupont Menuiserie est basée à Lyon");
    const groups = detectLocal(tokens);
    const company = groups.find((g) => g.localType === "company_candidate");
    expect(company).toBeDefined();
    expect(company!.text).toContain("SARL");
  });

  it("detects address with street type", () => {
    const tokens = tokenize("Il habite au 12 rue des Acacias");
    const groups = detectLocal(tokens);
    const address = groups.find((g) => g.localType === "address_fragment");
    expect(address).toBeDefined();
    expect(address!.text).toContain("rue");
  });

  it("detects person with honorific", () => {
    const tokens = tokenize("Signé par M. Dupont le 15 mars");
    const groups = detectLocal(tokens);
    const person = groups.find((g) => g.localType === "person_candidate");
    expect(person).toBeDefined();
    expect(person!.text).toContain("Dupont");
  });

  it("detects Mme honorific", () => {
    const tokens = tokenize("Mme Martin est présente");
    const groups = detectLocal(tokens);
    const person = groups.find((g) => g.localType === "person_candidate");
    expect(person).toBeDefined();
    expect(person!.text).toContain("Martin");
  });

  it("detects email as pattern (skipTouchstone=true)", () => {
    const tokens = tokenize("Contacter jean@example.com");
    const groups = detectLocal(tokens);
    const email = groups.find((g) => g.localType === "email");
    expect(email).toBeDefined();
    expect(email!.skipTouchstone).toBe(true);
  });

  it("detects standalone capitalized words as candidates", () => {
    const tokens = tokenize("le contrat entre Dupont et Lyon est validé");
    const groups = detectLocal(tokens);
    const candidates = groups.filter((g) => g.confidence === "candidate");
    const texts = candidates.map((g) => g.text);
    expect(texts).toContain("Dupont");
    expect(texts).toContain("Lyon");
  });

  it("filters out stop words", () => {
    const tokens = tokenize("Le bail du propriétaire");
    const groups = detectLocal(tokens);
    const texts = groups.map((g) => g.text);
    expect(texts).not.toContain("Le");
    expect(texts).not.toContain("du");
  });
});
