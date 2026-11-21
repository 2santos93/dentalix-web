import { test } from '../support/test';
import { sweepSuite, SWEEP_SIZES } from '../support/responsive-sweep';

// DX-587: barrido responsive a 844×390 (un fichero por tamaño: la CI reparte por fichero).
const sweep = sweepSuite(SWEEP_SIZES['844x390']);

test.beforeAll(async ({ browser, playwright }) => sweep.beforeAll({ browser, playwright }));
test.afterAll(async () => sweep.afterAll());
for (const group of sweep.groups) {
  test(group.title, async ({}, testInfo) => sweep.run(group, testInfo));
}
