import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.js'],
    env: {
      ENCRYPTION_KEY: 'a'.repeat(64),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['server/crypto-utils.js'],
    },
  },
})
