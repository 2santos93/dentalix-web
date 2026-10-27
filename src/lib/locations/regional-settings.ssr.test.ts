/**
 * @jest-environment node
 */
import { browserHourCycle, browserLocale } from './regional-settings';

describe('browser suggestions on the server (SSR, no window)', () => {
  it('browserLocale and browserHourCycle are null without window, never a value of the server', () => {
    expect(typeof window).toBe('undefined');
    expect(browserLocale()).toBeNull();
    expect(browserHourCycle()).toBeNull();
  });
});
