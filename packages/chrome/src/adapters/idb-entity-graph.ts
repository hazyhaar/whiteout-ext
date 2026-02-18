import type {
  EntityGraphPort,
  KnownEntity,
  EntityOccurrence,
  DocumentRecord,
} from "@whiteout/core";
import type { EntityType } from "@whiteout/core";

const DB_NAME = "whiteout-graph";
const DB_VERSION = 1;

function openGraphDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      // Known entities
      if (!db.objectStoreNames.contains("entities")) {
        const store = db.createObjectStore("entities", { keyPath: "id" });
        store.createIndex("canonical", "canonical", { unique: false });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("lastSeen", "lastSeen", { unique: false });
      }

      // Entity occurrences in documents
      if (!db.objectStoreNames.contains("occurrences")) {
        const store = db.createObjectStore("occurrences", {
          keyPath: ["entityId", "documentId"],
        });
        store.createIndex("entityId", "entityId", { unique: false });
        store.createIndex("documentId", "documentId", { unique: false });
      }

      // Processed documents
      if (!db.objectStoreNames.contains("documents")) {
        const store = db.createObjectStore("documents", { keyPath: "id" });
        store.createIndex("fingerprint", "fingerprint", { unique: false });
        store.createIndex("processedAt", "processedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IDBEntityGraph implements EntityGraphPort {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = openGraphDB();
  }

  // ── Entities ──

  async findByCanonical(canonical: string): Promise<KnownEntity[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entities", "readonly");
      const idx = tx.objectStore("entities").index("canonical");
      const req = idx.getAll(canonical.toUpperCase());
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async findByType(type: EntityType): Promise<KnownEntity[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entities", "readonly");
      const idx = tx.objectStore("entities").index("type");
      const req = idx.getAll(type);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async search(prefix: string, limit = 20): Promise<KnownEntity[]> {
    const db = await this.dbPromise;
    const upper = prefix.toUpperCase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entities", "readonly");
      const idx = tx.objectStore("entities").index("canonical");
      const range = IDBKeyRange.bound(upper, upper + "\uffff");
      const req = idx.getAll(range, limit);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async putEntity(entity: KnownEntity): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entities", "readwrite");
      tx.objectStore("entities").put(entity);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getEntity(id: string): Promise<KnownEntity | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entities", "readonly");
      const req = tx.objectStore("entities").get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Occurrences ──

  async addOccurrence(occurrence: EntityOccurrence): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("occurrences", "readwrite");
      tx.objectStore("occurrences").put(occurrence);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getOccurrences(entityId: string): Promise<EntityOccurrence[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("occurrences", "readonly");
      const idx = tx.objectStore("occurrences").index("entityId");
      const req = idx.getAll(entityId);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async getDocumentOccurrences(
    documentId: string
  ): Promise<EntityOccurrence[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("occurrences", "readonly");
      const idx = tx.objectStore("occurrences").index("documentId");
      const req = idx.getAll(documentId);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async confirmOccurrence(
    entityId: string,
    documentId: string
  ): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("occurrences", "readwrite");
      const store = tx.objectStore("occurrences");
      const req = store.get([entityId, documentId]);
      req.onsuccess = () => {
        if (req.result) {
          req.result.confirmed = true;
          store.put(req.result);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ── Documents ──

  async putDocument(doc: DocumentRecord): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("documents", "readwrite");
      tx.objectStore("documents").put(doc);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getDocument(id: string): Promise<DocumentRecord | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("documents", "readonly");
      const req = tx.objectStore("documents").get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async findByFingerprint(
    fingerprint: string
  ): Promise<DocumentRecord | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("documents", "readonly");
      const idx = tx.objectStore("documents").index("fingerprint");
      const req = idx.get(fingerprint);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async listDocuments(limit = 20, offset = 0): Promise<DocumentRecord[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("documents", "readonly");
      const idx = tx.objectStore("documents").index("processedAt");
      const results: DocumentRecord[] = [];
      let skipped = 0;

      const req = idx.openCursor(null, "prev");
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }
        if (skipped < offset) {
          skipped++;
          cursor.continue();
          return;
        }
        results.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ── Stats ──

  async entityCount(): Promise<number> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entities", "readonly");
      const req = tx.objectStore("entities").count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async documentCount(): Promise<number> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("documents", "readonly");
      const req = tx.objectStore("documents").count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}
