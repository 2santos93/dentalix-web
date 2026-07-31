import type { Config } from 'jest';
import nextJest from 'next/jest.js';

// Pin the suite's timezone. Several specs assert LOCAL-time output from a UTC
// (`...Z`) input — e.g. week-grid-layout.test.ts states "TZ=UTC in tests, so the
// Z time equals local time", and the date/agenda specs format local dates. That
// assumption only holds when TZ is actually UTC: on a machine in, say, CEST
// those specs fail by the offset (09:30Z read as 10:30 local). Setting it here
// (rather than only in the `npm test` script) means a bare `npx jest` or an IDE
// runner is deterministic too — jest loads this config in the parent process and
// workers inherit `process.env`.
process.env.TZ = 'UTC';

const createJestConfig = nextJest({ dir: './' });
const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Playwright e2e specs live in ./e2e and run via `npm run test:e2e`, not jest.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/e2e/'],
};
export default createJestConfig(config);
