# Contributing to OpenWA

Thanks for your interest! This document explains how to set up the monorepo and submit changes.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Git
- (Optional) Wrangler CLI for Cloudflare deployments: `bun add -g wrangler`

## Repository layout

```
apps/
  api/         # Elysia REST API (Cloudflare Workers)
  engine/      # WhatsApp engine (Durable Object host)
  dashboard/   # TanStack Start dashboard (Sprint 4 — stub)
packages/
  shared/      # Cross-cutting types, enums, error codes
  validators/  # Valibot schemas
  db/          # Drizzle ORM schemas + helpers (D1)
e2e/           # Backend e2e (Jest, hits the deployed API)
e2e-frontend/  # Frontend e2e (Playwright)
docs/          # Spec, sprint plans, runbooks
legacy/        # Archived NestJS monolith (reference only)
```

## Getting started

```bash
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA
git checkout serverless
bun install
bun run build
bun run test
```

## Day-to-day commands

| Command | Purpose |
|---------|---------|
| `bun run dev` | Run all `dev` tasks (API, Engine, Dashboard) in parallel |
| `bun run build` | Build all workspaces via Turborepo |
| `bun run test` | Run unit tests across all packages |
| `bun run lint` | Lint with Biome |
| `bun run typecheck` | TypeScript no-emit checks |
| `bun run format` | Format with Biome |

Run a single workspace task:

```bash
bun run --filter @openwa/shared test
bun run --filter @openwa/api dev
```

## Code style

- **Formatter & linter:** [Biome](https://biomejs.dev) (`biome.json`)
- **Pre-commit hooks:** [Lefthook](https://lefthook.dev) (`lefthook.yml`) runs Biome on staged files
- **Commit messages:** Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …)

## Pull requests

1. Branch from `serverless`: `git switch -c feat/your-feature`
2. Make changes, run `bun run lint && bun run typecheck && bun run test`
3. Push and open a PR against `serverless`
4. Ensure CI passes
5. Request review from at least one maintainer

## License

By contributing, you agree your contributions are licensed under the MIT License.
