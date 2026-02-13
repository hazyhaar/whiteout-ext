# Whiteout

Anonymize documents locally. Paste text, get a clean version. Your document never leaves your device.

Whiteout detects personal names, company names, addresses and other identifiable entities in your text, proposes aliases, and produces an anonymized version — entirely on-device. The only thing that leaves your machine is isolated lookup terms sent to [Touchstone](https://github.com/hazyhaar/touchstone-registry), a blind classification service that doesn't know where the terms came from.

Available on **Chrome** (extension), **Android** and **macOS / iOS** (native apps). All platforms share the same TypeScript processing core.

## Install

| Platform | Status |
|---|---|
| Chrome Extension | *(coming soon)* |
| Android (Google Play) | *(coming soon)* |
| macOS / iOS (App Store) | *(coming soon)* |

Development install:
```bash
git clone https://github.com/hazyhaar/whiteout-ext.git
cd whiteout-ext
npm install
npm run build              # all platforms
npm run build:chrome       # Chrome extension only
npm run build:android      # Android app (requires Android SDK)
npm run build:apple        # macOS/iOS app (requires Xcode)
```

## How it works

1. **Paste or select text** — paste into the app, or right-click selected text on any page (Chrome), or use the share sheet (mobile)
2. **Entities are detected** — names, companies, addresses are highlighted in color
3. **Aliases are proposed** — "Jean-Pierre Dupont" → "Marc Renaud", "SCI Les Lilas" → "Société 1"
4. **You review and adjust** — accept, change, or skip any detection
5. **Get your clean text** — copy or download the anonymized version

Your original text never leaves the device. Only isolated terms (individual words like "DUPONT" or "LYON") are sent to Touchstone for classification. Touchstone has no way to reconstruct your document from these fragments.

## What stays local

Everything except the lookup:
- Tokenization (splitting text into words)
- Pattern detection (legal forms, address patterns, emails, phone numbers)
- Context assembly (figuring out "Jean-Pierre Dupont" is a full name)
- Alias generation
- Substitution
- The mapping table (alias ↔ original) — stored locally (IndexedDB on Chrome, SQLite on mobile), never transmitted

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

The codebase is a monorepo. The processing engine (`packages/core`) is pure TypeScript with zero platform dependency. Each platform shell wraps the core with native UI and a JS runtime.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PLATFORM SHELLS                              │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────────┐  │
│  │ Chrome Ext.  │   │ Android App      │   │ macOS / iOS App    │  │
│  │              │   │                  │   │                    │  │
│  │ popup.html   │   │ Kotlin UI        │   │ SwiftUI            │  │
│  │ service      │   │ Jetpack Compose  │   │ JavaScriptCore     │  │
│  │ worker (MV3) │   │ V8/Hermes via    │   │ (built into Apple  │  │
│  │ content      │   │ aspect-bundled   │   │  platforms)        │  │
│  │ script       │   │ JS runtime       │   │                    │  │
│  │              │   │                  │   │ Share sheet ext.   │  │
│  │ IndexedDB    │   │ SQLite           │   │ SQLite             │  │
│  └──────┬───────┘   └────────┬─────────┘   └─────────┬──────────┘  │
│         │                    │                        │             │
│         └────────────────────┼────────────────────────┘             │
│                              │                                      │
│  ┌───────────────────────────┴───────────────────────────────────┐  │
│  │ @whiteout/core  (pure TypeScript, zero DOM/platform deps)     │  │
│  │                                                               │  │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────────────┐             │  │
│  │  │Tokenizer │→│ Local     │→│ Touchstone       │             │  │
│  │  │          │ │ Detector  │ │ Client           │             │  │
│  │  └──────────┘ └───────────┘ └────────┬─────────┘             │  │
│  │                                       │                       │  │
│  │  ┌──────────┐ ┌───────────┐ ┌────────┴─────────┐            │  │
│  │  │Assembler │←│ Alias     │←│ Decoy Mixer      │            │  │
│  │  │          │ │ Generator │ │                   │            │  │
│  │  └──────────┘ └───────────┘ └──────────────────┘            │  │
│  │                                                               │  │
│  │  types.ts · data/ (stop words, legal forms, alias pools)      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ REST/HTTPS (or MCP/QUIC on desktop)
                           │ (isolated terms only)
                           ▼
                  ┌──────────────────┐
                  │   TOUCHSTONE     │
                  │   (remote or     │
                  │    localhost)    │
                  └──────────────────┘
```

### Platform integration strategy

| Concern | Chrome | Android | macOS / iOS |
|---|---|---|---|
| JS runtime | V8 (browser-native) | aspect-bundled Hermes or system WebView | JavaScriptCore (system) |
| Core loading | `import` in service worker | Load compiled bundle at app startup, call via bridge | `JSContext.evaluateScript()`, call exported functions |
| Local storage | IndexedDB | SQLite (Room) | SQLite (SwiftData / GRDB) |
| Store adapter | `local-store.ts` (IndexedDB) | Kotlin adapter implementing `StorePort` | Swift adapter implementing `StorePort` |
| Text input | Popup textarea + context menu | Share sheet + in-app textarea | Share sheet + in-app textarea |
| Network | `fetch()` | `OkHttp` via bridge or `fetch()` in WebView | `URLSession` via bridge or `fetch()` in JSContext |
| Distribution | Chrome Web Store | Google Play | App Store (universal binary) |

The core exports a `StorePort` interface. Each platform provides its own implementation. The core never imports platform-specific APIs.

```typescript
// packages/core/src/ports.ts
interface StorePort {
  getAliasMap(sessionId: string): Promise<Map<string, string>>;
  setAliasMap(sessionId: string, map: Map<string, string>): Promise<void>;
  getCachedClassification(term: string): Promise<TouchstoneResult[] | null>;
  setCachedClassification(term: string, results: TouchstoneResult[], ttlMs: number): Promise<void>;
}

interface FetchPort {
  post(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; body: string }>;
}
```

## Monorepo structure

```
whiteout-ext/
├── package.json                   # npm workspaces root
├── tsconfig.base.json             # shared TS config
├── packages/
│   ├── core/                      # @whiteout/core — shared processing engine
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts           # public API: pipeline(), tokenize(), detect(), classify(), assemble(), substitute()
│   │   │   ├── tokenizer.ts
│   │   │   ├── local-detector.ts
│   │   │   ├── touchstone-client.ts
│   │   │   ├── decoy-mixer.ts
│   │   │   ├── assembler.ts
│   │   │   ├── alias-generator.ts
│   │   │   ├── substituter.ts
│   │   │   ├── ports.ts           # StorePort, FetchPort interfaces
│   │   │   └── types.ts
│   │   ├── data/
│   │   │   ├── stop-words/
│   │   │   │   ├── fr.json
│   │   │   │   ├── en.json
│   │   │   │   └── de.json
│   │   │   ├── legal-forms.json
│   │   │   ├── street-types.json
│   │   │   ├── alias-firstnames.json
│   │   │   ├── alias-surnames.json
│   │   │   └── alias-companies.json
│   │   └── __tests__/             # vitest, platform-independent
│   │       ├── tokenizer.test.ts
│   │       ├── local-detector.test.ts
│   │       ├── assembler.test.ts
│   │       └── substituter.test.ts
│   │
│   ├── chrome/                    # Chrome extension shell
│   │   ├── package.json
│   │   ├── manifest.json
│   │   ├── vite.config.ts
│   │   ├── src/
│   │   │   ├── background/
│   │   │   │   └── service-worker.ts
│   │   │   ├── popup/
│   │   │   │   ├── popup.html
│   │   │   │   ├── popup.ts
│   │   │   │   └── popup.css
│   │   │   ├── content/
│   │   │   │   └── content-script.ts
│   │   │   └── adapters/
│   │   │       ├── idb-store.ts       # StorePort → IndexedDB
│   │   │       └── fetch-adapter.ts   # FetchPort → browser fetch()
│   │   └── dist/
│   │
│   ├── android/                   # Android app shell
│   │   ├── app/
│   │   │   ├── build.gradle.kts
│   │   │   └── src/main/
│   │   │       ├── java/.../whiteout/
│   │   │       │   ├── MainActivity.kt
│   │   │       │   ├── WhiteoutEngine.kt      # loads core bundle, exposes Kotlin API
│   │   │       │   ├── ShareActivity.kt       # handles share sheet intents
│   │   │       │   └── adapters/
│   │   │       │       ├── RoomStore.kt       # StorePort → Room/SQLite
│   │   │       │       └── OkHttpFetch.kt     # FetchPort → OkHttp
│   │   │       ├── res/
│   │   │       └── AndroidManifest.xml
│   │   ├── build.gradle.kts
│   │   ├── settings.gradle.kts
│   │   └── core-bundle/              # compiled @whiteout/core JS bundle (generated)
│   │
│   └── apple/                     # macOS + iOS app shell (universal)
│       ├── Whiteout.xcodeproj
│       ├── Whiteout/
│       │   ├── WhiteoutApp.swift
│       │   ├── ContentView.swift
│       │   ├── WhiteoutEngine.swift       # JSContext wrapper, loads core bundle
│       │   ├── ShareExtension/
│       │   │   └── ShareViewController.swift
│       │   ├── Adapters/
│       │   │   ├── SQLiteStore.swift       # StorePort → SQLite
│       │   │   └── URLSessionFetch.swift   # FetchPort → URLSession
│       │   └── Resources/
│       │       └── core-bundle.js         # compiled @whiteout/core (generated)
│       └── WhiteoutTests/
│
├── LICENSE
└── README.md
```

## manifest.json (Chrome shell — Manifest V3)

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
   - Legal forms list (shipped with core):
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

**Alias pools** (shipped with core):

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

### Context menu (Chrome)

Right-click on any web page with text selected:
- "Whiteout: Anonymize selection" → opens popup with selected text pre-filled

### Share sheet (Android / iOS)

Select text in any app → Share → Whiteout:
- Opens Whiteout with the selected text pre-filled in the Review panel
- On Android: `ShareActivity` receives `Intent.ACTION_SEND` with `text/plain`
- On iOS: Share Extension receives text via `NSExtensionItem`, forwards to main app via App Group

### Settings (accessible from popup gear icon / app settings)

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

## Data files — Embedded in `@whiteout/core`

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

1. **Document never transmitted** — only isolated terms leave the device
2. **Terms shuffled** — order randomized before sending
3. **Decoy injection** — 30-50% fake terms mixed in
4. **No session** — Touchstone has no cookies, no tokens, no IP logging
5. **Alias table local-only** — the mapping (original ↔ alias) stays in IndexedDB (Chrome) or SQLite (mobile)
6. **Cache reduces exposure** — previously classified terms are not re-sent
7. **Works offline** — if Touchstone unreachable, local detection still works (patterns, legal forms), only dictionary-based classification is degraded
8. **Open source** — all code is auditable, AGPL-free (Apache 2.0)

---

## Build & development

```bash
# Install all workspace dependencies
npm install

# ── Core ──
npm run -w packages/core build        # compile core to ESM + CJS
npm run -w packages/core test         # vitest (platform-independent)
npm run -w packages/core typecheck    # tsc --noEmit

# ── Chrome ──
npm run -w packages/chrome dev        # vite dev with hot reload → load dist/ as unpacked extension
npm run -w packages/chrome build      # production build → dist/ ready for Chrome Web Store

# ── Android ──
npm run build:android                 # 1) build core bundle  2) copy to android/core-bundle/  3) run ./gradlew assembleDebug
# Or manually:
npm run -w packages/core bundle:iife  # produce single-file IIFE bundle for embedding
cp packages/core/dist/whiteout-core.iife.js packages/android/core-bundle/
cd packages/android && ./gradlew assembleDebug

# ── Apple (macOS / iOS) ──
npm run build:apple                   # 1) build core bundle  2) copy to apple/Whiteout/Resources/  3) xcodebuild
# Or manually:
npm run -w packages/core bundle:iife
cp packages/core/dist/whiteout-core.iife.js packages/apple/Whiteout/Resources/core-bundle.js
cd packages/apple && xcodebuild -scheme Whiteout -destination 'generic/platform=iOS'

# ── All platforms ──
npm run build                         # build core + chrome + android + apple
npm test                              # run all tests (core unit + chrome e2e)
```

### Root `package.json` (npm workspaces)

```json
{
  "private": true,
  "workspaces": ["packages/core", "packages/chrome"],
  "scripts": {
    "build": "npm run -w packages/core build && npm run -w packages/chrome build",
    "build:chrome": "npm run -w packages/chrome build",
    "build:android": "npm run -w packages/core bundle:iife && node scripts/copy-core-android.js && cd packages/android && ./gradlew assembleDebug",
    "build:apple": "npm run -w packages/core bundle:iife && node scripts/copy-core-apple.js && cd packages/apple && xcodebuild -scheme Whiteout",
    "test": "npm run -w packages/core test",
    "typecheck": "npm run -w packages/core typecheck"
  }
}
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

No React. No framework. Vanilla TypeScript + DOM APIs for Chrome. Kotlin Compose for Android. SwiftUI for Apple. Each platform uses its idiomatic UI toolkit. CSS is vanilla with CSS custom properties for theming (Chrome only).

---

## What to build first (priority order)

### Phase 1 — Core engine (`@whiteout/core`)
1. **Types + Ports** — `types.ts`, `ports.ts` (StorePort, FetchPort interfaces)
2. **Tokenizer + Local Detector** — core text processing, no network needed
3. **Touchstone Client** — REST batch call via FetchPort
4. **Decoy Mixer** — privacy layer for Touchstone calls
5. **Assembler** — combine local + Touchstone results
6. **Alias Generator + Substituter** — produce the anonymized output
7. **`pipeline()` orchestrator** — single function: text in → entities + anonymized text out
8. **Core tests** — vitest, 100% platform-independent

### Phase 2 — Chrome extension
9. **Chrome adapters** — IndexedDB store, browser fetch
10. **Popup UI** — input + review + output panels
11. **Context menu** — right-click → anonymize selection
12. **Settings panel** — Touchstone URL, jurisdictions, decoy ratio

### Phase 3 — Mobile apps
13. **Core IIFE bundle** — single-file build for embedding in native apps
14. **Android shell** — Kotlin/Compose UI, Room store adapter, share sheet intent
15. **Apple shell** — SwiftUI, JavaScriptCore engine wrapper, SQLite store, share extension
16. **MCP/QUIC transport** — when Touchstone chassis is ready (desktop only)

---

## What this project is NOT

- Not a NER engine — it uses Touchstone for classification, local heuristics for grouping
- Not a document editor — it takes text in, gives text out, doesn't modify the original source
- Not a VPN or proxy — it doesn't route traffic, it processes text locally
- Not an anonymization certifier — it helps anonymize, but the user is responsible for reviewing the output
- Not Touchstone — Touchstone is the infrastructure, Whiteout is the user-facing product
