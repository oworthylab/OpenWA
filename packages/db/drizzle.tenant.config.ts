import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/tenant.ts',
  out: './src/migrations/tenant',
  dialect: 'sqlite',
  driver: 'd1-http',
});
