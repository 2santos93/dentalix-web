import { render, screen, waitFor } from '@testing-library/react';
import { saveCommissionRule } from '@/lib/commissions/commissions-api';
import { setupUser } from '@/lib/test/user';
import { CommissionRuleDialog, commissionRuleDialogCopy as copy } from './commission-rule-dialog';
import { DRA_X, makeRuleRow } from './commissions-fixtures';

jest.mock('../../lib/commissions/commissions-api', () => ({
  ...jest.requireActual('../../lib/commissions/commissions-api'),
  saveCommissionRule: jest.fn(),
}));

const mockedSave = jest.mocked(saveCommissionRule);

function renderDialog(row = makeRuleRow({ rule: null }), onSaved = jest.fn()) {
  render(
    <CommissionRuleDialog
      open
      onOpenChange={jest.fn()}
      token="tok"
      row={row}
      categories={['Endodoncia', 'Higiene']}
      deductionsAvailable={{ labCost: false, cardFee: false }}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

describe('CommissionRuleDialog (DX-018)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('«Dra. X: 35% de lo cobrado» con Higiene al 20 %: manda la regla a la API', async () => {
    const user = setupUser();
    const saved = makeRuleRow();
    mockedSave.mockResolvedValue(saved);
    const onSaved = renderDialog();
    expect(screen.getByRole('heading', { name: copy.title(DRA_X.name) })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: copy.percent }), '35');
    await user.click(screen.getByRole('button', { name: copy.addCategory }));
    await user.selectOptions(screen.getByRole('combobox', { name: copy.category }), 'Higiene');
    await user.type(screen.getByRole('textbox', { name: copy.categoryPercent(1) }), '20');
    await user.click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', DRA_X.userId, {
        basis: 'COLLECTED',
        releaseMode: 'PER_ITEM',
        percent: 35,
        categories: [{ category: 'Higiene', percent: 20 }],
        active: true,
        deductLabCost: false,
        deductCardFee: false,
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('% fuera de rango: error junto al campo y no se envía', async () => {
    const user = setupUser();
    renderDialog();
    await user.type(screen.getByRole('textbox', { name: copy.percent }), '120');
    await user.click(screen.getByRole('button', { name: copy.save }));
    expect(await screen.findByText(copy.percentError)).toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('base producido y liberación por plan; categoría repetida avisa', async () => {
    const user = setupUser();
    renderDialog(makeRuleRow());
    await user.click(screen.getByRole('radio', { name: /Lo producido/ }));
    await user.click(screen.getByRole('radio', { name: /Con el plan completo y pagado/ }));
    await user.click(screen.getByRole('button', { name: copy.addCategory }));
    const selects = screen.getAllByRole('combobox', { name: copy.category });
    await user.selectOptions(selects[1], 'Higiene');
    await user.type(screen.getAllByRole('textbox', { name: copy.categoryPercent(2) })[0], '10');
    await user.click(screen.getByRole('button', { name: copy.save }));
    expect(await screen.findByText(copy.categoryDuplicated)).toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('costo de laboratorio y comisión de la pasarela: desactivados con el porqué', () => {
    renderDialog();
    expect(screen.getByRole('switch', { name: copy.labCost })).toBeDisabled();
    expect(screen.getByRole('switch', { name: copy.cardFee })).toBeDisabled();
    expect(screen.getByText(copy.labCostUnavailable)).toBeInTheDocument();
    expect(screen.getByText(copy.cardFeeUnavailable)).toBeInTheDocument();
  });
});
