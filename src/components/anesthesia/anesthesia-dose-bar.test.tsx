import { render, screen } from '@testing-library/react';
import { AnesthesiaDoseBar, doseBarCopy } from './anesthesia-dose-bar';
import type { AnesthesiaDoseSummary } from '@/lib/anesthesia/anesthesia-api';

function summary(overrides: Partial<AnesthesiaDoseSummary>): AnesthesiaDoseSummary {
  return {
    rulesVersion: 'ANESTHESIA_DOSE_V1',
    weightKg: 20,
    totalMg: 72,
    byAnesthetic: [
      {
        name: 'Lidocaína 2 %',
        activeIngredient: 'Lidocaína',
        concentrationPct: 2,
        carpules: 2,
        mg: 72,
        maxMg: 140,
        percent: 51,
      },
    ],
    percent: 51,
    level: 'OK',
    alerts: [],
    ...overrides,
  };
}

describe('AnesthesiaDoseBar (DX-307)', () => {
  it('bajo el 80 %: barra con el % y sin aviso', () => {
    render(<AnesthesiaDoseBar summary={summary({})} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '51');
    expect(screen.getByText(/72 mg · 51 % del máximo/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(doseBarCopy.warning)).not.toBeInTheDocument();
  });

  it('desde el 80 %: aviso (status), no bloqueo', () => {
    render(<AnesthesiaDoseBar summary={summary({ percent: 86, totalMg: 90, level: 'WARNING' })} />);
    expect(screen.getByRole('status')).toHaveTextContent(doseBarCopy.warning);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('desde el 100 %: alerta de bloqueo y la barra llena aunque pase de 100', () => {
    render(<AnesthesiaDoseBar summary={summary({ percent: 146, totalMg: 204, level: 'EXCEEDED' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(doseBarCopy.exceeded);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', '146 % del máximo');
  });

  it('con varios anestésicos explica la suma de fracciones', () => {
    render(
      <AnesthesiaDoseBar
        summary={summary({
          percent: 100,
          totalMg: 140,
          level: 'EXCEEDED',
          byAnesthetic: [
            { name: 'Lidocaína', activeIngredient: 'Lidocaína', concentrationPct: 2, carpules: 2, mg: 72, maxMg: 140, percent: 51 },
            { name: 'Articaína', activeIngredient: 'Articaína', concentrationPct: 4, carpules: 1, mg: 68, maxMg: 140, percent: 49 },
          ],
        })}
      />,
    );
    expect(screen.getByText('Lidocaína: 2 carp. · 72 de 140 mg (51 %)')).toBeInTheDocument();
    expect(screen.getByText(doseBarCopy.sum)).toBeInTheDocument();
  });

  it('sin peso: no hay barra y dice que falta el peso', () => {
    render(<AnesthesiaDoseBar summary={summary({ percent: null, weightKg: null, level: 'NO_WEIGHT' })} />);
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.getByText('Dosis máxima no calculada: falta el peso.')).toBeInTheDocument();
  });
});
