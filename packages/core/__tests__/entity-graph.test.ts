import { describe, it, expect, beforeEach } from "vitest";
import { MemoryEntityGraph } from "../src/entity-graph-memory.js";
import {
  canonicalize,
  findMatches,
  recordDocument,
  generateId,
} from "../src/entity-graph.js";

describe("canonicalize", () => {
  it("uppercases and trims", () => {
    expect(canonicalize("  Jean-Pierre Dupont  ")).toBe("JEAN-PIERRE DUPONT");
  });

  it("collapses whitespace", () => {
    expect(canonicalize("SCI   Les   Lilas")).toBe("SCI LES LILAS");
  });
});

describe("generateId", () => {
  it("produces prefixed IDs", () => {
    const id = generateId("ent_");
    expect(id).toMatch(/^ent_/);
    expect(id.length).toBeGreaterThan(8);
  });

  it("produces unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId("x_")));
    expect(ids.size).toBe(100);
  });
});

describe("MemoryEntityGraph", () => {
  let graph: MemoryEntityGraph;

  beforeEach(() => {
    graph = new MemoryEntityGraph();
  });

  it("stores and retrieves entities by canonical", async () => {
    await graph.putEntity({
      id: "ent_1",
      canonical: "DUPONT",
      type: "person",
      firstSeen: "2025-01-01T00:00:00Z",
      lastSeen: "2025-01-01T00:00:00Z",
      documentCount: 1,
    });

    const found = await graph.findByCanonical("DUPONT");
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("ent_1");
  });

  it("stores and retrieves documents", async () => {
    await graph.putDocument({
      id: "doc_1",
      label: "Contrat bail",
      processedAt: "2025-06-15T10:00:00Z",
      entityCount: 5,
      fingerprint: "abc123",
    });

    const doc = await graph.getDocument("doc_1");
    expect(doc).not.toBeNull();
    expect(doc!.label).toBe("Contrat bail");
  });

  it("finds documents by fingerprint", async () => {
    await graph.putDocument({
      id: "doc_1",
      label: "Test",
      processedAt: "2025-06-15T10:00:00Z",
      entityCount: 0,
      fingerprint: "fp_unique",
    });

    const found = await graph.findByFingerprint("fp_unique");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("doc_1");
  });

  it("records and retrieves occurrences", async () => {
    await graph.addOccurrence({
      entityId: "ent_1",
      documentId: "doc_1",
      originalText: "Dupont",
      alias: "Renaud",
      confirmed: true,
    });

    const occs = await graph.getOccurrences("ent_1");
    expect(occs).toHaveLength(1);
    expect(occs[0].alias).toBe("Renaud");

    const docOccs = await graph.getDocumentOccurrences("doc_1");
    expect(docOccs).toHaveLength(1);
  });

  it("confirms occurrences", async () => {
    await graph.addOccurrence({
      entityId: "ent_1",
      documentId: "doc_1",
      originalText: "Dupont",
      alias: "Renaud",
      confirmed: false,
    });

    await graph.confirmOccurrence("ent_1", "doc_1");
    const occs = await graph.getOccurrences("ent_1");
    expect(occs[0].confirmed).toBe(true);
  });

  it("searches by prefix", async () => {
    await graph.putEntity({
      id: "ent_1",
      canonical: "DUPONT",
      type: "person",
      firstSeen: "2025-01-01T00:00:00Z",
      lastSeen: "2025-01-01T00:00:00Z",
      documentCount: 1,
    });
    await graph.putEntity({
      id: "ent_2",
      canonical: "DURAND",
      type: "person",
      firstSeen: "2025-01-01T00:00:00Z",
      lastSeen: "2025-01-01T00:00:00Z",
      documentCount: 1,
    });
    await graph.putEntity({
      id: "ent_3",
      canonical: "MARTIN",
      type: "person",
      firstSeen: "2025-01-01T00:00:00Z",
      lastSeen: "2025-01-01T00:00:00Z",
      documentCount: 1,
    });

    const results = await graph.search("DU");
    expect(results).toHaveLength(2);
  });

  it("counts entities and documents", async () => {
    expect(await graph.entityCount()).toBe(0);
    expect(await graph.documentCount()).toBe(0);

    await graph.putEntity({
      id: "ent_1",
      canonical: "X",
      type: "person",
      firstSeen: "2025-01-01T00:00:00Z",
      lastSeen: "2025-01-01T00:00:00Z",
      documentCount: 1,
    });
    await graph.putDocument({
      id: "doc_1",
      label: "X",
      processedAt: "2025-01-01T00:00:00Z",
      entityCount: 0,
      fingerprint: "x",
    });

    expect(await graph.entityCount()).toBe(1);
    expect(await graph.documentCount()).toBe(1);
  });
});

describe("recordDocument", () => {
  it("creates new entities for first-time occurrences", async () => {
    const graph = new MemoryEntityGraph();

    await recordDocument(
      "doc_1",
      "Contrat bail",
      "M. Dupont habite à Lyon",
      [
        { text: "Dupont", type: "person", alias: "Renaud", confirmed: true },
        { text: "Lyon", type: "city", alias: "Bordeaux", confirmed: true },
      ],
      graph
    );

    expect(await graph.entityCount()).toBe(2);
    expect(await graph.documentCount()).toBe(1);

    const dupont = await graph.findByCanonical("DUPONT");
    expect(dupont).toHaveLength(1);
    expect(dupont[0].type).toBe("person");
  });

  it("updates existing entities on second occurrence", async () => {
    const graph = new MemoryEntityGraph();

    // First document
    await recordDocument(
      "doc_1",
      "Document 1",
      "M. Dupont signe",
      [{ text: "Dupont", type: "person", alias: "Renaud", confirmed: true }],
      graph
    );

    // Second document
    await recordDocument(
      "doc_2",
      "Document 2",
      "M. Dupont confirme",
      [{ text: "Dupont", type: "person", alias: "Martin", confirmed: true }],
      graph
    );

    // Still 1 entity, but documentCount = 2
    expect(await graph.entityCount()).toBe(1);
    const dupont = await graph.findByCanonical("DUPONT");
    expect(dupont[0].documentCount).toBe(2);

    // 2 occurrences
    const occs = await graph.getOccurrences(dupont[0].id);
    expect(occs).toHaveLength(2);
    expect(occs[0].alias).toBe("Renaud");
    expect(occs[1].alias).toBe("Martin");
  });
});

describe("findMatches", () => {
  it("finds exact match from previous document", async () => {
    const graph = new MemoryEntityGraph();

    // Simulate processing a first document
    await recordDocument(
      "doc_1",
      "Contrat bail 2025",
      "M. Dupont habite au 12 rue des Acacias à Lyon",
      [
        { text: "Dupont", type: "person", alias: "Renaud", confirmed: true },
        { text: "Lyon", type: "city", alias: "Bordeaux", confirmed: true },
      ],
      graph
    );

    // Now a new document arrives with the same entities
    const matches = await findMatches(
      [
        { text: "Dupont", type: "person" },
        { text: "Lyon", type: "city" },
        { text: "Martin", type: "person" },
      ],
      graph
    );

    // Dupont and Lyon should match
    expect(matches.has("Dupont")).toBe(true);
    expect(matches.has("Lyon")).toBe(true);
    expect(matches.has("Martin")).toBe(false);

    const dupontMatch = matches.get("Dupont")!;
    expect(dupontMatch.previousAlias).toBe("Renaud");
    expect(dupontMatch.previousDocument.label).toBe("Contrat bail 2025");
    // Multiple co-entities → should be "exact" confidence
    expect(dupontMatch.matchConfidence).toBe("exact");
  });

  it("returns 'likely' when no co-entities overlap", async () => {
    const graph = new MemoryEntityGraph();

    await recordDocument(
      "doc_1",
      "Old doc",
      "M. Dupont dans l'ancien document",
      [
        { text: "Dupont", type: "person", alias: "Renaud", confirmed: true },
      ],
      graph
    );

    // New document has Dupont but no shared co-entities
    const matches = await findMatches(
      [{ text: "Dupont", type: "person" }],
      graph
    );

    expect(matches.has("Dupont")).toBe(true);
    expect(matches.get("Dupont")!.matchConfidence).toBe("likely");
  });

  it("returns 'possible' when types don't match", async () => {
    const graph = new MemoryEntityGraph();

    await recordDocument(
      "doc_1",
      "Old doc",
      "SCI Dupont",
      [
        { text: "Dupont", type: "company", alias: "SCI Horizon", confirmed: true },
      ],
      graph
    );

    // New document has Dupont as a person, not company
    const matches = await findMatches(
      [{ text: "Dupont", type: "person" }],
      graph
    );

    expect(matches.has("Dupont")).toBe(true);
    expect(matches.get("Dupont")!.matchConfidence).toBe("possible");
  });
});
