import { describe, it, expect, vi } from "vitest";
import { classifyBatch } from "../src/touchstone-client.js";
import { MemoryStore } from "../src/ports.js";
import type { FetchPort } from "../src/ports.js";
import type { DetectedGroup } from "../src/types.js";

function makeGroup(text: string, skip = false): DetectedGroup {
  return {
    tokens: [{ text, start: 0, end: text.length, kind: "word" }],
    text,
    confidence: "candidate",
    skipTouchstone: skip,
  };
}

describe("classifyBatch", () => {
  it("sends ConnectRPC request first", async () => {
    const fetch: FetchPort = {
      async post(url, body) {
        expect(url).toContain("/touchstone.v1.ClassificationService/ClassifyBatch");
        const req = JSON.parse(body);
        return {
          status: 200,
          body: JSON.stringify({
            classifications: {
              [req.terms[0]]: [{ dict: "test", match: true, type: "surname", jurisdiction: "fr", confidence: "high", metadata: {} }],
            },
          }),
        };
      },
    };

    const store = new MemoryStore();
    const groups = [makeGroup("Dupont")];
    const results = await classifyBatch(groups, fetch, store, {}, 0);

    expect(results.has("Dupont")).toBe(true);
    expect(results.get("Dupont")![0].type).toBe("surname");
  });

  it("falls back to REST on 404", async () => {
    let callCount = 0;
    const fetch: FetchPort = {
      async post(url, body) {
        callCount++;
        if (url.includes("ClassifyBatch")) {
          return { status: 404, body: "Not Found" };
        }
        // REST fallback
        expect(url).toContain("/v1/classify/batch");
        return {
          status: 200,
          body: JSON.stringify({
            classifications: {
              Dupont: [{ dict: "surnames", match: true, type: "surname", jurisdiction: "fr", confidence: "high", metadata: {} }],
            },
          }),
        };
      },
    };

    const store = new MemoryStore();
    const results = await classifyBatch([makeGroup("Dupont")], fetch, store, {}, 0);

    expect(callCount).toBe(2); // ConnectRPC + REST
    expect(results.get("Dupont")![0].type).toBe("surname");
  });

  it("returns empty map on network error (offline mode)", async () => {
    const fetch: FetchPort = {
      async post() {
        throw new Error("ECONNREFUSED");
      },
    };

    const store = new MemoryStore();
    const results = await classifyBatch([makeGroup("Dupont")], fetch, store);
    // Should not throw, just return empty
    expect(results.size).toBe(0);
  });

  it("skips groups marked as skipTouchstone", async () => {
    let called = false;
    const fetch: FetchPort = {
      async post() {
        called = true;
        return { status: 200, body: JSON.stringify({ classifications: {} }) };
      },
    };

    const store = new MemoryStore();
    const groups = [makeGroup("test@example.com", true)];
    await classifyBatch(groups, fetch, store);

    expect(called).toBe(false);
  });

  it("uses cached results", async () => {
    let fetchCalls = 0;
    const fetch: FetchPort = {
      async post(_url, body) {
        fetchCalls++;
        return {
          status: 200,
          body: JSON.stringify({
            classifications: {
              Lyon: [{ dict: "cities", match: true, type: "city", jurisdiction: "fr", confidence: "high", metadata: {} }],
            },
          }),
        };
      },
    };

    const store = new MemoryStore();
    const groups = [makeGroup("Lyon")];

    // First call: goes to network
    await classifyBatch(groups, fetch, store, {}, 0);
    expect(fetchCalls).toBe(1);

    // Second call: should use cache
    const results = await classifyBatch(groups, fetch, store, {}, 0);
    expect(fetchCalls).toBe(1); // no new fetch call
    expect(results.get("Lyon")![0].type).toBe("city");
  });

  it("filters out decoys from results", async () => {
    const fetch: FetchPort = {
      async post(_url, body) {
        const req = JSON.parse(body);
        const classifications: Record<string, unknown[]> = {};
        for (const term of req.terms) {
          classifications[term] = [{ dict: "test", match: true, type: "unknown", jurisdiction: "fr", confidence: "low", metadata: {} }];
        }
        return { status: 200, body: JSON.stringify({ classifications }) };
      },
    };

    const store = new MemoryStore();
    const groups = [makeGroup("Dupont")];
    // Use high decoy ratio
    const results = await classifyBatch(groups, fetch, store, {}, 0.5);

    // Only real term should be in results
    expect(results.has("Dupont")).toBe(true);
    // Decoys should be filtered out (result size should be 1)
    expect(results.size).toBe(1);
  });
});
