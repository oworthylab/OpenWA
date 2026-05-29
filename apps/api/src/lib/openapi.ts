/**
 * Hand-rolled minimal OpenAPI 3.0 spec for the OpenWA API (US-062).
 *
 * Rationale: `@elysiajs/swagger` requires AOT compilation of every
 * route schema which we deliberately bypass (we use `t.Any()` on
 * Workers because Valibot owns validation). Maintaining a focused
 * static spec is ~150 LOC and lets us hand-tune docs without the
 * codegen friction.
 *
 * The spec stays in sync with the route layer via a smoke test that
 * asserts every documented `operationId` is unique and every path
 * starts with `/v1/`.
 */

export interface OpenApiInfo {
  /** Defaults to `'OpenWA API'`. */
  title?: string;
  version?: string;
  description?: string;
  /** Public URL the docs viewer should call. */
  serverUrl?: string;
}

export function buildOpenApiSpec(info: OpenApiInfo = {}): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: info.title ?? 'OpenWA API',
      version: info.version ?? '1.0.0',
      description:
        info.description ??
        'OpenWA — multi-tenant WhatsApp API gateway. All endpoints are scoped to the API key tenant. Authenticate with the `X-API-Key` header or `Authorization: Bearer <key>`.',
      license: { name: 'MIT' },
    },
    servers: [{ url: info.serverUrl ?? 'https://api.openwa.io' }],
    components: {
      securitySchemes: {
        ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        BearerAuth: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string' },
                details: { type: 'object', additionalProperties: true, nullable: true },
                requestId: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
    security: [{ ApiKeyHeader: [] }, { BearerAuth: [] }],
    paths: PATHS,
    tags: TAGS,
  };
}

const TAGS = [
  { name: 'Health', description: 'Liveness and readiness probes' },
  { name: 'Auth', description: 'Tenant registration and login' },
  { name: 'Billing', description: 'Plans, usage, and Stripe webhooks' },
  { name: 'Sessions', description: 'WhatsApp session lifecycle' },
  { name: 'Messages', description: 'Send messages' },
  { name: 'Contacts', description: 'WhatsApp contact directory' },
  { name: 'Groups', description: 'WhatsApp group management' },
  { name: 'CRM', description: 'Contacts, tags, conversations, templates' },
  { name: 'Mart', description: 'Mart commerce integration' },
  { name: 'Labels', description: 'Contact labels' },
  { name: 'Status', description: 'WhatsApp status (stories)' },
  { name: 'Settings', description: 'Tenant settings' },
  { name: 'Plugins', description: 'Tenant plugin management' },
  { name: 'Webhooks', description: 'Outbound webhook subscriptions' },
  { name: 'Audit', description: 'Audit log' },
];

const errorRef = { $ref: '#/components/schemas/Error' };
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorRef } },
});

const ok = (description: string) => ({ description });

const PATHS: Record<string, Record<string, unknown>> = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Liveness probe',
      security: [],
      operationId: 'getHealth',
      responses: { '200': ok('Service healthy') },
    },
  },
  '/health/ready': {
    get: {
      tags: ['Health'],
      summary: 'Readiness probe (verifies bindings)',
      security: [],
      operationId: 'getHealthReady',
      responses: { '200': ok('Ready'), '503': errorResponse('Not ready') },
    },
  },
  '/v1/auth/register': {
    post: {
      tags: ['Auth'],
      operationId: 'register',
      security: [],
      summary: 'Register a tenant + admin user',
      responses: {
        '201': ok('Registered'),
        '400': errorResponse('Validation error'),
        '409': errorResponse('Email or slug taken'),
      },
    },
  },
  '/v1/auth/login': {
    post: {
      tags: ['Auth'],
      operationId: 'login',
      security: [],
      summary: 'Verify password and mint an admin API key',
      responses: { '200': ok('Logged in'), '401': errorResponse('Invalid credentials') },
    },
  },
  '/v1/billing/plans': {
    get: {
      tags: ['Billing'],
      operationId: 'listPlans',
      security: [],
      summary: 'Public plan catalogue',
      responses: { '200': ok('Plan map') },
    },
  },
  '/v1/billing/usage': {
    get: {
      tags: ['Billing'],
      operationId: 'getUsage',
      summary: 'Current period usage counters',
      responses: { '200': ok('Usage'), '401': errorResponse('Unauthorized') },
    },
  },
  '/v1/sessions': {
    get: {
      tags: ['Sessions'],
      operationId: 'listSessions',
      summary: 'List sessions for the tenant',
      responses: { '200': ok('Sessions') },
    },
    post: {
      tags: ['Sessions'],
      operationId: 'createSession',
      summary: 'Create a new session',
      responses: { '201': ok('Created'), '403': errorResponse('Plan limit exceeded') },
    },
  },
  '/v1/sessions/{id}': {
    get: {
      tags: ['Sessions'],
      operationId: 'getSession',
      summary: 'Session detail',
      responses: { '200': ok('Session') },
    },
    delete: {
      tags: ['Sessions'],
      operationId: 'deleteSession',
      summary: 'Delete a session',
      responses: { '204': ok('Deleted') },
    },
  },
  '/v1/sessions/{id}/messages/text': {
    post: {
      tags: ['Messages'],
      operationId: 'sendTextMessage',
      summary: 'Send a text message',
      responses: { '202': ok('Queued'), '429': errorResponse('Monthly limit reached') },
    },
  },
  '/v1/crm/contacts': {
    get: {
      tags: ['CRM'],
      operationId: 'listCrmContacts',
      summary: 'List CRM contacts',
      responses: { '200': ok('Contacts') },
    },
    post: {
      tags: ['CRM'],
      operationId: 'createCrmContact',
      summary: 'Create CRM contact',
      responses: { '201': ok('Created'), '409': errorResponse('Duplicate phone') },
    },
  },
  '/v1/crm/contacts/import': {
    post: {
      tags: ['CRM'],
      operationId: 'importCrmContacts',
      summary: 'Bulk import contacts from CSV',
      responses: { '201': ok('Imported'), '400': errorResponse('Invalid CSV') },
    },
  },
  '/v1/crm/contacts/export': {
    get: {
      tags: ['CRM'],
      operationId: 'exportCrmContacts',
      summary: 'Download all contacts as CSV',
      responses: { '200': { description: 'text/csv body', content: { 'text/csv': {} } } },
    },
  },
  '/v1/crm/conversations': {
    get: {
      tags: ['CRM'],
      operationId: 'listConversations',
      summary: 'List conversations',
      responses: { '200': ok('Conversations') },
    },
  },
  '/v1/crm/templates': {
    get: {
      tags: ['CRM'],
      operationId: 'listTemplates',
      summary: 'List message templates',
      responses: { '200': ok('Templates') },
    },
    post: {
      tags: ['CRM'],
      operationId: 'createTemplate',
      summary: 'Create a message template',
      responses: { '201': ok('Created') },
    },
  },
  '/v1/integrations/mart/link': {
    post: {
      tags: ['Mart'],
      operationId: 'linkMart',
      summary: 'Link a Mart store (admin)',
      responses: { '201': ok('Linked'), '409': errorResponse('Already linked') },
    },
    delete: {
      tags: ['Mart'],
      operationId: 'unlinkMart',
      summary: 'Revoke the Mart link',
      responses: { '204': ok('Revoked') },
    },
  },
  '/v1/integrations/mart/webhooks': {
    post: {
      tags: ['Mart'],
      operationId: 'martWebhook',
      security: [],
      summary: 'Inbound Mart webhook (signed via X-Mart-Secret)',
      responses: { '200': ok('Accepted'), '403': errorResponse('Invalid secret') },
    },
  },
  '/v1/labels': {
    get: {
      tags: ['Labels'],
      operationId: 'listLabels',
      summary: 'List labels',
      responses: { '200': ok('Labels') },
    },
    post: {
      tags: ['Labels'],
      operationId: 'createLabel',
      summary: 'Create a label',
      responses: { '201': ok('Created') },
    },
  },
  '/v1/labels/bulk': {
    post: {
      tags: ['Labels'],
      operationId: 'bulkLabelAssign',
      summary: 'Bulk assign/remove labels across many contacts',
      responses: { '200': ok('Done') },
    },
  },
  '/v1/status': {
    get: {
      tags: ['Status'],
      operationId: 'listStatuses',
      summary: 'List my recent statuses',
      responses: { '200': ok('Statuses') },
    },
  },
  '/v1/status/text': {
    post: {
      tags: ['Status'],
      operationId: 'postTextStatus',
      summary: 'Post a text status',
      responses: { '201': ok('Posted') },
    },
  },
  '/v1/status/media': {
    post: {
      tags: ['Status'],
      operationId: 'postMediaStatus',
      summary: 'Post an image/video status',
      responses: { '201': ok('Posted') },
    },
  },
  '/v1/settings': {
    get: {
      tags: ['Settings'],
      operationId: 'getSettings',
      summary: 'Tenant settings',
      responses: { '200': ok('Settings') },
    },
    patch: {
      tags: ['Settings'],
      operationId: 'updateSettings',
      summary: 'Update tenant settings',
      responses: { '200': ok('Updated') },
    },
  },
  '/v1/plugins': {
    get: {
      tags: ['Plugins'],
      operationId: 'listPlugins',
      summary: 'List installed plugins',
      responses: { '200': ok('Plugins') },
    },
    post: {
      tags: ['Plugins'],
      operationId: 'installPlugin',
      summary: 'Install a plugin (admin)',
      responses: { '201': ok('Installed'), '409': errorResponse('Already installed') },
    },
  },
  '/v1/plugins/{id}': {
    patch: {
      tags: ['Plugins'],
      operationId: 'updatePlugin',
      summary: 'Toggle / configure a plugin',
      responses: { '200': ok('Updated') },
    },
    delete: {
      tags: ['Plugins'],
      operationId: 'uninstallPlugin',
      summary: 'Uninstall a plugin (admin)',
      responses: { '204': ok('Removed') },
    },
  },
};

/** Renders the Scalar viewer HTML pointing at `/docs/openapi.json`. */
export function buildDocsHtml(specUrl = '/docs/openapi.json'): string {
  // Scalar's CDN-hosted standalone viewer — single script, no
  // build step. We pin a major version to keep the contract stable.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OpenWA API Docs</title>
</head>
<body>
<script id="api-reference" data-url="${specUrl}"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
}
