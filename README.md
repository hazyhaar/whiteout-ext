# Whiteout

Browser extension that anonymizes documents locally. Paste text, get a clean version. Your document never leaves your browser.

Whiteout detects personal names, company names, addresses and other identifiable entities in your text, proposes aliases, and produces an anonymized version — all inside your browser. The only thing that leaves your machine is isolated lookup terms sent to [Touchstone](https://github.com/hazyhaar/touchstone-registry), a blind classification service that doesn't know where the terms came from.

## Install

Chrome Web Store: *(coming soon)*

Manual install (development):
```bash
git clone https://github.com/hazyhaar/whiteout-ext.git
cd whiteout-ext
npm install
npm run build
# Chrome → chrome://extensions → Developer mode → Load unpacked → select dist/
```

## How it works

1. **Paste or select text** — paste into the extension popup, or right-click selected text on any page
2. **Entities are detected** — names, companies, addresses are highlighted in color
3. **Aliases are proposed** — "Jean-Pierre Dupont" → "Marc Renaud", "SCI Les Lilas" → "Société 1"
4. **You review and adjust** — accept, change, or skip any detection
5. **Get your clean text** — copy or download the anonymized version

Your original text never leaves the browser. Only isolated terms (individual words like "DUPONT" or "LYON") are sent to Touchstone for classification. Touchstone has no way to reconstruct your document from these fragments.

## What stays local

Everything except the lookup:
- Tokenization (splitting text into words)
- Pattern detection (legal forms, address patterns, emails, phone numbers)
- Context assembly (figuring out "Jean-Pierre Dupont" is a full name)
- Alias generation
- Substitution
- The mapping table (alias ↔ original) — stored in IndexedDB, never transmitted

## What goes to Touchstone

A batch of isolated terms, in randomized order, mixed with decoy terms:

```json
{
  "terms": ["Lyon", "Boulanger", "Acacias", "SCI Les Lilas",
            "Dupont", "Strasbourg", "Jean-Pierre", "Moreau"]
}
```

Touchstone replies with classifications. Whiteout ignores the decoys. Touchstone cannot tell which terms are real and which are noise.

## License

[Apache License 2.0](LICENSE)

---

# SPEC — Technical specification

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  CHROME EXTENSION                                     │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ UI Layer (popup / sidebar / context menu)         │ │
│  │                                                   │ │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────────────┐   │ │
│  │  │ Input   │ │ Review   │ │ Output           │   │ │
│  │  │ (paste/ │ │ (entities│ │ (anonymized text, │   │ │
│  │  │  select/│ │  + alias │ │  copy/download)  │   │ │
│  │  │  upload)│ │  editor) │ │                   │   │ │
│  │  └────┬────┘ └────┬─────┘ └──────────────────┘   │ │
│  └───────┼───────────┼───────────────────────────────┘ │
│          │           │                                  │
│  ┌───────┼───────────┼───────────────────────────────┐ │
│  │ Processing Layer (service worker)                  │ │
│  │                                                    │ │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────────────┐ │ │
│  │  │Tokenizer │→│ Local     │→│ Touchstone       │ │ │
│  │  │          │ │ Detector  │ │ Client           │ │ │
│  │  └──────────┘ └───────────┘ └────────┬─────────┘ │ │
│  │                                       │           │ │
│  │  ┌──────────┐ ┌───────────┐ ┌────────┴─────────┐│ │
│  │  │Assembler │←│ Alias     │←│ Decoy Mixer      ││ │
│  │  │          │ │ Generator │ │                   ││ │
│  │  └──────────┘ └───────────┘ └──────────────────┘│ │
│  │                                                   │ │
│  │  ┌──────────────────────────────────────────────┐│ │
│  │  │ Local Store (IndexedDB)                       ││ │
│  │  │ - alias ↔ original mapping                    ││ │
│  │  │ - user corrections history                    ││ │
│  │  │ - cached Touchstone responses                 ││ │
│  │  └──────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │ MCP/QUIC or REST/HTTPS
                       │ (isolated terms only)
                       ▼
              ┌──────────────────┐
              │   TOUCHSTONE     │
              │   (remote or     │
              │    localhost)    │
              └──────────────────┘
```

## Extension structure (Manifest V3)

```
whiteout-ext/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts              # or webpack — builder for the extension
├── src/
│   ├── background/
│   │   └── service-worker.ts   # service worker (MV3)
│   ├── popup/
│   │   ├── popup.html          # main UI
│   │   ├── popup.ts            # popup logic
│   │   └── popup.css           # styles
│   ├── content/
│   │   └── content-script.ts   # context menu + selection handling
│   ├── core/
│   │   ├── tokenizer.ts        # text → tokens
│   │   ├── local-detector.ts   # patterns, stop words, legal forms
│   │   ├── touchstone-client.ts # batch classify via REST or MCP
│   │   ├── decoy-mixer.ts      # injects noise terms
│   │   ├── assembler.ts        # combines local + Touchstone results
│   │   ├── alias-generator.ts  # produces replacement names/addresses
│   │   ├── substituter.ts      # applies aliases to original text
│   │   └── types.ts            # shared type definitions
│   ├── data/
│   │   ├── stop-words/
│   │   │   ├── fr.json
│   │   │   ├── en.json
│   │   │   └── de.json
│   │   ├── legal-forms.json    # SCI, SARL, GmbH, Ltd, PLC, LLC...
│   │   ├── street-types.json   # rue, avenue, street, road, Straße...
│   │   ├── alias-firstnames.json  # replacement first names pool
│   │   ├── alias-surnames.json    # replacement surnames pool
│   │   └── alias-companies.json   # replacement company names pool
│   └── store/
│       └── local-store.ts      # IndexedDB wrapper for alias tables
├── dist/                       # built extension
├── LICENSE
└── README.md
```

## manifest.json (Chrome Manifest V3)

```json
{
  "manifest_version": 3,
  "name": "Whiteout",
  "version": "0.1.0",
  "description": "Anonymize documents in your browser. Your text never leaves your machine.",
  "permissions": [
    "activeTab",
    "contextMenus",
    "storage"
  ],
  "host_permissions": [
    "http://localhost:8420/*",
    "https://touchstone.example.org/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content-script.js"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

---

## Core modules — Detailed specs

### 1. Tokenizer (`tokenizer.ts`)

**Input**: raw text string
**Output**: array of `Token` objects

```typescript
interface Token {
  text: string;           // original text
  start: number;          // char offset in original
  end: number;            // char offset end
  kind: "word" | "number" | "punctuation" | "whitespace" | "pattern";
  patternType?: string;   // if kind=pattern: "email" | "phone" | "iban" | "ssn_fr" | "url"
}
```

**Logic**:

1. Split on whitespace, preserving offsets
2. For each chunk, apply regex patterns (greedy, longest match):
   - Email: `/[\w.-]+@[\w.-]+\.\w{2,}/`
   - French phone: `/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/`
   - UK phone: `/(?:\+44|0)[\s.-]?\d{4}[\s.-]?\d{6}/`
   - IBAN: `/[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){2,7}[\dA-Z]{1,4}/`
   - French SSN: `/[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}/`
   - URL: `/https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/`
3. Remaining chunks: split on punctuation boundaries (preserving hyphens within words like "Jean-Pierre")
4. Classify each token as word/number/punctuation/whitespace

Patterns detected locally skip Touchstone entirely — no need to look up an email address in a surname dictionary.

### 2. Local Detector (`local-detector.ts`)

**Input**: array of `Token`
**Output**: array of `DetectedGroup` — groups of tokens that form a single entity candidate

```typescript
interface DetectedGroup {
  tokens: Token[];
  text: string;             // joined text of the group
  localType?: string;       // locally detected type, if any
  confidence: "certain" | "probable" | "candidate";
  skipTouchstone: boolean;  // true if fully resolved locally
}
```

**Logic**:

1. **Legal form grouping**: scan for known legal forms (from `legal-forms.json`). When found, group the legal form + following capitalized words as one entity.
   - "SCI Les Lilas" → one group, localType="company_candidate", confidence="probable"
   - "SARL Dupont Menuiserie" → one group
   - Legal forms list (shipped with extension):
     ```json
     {
       "fr": ["SCI", "SARL", "SAS", "SA", "EURL", "SASU", "GIE", "SNC", "SCA", "SCOP", "SEL"],
       "uk": ["LTD", "LIMITED", "PLC", "LLP", "CIC", "CIO"],
       "de": ["GMBH", "AG", "KG", "OHG", "EV", "GMBH & CO KG", "UG"],
       "us": ["LLC", "INC", "INCORPORATED", "CORP", "CORPORATION", "LP", "LLP"],
       "generic": ["& CO", "AND CO", "GROUP", "HOLDING", "PARTNERS"]
     }
     ```

2. **Address pattern grouping**: scan for street type tokens (from `street-types.json`). Group number + street type + following words + city.
   - "12 rue des Acacias" → one group, localType="address_fragment", confidence="probable"
   - Street types list:
     ```json
     {
       "fr": ["RUE", "AVENUE", "BOULEVARD", "PLACE", "IMPASSE", "ALLEE", "CHEMIN", "PASSAGE", "COURS", "ROUTE", "SQUARE", "QUAI"],
       "en": ["STREET", "ROAD", "AVENUE", "LANE", "DRIVE", "COURT", "PLACE", "TERRACE", "CLOSE", "WAY", "CRESCENT"],
       "de": ["STRASSE", "STRAßE", "WEG", "GASSE", "PLATZ", "ALLEE", "RING"]
     }
     ```

3. **Title/honorific grouping**: "M.", "Mme", "Mr", "Mrs", "Dr" followed by capitalized words → person candidate.
   - "M. Dupont" → group, localType="person_candidate"
   - Honorifics:
     ```json
     {
       "fr": ["M.", "M", "MR", "MME", "MLLE", "DR", "ME", "PR"],
       "en": ["MR", "MRS", "MS", "MISS", "DR", "PROF", "SIR", "LADY"],
       "de": ["HERR", "FRAU", "DR", "PROF"]
     }
     ```

4. **Already-classified patterns**: tokens with kind="pattern" → group of 1, localType from patternType, skipTouchstone=true.
   - An email is an email. No need to ask Touchstone.

5. **Remaining capitalized words**: any word that starts with uppercase (and is not at the beginning of a sentence, heuristic: not after ". ") → candidate for Touchstone lookup.

6. **Stop word filtering**: remove tokens that match stop words list. These are never sent to Touchstone.
   - Stop words per language (~200-500 words each), stored in `data/stop-words/{lang}.json`
   - Detection of text language: simple heuristic based on stop word frequency. Count matches against each language's stop words. Highest count wins.

### 3. Touchstone Client (`touchstone-client.ts`)

**Input**: array of candidate terms (strings)
**Output**: map of term → Touchstone classification results

```typescript
interface TouchstoneConfig {
  baseUrl: string;          // "http://localhost:8420" or remote
  timeout: number;          // ms, default 5000
  maxBatchSize: number;     // default 100
  jurisdictions?: string[]; // default: auto-detect from text language
}

interface TouchstoneResult {
  dict: string;
  match: boolean;
  type: string;
  jurisdiction: string;
  confidence: string;
  metadata: Record<string, string | number>;
}

async function classifyBatch(
  terms: string[],
  config: TouchstoneConfig
): Promise<Map<string, TouchstoneResult[]>>
```

**Logic**:

1. Take the candidate terms from local detector
2. Pass them to DecoyMixer (see below)
3. Send batch POST to `{baseUrl}/v1/classify/batch`
4. Parse response, build map of term → results
5. Cache results in IndexedDB (term → results, TTL 24h) to avoid re-querying known terms
6. Return only results for real terms (discard decoy results)

**Fallback**: if Touchstone is unreachable (offline, timeout), Whiteout still works — it just shows candidates with "unconfirmed" status. The user can manually accept/reject detections.

### 4. Decoy Mixer (`decoy-mixer.ts`)

**Input**: array of real candidate terms
**Output**: shuffled array of real terms + decoy terms

**Logic**:

1. For each real term, add 0-2 decoy terms of similar shape:
   - If term looks like a name (capitalized single word, 3-12 chars): pick a random name from alias pool
   - If term looks like a company (multiple words, legal form prefix): generate a random "SCI/SARL/Ltd + Word" combo
   - If term looks like a city: pick a random city name from a small embedded list
2. Shuffle the entire array (Fisher-Yates)
3. Cap total at max batch size (100). If more, split into multiple batches.

**Decoy source**: the alias name pools (`alias-firstnames.json`, `alias-surnames.json`) double as decoy sources. No extra data needed.

**Ratio**: aim for 30-50% decoys. Enough noise to prevent reconstruction, not so much that it doubles the request cost.

### 5. Assembler (`assembler.ts`)

**Input**: `DetectedGroup[]` from local detector + `Map<term, results>` from Touchstone client
**Output**: `Entity[]` — final classified entities with positions and proposed aliases

```typescript
interface Entity {
  text: string;             // original text in document
  start: number;            // char offset
  end: number;              // char offset end
  type: EntityType;         // "person" | "company" | "address" | "email" | "phone" | "iban" | "city" | "unknown"
  confidence: "high" | "medium" | "low";
  sources: string[];        // which dicts matched, or "local:pattern"
  proposedAlias: string;    // generated replacement
}

type EntityType = "person" | "company" | "address" | "city" | "email" | "phone" | "iban" | "ssn" | "unknown";
```

**Logic**:

1. For each `DetectedGroup`, merge local detection with Touchstone results:
   - Group has localType="company_candidate" + Touchstone confirms company match → type="company", confidence="high"
   - Group has localType="person_candidate" + Touchstone confirms first_name/surname → type="person", confidence="high"
   - Touchstone says "surname" but no first_name adjacent → type="person", confidence="medium" (might be a standalone surname reference)
   - No local signal + Touchstone says "city" → type="city", confidence="medium"
   - No local signal + no Touchstone match → type="unknown", confidence="low" — still shown to user, they decide

2. **Adjacent name merging**: if token N is first_name and token N+1 is surname (both confirmed), merge into a single "person" entity. Apply also for patterns like "DUPONT Jean-Pierre" (surname then firstname).

3. **Address assembly**: if street pattern + city detected in proximity (within 5 tokens), group as one "address" entity.

4. Request alias from Alias Generator for each entity.

### 6. Alias Generator (`alias-generator.ts`)

**Input**: `Entity`
**Output**: replacement string

**Logic by entity type**:

- **person**: pick random first name (same gender if known from Touchstone metadata) + random surname from pool. Maintain consistency: same original → same alias within a document session.
- **company**: keep the legal form, replace the name part. "SCI Les Lilas" → "SCI Horizon". "SARL Dupont Menuiserie" → "SARL Renaud Services".
- **address**: replace street name and number, keep structure. "12 rue des Acacias" → "8 avenue des Tilleuls". Replace city with another city from the same country.
- **city**: replace with another city from same jurisdiction.
- **email**: generate a plausible fake email. "jean.dupont@gmail.com" → "m.renaud@email.com"
- **phone**: replace digits, keep country format. "+33 6 12 34 56 78" → "+33 6 XX XX XX XX" or a random valid-format number.
- **iban/ssn**: mask with X's. "FR76 1234 5678 9012 3456 7890 123" → "FR76 XXXX XXXX XXXX XXXX XXXX XXX"

**Consistency**: a `Map<string, string>` stored in session. If "Dupont" was aliased to "Renaud" the first time, every subsequent "Dupont" in the same document gets "Renaud". This map is the alias table. It lives in IndexedDB, never sent anywhere.

**Alias pools** (shipped with extension):

`alias-firstnames.json` (~500 entries per gender, French + English):
```json
{
  "M": ["Marc", "Antoine", "Julien", "Thomas", "Paul", "Lucas", "Hugo", "Louis", "Arthur", "Nathan", "James", "William", "Oliver", "Henry", "George"],
  "F": ["Sophie", "Claire", "Émilie", "Laura", "Julie", "Alice", "Charlotte", "Léa", "Emma", "Sarah", "Emily", "Grace", "Lily", "Amelia", "Charlotte"],
  "neutral": ["Camille", "Dominique", "Claude", "Alex", "Sam", "Charlie", "Robin"]
}
```

`alias-surnames.json` (~500 entries):
```json
["Renaud", "Blanchard", "Lecomte", "Marechal", "Collet", "Picard", "Navarro", "Lemoine", "Barbier", "Gérard", "Humbert", "Maillard", "Cordier", "Bouvier", "Tessier", "Smith", "Johnson", "Brown", "Taylor", "Wilson", "Moore", "Clark", "Hall", "Young", "King"]
```

`alias-companies.json` — name fragments for generating company names:
```json
{
  "prefixes": ["Euro", "Groupe", "Alliance", "Horizon", "Apex", "Nova", "Stellar", "Atlas", "Global", "Prime"],
  "suffixes": ["Solutions", "Services", "Conseil", "Investissement", "Développement", "Capital", "Industries", "Technologies", "Patrimoine", "Gestion"],
  "standalone": ["Horizon", "Étoile", "Méridien", "Solaris", "Boréal", "Azur", "Opale", "Cristal"]
}
```

### 7. Substituter (`substituter.ts`)

**Input**: original text + array of `Entity` (with accepted aliases)
**Output**: anonymized text string

**Logic**:

1. Sort entities by start offset, descending (replace from end to start to preserve offsets)
2. For each entity, replace `text[entity.start:entity.end]` with `entity.acceptedAlias` (which may differ from `proposedAlias` if user edited it)
3. Return the resulting string

Simple string surgery. No intelligence.

---

## UI Specification

### Popup (main interface)

**Three panels, left to right or stacked on mobile:**

**Panel 1 — Input**
- Large textarea, placeholder: "Paste your text here"
- Or: "Select text on any page and right-click → Whiteout"
- Language auto-detection indicator (small flag icon)
- Settings gear icon: Touchstone URL, jurisdiction preferences

**Panel 2 — Review**
- Original text displayed with inline highlights:
  - 🔵 Blue: persons (names)
  - 🟠 Orange: companies
  - 🟣 Purple: addresses
  - 🟢 Green: cities
  - 🔴 Red: sensitive patterns (email, phone, IBAN, SSN)
  - ⚪ Gray: unconfirmed candidates
- Each highlight is clickable → popover with:
  - Detected type + confidence
  - Source (which dictionary matched)
  - Proposed alias (editable text field)
  - Buttons: ✓ Accept / ✎ Edit alias / ✕ Skip (don't anonymize)
- Bulk actions bar at top: "Accept all", "Skip all unconfirmed"
- Counter: "12 entities detected, 10 accepted, 2 skipped"

**Panel 3 — Output**
- Anonymized text, read-only
- Copy to clipboard button
- Download as .txt button
- Download alias table as CSV button (for the user's own records)
- "New document" button (clears everything, generates fresh alias set)

### Context menu

Right-click on any web page with text selected:
- "Whiteout: Anonymize selection" → opens popup with selected text pre-filled

### Settings (accessible from popup gear icon)

- **Touchstone server**: URL input, default `http://localhost:8420`. Test connection button.
- **Jurisdictions**: checkboxes for which jurisdictions to query (fr, uk, de, us...). Default: auto from detected language.
- **Privacy**: 
  - Decoy ratio slider (0% to 50%, default 30%)
  - "Randomize term order" toggle (default on)
- **Alias style**: 
  - "Generic" (Personne A, Société 1) 
  - "Realistic" (Marc Renaud, SCI Horizon) — default
- **Clear local data**: button to wipe IndexedDB (cached responses + alias history)

---

## Data files — Embedded in extension

### Stop words

`data/stop-words/fr.json` (excerpt, ship ~300 words):
```json
["de", "la", "le", "les", "un", "une", "des", "du", "au", "aux", "et", "ou", "mais", "donc", "car", "ni", "que", "qui", "quoi", "dont", "où", "ce", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses", "notre", "nos", "votre", "vos", "leur", "leurs", "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "on", "me", "te", "se", "lui", "y", "en", "dans", "sur", "sous", "avec", "sans", "pour", "par", "entre", "vers", "chez", "est", "sont", "a", "ont", "fait", "dit", "être", "avoir", "faire", "pouvoir", "devoir", "vouloir", "aller", "venir", "voir", "savoir", "falloir", "plus", "moins", "très", "bien", "mal", "aussi", "comme", "même", "tout", "toute", "tous", "toutes", "autre", "autres", "aucun", "aucune", "chaque", "pas", "ne", "jamais", "toujours", "encore", "déjà", "ici", "là", "alors", "ainsi", "donc", "puis", "ensuite", "après", "avant", "depuis", "pendant", "quand", "si", "non", "oui"]
```

`data/stop-words/en.json` (excerpt, ship ~250 words):
```json
["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "as", "is", "was", "are", "were", "been", "be", "have", "has", "had", "do", "does", "did", "will", "would", "shall", "should", "may", "might", "can", "could", "must", "not", "no", "nor", "so", "if", "then", "than", "that", "this", "these", "those", "it", "its", "he", "she", "they", "we", "you", "i", "me", "him", "her", "us", "them", "my", "your", "his", "our", "their", "what", "which", "who", "whom", "where", "when", "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such", "only", "own", "same", "very", "just", "about", "above", "after", "again", "also", "any", "because", "before", "between", "during", "here", "there", "into", "through", "under", "until", "up", "down", "out", "over"]
```

`data/stop-words/de.json` (excerpt, ship ~250 words):
```json
["der", "die", "das", "ein", "eine", "und", "oder", "aber", "in", "auf", "an", "zu", "für", "von", "mit", "bei", "nach", "aus", "um", "über", "vor", "zwischen", "durch", "gegen", "ohne", "bis", "ist", "sind", "war", "waren", "hat", "haben", "wird", "werden", "kann", "können", "muss", "müssen", "soll", "sollen", "darf", "dürfen", "nicht", "kein", "keine", "auch", "noch", "schon", "wenn", "als", "wie", "so", "da", "dann", "dort", "hier", "ich", "du", "er", "sie", "es", "wir", "ihr", "mein", "dein", "sein", "unser", "euer"]
```

### Legal forms (`data/legal-forms.json`)

```json
{
  "fr": {
    "forms": ["SCI", "SARL", "SAS", "SA", "EURL", "SASU", "GIE", "SNC", "SCA", "SCOP", "SCEA", "SEL", "SELARL", "SELAS"],
    "context_words": ["SOCIETE", "SOCIÉTÉ", "GROUPE", "COMPAGNIE", "ETABLISSEMENT", "ÉTABLISSEMENT", "FONDATION", "ASSOCIATION"]
  },
  "uk": {
    "forms": ["LTD", "LIMITED", "PLC", "LLP", "CIC", "CIO", "LP"],
    "context_words": ["COMPANY", "GROUP", "HOLDINGS", "PARTNERS", "ASSOCIATES", "FOUNDATION", "TRUST"]
  },
  "de": {
    "forms": ["GMBH", "AG", "KG", "OHG", "EV", "E.V.", "UG", "GMBH & CO. KG", "GMBH & CO KG", "SE"],
    "context_words": ["GESELLSCHAFT", "VEREIN", "STIFTUNG", "GENOSSENSCHAFT", "KONZERN"]
  },
  "us": {
    "forms": ["LLC", "INC", "INC.", "INCORPORATED", "CORP", "CORP.", "CORPORATION", "LP", "LLP", "PLLC", "PA", "PC"],
    "context_words": ["COMPANY", "GROUP", "HOLDINGS", "PARTNERS", "ASSOCIATES", "FOUNDATION"]
  },
  "br": {
    "forms": ["LTDA", "S.A.", "SA", "EIRELI", "MEI", "EPP", "ME"],
    "context_words": ["EMPRESA", "GRUPO", "COMPANHIA", "FUNDAÇÃO", "ASSOCIAÇÃO"]
  }
}
```

### Street types (`data/street-types.json`)

```json
{
  "fr": ["RUE", "AVENUE", "BOULEVARD", "PLACE", "IMPASSE", "ALLÉE", "ALLEE", "CHEMIN", "PASSAGE", "COURS", "ROUTE", "SQUARE", "QUAI", "SENTIER", "CITÉ", "CITE", "VILLA", "VOIE", "TRAVERSE", "MONTÉE", "MONTEE", "RUELLE"],
  "en": ["STREET", "ST", "ROAD", "RD", "AVENUE", "AVE", "LANE", "LN", "DRIVE", "DR", "COURT", "CT", "PLACE", "PL", "TERRACE", "CLOSE", "WAY", "CRESCENT", "CIRCLE", "BOULEVARD", "BLVD", "HIGHWAY", "HWY", "SQUARE"],
  "de": ["STRASSE", "STR", "STRAßE", "WEG", "GASSE", "PLATZ", "ALLEE", "RING", "DAMM", "UFER", "CHAUSSEE", "STEIG", "PFAD"]
}
```

---

## Communication protocol with Touchstone

### REST (default)

```typescript
// Single classify
const response = await fetch(`${baseUrl}/v1/classify/${encodeURIComponent(term)}?jurisdictions=${jurisdictions.join(",")}`);
const data: ClassifyResponse = await response.json();

// Batch classify
const response = await fetch(`${baseUrl}/v1/classify/batch`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    terms: mixedTerms,
    jurisdictions: jurisdictions
  })
});
const data: BatchClassifyResponse = await response.json();
```

### MCP/QUIC (when available)

If the Touchstone server supports MCP/QUIC (detected via connection probe on startup), use MCP tools directly. The `pkg/kit` bridge on Touchstone's side handles the conversion. From the extension's perspective, it's calling MCP tools:

```typescript
// MCP tool call
const result = await mcpClient.callTool("classify_batch", {
  terms: mixedTerms,
  jurisdictions: jurisdictions
});
```

**Fallback chain**: MCP/QUIC → REST/HTTPS → REST/HTTP (localhost only) → offline mode.

---

## Privacy guarantees

1. **Document never transmitted** — only isolated terms leave the browser
2. **Terms shuffled** — order randomized before sending
3. **Decoy injection** — 30-50% fake terms mixed in
4. **No session** — Touchstone has no cookies, no tokens, no IP logging
5. **Alias table local-only** — the mapping (original ↔ alias) stays in IndexedDB
6. **Cache reduces exposure** — previously classified terms are not re-sent
7. **Works offline** — if Touchstone unreachable, local detection still works (patterns, legal forms), only dictionary-based classification is degraded
8. **Open source** — all code is auditable, AGPL-free (Apache 2.0)

---

## Build & development

```bash
# Install dependencies
npm install

# Dev mode with hot reload
npm run dev
# → loads unpacked extension from dist/, watches for changes

# Production build
npm run build
# → dist/ ready for Chrome Web Store upload

# Run tests
npm test

# Type check
npm run typecheck
```

### Dependencies (minimal)

```json
{
  "devDependencies": {
    "typescript": "^5.3",
    "vite": "^5.0",
    "@crxjs/vite-plugin": "^2.0",
    "vitest": "^1.0"
  }
}
```

No React. No framework. Vanilla TypeScript + DOM APIs. The UI is simple enough that a framework would be overhead. CSS is vanilla with CSS custom properties for theming.

---

## What to build first (priority order)

1. **Tokenizer + Local Detector** — the core text processing, no network needed
2. **Popup UI** — input panel + review panel with hardcoded test entities
3. **Touchstone Client** — REST batch call to localhost
4. **Assembler** — combine local + Touchstone results
5. **Alias Generator + Substituter** — produce the anonymized output
6. **Context menu integration** — right-click → anonymize selection
7. **Decoy Mixer** — privacy layer for Touchstone calls
8. **Settings panel** — Touchstone URL, jurisdictions, privacy options
9. **IndexedDB cache** — avoid re-querying known terms
10. **MCP/QUIC transport** — when Touchstone chassis is ready

---

## What this project is NOT

- Not a NER engine — it uses Touchstone for classification, local heuristics for grouping
- Not a document editor — it takes text in, gives text out, doesn't modify the original
- Not a VPN or proxy — it doesn't route traffic, it processes text locally
- Not an anonymization certifier — it helps anonymize, but the user is responsible for reviewing the output
- Not Touchstone — Touchstone is the infrastructure, Whiteout is the user-facing product
