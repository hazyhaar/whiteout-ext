# Audit du plan Whiteout — Février 2026

## Résumé exécutif

Le plan technique dans le README est **solide sur le fond architectural** : moteur TypeScript pur partagé, modèle port/adapter, pipeline linéaire de traitement. Cependant, **plusieurs choix technologiques sont datés ou imprécis** et doivent être mis à jour avant le début de l'implémentation.

**Verdict** : Le plan nécessite des corrections ciblées (pas une refonte) sur 7 points identifiés ci-dessous.

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

## 3. MCP/QUIC — RETIRER du plan

### Constat

Le README mentionne une chaîne de fallback :
```
MCP/QUIC → REST/HTTPS → REST/HTTP (localhost) → offline
```

Et des exemples de code MCP :
```typescript
const result = await mcpClient.callTool("classify_batch", { ... });
```

### Problèmes identifiés

- **"MCP/QUIC" n'existe pas** en tant que transport utilisable. Il existe un Internet-Draft IETF préliminaire (octobre 2025) pour "MCP over MOQT" (Media over QUIC Transport), mais aucun SDK ne l'implémente.
- **MCP est un protocole d'intégration d'outils IA**, pas un transport généraliste. Chaque concept (tools, resources, prompts, sampling) est orienté vers un modèle de langage qui consomme du contexte. Un service de classification dictionnaire ne correspond pas à ce modèle mental.
- **Complexité inutile** : l'interaction Touchstone est simple (POST batch de termes → réponse classifications). MCP ajouterait la négociation de capacités, le session management, le framing JSON-RPC — pour un seul endpoint REST.
- **Pas de bénéfice écosystème** : Touchstone est un backend privé pour Whiteout, pas un outil généraliste IA. Aucun client MCP tiers n'en bénéficierait.

### Recommandation

Simplifier la chaîne de fallback :
```
REST/HTTPS → REST/HTTP (localhost uniquement) → mode offline
```

Retirer toute mention de MCP/QUIC du plan. Si Touchstone évolue un jour vers un outil IA exposé publiquement, MCP pourra être ajouté à ce moment-là — mais c'est du design spéculatif.

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

**Problème** : `touchstone.example.org` est un placeholder. Le domaine réel doit être déterminé ou rendu configurable. Si le Touchstone est self-hosted uniquement, seul `localhost` est nécessaire.

**Recommandation** : clarifier la stratégie de déploiement Touchstone. Si Touchstone est toujours local, ne garder que `http://localhost:8420/*`. Si un service distant est prévu, utiliser `optional_host_permissions` pour éviter un avertissement de permission lors de l'installation.

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

---

## 6. Architecture — Points forts confirmés

Les éléments suivants du plan sont **solides et ne nécessitent pas de modification** :

### Pipeline core
- La décomposition en 7 modules (Tokenizer → Local Detector → Touchstone Client → Decoy Mixer → Assembler → Alias Generator → Substituter) est propre et testable.
- Le pattern port/adapter (StorePort, FetchPort) est le bon choix pour le multi-plateforme.
- Le core zero-DOM/zero-platform est correct.

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

---

## Résumé des actions

| # | Action | Priorité | Impact |
|---|---|---|---|
| 1 | Mettre à jour les versions cibles (TS 5.9, Vite 7, Vitest 4) | Haute | Build cassé sinon |
| 2 | Remplacer @crxjs/vite-plugin par WXT | Haute | Maintenance, fonctionnalités |
| 3 | Retirer MCP/QUIC du plan | Moyenne | Clarté, réalisme |
| 4a | Retirer `<all_urls>`, utiliser activeTab + scripting | Haute | Rejet Web Store |
| 4b | Ajouter `unlimitedStorage` | Moyenne | Éviction données |
| 4c | Clarifier host_permissions (Touchstone local vs distant) | Moyenne | Clarté |
| 5 | Spécifier le runtime JS Android (QuickJS recommandé) | Moyenne | Faisabilité |
| 6 | Ajouter stratégie keep-alive service worker | Moyenne | Fiabilité |
| 7 | Corriger l'incohérence Brésil (scope langues) | Basse | Cohérence |
| 8 | Renforcer les regex tokenizer | Basse | Qualité détection |
| 9 | Ajouter les tests manquants au plan | Moyenne | Couverture |

---

*Audit réalisé le 17 février 2026 — basé sur une recherche de fraîcheur des technologies référencées.*
