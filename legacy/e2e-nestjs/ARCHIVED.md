# Archived: Legacy NestJS E2E Suite

These tests were written against the original NestJS monolith
(`legacy/api-nestjs/`) and target HTTP routes (`/api/*` on port `2785`)
that the **serverless Cloudflare Workers** rewrite (`apps/api`) no
longer exposes — it serves `/v1/*` on a Worker fetch handler.

This suite is kept only as a reference for the contract the legacy
stack implemented. The live test surface is now:

| Layer | Where |
|---|---|
| Unit + integration | `apps/api/test/*.test.ts` (`bun test` in `apps/api`) |
| Serverless e2e | `apps/api/e2e/*.e2e.test.ts` (`bun test` in `apps/api`) |
| Self-host smoke | `apps/api/e2e/self-host.e2e.test.ts` |
| Multi-tenant isolation | `apps/api/e2e/multi-tenant.e2e.test.ts` |

See [`docs/SELF_HOST.md`](../../docs/SELF_HOST.md) for deployment.

> Do not run these tests in CI — they will fail to build because the
> root Dockerfile no longer ships a NestJS app.
