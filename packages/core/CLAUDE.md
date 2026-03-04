> **Protocole** — Avant toute tâche, lire [`../../CLAUDE.md`](../../CLAUDE.md) §Protocole de recherche.
> Commandes obligatoires : `cat <dossier>/CLAUDE.md` → `grep -rn "CLAUDE:SUMMARY"` → `grep -n "CLAUDE:WARN" <fichier>`.
> **Interdit** : Glob/Read/Explore/find au lieu de `grep -rn`. Ne jamais lire un fichier entier en première intention.

# @whiteout/core

**Responsabilité** : Logique partagée d'anonymisation de documents — pipeline, tokenisation, détection d'entités, substitution, génération d'alias, mélange de leurres. Consommé par l'extension Chrome et les runtimes natifs (Android/iOS via bundle IIFE).

## Dépendances et dépendants

| Direction | Cible | Nature |
|-----------|-------|--------|
| **dépend de** | `@whiteout/proto` | Types ConnectRPC générés (Touchstone API) |
| **dépend de** | `@bufbuild/protobuf`, `@connectrpc/connect` | Runtime protobuf/connect |
| **dépendant** | `@whiteout/chrome` | Consomme le pipeline et les types |
| **dépendant** | Runtimes natifs (Android, iOS) | Via bundle IIFE `whiteout-core.iife.js` |

## Fichiers clés / types clés

| Fichier | Rôle |
|---------|------|
| `src/pipeline.ts` | Pipeline principal : tokenize → detect → classify → substitute → mix decoys |
| `src/anonymize.ts` | API publique — point d'entrée pour les consommateurs |
| `src/tokenizer.ts` | Découpage du texte en tokens |
| `src/local-detector.ts` | Détection locale d'entités (regex, heuristiques) |
| `src/entity-graph.ts` | Interface `EntityGraph` — contrat du graphe d'entités |
| `src/entity-graph-memory.ts` | Implémentation in-memory du graphe |
| `src/alias-generator.ts` | Génération d'alias cohérents (noms, entreprises, adresses) |
| `src/decoy-mixer.ts` | Insertion de leurres pour renforcer la confidentialité |
| `src/substituter.ts` | Remplacement des entités par leurs alias |
| `src/touchstone-client.ts` | Client ConnectRPC vers l'API Touchstone |
| `src/types.ts` | Types centraux du domaine |
| `src/ports.ts` | Interfaces d'adaptation (ports hexagonaux) |
| `src/bundle-entry.ts` | Point d'entrée du bundle IIFE (`window.Whiteout`) |

## Build / test

```bash
# Build TypeScript → dist/
npm run build

# Bundle IIFE pour runtimes natifs
npm run bundle:iife

# Tests unitaires + E2E
npm test

# Typecheck seul
npm run typecheck
```

## Invariants

- **ESM uniquement** — `"type": "module"`
- **Exports explicites** — `"."` et `"./anonymize"` dans package.json
- **Architecture hexagonale** — `ports.ts` définit les interfaces, les implémentations sont injectées
- **Données embarquées** — `data/` contient les alias et stop-words (JSON statique)
- **Bundle IIFE** expose `window.Whiteout` — ne pas modifier le namespace global

## Pièges connus

- Le bundle IIFE inline les imports dynamiques — vérifier la taille après modification
- Les golden fixtures (`test-fixtures/golden/golden.db`) sont des fichiers SQLite binaires — regénérer avec `npm run generate:golden`
- `better-sqlite3` est une devDependency (tests uniquement) — pas de SQLite en production core
