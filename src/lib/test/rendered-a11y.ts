import { execFileSync } from 'node:child_process';

/** Send real component renders to Chromium with the project's compiled CSS. No app or API. */
export function auditRenderedControls(snapshots: { html: string; selector: string; viewport?: { width: number; height: number } }[]) {
  const reports = JSON.parse(execFileSync(process.execPath, ['e2e/support/audit-rendered-controls.mjs'], {
    input: JSON.stringify(snapshots), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  })) as { version: string; html: string; geometry: { width: number; height: number };
    spans: { text: string; width: number; scrollWidth: number }[];
    violations: { id: string; impact: string; nodes: unknown[] }[] }[];
  expect(reports.length).toBeGreaterThan(0);
  for (const report of reports) {
    expect(report.version).toBe('4.14.0');
    expect({ html: report.html, violations: report.violations }).toEqual({ html: report.html, violations: [] });
  }
  return reports;
}
