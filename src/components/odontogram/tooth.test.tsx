import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooth } from './tooth';
import type { ToothRecord } from '@/lib/odontogram/odontogram-api';
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

describe('Tooth', () => {
  it('renders the 5 surface regions with accessible names', () => {
    render(<Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />);

    expect(screen.getByRole('button', { name: /diente 11.*vestibular/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /diente 11.*lingual/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /diente 11.*mesial/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /diente 11.*distal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /diente 11.*oclusal/i })).toBeInTheDocument();
  });

  it('renders a group with an aria-label carrying the FDI number', () => {
    render(<Tooth toothNumber="24" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />);
    expect(screen.getByRole('group', { name: /diente 24/i })).toBeInTheDocument();
  });

  it('clicking a surface fires onSelectSurface with that surface', async () => {
    const user = userEvent.setup();
    const onSelectSurface = jest.fn();
    render(<Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={onSelectSurface} />);

    await user.click(screen.getByRole('button', { name: /diente 11.*oclusal/i }));
    expect(onSelectSurface).toHaveBeenCalledWith('OCCLUSAL');

    await user.click(screen.getByRole('button', { name: /diente 11.*mesial/i }));
    expect(onSelectSurface).toHaveBeenCalledWith('MESIAL');
  });

  it('is operable by keyboard: Enter and Space on a surface trigger onSelectSurface', async () => {
    const user = userEvent.setup();
    const onSelectSurface = jest.fn();
    render(<Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={onSelectSurface} />);

    const distal = screen.getByRole('button', { name: /diente 11.*distal/i });
    distal.focus();
    await user.keyboard('{Enter}');
    expect(onSelectSurface).toHaveBeenCalledWith('DISTAL');

    const lingual = screen.getByRole('button', { name: /diente 11.*lingual/i });
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
    const state: ToothState = {
      toothNumber: '11',
      hasRecords: true,
      records: [record()],
      surfaceState: { OCCLUSAL: record() },
      wholeToothRecord: null,
      color: '#DC2626',
    };
    const catalogById = new Map([['cat-1', { color: '#DC2626' }]]);

    render(
      <Tooth
        toothNumber="11"
        state={state}
        catalogById={catalogById}
        onSelectTooth={jest.fn()}
        onSelectSurface={jest.fn()}
      />,
    );

    const occlusal = screen.getByRole('button', { name: /diente 11.*oclusal/i });
    expect(occlusal).toHaveAttribute('style', expect.stringContaining('fill: #DC2626'));
  });

  it('a healthy surface (no record) does not carry an inline fill — it relies on the neutral token class', () => {
    render(<Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />);

    const occlusal = screen.getByRole('button', { name: /diente 11.*oclusal/i });
    expect(occlusal.getAttribute('style') ?? '').not.toContain('fill:');
    expect(occlusal.getAttribute('class')).toContain('fill-surface');
  });

  it('a healthy (unmarked) surface outline uses the higher-contrast muted stroke token, not the low-contrast border token', () => {
    render(<Tooth toothNumber="11" onSelectTooth={jest.fn()} onSelectSurface={jest.fn()} />);

    const occlusal = screen.getByRole('button', { name: /diente 11.*oclusal/i });
    expect(occlusal.getAttribute('class')).toContain('stroke-muted');
    expect(occlusal.getAttribute('class')).not.toContain('stroke-border');
  });
});
