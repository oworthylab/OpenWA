import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/control-plane.ts',
  out: './src/migrations/control-plane',
  dialect: 'sqlite',
  driver: 'd1-http',
  // Local-only generation; remote apply happens via wrangler.
});
