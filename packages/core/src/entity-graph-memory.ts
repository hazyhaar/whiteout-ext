import type { EntityType } from "./types.js";
import type {
  EntityGraphPort,
  KnownEntity,
  EntityOccurrence,
  DocumentRecord,
} from "./entity-graph.js";
import { canonicalize } from "./entity-graph.js";

/**
 * In-memory implementation of EntityGraphPort.
 * Used for testing and as a reference implementation.
 */
export class MemoryEntityGraph implements EntityGraphPort {
  private entities = new Map<string, KnownEntity>();
  private occurrences: EntityOccurrence[] = [];
  private documents = new Map<string, DocumentRecord>();

  // ── Entities ──

  async findByCanonical(canonical: string): Promise<KnownEntity[]> {
    const upper = canonical.toUpperCase();
    return [...this.entities.values()].filter((e) => e.canonical === upper);
  }

  async findByType(type: EntityType): Promise<KnownEntity[]> {
    return [...this.entities.values()].filter((e) => e.type === type);
  }

  async search(prefix: string, limit = 20): Promise<KnownEntity[]> {
    const upper = prefix.toUpperCase();
    return [...this.entities.values()]
      .filter((e) => e.canonical.startsWith(upper))
      .slice(0, limit);
  }

  async putEntity(entity: KnownEntity): Promise<void> {
    this.entities.set(entity.id, { ...entity });
  }

  async getEntity(id: string): Promise<KnownEntity | null> {
    return this.entities.get(id) ?? null;
  }

  // ── Occurrences ──

  async addOccurrence(occurrence: EntityOccurrence): Promise<void> {
    this.occurrences.push({ ...occurrence });
  }

  async getOccurrences(entityId: string): Promise<EntityOccurrence[]> {
    return this.occurrences.filter((o) => o.entityId === entityId);
  }

  async getDocumentOccurrences(documentId: string): Promise<EntityOccurrence[]> {
    return this.occurrences.filter((o) => o.documentId === documentId);
  }

  async confirmOccurrence(
    entityId: string,
    documentId: string
  ): Promise<void> {
    for (const o of this.occurrences) {
      if (o.entityId === entityId && o.documentId === documentId) {
        o.confirmed = true;
      }
    }
  }

  // ── Documents ──

  async putDocument(doc: DocumentRecord): Promise<void> {
    this.documents.set(doc.id, { ...doc });
  }

  async getDocument(id: string): Promise<DocumentRecord | null> {
    return this.documents.get(id) ?? null;
  }

  async findByFingerprint(fingerprint: string): Promise<DocumentRecord | null> {
    for (const doc of this.documents.values()) {
      if (doc.fingerprint === fingerprint) return doc;
    }
    return null;
  }

  async listDocuments(limit = 20, offset = 0): Promise<DocumentRecord[]> {
    return [...this.documents.values()]
      .sort((a, b) => b.processedAt.localeCompare(a.processedAt))
      .slice(offset, offset + limit);
  }

  // ── Stats ──

  async entityCount(): Promise<number> {
    return this.entities.size;
  }

  async documentCount(): Promise<number> {
    return this.documents.size;
  }
}
