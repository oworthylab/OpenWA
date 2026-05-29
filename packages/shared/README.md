# @openwa/shared

Shared TypeScript types, enums, and constants used across the OpenWA platform (API, Engine, Dashboard, SDK).

## Modules

- `./types` — Core entity types: `Session`, `Message`, `Contact`, `Group`, `Tenant`, `User`
- `./events` — Event payloads (WebSocket, webhooks, internal): `SessionEvent`, `MessageEvent`, `WebhookPayload`
- `./api` — REST API request/response shapes
- `./errors` — Standardized error codes and shapes

## Usage

```ts
import type { Session, MessageStatus } from '@openwa/shared';
import { ERROR_CODES } from '@openwa/shared/errors';
```
