import type { Token, DetectedGroup, LocalType } from "./types.js";
import legalForms from "../data/legal-forms.json" with { type: "json" };
import streetTypes from "../data/street-types.json" with { type: "json" };
import stopWordsFr from "../data/stop-words/fr.json" with { type: "json" };
import stopWordsEn from "../data/stop-words/en.json" with { type: "json" };
import stopWordsDe from "../data/stop-words/de.json" with { type: "json" };

const HONORIFICS: Record<string, string[]> = {
  fr: ["M.", "M", "MR", "MME", "MLLE", "DR", "ME", "PR"],
  en: ["MR", "MRS", "MS", "MISS", "DR", "PROF", "SIR", "LADY"],
  de: ["HERR", "FRAU", "DR", "PROF"],
};

const STOP_WORDS: Record<string, Set<string>> = {
  fr: new Set(stopWordsFr.map((w: string) => w.toUpperCase())),
  en: new Set(stopWordsEn.map((w: string) => w.toUpperCase())),
  de: new Set(stopWordsDe.map((w: string) => w.toUpperCase())),
};

/** Detect the primary language of text based on stop word frequency. */
export function detectLanguage(tokens: Token[]): string {
  const words = tokens
    .filter((t) => t.kind === "word")
    .map((t) => t.text.toUpperCase());

  const scores: Record<string, number> = { fr: 0, en: 0, de: 0 };
  for (const w of words) {
    for (const lang of Object.keys(scores)) {
      if (STOP_WORDS[lang].has(w)) scores[lang]++;
    }
  }

  let best = "fr";
  let bestScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return best;
}

/** Build a flat set of all legal form strings (uppercased). */
function buildLegalFormSet(): Set<string> {
  const set = new Set<string>();
  for (const juris of Object.values(legalForms)) {
    const j = juris as { forms: string[]; context_words: string[] };
    for (const f of j.forms) set.add(f.toUpperCase());
    for (const c of j.context_words) set.add(c.toUpperCase());
  }
  return set;
}

function buildStreetTypeSet(): Set<string> {
  const set = new Set<string>();
  for (const types of Object.values(streetTypes)) {
    for (const t of types as string[]) set.add(t.toUpperCase());
  }
  return set;
}

function buildHonorificsSet(): Set<string> {
  const set = new Set<string>();
  for (const list of Object.values(HONORIFICS)) {
    for (const h of list) set.add(h.toUpperCase());
  }
  return set;
}

function buildAllStopWords(): Set<string> {
  const set = new Set<string>();
  for (const langSet of Object.values(STOP_WORDS)) {
    for (const w of langSet) set.add(w);
  }
  return set;
}

const LEGAL_FORMS = buildLegalFormSet();
const STREET_TYPES = buildStreetTypeSet();
const ALL_HONORIFICS = buildHonorificsSet();
const ALL_STOP_WORDS = buildAllStopWords();

function isCapitalized(text: string): boolean {
  return /^[A-ZÀ-Ý]/.test(text);
}

function isStopWord(text: string): boolean {
  return ALL_STOP_WORDS.has(text.toUpperCase());
}

function wordTokens(tokens: Token[]): Token[] {
  return tokens.filter((t) => t.kind === "word" || t.kind === "number");
}

/**
 * Run local detection on tokens to produce detected groups.
 * Each group is a candidate entity (person, company, address, pattern, or
 * unclassified candidate for Touchstone).
 */
export function detectLocal(tokens: Token[]): DetectedGroup[] {
  const groups: DetectedGroup[] = [];
  const consumed = new Set<number>(); // indices of tokens already in a group

  const words = tokens.filter(
    (t) => t.kind === "word" || t.kind === "number" || t.kind === "pattern"
  );

  // Pass 1: pattern tokens (email, phone, iban, ssn, url) → immediate groups
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === "pattern") {
      consumed.add(i);
      const lt = (t.patternType === "ssn_fr" ? "ssn" : t.patternType) as LocalType;
      groups.push({
        tokens: [t],
        text: t.text,
        localType: lt,
        confidence: "certain",
        skipTouchstone: true,
      });
    }
  }

  // Build an index from token to its position in the full tokens array
  const wordIndices = tokens
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.kind === "word");

  // Pass 2: legal form grouping
  for (let wi = 0; wi < wordIndices.length; wi++) {
    const { t, i } = wordIndices[wi];
    if (consumed.has(i)) continue;

    if (LEGAL_FORMS.has(t.text.toUpperCase())) {
      // Collect legal form + following capitalized words
      const groupTokens = [t];
      consumed.add(i);

      for (let wj = wi + 1; wj < wordIndices.length; wj++) {
        const next = wordIndices[wj];
        if (consumed.has(next.i)) break;
        if (!isCapitalized(next.t.text)) break;
        if (isStopWord(next.t.text) && !isCapitalized(next.t.text)) break;
        groupTokens.push(next.t);
        consumed.add(next.i);
      }

      if (groupTokens.length > 1) {
        groups.push({
          tokens: groupTokens,
          text: groupTokens.map((t) => t.text).join(" "),
          localType: "company_candidate",
          confidence: "probable",
          skipTouchstone: false,
        });
      } else {
        // Legal form alone, not very useful — unconsume
        consumed.delete(i);
      }
    }
  }

  // Pass 3: address patterns (number + street type + following words)
  for (let wi = 0; wi < wordIndices.length; wi++) {
    const { t, i } = wordIndices[wi];
    if (consumed.has(i)) continue;

    if (STREET_TYPES.has(t.text.toUpperCase())) {
      const groupTokens: Token[] = [];

      // Look back for a number token
      if (wi > 0) {
        const prev = wordIndices[wi - 1];
        if (!consumed.has(prev.i) && prev.t.kind === "number") {
          // Actually check in the full tokens array
        }
      }
      // Check token just before in the full array for a number
      for (let j = i - 1; j >= 0; j--) {
        const prev = tokens[j];
        if (prev.kind === "whitespace") continue;
        if (prev.kind === "number" && !consumed.has(j)) {
          groupTokens.push(prev);
          consumed.add(j);
        }
        break;
      }

      groupTokens.push(t);
      consumed.add(i);

      // Collect following words (street name components)
      for (let wj = wi + 1; wj < wordIndices.length && groupTokens.length < 8; wj++) {
        const next = wordIndices[wj];
        if (consumed.has(next.i)) break;
        // Stop at sentence boundaries, stop words that are clearly not part of the address
        if (next.t.text === "." || next.t.text === ",") break;
        groupTokens.push(next.t);
        consumed.add(next.i);
      }

      groups.push({
        tokens: groupTokens,
        text: groupTokens.map((t) => t.text).join(" "),
        localType: "address_fragment",
        confidence: "probable",
        skipTouchstone: false,
      });
    }
  }

  // Pass 4: honorific + capitalized words → person
  for (let wi = 0; wi < wordIndices.length; wi++) {
    const { t, i } = wordIndices[wi];
    if (consumed.has(i)) continue;

    if (ALL_HONORIFICS.has(t.text.toUpperCase().replace(/\.$/, ""))) {
      const groupTokens = [t];
      consumed.add(i);

      for (let wj = wi + 1; wj < wordIndices.length; wj++) {
        const next = wordIndices[wj];
        if (consumed.has(next.i)) break;
        if (!isCapitalized(next.t.text)) break;
        if (isStopWord(next.t.text)) break;
        groupTokens.push(next.t);
        consumed.add(next.i);
      }

      if (groupTokens.length > 1) {
        groups.push({
          tokens: groupTokens,
          text: groupTokens.map((t) => t.text).join(" "),
          localType: "person_candidate",
          confidence: "probable",
          skipTouchstone: false,
        });
      } else {
        consumed.delete(i);
      }
    }
  }

  // Pass 5: remaining capitalized words → candidates for Touchstone
  for (let wi = 0; wi < wordIndices.length; wi++) {
    const { t, i } = wordIndices[wi];
    if (consumed.has(i)) continue;
    if (!isCapitalized(t.text)) continue;
    if (isStopWord(t.text)) continue;
    if (t.text.length < 2) continue;

    // Check if it's at the start of a sentence (after ". ")
    const isSentenceStart = isSentenceStartToken(tokens, i);
    if (isSentenceStart && !isAllUpper(t.text)) continue;

    consumed.add(i);

    // Try to group consecutive capitalized words
    const groupTokens = [t];
    for (let wj = wi + 1; wj < wordIndices.length; wj++) {
      const next = wordIndices[wj];
      if (consumed.has(next.i)) break;
      if (!isCapitalized(next.t.text)) break;
      if (isStopWord(next.t.text)) break;
      groupTokens.push(next.t);
      consumed.add(next.i);
    }

    groups.push({
      tokens: groupTokens,
      text: groupTokens.map((t) => t.text).join(" "),
      confidence: "candidate",
      skipTouchstone: false,
    });
  }

  return groups;
}

function isSentenceStartToken(tokens: Token[], index: number): boolean {
  if (index === 0) return true;
  for (let i = index - 1; i >= 0; i--) {
    if (tokens[i].kind === "whitespace") continue;
    if (tokens[i].kind === "punctuation" && tokens[i].text === ".") return true;
    return false;
  }
  return true;
}

function isAllUpper(text: string): boolean {
  return text === text.toUpperCase() && /[A-ZÀ-Ý]/.test(text);
}
