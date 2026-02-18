import type { Token, PatternType } from "./types.js";

interface PatternDef {
  type: PatternType;
  regex: RegExp;
}

const PATTERNS: PatternDef[] = [
  {
    type: "url",
    regex: /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/g,
  },
  {
    type: "email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  {
    type: "iban",
    regex: /[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}(?:[\s]?[\dA-Z]{4}){2,7}[\s]?[\dA-Z]{1,4}/g,
  },
  {
    type: "ssn_fr",
    regex: /[12]\s?\d{2}\s?\d{2}\s?(?:\d{2}|2[AB])\s?\d{3}\s?\d{3}\s?\d{2}/g,
  },
  {
    type: "phone",
    regex: /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g,
  },
  {
    type: "phone",
    regex: /(?:\+44|0)[\s.-]?\d{4}[\s.-]?\d{6}/g,
  },
];

/**
 * Tokenize raw text into an array of typed tokens.
 * Pattern tokens (email, phone, IBAN, etc.) are detected first, then the
 * remaining text is split into words, numbers, punctuation, and whitespace.
 */
export function tokenize(text: string): Token[] {
  // Phase 1: find all pattern matches with their offsets
  const patternSpans: { start: number; end: number; type: PatternType }[] = [];

  for (const pat of PATTERNS) {
    const re = new RegExp(pat.regex.source, pat.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // Don't overlap with existing pattern spans
      const overlaps = patternSpans.some(
        (s) => start < s.end && end > s.start
      );
      if (!overlaps) {
        // Validate IBAN checksums (ISO 13616 mod-97)
        if (pat.type === "iban" && !validateIbanChecksum(m[0])) {
          continue;
        }
        patternSpans.push({ start, end, type: pat.type });
      }
    }
  }

  patternSpans.sort((a, b) => a.start - b.start);

  // Phase 2: build tokens, filling gaps between patterns with word-level tokens
  const tokens: Token[] = [];
  let cursor = 0;

  for (const span of patternSpans) {
    if (cursor < span.start) {
      splitBasic(text, cursor, span.start, tokens);
    }
    tokens.push({
      text: text.slice(span.start, span.end),
      start: span.start,
      end: span.end,
      kind: "pattern",
      patternType: span.type,
    });
    cursor = span.end;
  }

  if (cursor < text.length) {
    splitBasic(text, cursor, text.length, tokens);
  }

  return tokens;
}

/**
 * Validate IBAN checksum using ISO 13616 mod-97.
 * Moves country code + check digits to the end, converts letters to numbers,
 * then verifies remainder when divided by 97 is 1.
 */
function validateIbanChecksum(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (cleaned.length < 5) return false;
  // Move first 4 chars (country + check digits) to end
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  // Convert letters to numbers (A=10, B=11, ..., Z=35)
  let numStr = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      numStr += (code - 55).toString();
    } else {
      numStr += ch;
    }
  }
  // Compute mod 97 using chunked arithmetic (avoid BigInt for compatibility)
  let remainder = 0;
  for (let i = 0; i < numStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numStr[i], 10)) % 97;
  }
  return remainder === 1;
}

/** Split a non-pattern segment into word/number/punctuation/whitespace tokens. */
function splitBasic(
  text: string,
  from: number,
  to: number,
  out: Token[]
): void {
  // Match: whitespace runs, words (including hyphenated like Jean-Pierre and
  // apostrophes like l'avenue), numbers, or single punctuation chars.
  const seg = text.slice(from, to);
  const re = /(\s+)|([a-zA-ZÀ-ÿ](?:[a-zA-ZÀ-ÿ''-]*[a-zA-ZÀ-ÿ])?)|(\d+(?:[.,]\d+)*)|([^\s])/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(seg)) !== null) {
    const start = from + m.index;
    const end = start + m[0].length;
    let kind: Token["kind"];

    if (m[1]) kind = "whitespace";
    else if (m[2]) kind = "word";
    else if (m[3]) kind = "number";
    else kind = "punctuation";

    out.push({ text: m[0], start, end, kind });
  }
}
