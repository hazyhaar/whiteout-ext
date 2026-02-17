# Audit du plan Whiteout — Février 2026

## Résumé exécutif

Le plan technique dans le README est **solide sur le fond architectural** : moteur TypeScript pur partagé, modèle port/adapter, pipeline linéaire de traitement. L'analyse du repo `hazyhaar/pkg` confirme que l'infrastructure MCP-over-QUIC existe et que le plan s'insère dans un écosystème HOROS cohérent.

**Verdict** : Le plan nécessite des corrections ciblées (pas une refonte) sur 8 points identifiés ci-dessous. Le point le plus critique est la mise à jour des versions de dépendances et le remplacement du framework de build Chrome.

---

## 0. Contexte écosystème — `hazyhaar/pkg` (HOROS shared packages)

L'audit a été complété par l'analyse du repo `hazyhaar/pkg`, un monorepo Go qui fournit l'infrastructure partagée de l'écosystème HOROS. Les packages pertinents pour Whiteout :

| Package | Rôle | Pertinence pour Whiteout |
|---|---|---|
| **`mcpquic`** | Transport MCP-over-QUIC réel (ALPN `mcp-quic-v1`, magic bytes `MCP1`, JSON-RPC sur stream QUIC) | **Directe** — c'est le transport que le plan Whiteout référence |
| **`chassis`** | Serveur unifié HTTP/1.1 + HTTP/2 + HTTP/3 + MCP-QUIC sur un seul port (démux ALPN) | **Directe** — c'est probablement ce sur quoi tourne Touchstone |
| **`connectivity`** | Smart router SQLite avec factories HTTP et MCP-QUIC, circuit breaker, retry, fallback | **Directe** — implémente la chaîne de fallback décrite dans le plan |
| **`kit`** | Endpoints transport-agnostic (même fonction sert HTTP et MCP), middleware composable | **Directe** — pattern architectural de Touchstone |
| **`mcprt`** | Registre dynamique d'outils MCP (SQLite-backed, hot-reload) | **Indirecte** — les outils `classify_batch` de Touchstone y sont probablement définis |
| **`audit`** | Audit log asynchrone SQLite | **Indirecte** — logging des actions d'anonymisation |
| **`idgen`** | Génération d'IDs (NanoID, UUIDv7, préfixés) | **Indirecte** — convention d'ID de l'écosystème |
| **`watch`** | Détection de changements SQLite (poll `PRAGMA data_version`) | **Indirecte** — utilisé par mcprt et connectivity |
| **`observability`** | Stack monitoring SQLite-native (métriques, heartbeat, audit) | **Indirecte** |
| **`sas_ingester`** | Pipeline d'ingestion de fichiers avec détection d'injection de prompt | **Parallèle** — patterns de sécurité similaires |

### Implications clés

1. **MCP/QUIC est une réalité dans l'écosystème HOROS** — `mcpquic` est une implémentation production-grade avec client/serveur, ALPN, magic bytes, session management. Mon analyse initiale (sans accès à `pkg`) qui recommandait de retirer MCP/QUIC était **erronée**.

2. **La chaîne de fallback du plan est cohérente** avec le package `connectivity` qui supporte exactement les stratégies `quic`, `http`, `local`, `noop` avec circuit breaker et retry intégrés.

3. **Le pattern kit.Endpoint** (même business logic servie via HTTP et MCP) confirme que Touchstone expose ses endpoints sur les deux transports simultanément via le chassis.

4. **Le client TypeScript MCP-QUIC reste à écrire** — `mcpquic` est en Go. L'extension Chrome et les apps mobiles auront besoin d'un client TypeScript/JS qui implémente le même protocole (ALPN `mcp-quic-v1`, magic `MCP1`, JSON-RPC newline-delimited sur QUIC stream). C'est un effort non-trivial.

---

## 1. Versions des dépendances — OBSOLÈTES

### Constat

Le README spécifie :
```json
{
  "typescript": "^5.3",
  "vite": "^5.0",
  "@crxjs/vite-plugin": "^2.0",
  "vitest": "^1.0"
}
```

### Réalité février 2026

| Outil | Version dans le plan | Version actuelle stable | Remarque |
|---|---|---|---|
| TypeScript | ^5.3 | **5.9** (6.0 en beta) | TS 7 en Go est en cours de dev |
| Vite | ^5.0 | **7.3.1** (8.0 en beta) | Vite 8 utilise Rolldown (Rust) |
| Vitest | ^1.0 | **4.0.18** | Vitest 4 requiert Vite 7+ |
| @crxjs/vite-plugin | ^2.0 | **2.3.0** | Voir point 2 |

### Recommandation

Mettre à jour les versions cibles :
```json
{
  "typescript": "^5.9",
  "vite": "^7.3",
  "vitest": "^4.0"
}
```

---

## 2. @crxjs/vite-plugin — REMPLACER par WXT

### Constat

Le plan utilise `@crxjs/vite-plugin` pour le build de l'extension Chrome.

### Problèmes identifiés

- **Historique instable** : le projet a été quasi-abandonné pendant 3 ans (beta prolongée). Une nouvelle équipe communautaire a repris la maintenance mi-2025, mais la pérennité reste incertaine.
- **Bug critique passé** : Chrome 130+ cassait les content scripts à cause d'un problème CSP (corrigé dans 2.0.0-beta.26+, mais révélateur d'un suivi lent).
- **Pas d'abstractions runtime** : c'est uniquement un plugin de build. Storage, messaging, compatibilité cross-browser sont à implémenter soi-même.
- **CSS en content scripts** parfois ignoré (fichiers manquants dans dist/).

### Alternative recommandée : WXT (wxt.dev)

WXT est le framework d'extension navigateur dominant en 2026 :
- ~9 000 stars GitHub, maintenance active
- Basé sur Vite, conventions à la Nuxt (file-based entrypoints, auto-imports, manifest auto-généré)
- Framework-agnostic (pas de React imposé — parfait pour du vanilla TS)
- Cross-browser natif (Chrome, Firefox, Edge, Safari) avec support MV2 et MV3
- Abstractions runtime intégrées (storage, messaging)
- Bundles plus petits (~400 KB vs ~800 KB Plasmo)
- Outils de publication intégrés

### Impact sur le plan

- Remplacer `@crxjs/vite-plugin` par `wxt` dans les dépendances
- Adapter la structure `packages/chrome/` aux conventions WXT (entrypoints basés sur les fichiers)
- Le `vite.config.ts` est remplacé par `wxt.config.ts`
- Le `manifest.json` statique est remplacé par un manifest auto-généré à partir des entrypoints

---

## 3. MCP/QUIC — CONSERVER, mais clarifier le client TypeScript

### Constat initial (corrigé)

L'analyse initiale sans accès à `hazyhaar/pkg` concluait que MCP/QUIC n'existait pas. **C'était faux.**

### Réalité après examen de `pkg`

Le package `mcpquic` dans `hazyhaar/pkg` est une **implémentation production-grade** de MCP-over-QUIC :
- Protocole ALPN `"mcp-quic-v1"` pour la négociation TLS
- Magic bytes `"MCP1"` en handshake de stream
- JSON-RPC newline-delimited sur streams QUIC bidirectionnels
- Client Go complet (`Connect()` → `ListTools()` / `CallTool()` / `Ping()`)
- Serveur avec deux modes : `Handler` (intégré au chassis) et `Listener` (standalone)
- Session management avec notifications push (channel buffered, cap 100)
- Config production (TLS 1.3, fenêtres QUIC 10/50 MB) et dev (certs auto-signés)

Le `chassis` sert HTTP/1.1 + HTTP/2 + HTTP/3 + MCP-QUIC sur **un seul port** via ALPN demux. Le `connectivity` router implémente exactement la chaîne de fallback MCP → HTTP → local → noop avec circuit breaker et retry.

### Ce qui manque dans le plan Whiteout

Le plan décrit le client MCP côté TypeScript comme une simple ligne :
```typescript
const result = await mcpClient.callTool("classify_batch", { ... });
```

Mais **il n'existe pas de client MCP-over-QUIC en TypeScript/JavaScript**. Le client dans `pkg/mcpquic` est en Go. L'implémentation côté extension Chrome nécessite :

1. **Un transport QUIC dans le navigateur** — WebTransport (basé sur HTTP/3) est le seul accès QUIC disponible dans un navigateur. Il ne supporte pas l'ALPN custom `mcp-quic-v1`. C'est un **blocker** pour l'extension Chrome.

2. **Sur desktop/mobile** — un client QUIC natif (via un binding ou une lib comme `libquiche` en WASM) serait techniquement possible mais très lourd.

### Recommandation

- **Conserver MCP/QUIC dans le plan** comme transport de Phase 3 (mobile/desktop).
- **Clarifier que MCP-QUIC n'est PAS disponible dans l'extension Chrome** — le navigateur ne supporte pas l'ALPN custom requis. L'extension utilisera toujours REST/HTTPS.
- **Pour Android/iOS** — le client MCP-QUIC peut être implémenté nativement (Kotlin/Swift) sans passer par le core TypeScript, en se connectant directement au chassis.
- **Adapter la chaîne de fallback par plateforme** :
  - Chrome : `REST/HTTPS → REST/HTTP localhost → offline`
  - Android/iOS : `MCP-QUIC → REST/HTTPS → REST/HTTP localhost → offline`
- **Ajouter au plan** : une tâche Phase 3 explicite "Implémenter client MCP-QUIC natif pour Kotlin (Android) et Swift (iOS)".

---

## 4. Manifest Chrome — CORRECTIONS NÉCESSAIRES

### 4.1. `<all_urls>` dans content_scripts

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["content/content-script.js"],
    "run_at": "document_idle"
  }
]
```

**Problème** : `<all_urls>` est la première cause de rejet sur le Chrome Web Store. Google exige les permissions les plus étroites possibles.

**Réalité** : le content script de Whiteout ne sert qu'à activer le menu contextuel sur la sélection de texte. Il n'a pas besoin de s'exécuter sur toutes les pages.

**Recommandation** : utiliser `activeTab` + `scripting` API pour injecter le content script dynamiquement uniquement quand l'utilisateur interagit avec l'extension (clic sur l'icône ou menu contextuel). Retirer le bloc `content_scripts` statique.

```json
{
  "permissions": ["activeTab", "contextMenus", "storage", "scripting"],
  "content_scripts": []
}
```

Le service worker enregistre le context menu et utilise `chrome.scripting.executeScript()` avec `activeTab` pour injecter le script quand nécessaire.

### 4.2. Permission `unlimitedStorage` manquante

**Problème** : le plan utilise IndexedDB pour le cache Touchstone (TTL 24h) et les alias maps. Sans `unlimitedStorage` :
- IndexedDB est soumis aux quotas web standard
- Les données peuvent être évincées sous pression mémoire

**Recommandation** : ajouter `"unlimitedStorage"` aux permissions et appeler `navigator.storage.persist()` dans le service worker.

### 4.3. `host_permissions` avec placeholder

```json
"host_permissions": [
  "http://localhost:8420/*",
  "https://touchstone.example.org/*"
]
```

**Problème** : `touchstone.example.org` est un placeholder. Le domaine réel doit être déterminé ou rendu configurable.

**Recommandation** : vu que le chassis HOROS sert tout sur un seul port, clarifier l'adresse réelle. Si Touchstone est principalement self-hosted, ne garder que `http://localhost:8420/*` dans les permissions statiques et utiliser `optional_host_permissions` pour les serveurs distants.

---

## 5. Android JS Runtime — CLARIFIER

### Constat

Le plan mentionne :
> "V8/Hermes via aspect-bundled JS runtime"

### Problèmes identifiés

- **"Aspect-bundled" n'est pas un terme standard** — aucune recherche ne retourne ce terme dans le contexte des runtimes JS Android.
- **Hermes standalone** (sans React Native) est mal documenté et nécessite un build CMake + JNI bridge maison. Non recommandé.
- **V8 via J2V8** est abandonné — ne pas utiliser.

### Options concrètes (classées)

| Option | Taille binaire | Performance | Complexité d'intégration |
|---|---|---|---|
| **QuickJS** (`app.cash.quickjs:quickjs-android`) | ~350 KB/archi | Interpréteur (plus lent que V8 JIT) | Faible |
| **AndroidX JavascriptEngine** (Jetpack, V8 via WebView) | 0 (système) | V8 JIT via IPC | Faible mais IPC overhead |
| **Javet** (V8 direct) | ~5-6 MB/ABI | V8 JIT natif | Moyenne |
| **Cash App Zipline** (QuickJS + Kotlin bridge) | ~350 KB + framework | Interpréteur | Faible (si Kotlin/JS) |

### Recommandation

Pour le cas Whiteout (traitement de texte batch, pas de calcul intensif continu) :

**Option principale** : `app.cash.quickjs:quickjs-android` — petit, rapide au démarrage, ES2023, suffisant pour le pipeline de tokenisation/détection/substitution.

**Option alternative** : `AndroidX JavascriptEngine` — solution officielle Google, mais overhead IPC pour chaque appel.

Le plan devrait spécifier concrètement quelle bibliothèque sera utilisée et retirer la mention vague "V8/Hermes via aspect-bundled".

**Note** : pour la partie MCP-QUIC sur Android, le client serait implémenté en Kotlin natif (pas via le core TS), en utilisant une lib QUIC Kotlin/Java. Le core TS ne gère que le pipeline de traitement, pas le transport.

---

## 6. Architecture — Points forts confirmés

Les éléments suivants du plan sont **solides et ne nécessitent pas de modification** :

### Pipeline core
- La décomposition en 7 modules (Tokenizer → Local Detector → Touchstone Client → Decoy Mixer → Assembler → Alias Generator → Substituter) est propre et testable.
- Le pattern port/adapter (StorePort, FetchPort) est le bon choix pour le multi-plateforme.
- Le core zero-DOM/zero-platform est correct.

### Alignement avec l'écosystème `pkg`
- Le `FetchPort` de Whiteout s'inscrit dans le pattern `kit.Endpoint` de `pkg` — le même endpoint Touchstone sert HTTP et MCP.
- Le `StorePort` s'aligne avec l'utilisation de SQLite partout dans `pkg` (mcprt, connectivity, audit, observability).
- La chaîne de fallback correspond aux stratégies du `connectivity.Router`.

### Modèle de confidentialité
- Le mélange de decoys (30-50%) est un bon mécanisme de k-anonymité.
- Le shuffle Fisher-Yates des termes est standard.
- Le stockage local-only de la table d'alias est la bonne approche.
- Le mode offline dégradé est bien pensé.

### Données embarquées
- Les listes de stop words, formes juridiques, types de rues sont pertinentes et complètes pour FR/EN/DE.
- Les pools d'alias sont raisonnables.

### UI Specification
- Le design 3 panneaux (Input/Review/Output) est standard pour ce type d'outil.
- Le code couleur par type d'entité est clair.

---

## 7. Points d'attention additionnels

### 7.1. Service worker Chrome MV3 — lifecycle

Le service worker se termine après **30 secondes d'inactivité**. Pour un traitement de document long :
- Le plan ne mentionne pas de stratégie de keep-alive.
- **Recommandation** : utiliser `chrome.runtime.Port` (keepalive pendant qu'un port est ouvert) ou déplacer le traitement lourd dans un offscreen document.

### 7.2. Taille de l'extension

Les extensions Chrome > 3 MB sont à risque de rejet au Web Store. Avec les données embarquées (stop words, alias pools, formes juridiques), il faut surveiller la taille du bundle.

**Recommandation** : prévoir un budget taille et utiliser des imports dynamiques (`await import(...)`) pour les données par langue.

### 7.3. Brésil dans les formes juridiques

Le plan inclut le Brésil (`"br"`) dans `legal-forms.json` mais **pas dans les stop words ni les street types**. Si le Brésil est dans le scope, ajouter le portugais. Sinon, retirer `"br"` de `legal-forms.json`.

### 7.4. Regex du tokenizer — edge cases

- La regex email `/[\w.-]+@[\w.-]+\.\w{2,}/` match des faux positifs comme `test@.com` ou `@domain.com`. Envisager une regex plus stricte.
- La regex IBAN est permissive — elle pourrait matcher des chaînes qui ne sont pas des IBAN. La validation par checksum (mod 97) devrait être faite côté local detector.
- La regex SSN française ne couvre pas les numéros de Corse (2A/2B au lieu de 20).

### 7.5. Tests manquants dans le plan

Le plan liste des tests pour tokenizer, local-detector, assembler, substituter — mais **pas pour** :
- `decoy-mixer` (important pour vérifier le ratio et la distribution)
- `alias-generator` (important pour la consistance des alias)
- `touchstone-client` (mocks du FetchPort)
- Le `pipeline()` orchestrateur (test d'intégration)

### 7.6. Protocole Touchstone — aligner avec `pkg/kit`

Le plan décrit l'API Touchstone comme un simple REST :
```typescript
POST /v1/classify/batch { terms, jurisdictions }
```

Mais côté serveur, Touchstone utilise probablement le pattern `kit.Endpoint` + `kit.RegisterMCPTool()`. Il serait utile d'aligner la spec du `touchstone-client.ts` avec le format réel des payloads `kit.Endpoint` (request/response JSON marshalés) et le nom de l'outil MCP tel que défini dans `mcprt` (probablement `classify_batch`).

### 7.7. Convention d'ID — aligner avec `pkg/idgen`

L'écosystème HOROS utilise `idgen` (NanoID base-36, UUIDv7, préfixes). Le plan Whiteout ne mentionne pas de stratégie d'ID pour les sessions, les alias maps, etc. Adopter les conventions `idgen` (ex: `sess_` pour les sessions, `alias_` pour les maps) assurerait la cohérence avec le reste de l'écosystème.

---

## Résumé des actions

| # | Action | Priorité | Impact |
|---|---|---|---|
| 1 | Mettre à jour les versions cibles (TS 5.9, Vite 7, Vitest 4) | **Haute** | Build cassé sinon |
| 2 | Remplacer @crxjs/vite-plugin par WXT | **Haute** | Maintenance, fonctionnalités |
| 3 | ~~Retirer MCP/QUIC~~ → Conserver, clarifier par plateforme (Chrome=REST only, mobile=MCP-QUIC natif) | **Haute** | Réalisme, faisabilité |
| 4a | Retirer `<all_urls>`, utiliser activeTab + scripting | **Haute** | Rejet Web Store |
| 4b | Ajouter `unlimitedStorage` | Moyenne | Éviction données |
| 4c | Clarifier host_permissions (Touchstone local vs distant) | Moyenne | Clarté |
| 5 | Spécifier le runtime JS Android (QuickJS recommandé) | Moyenne | Faisabilité |
| 6 | Ajouter stratégie keep-alive service worker | Moyenne | Fiabilité |
| 7 | Corriger l'incohérence Brésil (scope langues) | Basse | Cohérence |
| 8 | Renforcer les regex tokenizer (email, IBAN, SSN Corse) | Basse | Qualité détection |
| 9 | Ajouter les tests manquants au plan (decoy-mixer, alias-generator, touchstone-client, pipeline) | Moyenne | Couverture |
| 10 | Aligner protocole Touchstone avec le format `kit.Endpoint` réel | Moyenne | Interopérabilité |
| 11 | Adopter les conventions `idgen` de l'écosystème HOROS | Basse | Cohérence |

---

*Audit réalisé le 17 février 2026.*
*V1 : basé sur recherche de fraîcheur technologique uniquement.*
*V2 : complété avec l'analyse de `hazyhaar/pkg` — correction majeure sur MCP/QUIC (point 3).*
