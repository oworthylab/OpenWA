# OpenWA End-to-End Tests

Stack-agnostic e2e tests that validate the OpenWA API Gateway behavior through pure HTTP requests. These tests are designed to work regardless of the underlying framework — whether you use NestJS, Hono, Express, or any other stack.

## Design Principles

1. **Framework-agnostic**: Tests use only HTTP/WebSocket. No NestJS testing utilities.
2. **Black-box testing**: Tests treat the API as an opaque service.
3. **Docker-based**: Services run in containers, matching production.
4. **Self-contained**: Each test suite sets up and tears down its own data.
5. **Sequential**: Tests run in order (numbered files) to test progressive flows.

## Quick Start

```bash
cd e2e

# Install test dependencies
npm install

# Start services and run tests (auto-cleans up)
npm run e2e

# Or manually:
npm run docker:up    # Start API in Docker
npm test             # Run all tests
npm run docker:down  # Stop and cleanup
```

## Running Individual Test Suites

```bash
npm run test:health      # Health endpoints only
npm run test:auth        # Authentication & API keys
npm run test:sessions    # Session management
npm run test:messages    # Message sending
npm run test:webhooks    # Webhook CRUD
npm run test:contacts    # Contact endpoints
npm run test:groups      # Group endpoints
npm run test:settings    # Settings management
npm run test:stats       # Statistics
npm run test:audit       # Audit logs
npm run test:infra       # Infrastructure
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_BASE_URL` | `http://localhost:2785/api` | API base URL |
| `API_KEY` | `dev-admin-key` | Admin API key (dev mode default) |
| `WS_URL` | `ws://localhost:2785` | WebSocket base URL |

## Test Structure

```
e2e/
├── docker-compose.e2e.yml    # Docker setup for test env
├── package.json              # Test dependencies
├── jest.config.js            # Jest configuration
├── tsconfig.json             # TypeScript config
├── helpers/
│   └── api-client.ts        # Stack-agnostic HTTP client
├── setup/
│   ├── global-setup.ts      # Wait for API health before tests
│   └── global-teardown.ts   # Cleanup
└── tests/
    ├── 01-health.e2e.ts     # Health probes (public)
    ├── 02-auth.e2e.ts       # Auth & API key lifecycle
    ├── 03-sessions.e2e.ts   # Session CRUD & lifecycle
    ├── 04-messages.e2e.ts   # Message validation
    ├── 05-webhooks.e2e.ts   # Webhook management
    ├── 06-contacts.e2e.ts   # Contact operations
    ├── 07-groups.e2e.ts     # Group operations
    ├── 08-settings.e2e.ts   # Settings management
    ├── 09-stats.e2e.ts      # Statistics
    ├── 10-audit.e2e.ts      # Audit logging
    ├── 11-infra.e2e.ts      # Infrastructure
    ├── 12-status.e2e.ts     # WhatsApp Stories
    ├── 13-labels.e2e.ts     # Business labels
    ├── 14-catalog.e2e.ts    # Business catalog
    ├── 15-channels.e2e.ts   # Newsletters
    ├── 16-plugins.e2e.ts    # Plugin management
    ├── 17-api-contract.e2e.ts # API format & security
    ├── 18-websocket.e2e.ts  # WebSocket connectivity
    └── 19-workflows.e2e.ts  # Full integration workflows
```

## Using as Validation for Stack Migration

When migrating to a different framework (e.g., NestJS → Hono):

1. Keep these tests unchanged
2. Implement the new stack
3. Run `npm run e2e`
4. All tests should pass with the same API contract

The tests validate:
- Correct HTTP status codes
- Response body structure
- Authentication enforcement
- Role-based access control
- Error handling patterns
- Endpoint availability
- Data lifecycle (CRUD operations)
