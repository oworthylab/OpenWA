# Sprint 1 — Foundation

## Sprint Goal

Establish the Bun monorepo with Turborepo pipelines, shared packages (types, validators, database schemas), and CI/CD so the team can develop features in parallel with confidence from Sprint 2 onward.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 1 |
| Start Date | 2026-06-02 (Monday) |
| End Date | 2026-06-13 (Friday) |
| Working Days | 10 |
| Phase | Phase 1 — Foundation |

## Capacity

| Team Member | Role | Available Days | Notes |
|-------------|------|---------------|-------|
| Dev A | Senior Full-Stack | 10 | Leads architecture decisions |
| Dev B | Backend/Infra | 10 | Workers, DOs, databases |
| Dev C | Frontend | 10 | React, TanStack, UI |
| **Total** | | **30 person-days** | ~30 story points capacity |

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies | Status |
|----------|-------|--------|----------|----------|--------------|--------|
| US-001 | Monorepo Initialization | 3 | Dev A | Must-have | None | — |
| US-002 | Code Quality Tooling | 2 | Dev C | Must-have | US-001 | — |
| US-003 | Shared Types Package | 3 | Dev A | Must-have | US-001 | — |
| US-004 | Validation Schemas | 3 | Dev C | Must-have | US-001, US-003 | — |
| US-005 | Database Schema Package | 5 | Dev B | Must-have | US-001, US-003 | — |
| US-006 | CI/CD Pipeline | 3 | Dev B | Must-have | US-001, US-002 | — |

**Total: 19 points** (well within 30-point velocity — remaining capacity reserved for unknowns, documentation, and Sprint 2 prep)

## Day-by-Day Schedule

### Week 1 (June 2–6)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D1 Mon** | US-001: Init Bun workspace, root `package.json`, `turbo.json` | US-001: Support — Wrangler config templates, D1 bindings scaffold | US-001: Support — dashboard package stub, Vite config |
| **D2 Tue** | US-001: Turborepo pipelines (build/test/lint/typecheck), workspace deps | US-005: Begin D1 schema design (control plane tables) | US-002: Biome config, format/lint rules, pre-commit hook |
| **D3 Wed** | US-003: `packages/shared` — core types (Session, Message, Contact, etc.) | US-005: Control plane schema (users, tenants, sessions, api_keys) | US-002: Editor integration, CI lint script, format-on-save |
| **D4 Thu** | US-003: Event types, API request/response types, error codes | US-005: Per-tenant schema (messages, contacts, groups, media) | US-004: Begin `packages/validators` — Valibot setup, auth schemas |
| **D5 Fri** | US-003: Export barrel files, type tests, documentation | US-005: Migrations, seed scripts, D1 local dev setup | US-004: Session validators, message validators, webhook schemas |

### Week 2 (June 9–13)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D6 Mon** | Sprint 2 prep: Baileys fork analysis, adapter interface design | US-005: Index optimization, query helpers, type exports | US-004: Validation error formatting, integration with shared types |
| **D7 Tue** | Sprint 2 prep: Engine package structure, DO architecture spike | US-006: GitHub Actions — lint, typecheck, test matrix | US-004: Unit tests for all validators, edge cases |
| **D8 Wed** | Review all PRs, integration testing across packages | US-006: Deploy pipeline (Wrangler), environment secrets | Code review, fix integration issues |
| **D9 Thu** | Documentation: CONTRIBUTING.md, package READMEs | US-006: Dependency caching, Turborepo remote cache | Sprint 2 prep: TanStack Start research, dashboard scaffold |
| **D10 Fri** | Sprint Review prep, final integration verification | Final CI/CD testing, branch protection rules | Sprint Review prep, demo script |

## Technical Tasks

### US-001: Monorepo Initialization (3 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Initialize Bun workspace | 1h | `bun init`, root `package.json` with `workspaces` field |
| 2 | Configure Turborepo | 2h | `turbo.json` with `build`, `test`, `lint`, `typecheck`, `dev` pipelines; define task dependencies |
| 3 | Create package stubs | 2h | Empty packages: `packages/shared`, `packages/validators`, `packages/db`, `apps/api`, `apps/engine`, `apps/dashboard` |
| 4 | Workspace scripts | 1h | Root scripts: `dev`, `build`, `test`, `lint`, `format`, `clean` |
| 5 | TypeScript project references | 2h | `tsconfig.base.json`, per-package `tsconfig.json` with composite references |
| 6 | Wrangler config templates | 1h | `wrangler.toml` for api and engine apps with D1 binding placeholders |
| 7 | `.gitignore` and workspace hygiene | 30min | Ignore patterns for `node_modules`, `dist`, `.wrangler`, `.turbo` |

### US-002: Code Quality Tooling (2 pts) — Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Biome configuration | 1.5h | `biome.json` — lint rules (recommended + strict), format settings (indent, line width, quotes) |
| 2 | Pre-commit hook | 1h | `lefthook.yml` or `simple-git-hooks` — run `biome check --staged` |
| 3 | Editor integration | 30min | `.vscode/settings.json` — formatOnSave, Biome as default formatter, recommended extensions |
| 4 | CI integration script | 1h | `turbo lint` task that runs `biome ci` across all packages |
| 5 | Ignore patterns | 30min | Exclude generated files, `node_modules`, dist from linting |

### US-003: Shared Types Package (3 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Package setup | 30min | `packages/shared/package.json`, `tsconfig.json`, exports map |
| 2 | Core entity types | 3h | `Session`, `Message`, `Contact`, `Group`, `MediaMessage`, `Tenant`, `User` |
| 3 | Event types | 2h | `SessionEvent`, `MessageEvent`, `WebhookPayload`, discriminated unions |
| 4 | API types | 2h | Request/response types for all planned endpoints, error response shape |
| 5 | Enum & constants | 1h | `SessionStatus`, `MessageStatus`, `MediaType`, error codes |
| 6 | Type tests | 1h | `tsd` or `expect-type` assertions to prevent accidental breaking changes |
| 7 | Barrel exports | 30min | `index.ts` with organized re-exports |

### US-004: Validation Schemas (3 pts) — Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Package setup | 30min | `packages/validators/package.json`, Valibot dependency |
| 2 | Auth schemas | 2h | `LoginSchema`, `RegisterSchema`, `ApiKeyCreateSchema`, `TokenRefreshSchema` |
| 3 | Session schemas | 2h | `CreateSessionSchema`, `UpdateSessionSchema`, `SessionConfigSchema` |
| 4 | Message schemas | 2h | `SendTextSchema`, `SendMediaSchema`, `MessageQuerySchema` |
| 5 | Webhook schemas | 1h | `WebhookConfigSchema`, `WebhookPayloadSchema` |
| 6 | Error formatting | 1h | Utility to convert Valibot issues to API error responses |
| 7 | Unit tests | 2h | Valid/invalid cases for each schema, edge cases (empty strings, oversized payloads) |
| 8 | Integration with shared types | 1h | Ensure `v.Output<>` aligns with shared type definitions |

### US-005: Database Schema Package (5 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Package setup | 1h | `packages/db/package.json`, Drizzle + `drizzle-kit` + `better-sqlite3` (dev) |
| 2 | Control plane schema | 4h | Tables: `users`, `tenants`, `tenant_members`, `sessions`, `api_keys`, `webhooks`, `audit_log` |
| 3 | Per-tenant schema | 3h | Tables: `messages`, `contacts`, `groups`, `group_members`, `media`, `labels` |
| 4 | Relations & indexes | 2h | Drizzle relations, composite indexes for query patterns |
| 5 | Migrations setup | 2h | `drizzle-kit` config for D1, migration generation, `migrate.ts` script |
| 6 | Seed script | 1.5h | Dev seed data for local testing |
| 7 | Query helpers | 2h | Type-safe query builder wrappers, pagination helper |
| 8 | Local D1 dev setup | 1.5h | `wrangler d1` local database, `.dev.vars` template |
| 9 | Type exports | 1h | Inferred types from schema (`InferSelectModel`, `InferInsertModel`) |

### US-006: CI/CD Pipeline (3 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Lint & typecheck workflow | 2h | `.github/workflows/ci.yml` — matrix: lint, typecheck, test; Bun setup, Turborepo cache |
| 2 | Test workflow | 2h | Unit test runner with coverage, Vitest config |
| 3 | Deploy workflow | 2h | `deploy.yml` — Wrangler deploy to staging on `main`, production on tags |
| 4 | Dependency caching | 1h | Bun lockfile cache, Turborepo remote cache (GitHub Actions cache) |
| 5 | Branch protection | 30min | Required checks: lint, typecheck, test pass before merge |
| 6 | Environment secrets | 1h | `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `D1_DATABASE_ID` in GitHub secrets |
| 7 | PR labeling | 30min | Auto-label by path (packages/*, apps/*) |

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Bun workspace resolution issues with Turborepo | Medium | Medium | Dev A has fallback to npm workspaces if needed; test early on D1 |
| 2 | Drizzle D1 adapter limitations (no JSON columns, limited ALTER) | Medium | High | Dev B to spike D1 compatibility on D1; use TEXT + JSON serialize pattern |
| 3 | TypeScript project references slow in large monorepo | Low | Low | Use `composite: true` only where needed; Turborepo handles build order |
| 4 | Biome missing rules team expects (from ESLint migration) | Low | Low | Document any gaps, add custom rules in Sprint 2 if needed |
| 5 | Under-estimation leaves Sprint 2 prep incomplete | Low | Medium | 19 points is well under capacity; buffer days D6-D10 allocated for prep |

## Sprint Review Checklist

- [ ] `bun install` succeeds from clean clone in < 30s
- [ ] `bun run build` builds all packages via Turborepo (parallel)
- [ ] `bun run lint` passes with zero errors across all packages
- [ ] `bun run typecheck` passes with zero errors
- [ ] `bun run test` runs unit tests for validators and db packages
- [ ] `packages/shared` exports all core types; IntelliSense works in consuming packages
- [ ] `packages/validators` — demo schema validation (valid + invalid inputs)
- [ ] `packages/db` — show schema in Drizzle Studio, run migration against local D1
- [ ] GitHub Actions CI runs green on a test PR
- [ ] Deploy workflow successfully deploys a "hello world" Worker to staging

## Definition of Done Verification

```bash
# Clone and install
git clone <repo> && cd openwa-serverless
bun install

# Build all packages
bun run build
# Expected: all packages build successfully, exit code 0

# Lint
bun run lint
# Expected: 0 errors, 0 warnings

# Type check
bun run typecheck
# Expected: 0 errors across all packages

# Unit tests
bun run test
# Expected: all tests pass, coverage > 80% for validators

# Database migrations (local D1)
cd packages/db
bun run db:generate
bun run db:migrate:local
# Expected: migrations apply cleanly to local D1

# Verify Turborepo caching
bun run build  # Second run
# Expected: "cache hit" for all packages, < 1s total

# CI verification
gh workflow run ci.yml --ref main
# Expected: all jobs pass (lint, typecheck, test)
```

---
