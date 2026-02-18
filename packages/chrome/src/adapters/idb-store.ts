import type { StorePort, TouchstoneResult } from "@whiteout/core";

const DB_NAME = "whiteout";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("aliases")) {
        db.createObjectStore("aliases");
      }
      if (!db.objectStoreNames.contains("cache")) {
        const store = db.createObjectStore("cache", { keyPath: "term" });
        store.createIndex("expiresAt", "expiresAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IDBStore implements StorePort {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = openDB();
    // Schedule expired cache cleanup on startup (non-blocking)
    this.cleanExpiredCache().catch(() => {});
  }

  /** Remove expired entries from the classification cache. */
  async cleanExpiredCache(): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("cache", "readwrite");
      const store = tx.objectStore("cache");
      const idx = store.index("expiresAt");
      const range = IDBKeyRange.upperBound(Date.now());
      const req = idx.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAliasMap(sessionId: string): Promise<Map<string, string>> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("aliases", "readonly");
      const req = tx.objectStore("aliases").get(sessionId);
      req.onsuccess = () => {
        const data = req.result as Record<string, string> | undefined;
        resolve(data ? new Map(Object.entries(data)) : new Map());
      };
      req.onerror = () => reject(req.error);
    });
  }

  async setAliasMap(sessionId: string, map: Map<string, string>): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("aliases", "readwrite");
      tx.objectStore("aliases").put(Object.fromEntries(map), sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getCachedClassification(term: string): Promise<TouchstoneResult[] | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("cache", "readonly");
      const req = tx.objectStore("cache").get(term);
      req.onsuccess = () => {
        const entry = req.result as { term: string; results: TouchstoneResult[]; expiresAt: number } | undefined;
        if (!entry || Date.now() > entry.expiresAt) {
          resolve(null);
        } else {
          resolve(entry.results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async setCachedClassification(
    term: string,
    results: TouchstoneResult[],
    ttlMs: number
  ): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("cache", "readwrite");
      tx.objectStore("cache").put({
        term,
        results,
        expiresAt: Date.now() + ttlMs,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
