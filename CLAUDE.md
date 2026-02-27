# whiteout-ext

Responsabilité: Extension cross-platform (Chrome, iOS, Android) en TypeScript. Seul projet non-Go du monorepo.
Runtime: TypeScript/Node (npm workspaces)

## Index

| Package | Rôle |
|---------|------|
| `packages/core/` | Logique partagée |
| `packages/chrome/` | Extension Chrome (manifest v3) |
| `packages/proto/` | Protocol buffers / schéma |

## Build

```bash
npm install
npm run build
```

## Invariants

- Monorepo npm workspaces (pas turborepo/nx)
- `node_modules/` gitignored (~122M)

## NE PAS

- Committer `node_modules/`
- Traiter comme un projet Go
