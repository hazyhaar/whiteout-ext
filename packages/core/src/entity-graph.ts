import type { EntityType } from "./types.js";

// ── Data model ──────────────────────────────────────────────────────

/** A known entity tracked across documents. */
export interface KnownEntity {
  /** Stable ID (e.g. "ent_k7x9m2"). */
  id: string;
  /** Normalized canonical text (uppercased, trimmed). */
  canonical: string;
  /** Entity type. */
  type: EntityType;
  /** First time this entity was seen (ISO 8601). */
  firstSeen: string;
  /** Last time this entity was seen (ISO 8601). */
  lastSeen: string;
  /** Number of documents this entity appeared in. */
  documentCount: number;
}

/** Record of an entity appearing in a specific document. */
export interface EntityOccurrence {
  /** KnownEntity ID. */
  entityId: string;
  /** Document ID. */
  documentId: string;
  /** The exact text as it appeared in this document. */
  originalText: string;
  /** The alias assigned in this document. */
  alias: string;
  /** Whether the user confirmed this alias. */
  confirmed: boolean;
}

/** A processed document in the user's history. */
export interface DocumentRecord {
  /** Document ID (e.g. "doc_a3f8k1"). */
  id: string;
  /** User-provided or auto-generated label. */
  label: string;
  /** When the document was processed (ISO 8601). */
  processedAt: string;
  /** Number of entities found. */
  entityCount: number;
  /** SHA-256 of first 200 chars (for dedup, not stored as content). */
  fingerprint: string;
}

/**
 * When the pipeline detects an entity that was seen before,
 * it produces a match suggestion for the UI to confirm.
 */
export interface EntityMatch {
  /** The KnownEntity that matched. */
  knownEntity: KnownEntity;
  /** How confident the match is. */
  matchConfidence: "exact" | "likely" | "possible";
  /** The alias used last time. */
  previousAlias: string;
  /** The document where this entity was last seen. */
  previousDocument: DocumentRecord;
  /** Co-occurring entities in the previous document. */
  coEntities: string[];
}

// ── Port interface ──────────────────────────────────────────────────

/**
 * Persistent entity graph store.
 * Implemented per-platform: IndexedDB (Chrome), SQLite (mobile/desktop).
 */
export interface EntityGraphPort {
  // ── Entities ──
  /** Find known entities by canonical text. */
  findByCanonical(canonical: string): Promise<KnownEntity[]>;

  /** Find known entities by type. */
  findByType(type: EntityType): Promise<KnownEntity[]>;

  /** Search entities (prefix match on canonical). */
  search(prefix: string, limit?: number): Promise<KnownEntity[]>;

  /** Upsert a known entity. */
  putEntity(entity: KnownEntity): Promise<void>;

  /** Get a known entity by ID. */
  getEntity(id: string): Promise<KnownEntity | null>;

  // ── Occurrences ──
  /** Record that an entity appeared in a document with a given alias. */
  addOccurrence(occurrence: EntityOccurrence): Promise<void>;

  /** Get all occurrences of an entity across documents. */
  getOccurrences(entityId: string): Promise<EntityOccurrence[]>;

  /** Get all occurrences in a specific document. */
  getDocumentOccurrences(documentId: string): Promise<EntityOccurrence[]>;

  /** Mark an occurrence as user-confirmed. */
  confirmOccurrence(entityId: string, documentId: string): Promise<void>;

  // ── Documents ──
  /** Record a processed document. */
  putDocument(doc: DocumentRecord): Promise<void>;

  /** Get a document by ID. */
  getDocument(id: string): Promise<DocumentRecord | null>;

  /** Find document by fingerprint (dedup check). */
  findByFingerprint(fingerprint: string): Promise<DocumentRecord | null>;

  /** List recent documents. */
  listDocuments(limit?: number, offset?: number): Promise<DocumentRecord[]>;

  // ── Stats ──
  /** Total number of known entities. */
  entityCount(): Promise<number>;

  /** Total number of processed documents. */
  documentCount(): Promise<number>;
}

// ── Entity matching logic ───────────────────────────────────────────

/**
 * Normalize text for canonical matching.
 * "Jean-Pierre Dupont" → "JEAN-PIERRE DUPONT"
 * "  SCI les Lilas  " → "SCI LES LILAS"
 */
export function canonicalize(text: string): string {
  return text.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Generate a fingerprint for a document (first 200 chars, SHA-256).
 * Falls back to a simple hash if SubtleCrypto is unavailable.
 */
export async function fingerprint(text: string): Promise<string> {
  const sample = text.slice(0, 200);
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = new TextEncoder().encode(sample);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback: simple FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < sample.length; i++) {
    h ^= sample.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Generate a short prefixed ID.
 */
export function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const rand = Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}${ts}_${rand}`;
}

/**
 * Match detected entities against the known entity graph.
 * Returns match suggestions for entities seen in previous documents.
 */
export async function findMatches(
  detectedEntities: Array<{ text: string; type: EntityType }>,
  graph: EntityGraphPort
): Promise<Map<string, EntityMatch>> {
  const matches = new Map<string, EntityMatch>();
  if (detectedEntities.length === 0) return matches;

  // Pre-compute canonical texts for co-occurrence check
  const currentTexts = new Set(
    detectedEntities.map((e) => canonicalize(e.text))
  );

  // Phase 1: Fetch all known entities in parallel
  const canonicals = detectedEntities.map((e) => canonicalize(e.text));
  const knownResults = await Promise.all(
    canonicals.map((c) => graph.findByCanonical(c))
  );

  // Phase 2: Determine which entities need occurrence lookups
  type Candidate = {
    detected: { text: string; type: EntityType };
    canonical: string;
    entity: KnownEntity;
    isFallback: boolean;
  };

  const candidates: Candidate[] = [];
  for (let i = 0; i < detectedEntities.length; i++) {
    const known = knownResults[i];
    if (known.length === 0) continue;

    const detected = detectedEntities[i];
    const best = known
      .filter((k) => k.type === detected.type)
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))[0];

    if (best) {
      candidates.push({
        detected,
        canonical: canonicals[i],
        entity: best,
        isFallback: false,
      });
    } else {
      candidates.push({
        detected,
        canonical: canonicals[i],
        entity: known[0],
        isFallback: true,
      });
    }
  }

  if (candidates.length === 0) return matches;

  // Phase 3: Fetch occurrences in parallel
  const occurrenceResults = await Promise.all(
    candidates.map((c) => graph.getOccurrences(c.entity.id))
  );

  // Phase 4: Fetch documents and co-occurrences in parallel
  // Cache document lookups to avoid fetching the same doc multiple times
  const docCache = new Map<string, Promise<DocumentRecord | null>>();
  const coOccCache = new Map<string, Promise<EntityOccurrence[]>>();

  function getCachedDoc(docId: string) {
    let p = docCache.get(docId);
    if (!p) {
      p = graph.getDocument(docId);
      docCache.set(docId, p);
    }
    return p;
  }
  function getCachedCoOcc(docId: string) {
    let p = coOccCache.get(docId);
    if (!p) {
      p = graph.getDocumentOccurrences(docId);
      coOccCache.set(docId, p);
    }
    return p;
  }

  // Build match results in parallel
  await Promise.all(
    candidates.map(async (candidate, i) => {
      const occurrences = occurrenceResults[i];
      const lastOcc = occurrences.sort((a, b) =>
        b.documentId.localeCompare(a.documentId)
      )[0];

      if (!lastOcc) return;

      const [prevDoc, coOccurrences] = await Promise.all([
        getCachedDoc(lastOcc.documentId),
        getCachedCoOcc(lastOcc.documentId),
      ]);

      if (!prevDoc) return;

      if (candidate.isFallback) {
        matches.set(candidate.detected.text, {
          knownEntity: candidate.entity,
          matchConfidence: "possible",
          previousAlias: lastOcc.alias,
          previousDocument: prevDoc,
          coEntities: coOccurrences
            .filter((o) => o.entityId !== candidate.entity.id)
            .map((o) => o.originalText)
            .slice(0, 5),
        });
        return;
      }

      const coEntityTexts = coOccurrences
        .filter((o) => o.entityId !== candidate.entity.id)
        .map((o) => o.originalText);

      const coOverlap = coEntityTexts.filter((t) =>
        currentTexts.has(canonicalize(t))
      );

      let confidence: EntityMatch["matchConfidence"];
      if (
        candidate.entity.canonical === candidate.canonical &&
        coOverlap.length >= 1
      ) {
        confidence = "exact";
      } else if (candidate.entity.canonical === candidate.canonical) {
        confidence = "likely";
      } else {
        confidence = "possible";
      }

      matches.set(candidate.detected.text, {
        knownEntity: candidate.entity,
        matchConfidence: confidence,
        previousAlias: lastOcc.alias,
        previousDocument: prevDoc,
        coEntities: coEntityTexts.slice(0, 5),
      });
    })
  );

  return matches;
}

/**
 * After the user confirms entities in a document, persist them to the graph.
 */
export async function recordDocument(
  documentId: string,
  label: string,
  text: string,
  entities: Array<{
    text: string;
    type: EntityType;
    alias: string;
    confirmed: boolean;
    /** If matched to a known entity, its ID. Otherwise a new one is created. */
    knownEntityId?: string;
  }>,
  graph: EntityGraphPort
): Promise<void> {
  const fp = await fingerprint(text);
  const now = new Date().toISOString();

  // Record the document
  await graph.putDocument({
    id: documentId,
    label,
    processedAt: now,
    entityCount: entities.length,
    fingerprint: fp,
  });

  // Record each entity
  for (const ent of entities) {
    const canonical = canonicalize(ent.text);
    let entityId = ent.knownEntityId;

    if (!entityId) {
      // Check if we already know this entity
      const existing = await graph.findByCanonical(canonical);
      const match = existing.find((e) => e.type === ent.type);
      if (match) {
        entityId = match.id;
      }
    }

    if (entityId) {
      // Update existing entity — derive documentCount from occurrences
      // to avoid read-modify-write race between concurrent tabs
      const known = await graph.getEntity(entityId);
      if (known) {
        known.lastSeen = now;
        const occurrences = await graph.getOccurrences(entityId);
        const uniqueDocs = new Set(occurrences.map((o) => o.documentId));
        uniqueDocs.add(documentId);
        known.documentCount = uniqueDocs.size;
        await graph.putEntity(known);
      }
    } else {
      // Create new entity
      entityId = generateId("ent_");
      await graph.putEntity({
        id: entityId,
        canonical,
        type: ent.type,
        firstSeen: now,
        lastSeen: now,
        documentCount: 1,
      });
    }

    // Record occurrence
    await graph.addOccurrence({
      entityId,
      documentId,
      originalText: ent.text,
      alias: ent.alias,
      confirmed: ent.confirmed,
    });
  }
}
