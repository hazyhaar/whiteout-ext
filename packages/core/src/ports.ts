import type { TouchstoneResult } from "./types.js";

/** Platform-agnostic local storage interface. */
export interface StorePort {
  getAliasMap(sessionId: string): Promise<Map<string, string>>;
  setAliasMap(sessionId: string, map: Map<string, string>): Promise<void>;
  getCachedClassification(
    term: string
  ): Promise<TouchstoneResult[] | null>;
  setCachedClassification(
    term: string,
    results: TouchstoneResult[],
    ttlMs: number
  ): Promise<void>;
}

/** Platform-agnostic HTTP client interface. */
export interface FetchPort {
  post(
    url: string,
    body: string,
    headers: Record<string, string>
  ): Promise<{ status: number; body: string }>;
}

/** In-memory store for testing and offline use. */
export class MemoryStore implements StorePort {
  private aliases = new Map<string, Map<string, string>>();
  private cache = new Map<
    string,
    { results: TouchstoneResult[]; expiresAt: number }
  >();

  async getAliasMap(sessionId: string): Promise<Map<string, string>> {
    return this.aliases.get(sessionId) ?? new Map();
  }

  async setAliasMap(
    sessionId: string,
    map: Map<string, string>
  ): Promise<void> {
    this.aliases.set(sessionId, map);
  }

  async getCachedClassification(
    term: string
  ): Promise<TouchstoneResult[] | null> {
    const entry = this.cache.get(term);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(term);
      return null;
    }
    return entry.results;
  }

  async setCachedClassification(
    term: string,
    results: TouchstoneResult[],
    ttlMs: number
  ): Promise<void> {
    this.cache.set(term, { results, expiresAt: Date.now() + ttlMs });
  }
}
