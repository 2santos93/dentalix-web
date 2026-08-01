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
  // `.claude/worktrees/` son worktrees de git ANIDADOS dentro del repo (el flujo
  // de trabajo del equipo los crea ahí). Sin ignorarlos, jest entra y corre una
  // COPIA de toda la suite desde esa rama — 33 suites duplicadas que fallan y
  // dejan `npm test` en rojo aunque `src/` esté verde, volviendo inútil la señal.
  // Sus `e2e/` también caían dentro, porque el patrón de abajo está anclado a
  // rootDir y no cubría rutas anidadas.
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/e2e/',
    '<rootDir>/.claude/worktrees/',
  ],
};
export default createJestConfig(config);
