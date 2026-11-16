import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplyTemplateModal } from './apply-template-modal';
import { ApiError } from '@/lib/api/api-error';
import { regionalFormat } from '@/lib/format/regional-format';
import { applyTemplate, listPlanTemplates, previewApplyTemplate } from '@/lib/treatment-plans/plan-templates-api';
import { crown, endoCrownTemplate, oldSealant, post, preview, previewLine } from './plan-template-fixtures';

jest.mock('../../lib/treatment-plans/plan-templates-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-templates-api'),
  listPlanTemplates: jest.fn(),
  previewApplyTemplate: jest.fn(),
  applyTemplate: jest.fn(),
}));

const mockedList = jest.mocked(listPlanTemplates);
const mockedPreview = jest.mocked(previewApplyTemplate);
const mockedApply = jest.mocked(applyTemplate);

const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const plan = { id: 'plan-1', currency: 'USD' };

const threeVisits = preview([
  previewLine({ lineId: 'line-1', targetVisit: 1, visitLabel: 'Conductometría', unitPrice: 120, lineTotal: 120 }),
  previewLine({
    lineId: 'line-2',
    position: 1,
    catalogItemId: post.id,
    catalogItemLabel: post.labelEs,
    catalogItemCode: post.code,
    templateVisit: 2,
    targetVisit: 2,
    asksSurfaces: true,
    unitPrice: 60,
    lineTotal: 60,
  }),
  previewLine({
    lineId: 'line-3',
    position: 2,
    catalogItemId: crown.id,
    catalogItemLabel: crown.labelEs,
    catalogItemCode: crown.code,
    templateVisit: 3,
    targetVisit: 3,
    quantity: 2,
    unitPrice: 250,
    lineTotal: 500,
  }),
]);

function renderModal(onApplied = jest.fn(), onOpenChange = jest.fn()) {
  render(
    <ApplyTemplateModal open onOpenChange={onOpenChange} token="tok" plan={plan} fmt={fmt} onApplied={onApplied} />,
  );
  return { onApplied, onOpenChange };
}

async function chooseTemplate(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog', { name: 'Añadir desde plantilla' });
  await user.selectOptions(await within(dialog).findByLabelText('Plantilla'), endoCrownTemplate.id);
  await within(dialog).findByRole('heading', { name: 'Procedimientos que se añadirán' });
  return dialog;
}

describe('ApplyTemplateModal (DX-559)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedList.mockResolvedValue([endoCrownTemplate]);
  });

  it('pide solo las plantillas activas y pinta la vista previa con visitas, precios y total', async () => {
    mockedPreview.mockResolvedValue(threeVisits);
    const user = userEvent.setup();
    renderModal();
    const dialog = await chooseTemplate(user);
    expect(mockedList).toHaveBeenCalledWith('tok');
    expect(mockedPreview).toHaveBeenCalledWith('tok', 'plan-1', endoCrownTemplate.id);

    const endoLine = within(dialog).getByRole('listitem', { name: 'Endodoncia unirradicular' });
    expect(endoLine).toHaveTextContent('Visita 1 · Conductometría');
    expect(endoLine).toHaveTextContent(/USD\s*120,00/);
    const crownLine = within(dialog).getByRole('listitem', { name: crown.labelEs });
    expect(crownLine).toHaveTextContent('Visita 3');
    expect(crownLine).toHaveTextContent('× 2');
    expect(crownLine).toHaveTextContent(/USD\s*500,00/);
    expect(crownLine).toHaveTextContent(/USD\s*250,00 c\/u/);
    expect(dialog).toHaveTextContent('4 procedimientos');
    expect(dialog).toHaveTextContent(/Total USD\s*680,00/);
    // Superficies solo en la línea que las pide.
    expect(within(within(dialog).getByRole('listitem', { name: post.labelEs })).getByRole('group')).toHaveAccessibleName(
      /Superficies de Poste de fibra/,
    );
    expect(within(endoLine).queryByRole('group')).not.toBeInTheDocument();
  });

  it('el diente es obligatorio: confirmar sigue deshabilitado hasta elegirlo y luego aplica', async () => {
    mockedPreview.mockResolvedValue(threeVisits);
    mockedApply.mockResolvedValue({
      plan: {} as never,
      createdItems: [{}, {}, {}, {}] as never,
      skipped: [],
    });
    const user = userEvent.setup();
    const { onApplied, onOpenChange } = renderModal();
    const dialog = await chooseTemplate(user);
    const submit = within(dialog).getByRole('button', { name: 'Añadir al plan' });
    expect(submit).toBeDisabled();
    expect(dialog).toHaveTextContent('Elige el diente de cada procedimiento.');

    await user.type(within(dialog).getByLabelText('Código FDI'), '36');
    const postLine = within(dialog).getByRole('listitem', { name: post.labelEs });
    await user.click(within(postLine).getByLabelText('Oclusal'));
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(mockedApply).toHaveBeenCalledWith('tok', 'plan-1', {
        templateId: endoCrownTemplate.id,
        toothNumber: '36',
        lines: [{ lineId: 'line-2', surfaces: ['OCCLUSAL'] }],
      }),
    );
    expect(onApplied).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('un diente distinto por línea: la de la corona va al 46 y las demás al común', async () => {
    mockedPreview.mockResolvedValue(threeVisits);
    mockedApply.mockResolvedValue({ plan: {} as never, createdItems: [] as never, skipped: [] });
    const user = userEvent.setup();
    renderModal();
    const dialog = await chooseTemplate(user);
    await user.click(within(dialog).getByLabelText('Un diente distinto por procedimiento'));
    const submit = within(dialog).getByRole('button', { name: 'Añadir al plan' });
    await user.type(within(dialog).getByLabelText(`Diente de ${crown.labelEs}`), '46');
    // Falta el de las otras dos (no hay diente común todavía).
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Código FDI'), '36');
    await user.click(submit);
    await waitFor(() =>
      expect(mockedApply).toHaveBeenCalledWith('tok', 'plan-1', {
        templateId: endoCrownTemplate.id,
        toothNumber: '36',
        lines: [{ lineId: 'line-3', toothNumber: '46' }],
      }),
    );
  });

  it('una línea omitida se señala y no pide diente; una sin precio bloquea con la salida', async () => {
    mockedPreview.mockResolvedValue(
      preview([
        previewLine({ lineId: 'line-1' }),
        previewLine({
          lineId: 'line-9',
          position: 1,
          catalogItemId: oldSealant.id,
          catalogItemLabel: oldSealant.labelEs,
          targetVisit: null,
          unitPrice: null,
          lineTotal: null,
          skipped: 'CATALOG_ITEM_INACTIVE',
        }),
        previewLine({
          lineId: 'line-3',
          position: 2,
          catalogItemId: crown.id,
          catalogItemLabel: crown.labelEs,
          unitPrice: null,
          lineTotal: null,
          priceMissing: true,
          priceIssue: 'NO_PRICE',
        }),
      ]),
    );
    const user = userEvent.setup();
    renderModal();
    const dialog = await chooseTemplate(user);
    expect(within(dialog).getByRole('listitem', { name: oldSealant.labelEs })).toHaveTextContent(
      'Desactivado en el catálogo, no se añadirá',
    );
    expect(within(dialog).getByRole('listitem', { name: crown.labelEs })).toHaveTextContent(
      'Sin precio en la lista vigente',
    );
    await user.type(within(dialog).getByLabelText('Código FDI'), '36');
    expect(within(dialog).getByRole('button', { name: 'Añadir al plan' })).toBeDisabled();
    expect(dialog).toHaveTextContent('Hay procedimientos sin precio: añade el precio en la lista o en el catálogo.');
  });

  it('un error de la API con `lineId` se enseña con su texto y marca la línea', async () => {
    mockedPreview.mockResolvedValue(threeVisits);
    mockedApply.mockRejectedValue(
      new ApiError(422, 'price', {
        code: 'PLAN_TEMPLATE_PRICE_MISSING',
        messages: ['«Corona de zirconio» no tiene precio en la moneda del plan.'],
        lineId: 'line-3',
      }),
    );
    const user = userEvent.setup();
    const { onApplied } = renderModal();
    const dialog = await chooseTemplate(user);
    await user.type(within(dialog).getByLabelText('Código FDI'), '36');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir al plan' }));
    expect(await within(dialog).findByText('«Corona de zirconio» no tiene precio en la moneda del plan.')).toBeInTheDocument();
    expect(within(dialog).getByRole('listitem', { name: crown.labelEs })).toHaveTextContent('Revisa este procedimiento');
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('sin plantillas activas lo dice y no ofrece confirmar', async () => {
    mockedList.mockResolvedValue([]);
    renderModal();
    expect(await screen.findByText(/No hay plantillas de plan activas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir al plan' })).not.toBeInTheDocument();
  });

  it('si la vista previa falla (409 del plan), enseña el texto de la API', async () => {
    mockedPreview.mockRejectedValue(
      new ApiError(409, 'ne', {
        code: 'PLAN_TEMPLATE_PLAN_NOT_EDITABLE',
        messages: ['El plan está aceptado: no se le pueden añadir procedimientos desde una plantilla.'],
      }),
    );
    const user = userEvent.setup();
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: 'Añadir desde plantilla' });
    await user.selectOptions(await within(dialog).findByLabelText('Plantilla'), endoCrownTemplate.id);
    expect(await within(dialog).findByText(/El plan está aceptado/)).toBeInTheDocument();
  });
});
