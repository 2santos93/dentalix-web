import { fireEvent, render, screen } from '@testing-library/react';
import { NewPerioExamModal } from './new-perio-exam-modal';
import { createPerioExam } from '@/lib/perio/perio-api';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/perio/perio-api', () => ({
  ...jest.requireActual('../../lib/perio/perio-api'),
  createPerioExam: jest.fn(),
}));

const mockedCreate = createPerioExam as jest.MockedFunction<typeof createPerioExam>;

describe('NewPerioExamModal', () => {
  beforeEach(() => mockedCreate.mockReset());

  function renderModal(hasPrevious: boolean) {
    const onCreated = jest.fn();
    render(
      <NewPerioExamModal
        open
        onOpenChange={jest.fn()}
        token="tok"
        patientId="p1"
        hasPrevious={hasPrevious}
        onCreated={onCreated}
      />,
    );
    return onCreated;
  }

  it('sin tocar la fecha deja que la API ponga «hoy» de la clínica y copia omitidos', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ id: 'e1' } as never);
    const onCreated = renderModal(true);
    await user.click(screen.getByRole('button', { name: 'Crear examen' }));
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', {
      examDate: undefined,
      notes: undefined,
      copySkippedFromLast: true,
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('envía la fecha elegida y no ofrece copiar si no hay examen previo', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ id: 'e1' } as never);
    renderModal(false);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fecha del examen'), {
      target: { value: '2026-04-15' },
    });
    await user.click(screen.getByRole('button', { name: 'Crear examen' }));
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', {
      examDate: '2026-04-15',
      notes: undefined,
      copySkippedFromLast: false,
    });
  });
});
