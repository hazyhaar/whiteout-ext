> **Protocole** — Avant toute tâche, lire [`../CLAUDE.md`](../CLAUDE.md) §Protocole de recherche.
> Commandes obligatoires : `cat <dossier>/CLAUDE.md` → `grep -rn "CLAUDE:SUMMARY"` → `grep -n "CLAUDE:WARN" <fichier>`.
> **Interdit** : Glob/Read/Explore/find au lieu de `grep -rn`. Ne jamais lire un fichier entier en première intention.

# whiteout-ext

**Responsabilité** : Extension cross-platform (Chrome, iOS, Android) d'anonymisation de documents avant envoi aux LLM. Seul projet non-Go du monorepo HOROS. Runtime TypeScript/Node.

## Dépendances et dépendants

| Direction | Cible | Nature |
|-----------|-------|--------|
| **dépend de** | `touchstone-registry-audit` | API classification ConnectRPC (via `@whiteout/proto`) |
| **dépend de** | `hazyhaar_pkg` | Schéma proto partagé (buf generate) |
| **dépendant** | aucun | Projet terminal (extension utilisateur) |

## Structure

```
whiteout-ext/
├── packages/
│   ├── core/          # Logique partagée : pipeline, tokenizer, anonymize, entity-graph
│   ├── chrome/        # Extension Chrome manifest v3 (popup, sidebar, content script, service worker)
│   └── proto/         # Protocol buffers / schéma ConnectRPC (Touchstone API)
├── package.json       # Racine npm workspaces
├── tsconfig.base.json # Config TypeScript partagée
└── CLAUDE.md          # Ce fichier
```

## Fichiers clés / types clés

| Fichier | Rôle |
|---------|------|
| `packages/core/src/pipeline.ts` | Pipeline principal d'anonymisation |
| `packages/core/src/anonymize.ts` | API publique d'anonymisation |
| `packages/core/src/entity-graph.ts` | Interface du graphe d'entités |
| `packages/core/src/touchstone-client.ts` | Client API classification |
| `packages/chrome/src/content/content-dom.ts` | Injection DOM et interception |
| `packages/chrome/manifest.json` | Manifest V3 de l'extension |
| `packages/proto/touchstone.proto` | Schéma ConnectRPC classification |

## Build / test / deploy

```bash
# Installation
npm install

# Build complet (core puis chrome)
npm run build

# Build IIFE pour runtimes natifs (Android/iOS)
npm run bundle:iife

# Tests unitaires (core)
npm test

# Tests E2E
npm run test:e2e

# Tests DOM (chrome)
npm run test:dom

# Typecheck
npm run typecheck
```

## Invariants

- **Monorepo npm workspaces** — pas turborepo/nx
- **ESM partout** — `"type": "module"` dans chaque package.json
- **TypeScript strict** — `strict: true` dans tsconfig.base.json
- **`node_modules/` gitignored** (~122M) — ne jamais committer
- **Pas de Go ici** — seul projet TypeScript du monorepo HOROS
- **Vite** pour le bundling (chrome extension + IIFE bundle natif)
- **Vitest** pour les tests

## Pièges connus

- Le build chrome dépend du build core (séquentiel dans `npm run build`)
- Le bundle IIFE expose `window.Whiteout` — utilisé par Android QuickJS et iOS JavaScriptCore
- `packages/chrome/vite.config.ts` a 5 entry points séparés — modifier avec précaution
- Les tests E2E utilisent `golden.db` (SQLite) comme fixture — regénérer avec `npm run generate:golden`
- `host_permissions` dans manifest.json pointe vers `localhost:8420` (Touchstone local)

## NE PAS

- Committer `node_modules/`
- Traiter comme un projet Go
- Utiliser turborepo/nx
- Modifier le manifest v3 sans tester le chargement dans Chrome
