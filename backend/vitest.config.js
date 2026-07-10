import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run tests in serial to avoid port conflicts
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
