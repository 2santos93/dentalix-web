import { render, screen } from '@testing-library/react';
import { ImportProgress } from './import-progress';
import { regionalFormat } from '@/lib/format/regional-format';
import { balancesFixture, batchFixture } from '@/lib/test/patient-imports';

const running = batchFixture({
  status: 'RUNNING',
  progress: {
    preparedRows: 10_000,
    processedRows: 1234,
    createdCount: 1200,
    updatedCount: 34,
    skippedCount: 0,
    failedCount: 0,
    percent: 12,
  },
  balances: balancesFixture({
    preparedCount: 2500,
    progress: { processed: 1500, created: 1499, skipped: 1, ambiguous: 0, existing: 0 },
  }),
});

describe('ImportProgress con el formato de la sede (G1-B)', () => {
  it('import progress en-US shows 1,234 de 10,000 filas procesadas', () => {
    render(
      <ImportProgress
        batch={running}
        headingId="h"
        onReport={jest.fn()}
        fmt={regionalFormat({ locale: 'en-US', hourCycle: 'h12' })}
      />,
    );
    expect(screen.getByText('1,234 de 10,000 filas procesadas')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('Saldos migrados: 1,500 de 2,500')).toBeInTheDocument();
    // El plural sale del número, no del texto formateado.
    expect(screen.getByText(/^1 saldo no se creó/)).toBeInTheDocument();
  });

  it('de-DE separa los miles con punto', () => {
    render(
      <ImportProgress
        batch={running}
        headingId="h"
        onReport={jest.fn()}
        fmt={regionalFormat({ locale: 'de-DE', hourCycle: 'h23' })}
      />,
    );
    expect(screen.getByText('1.234 de 10.000 filas procesadas')).toBeInTheDocument();
  });

  it('sin formato de la sede: «—» en los recuentos, nunca otro formato', () => {
    render(<ImportProgress batch={running} headingId="h" onReport={jest.fn()} fmt={null} />);
    expect(screen.getByText('— de — filas procesadas')).toBeInTheDocument();
    expect(screen.queryByText(/1[.,]234/)).not.toBeInTheDocument();
  });
});
