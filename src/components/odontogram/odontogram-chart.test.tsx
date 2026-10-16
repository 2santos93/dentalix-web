import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OdontogramChart } from './odontogram-chart';

// The surfaces are `aria-hidden` painted regions (the tooth announces them in
// its own label), so they're located by `data-surface` inside their tooth.
function surfaceRegion(fdi: string, surface: string): Element {
  const tooth = screen.getByRole('group', { name: new RegExp(`^Diente ${fdi},`) });
  const region = tooth.querySelector(`[data-surface="${surface}"]`);
  if (!region) throw new Error(`No ${surface} region on tooth ${fdi}`);
  return region;
}

describe('OdontogramChart', () => {
  it('renders all 32 permanent teeth with their FDI numbers, in the two-row layout', () => {
    render(
      <OdontogramChart
        states={new Map()}
        onSelectTooth={jest.fn()}
        onSelectSurface={jest.fn()}
      />,
    );

    // The arches are labelled `group`s: a `role="row"` with no owning
    // `grid`/`table` is invalid, and an AT drops it along with its label.
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    const upperRow = screen.getByRole('group', { name: 'Arcada superior' });
    const lowerRow = screen.getByRole('group', { name: 'Arcada inferior' });

    // Spot-check the layout boundaries documented in fdi.ts.
    expect(within(upperRow).getByText('18')).toBeInTheDocument();
    expect(within(upperRow).getByText('11')).toBeInTheDocument();
    expect(within(upperRow).getByText('21')).toBeInTheDocument();
    expect(within(upperRow).getByText('28')).toBeInTheDocument();
    expect(within(lowerRow).getByText('48')).toBeInTheDocument();
    expect(within(lowerRow).getByText('41')).toBeInTheDocument();
    expect(within(lowerRow).getByText('31')).toBeInTheDocument();
    expect(within(lowerRow).getByText('38')).toBeInTheDocument();

    // 32 tooth groups total.
    expect(screen.getAllByRole('group').filter((g) => /^Diente /.test(g.getAttribute('aria-label') ?? ''))).toHaveLength(32);
  });

  it('clicking a tooth number fires onSelectTooth with its FDI number', async () => {
    const user = userEvent.setup();
    const onSelectTooth = jest.fn();
    render(
      <OdontogramChart
        states={new Map()}
        selectedTooth={undefined}
        onSelectTooth={onSelectTooth}
        onSelectSurface={jest.fn()}
      />,
    );

    await user.click(screen.getByText('11'));
    expect(onSelectTooth).toHaveBeenCalledWith('11');
  });

  it('clicking a surface fires onSelectSurface with the FDI number and surface', async () => {
    const user = userEvent.setup();
    const onSelectSurface = jest.fn();
    render(
      <OdontogramChart
        states={new Map()}
        onSelectTooth={jest.fn()}
        onSelectSurface={onSelectSurface}
      />,
    );

    await user.click(surfaceRegion('21', 'OCCLUSAL'));
    expect(onSelectSurface).toHaveBeenCalledWith('21', 'OCCLUSAL');
  });

  it('wraps the chart in an overflow-x-auto container for mobile scroll', () => {
    const { container } = render(
      <OdontogramChart states={new Map()} onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />,
    );
    expect(container.querySelector('.overflow-x-auto')).toBeInTheDocument();
  });

  it('labels the four quadrants from the patient point of view', () => {
    render(<OdontogramChart states={new Map()} onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />);

    // Quadrant 1 is the patient's upper RIGHT and is drawn on the chart's left.
    expect(screen.getByText(/Superior derecho · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Superior izquierdo · 2/)).toBeInTheDocument();
    expect(screen.getByText(/Inferior izquierdo · 3/)).toBeInTheDocument();
    expect(screen.getByText(/Inferior derecho · 4/)).toBeInTheDocument();
  });

  it('draws molars wider than incisors so the row reads as an arch', () => {
    render(<OdontogramChart states={new Map()} onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />);

    const molar = screen.getByRole('group', { name: /^Diente 16,/ });
    const incisor = screen.getByRole('group', { name: /^Diente 11,/ });
    expect(Number(molar.getAttribute('width'))).toBeGreaterThan(
      Number(incisor.getAttribute('width')),
    );
    // Non-uniform stretch of one shared 40×40 geometry.
    expect(molar).toHaveAttribute('preserveAspectRatio', 'none');
  });

  describe('keyboard navigation (roving tabindex)', () => {
    function renderChart(overrides: Partial<Parameters<typeof OdontogramChart>[0]> = {}) {
      return render(
        <OdontogramChart
          states={new Map()}
          onSelectTooth={jest.fn()}
          onSelectSurface={jest.fn()}
          {...overrides}
        />,
      );
    }

    it('spends exactly one tab stop on the whole chart', () => {
      renderChart();
      const tabbable = screen
        .getAllByRole('button')
        .filter((el) => el.getAttribute('tabindex') === '0');
      expect(tabbable).toHaveLength(1);
      // ...and it's the first tooth of the upper arch by default.
      expect(tabbable[0]).toHaveAccessibleName('18');
    });

    it('starts on the selected tooth when there is one', () => {
      renderChart({ selectedTooth: '36' });
      const tabbable = screen
        .getAllByRole('button')
        .filter((el) => el.getAttribute('tabindex') === '0');
      expect(tabbable).toHaveLength(1);
      expect(tabbable[0]).toHaveAccessibleName('36');
    });

    it('moves along the arch with left/right and crosses arches with up/down', async () => {
      const user = userEvent.setup();
      renderChart({ selectedTooth: '11' });

      await user.tab();
      expect(screen.getByRole('button', { name: '11' })).toHaveFocus();

      // Upper arch reads left→right as 18..11, 21..28, so right of 11 is 21.
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', { name: '21' })).toHaveFocus();

      await user.keyboard('{ArrowLeft}');
      expect(screen.getByRole('button', { name: '11' })).toHaveFocus();

      // Same column of the lower arch: 11 sits above 41.
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('button', { name: '41' })).toHaveFocus();

      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('button', { name: '11' })).toHaveFocus();
    });

    it('clamps at the ends of an arch instead of wrapping, and Home/End jump to them', async () => {
      const user = userEvent.setup();
      renderChart({ selectedTooth: '18' });

      await user.tab();
      await user.keyboard('{ArrowLeft}');
      expect(screen.getByRole('button', { name: '18' })).toHaveFocus();

      await user.keyboard('{End}');
      expect(screen.getByRole('button', { name: '28' })).toHaveFocus();

      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('button', { name: '28' })).toHaveFocus();

      await user.keyboard('{Home}');
      expect(screen.getByRole('button', { name: '18' })).toHaveFocus();
    });

    it('selects the focused tooth with Enter', async () => {
      const user = userEvent.setup();
      const onSelectTooth = jest.fn();
      renderChart({ selectedTooth: '11', onSelectTooth });

      await user.tab();
      await user.keyboard('{ArrowRight}{Enter}');
      expect(onSelectTooth).toHaveBeenCalledWith('21');
    });

    it('keeps the surfaces out of the tab order (they are reachable by pointer and via the form)', () => {
      const { container } = renderChart();
      const surfaces = container.querySelectorAll('polygon[data-surface]');
      expect(surfaces).toHaveLength(32 * 5);
      for (const surface of surfaces) {
        expect(surface).toHaveAttribute('tabindex', '-1');
      }
    });

    it('keeps the surfaces out of the screen reader buffer too — 32 stops, not 192', () => {
      const { container } = renderChart();

      // No surface announces itself...
      for (const surface of container.querySelectorAll('polygon[data-surface]')) {
        expect(surface).toHaveAttribute('aria-hidden', 'true');
      }
      expect(screen.queryAllByRole('button', { name: /cara/i })).toHaveLength(0);
      // ...and the only announcements left are the 32 teeth.
      const teeth = screen
        .getAllByRole('group')
        .filter((g) => /^Diente /.test(g.getAttribute('aria-label') ?? ''));
      expect(teeth).toHaveLength(32);
    });
  });
});

describe('OdontogramChart — dentición temporal y mixta (DX-120)', () => {
  const mixed7 = (position: string) =>
    // Niño de 7 años: incisivos mudando, primeros molares permanentes, el resto temporal.
    Number(position[1]) <= 2 ? 'MIXED' : Number(position[1]) === 6 ? 'PERMANENT' : 'PRIMARY';

  it('dibuja los temporales 51-85 en sus posiciones y, en mixta, los dos dientes', () => {
    render(
      <OdontogramChart
        states={new Map()}
        dentitionOf={mixed7}
        onSelectTooth={jest.fn()}
        onSelectSurface={jest.fn()}
      />,
    );
    // Mixta: el 11 y el 51 a la vez.
    expect(screen.getByRole('group', { name: /^Diente 11,/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Diente 51 (temporal), sano' })).toBeInTheDocument();
    // Temporal: el 55, no el 15.
    expect(screen.getByRole('group', { name: 'Diente 55 (temporal), sano' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^Diente 15,/ })).not.toBeInTheDocument();
    // Molar sin predecesor y sin erupcionar.
    expect(screen.getByRole('group', { name: 'Diente 17, sin erupcionar' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Diente 16,/ })).toBeInTheDocument();
  });

  it('un niño de 4 años: 20 temporales y los molares permanentes sin erupcionar', () => {
    render(
      <OdontogramChart
        states={new Map()}
        dentitionOf={() => 'PRIMARY'}
        onSelectTooth={jest.fn()}
        onSelectSurface={jest.fn()}
      />,
    );
    expect(screen.getAllByRole('group', { name: /\(temporal\)/ })).toHaveLength(20);
    expect(screen.getAllByRole('group', { name: /sin erupcionar/ })).toHaveLength(12);
  });

  it('las flechas bajan de la fila de permanentes a la de temporales de la misma columna', async () => {
    const user = userEvent.setup();
    render(
      <OdontogramChart
        states={new Map()}
        dentitionOf={mixed7}
        selectedTooth="11"
        onSelectTooth={jest.fn()}
        onSelectSurface={jest.fn()}
      />,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: '11' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: '51' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: '81' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: '41' })).toHaveFocus();
  });

  it('elegir un molar sin erupcionar lo selecciona', async () => {
    const user = userEvent.setup();
    const onSelectTooth = jest.fn();
    render(
      <OdontogramChart
        states={new Map()}
        dentitionOf={() => 'PRIMARY'}
        onSelectTooth={onSelectTooth}
        onSelectSurface={jest.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: '16' }));
    expect(onSelectTooth).toHaveBeenCalledWith('16');
  });
});
