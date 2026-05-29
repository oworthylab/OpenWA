# @openwa/validators

Valibot-based request validation schemas. Used by the API for runtime validation; types are derived from schemas with `v.InferInput<>` / `v.InferOutput<>`.

## Modules

- `./auth` — Login, register, API key, token refresh
- `./session` — Create/update session, session config
- `./message` — Send text, media, location, contact
- `./webhook` — Webhook CRUD, payload validation
- `./error` — Format Valibot issues into API error responses
