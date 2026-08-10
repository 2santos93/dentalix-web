import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooth } from './tooth';
import type { ToothRecord, ToothSurface } from '@/lib/odontogram/odontogram-api';
import type { ToothState } from '@/lib/odontogram/projection';

function record(overrides: Partial<ToothRecord> = {}): ToothRecord {
  return {
    id: 'rec-1',
    toothNumber: '11',
    surfaces: ['OCCLUSAL'],
    kind: 'DIAGNOSIS',
    catalogItemId: 'cat-1',
    status: 'COMPLETED',
    recordedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

// The surfaces are `aria-hidden` painted regions (the tooth announces them in
// its own label), so they have no role and no accessible name: they're located
// by `data-surface`.
function surfaceRegion(container: HTMLElement, surface: ToothSurface): Element {
  const region = container.querySelector(`[data-surface="${surface}"]`);
  if (!region) throw new Error(`No surface region for ${surface}`);
  return region;
}

function state(overrides: Partial<ToothState> = {}): ToothState {
  return {
    toothNumber: '11',
    hasRecords: true,
    records: [record()],
    surfaceState: { OCCLUSAL: record() },
    wholeToothRecord: null,
    color: null,
    ...overrides,
  };
}

describe('Tooth', () => {
  it('draws the 5 surface regions but keeps them out of the accessibility tree', () => {
    const { container } = render(
      <Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );

    const regions = container.querySelectorAll('polygon[data-surface]');
    expect(regions).toHaveLength(5);
    for (const region of regions) {
      expect(region).toHaveAttribute('aria-hidden', 'true');
    }
    // The bug being fixed: every surface used to be a `role="button"` with its
    // own name — 5 extra stops per tooth in the screen reader's buffer.
    expect(container.querySelectorAll('polygon[role="button"]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /cara/i })).not.toBeInTheDocument();
  });

  it('renders a group with an aria-label carrying the FDI number', () => {
    render(<Tooth toothNumber="24" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />);
    expect(screen.getByRole('group', { name: /diente 24/i })).toBeInTheDocument();
  });

  it('announces a healthy tooth as such', () => {
    render(<Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />);
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Diente 11, sano');
  });

  it('folds a single affected surface into the tooth label', () => {
    render(
      <Tooth toothNumber="11" state={state()} onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );
    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Diente 11, 1 registro, cara oclusal',
    );
  });

  it('lists several affected surfaces in one readable string, not a comma soup', () => {
    const three = state({
      records: [record(), record({ id: 'rec-2' }), record({ id: 'rec-3' })],
      surfaceState: {
        VESTIBULAR: record({ id: 'rec-2', surfaces: ['VESTIBULAR'] }),
        MESIAL: record({ id: 'rec-3', surfaces: ['MESIAL'] }),
        OCCLUSAL: record(),
      },
    });

    render(
      <Tooth toothNumber="11" state={three} onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );

    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Diente 11, 3 registros, caras vestibular, mesial y oclusal',
    );
  });

  it('announces a whole-tooth record as every surface instead of listing all five', () => {
    const extracted = state({
      records: [record({ surfaces: [] })],
      surfaceState: {},
      wholeToothRecord: record({ surfaces: [] }),
    });

    render(
      <Tooth
        toothNumber="11"
        state={extracted}
        onSelectTooth={jest.fn()}
        onSelectSurface={jest.fn()}
      />,
    );

    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Diente 11, 1 registro, todas las caras',
    );
  });

  it('clicking a surface fires onSelectSurface with that surface', async () => {
    const user = userEvent.setup();
    const onSelectSurface = jest.fn();
    const { container } = render(
      <Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={onSelectSurface} />,
    );

    await user.click(surfaceRegion(container, 'OCCLUSAL'));
    expect(onSelectSurface).toHaveBeenCalledWith('OCCLUSAL');

    await user.click(surfaceRegion(container, 'MESIAL'));
    expect(onSelectSurface).toHaveBeenCalledWith('MESIAL');
  });

  it('is operable by keyboard: Enter and Space on a surface trigger onSelectSurface', async () => {
    const user = userEvent.setup();
    const onSelectSurface = jest.fn();
    const { container } = render(
      <Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={onSelectSurface} />,
    );

    const distal = surfaceRegion(container, 'DISTAL') as SVGPolygonElement;
    distal.focus();
    await user.keyboard('{Enter}');
    expect(onSelectSurface).toHaveBeenCalledWith('DISTAL');

    const lingual = surfaceRegion(container, 'LINGUAL') as SVGPolygonElement;
    lingual.focus();
    await user.keyboard(' ');
    expect(onSelectSurface).toHaveBeenCalledWith('LINGUAL');
  });

  it('clicking the tooth number label fires onSelectTooth', async () => {
    const user = userEvent.setup();
    const onSelectTooth = jest.fn();
    render(<Tooth toothNumber="16" onSelectTooth={onSelectTooth} onSelectSurface={jest.fn()} />);

    await user.click(screen.getByText('16'));
    expect(onSelectTooth).toHaveBeenCalledTimes(1);
  });

  it('applies the catalog color to a surface that has a matching record', () => {
    const catalogById = new Map([['cat-1', { color: '#DC2626' }]]);

    const { container } = render(
      <Tooth
        toothNumber="11"
        state={state({ color: '#DC2626' })}
        catalogById={catalogById}
        onSelectTooth={jest.fn()}
        onSelectSurface={jest.fn()}
      />,
    );

    expect(surfaceRegion(container, 'OCCLUSAL')).toHaveAttribute(
      'style',
      expect.stringContaining('fill: #DC2626'),
    );
  });

  it('a healthy surface (no record) does not carry an inline fill — it relies on the neutral token class', () => {
    const { container } = render(
      <Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );

    const occlusal = surfaceRegion(container, 'OCCLUSAL');
    expect(occlusal.getAttribute('style') ?? '').not.toContain('fill:');
    expect(occlusal.getAttribute('class')).toContain('fill-surface');
  });

  it('a healthy (unmarked) surface outline uses the higher-contrast muted stroke token, not the low-contrast border token', () => {
    const { container } = render(
      <Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );

    const occlusal = surfaceRegion(container, 'OCCLUSAL');
    expect(occlusal.getAttribute('class')).toContain('stroke-muted');
    expect(occlusal.getAttribute('class')).not.toContain('stroke-border');
  });

  it('mirrors the shared geometry per quadrant (vestibular outward, mesial toward the midline)', () => {
    // Quadrant 2 is the orientation the geometry is authored in.
    const { container: q2 } = render(
      <Tooth toothNumber="21" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );
    expect(q2.querySelector('g')).not.toHaveAttribute('transform');

    // Quadrant 1 sits in the chart's left half -> mesial must face right.
    const { container: q1 } = render(
      <Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );
    expect(q1.querySelector('g')).toHaveAttribute('transform', 'translate(40, 0) scale(-1, 1)');

    // Quadrant 4: lower arch AND left half -> both mirrors.
    const { container: q4 } = render(
      <Tooth toothNumber="41" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );
    expect(q4.querySelector('g')).toHaveAttribute('transform', 'translate(40, 40) scale(-1, -1)');
  });

  it('keeps every outline at 1px even though narrow teeth stretch the viewBox', () => {
    const { container } = render(
      <Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
    for (const polygon of container.querySelectorAll('polygon')) {
      expect(polygon).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    }
  });

  it('puts the FDI number on the arch outer edge as asked (above for the upper arch)', () => {
    const { container } = render(
      <Tooth
        toothNumber="16"
        numberPlacement="above"
        onSelectTooth={jest.fn()}
        onSelectSurface={jest.fn()}
      />,
    );
    const children = Array.from(container.firstElementChild?.children ?? []);
    expect(children[0].tagName).toBe('BUTTON');
    expect(children[1].tagName.toLowerCase()).toBe('svg');
  });

  it('is a single tooth-level tab stop, with the surfaces out of the tab order', () => {
    const { container } = render(
      <Tooth toothNumber="11" tabbable onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: '11' })).toHaveAttribute('tabindex', '0');
    expect(surfaceRegion(container, 'OCCLUSAL')).toHaveAttribute('tabindex', '-1');
  });

  it('marks the selected tooth on its FDI control for assistive tech', () => {
    render(<Tooth toothNumber="11" selected onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />);
    expect(screen.getByRole('button', { name: '11' })).toHaveAttribute('aria-pressed', 'true');
  });
});
