import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          API_KEY: 'test-api-key',
          JWT_SECRET: 'test-jwt-secret',
        },
      },
    }),
  ],
});
