# CLAUDE.md — whiteout-ext

## Ce que c'est

Extension cross-platform (Chrome, iOS, Android) en TypeScript. Monorepo npm workspaces.

**Attention** : ce n'est **pas du Go**. C'est le seul projet TypeScript/Node du dépôt.

## Structure

```
whiteout-ext/
├── packages/
│   ├── core/              # Logique partagée
│   ├── chrome/            # Extension Chrome (manifest v3)
│   └── proto/             # Protocol buffers / schéma
├── package.json           # npm workspaces root
└── node_modules/          # ~122M (ne pas committer)
```

## Build

```bash
npm install
npm run build
```

## Particularités

- Monorepo npm workspaces (pas turborepo/nx)
- `node_modules/` est volumineux — s'assurer qu'il est gitignored
- Tests E2E disponibles
