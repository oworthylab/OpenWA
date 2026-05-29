# @openwa/db

Drizzle ORM schemas, migrations, and query helpers for OpenWA's two D1 database tiers:

1. **Control Plane** — singleton: users, tenants, members, sessions registry, api keys, webhooks, audit log
2. **Tenant DB** — one per tenant (~50k allowed): messages, contacts, groups, group members, media, labels

## Workflow

```bash
# Generate migrations from schema changes
bun run db:generate:cp
bun run db:generate:tenant

# Apply migrations to local D1
bun run db:migrate:local:cp
bun run db:migrate:local:tenant

# Explore data
bun run db:studio:cp
```
