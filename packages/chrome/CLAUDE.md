> **Protocole** — Avant toute tâche, lire [`../../CLAUDE.md`](../../CLAUDE.md) §Protocole de recherche.
> Commandes obligatoires : `cat <dossier>/CLAUDE.md` → `grep -rn "CLAUDE:SUMMARY"` → `grep -n "CLAUDE:WARN" <fichier>`.
> **Interdit** : Glob/Read/Explore/find au lieu de `grep -rn`. Ne jamais lire un fichier entier en première intention.

# @whiteout/chrome

**Responsabilité** : Extension Chrome Manifest V3 — interface utilisateur pour l'anonymisation de documents dans le navigateur. Intercepte le contenu des pages, applique le pipeline `@whiteout/core`, et affiche les résultats via popup, sidebar et surlignage inline.

## Dépendances et dépendants

| Direction | Cible | Nature |
|-----------|-------|--------|
| **dépend de** | `@whiteout/core` | Pipeline d'anonymisation, types, API publique |
| **dépendant** | aucun | Projet terminal (extension Chrome installée par l'utilisateur) |

## Fichiers clés / types clés

| Fichier | Rôle |
|---------|------|
| `manifest.json` | Manifest V3 — permissions, entry points, content scripts |
| `src/background/service-worker.ts` | Service worker MV3 — orchestration, context menus, side panel |
| `src/content/content.ts` | Content script — point d'entrée injection page |
| `src/content/content-dom.ts` | Manipulation DOM — interception et remplacement de texte |
| `src/content/highlighter.ts` | Surlignage visuel des entités détectées |
| `src/popup/popup.ts` | Interface popup de l'extension |
| `src/sidebar/sidebar.ts` | Panneau latéral — vue détaillée des entités |
| `src/options/options.ts` | Page d'options de l'extension |
| `src/adapters/idb-entity-graph.ts` | Implémentation IndexedDB du graphe d'entités |
| `src/adapters/idb-store.ts` | Couche de persistance IndexedDB |
| `src/adapters/fetch-adapter.ts` | Adaptateur fetch pour Chrome |
| `vite.config.ts` | Build config — 5 entry points séparés |

## Build / test

```bash
# Build extension (output dans dist/)
npm run build

# Dev mode avec watch
npm run dev

# Tests DOM (jsdom)
npm test

# Typecheck
npm run typecheck
```

**Chargement dans Chrome** : `chrome://extensions` → Mode développeur → Charger l'extension non empaquetée → sélectionner `dist/`

## Invariants

- **Manifest V3** — service worker (pas de background page persistante)
- **5 entry points Vite** — background, content, popup, sidebar, options
- **IndexedDB** pour la persistance côté extension (pas de localStorage pour les données structurées)
- **`@whiteout/core`** résolu via alias Vite vers le source (pas le dist)
- **Permissions minimales** — `activeTab`, `storage`, `sidePanel`, `contextMenus`, `scripting`

## Pièges connus

- Le service worker MV3 est éphémère — pas d'état en mémoire entre les wakeups
- `host_permissions` pointe vers `localhost:8420` — adapter pour la production
- Les tests utilisent `jsdom` — pas de vraie API Chrome, les tests sont limités au DOM
- Modifier `vite.config.ts` peut casser le build des 5 entry points — tester chaque sortie
