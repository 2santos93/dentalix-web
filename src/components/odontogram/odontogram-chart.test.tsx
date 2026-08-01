import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OdontogramChart } from './odontogram-chart';

describe('OdontogramChart', () => {
  it('renders all 32 permanent teeth with their FDI numbers, in the two-row layout', () => {
    render(
      <OdontogramChart
        states={new Map()}
        onSelectTooth={jest.fn()}
        onSelectSurface={jest.fn()}
      />,
    );

    const upperRow = screen.getByRole('row', { name: /superior/i });
    const lowerRow = screen.getByRole('row', { name: /inferior/i });

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

    await user.click(screen.getByRole('button', { name: /diente 21.*oclusal/i }));
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
      renderChart();
      const surfaces = screen.getAllByRole('button', { name: /cara (vestibular|lingual|mesial|distal|oclusal)/i });
      expect(surfaces).toHaveLength(32 * 5);
      for (const surface of surfaces) {
        expect(surface).toHaveAttribute('tabindex', '-1');
      }
    });
  });
});
