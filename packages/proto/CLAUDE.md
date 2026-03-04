> **Protocole** — Avant toute tâche, lire [`../../CLAUDE.md`](../../CLAUDE.md) §Protocole de recherche.
> Commandes obligatoires : `cat <dossier>/CLAUDE.md` → `grep -rn "CLAUDE:SUMMARY"` → `grep -n "CLAUDE:WARN" <fichier>`.
> **Interdit** : Glob/Read/Explore/find au lieu de `grep -rn`. Ne jamais lire un fichier entier en première intention.

# @whiteout/proto

**Responsabilité** : Définitions Protocol Buffers et schéma ConnectRPC pour l'API Touchstone (service de classification d'entités). Source unique de vérité pour les contrats TypeScript et Go.

## Dépendances et dépendants

| Direction | Cible | Nature |
|-----------|-------|--------|
| **dépend de** | `buf` CLI | Génération de code (TypeScript + Go) |
| **dépendant** | `@whiteout/core` | Types TS générés pour le client Touchstone |
| **dépendant** | `touchstone-registry-audit` | Types Go générés pour le serveur |

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `touchstone.proto` | Définition du service `ClassificationService` — source de vérité |
| `buf.yaml` | Configuration buf (module, lint, breaking) |
| `buf.gen.ts.yaml` | Template de génération TypeScript (`@bufbuild/protobuf`) |
| `buf.gen.go.yaml` | Template de génération Go (`connectrpc/connect-go`) |

## Service défini

**ClassificationService** (ConnectRPC) :
- `ClassifyBatch` — Classification par lot de termes
- `Classify` — Classification d'un terme unique
- `ListDictionaries` — Liste des dictionnaires disponibles
- `Ping` — Health check

## Build

```bash
# Générer les types TypeScript
npm run generate:ts

# Générer les types Go
npm run generate:go
```

## Invariants

- **Un seul fichier `.proto`** — pas de fragmentation du schéma
- **Dual génération** — TypeScript et Go depuis la même source
- **Le code généré (`gen/`) n'est pas committé** — regénérer après modification du proto
- **Breaking changes** — vérifier avec `buf breaking` avant de modifier le schéma

## Pièges connus

- Modifier le proto sans regénérer casse `@whiteout/core` à la compilation
- Les numéros de champs proto sont immuables une fois déployés — ne jamais réutiliser un numéro supprimé
