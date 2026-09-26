import { defineConfig } from 'vite';

// `npm test` runs the fast suites; the slow headless balance harness runs with `npm run balance`.
const balance = process.env.TD_BALANCE === '1';

export default defineConfig({
  server: { port: 5173 },
  test: {
    include: balance ? ['tests/balance/**/*.test.ts'] : ['tests/**/*.test.ts'],
    exclude: balance ? [] : ['tests/balance/**', 'node_modules/**'],
    environment: 'node',
    testTimeout: balance ? 600_000 : 20_000,
  },
} as Parameters<typeof defineConfig>[0]);
