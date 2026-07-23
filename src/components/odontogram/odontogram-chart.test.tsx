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
});
