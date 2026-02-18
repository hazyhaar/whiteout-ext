import { describe, it, expect } from "vitest";
import { pipeline } from "../src/index.js";
import { MemoryStore } from "../src/ports.js";
import type { FetchPort } from "../src/ports.js";

/** A mock FetchPort that simulates Touchstone responses. */
function createMockFetch(
  classifications: Record<string, { dict: string; match: boolean; type: string }[]> = {}
): FetchPort {
  return {
    async post(_url: string, body: string) {
      const req = JSON.parse(body) as { terms: string[] };
      const results: Record<string, unknown[]> = {};
      for (const term of req.terms) {
        if (classifications[term]) {
          results[term] = classifications[term].map((c) => ({
            ...c,
            jurisdiction: "fr",
            confidence: "high",
            metadata: {},
          }));
        }
      }
      return {
        status: 200,
        body: JSON.stringify({ classifications: results }),
      };
    },
  };
}

describe("pipeline", () => {
  it("anonymizes a simple French text", async () => {
    const text = "M. Dupont habite au 12 rue des Acacias à Lyon.";
    const fetch = createMockFetch({
      Dupont: [{ dict: "surnames", match: true, type: "surname" }],
      Lyon: [{ dict: "communes", match: true, type: "city" }],
    });
    const store = new MemoryStore();

    const result = await pipeline(text, fetch, store, "test-session");

    expect(result.language).toBe("fr");
    expect(result.entities.length).toBeGreaterThan(0);
    // The anonymized text should not contain "Dupont"
    expect(result.anonymizedText).not.toContain("Dupont");
  });

  it("works in offline mode (Touchstone unreachable)", async () => {
    const text = "Contacter jean.dupont@gmail.com ou 06 12 34 56 78";
    const fetch: FetchPort = {
      async post() {
        throw new Error("Network error");
      },
    };
    const store = new MemoryStore();

    const result = await pipeline(text, fetch, store, "offline-test");

    // Pattern-detected entities (email, phone) should still be found
    const types = result.entities.map((e) => e.type);
    expect(types).toContain("email");
    expect(types).toContain("phone");
    // They should be anonymized
    expect(result.anonymizedText).not.toContain("jean.dupont@gmail.com");
  });

  it("maintains alias consistency across calls", async () => {
    const fetch = createMockFetch({
      Dupont: [{ dict: "surnames", match: true, type: "surname" }],
    });
    const store = new MemoryStore();

    const r1 = await pipeline("M. Dupont signe.", fetch, store, "session-1");
    const r2 = await pipeline("M. Dupont confirme.", fetch, store, "session-1");

    // Same alias should be used for Dupont across both calls
    const alias1 = r1.entities.find((e) => e.text.includes("Dupont"))?.proposedAlias;
    const alias2 = r2.entities.find((e) => e.text.includes("Dupont"))?.proposedAlias;
    expect(alias1).toBeTruthy();
    expect(alias1).toBe(alias2);
  });
});
