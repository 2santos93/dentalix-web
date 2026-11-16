import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanTemplatesManager } from './plan-templates-manager';
import { Toaster } from '@/components/errors/toaster';
import { ApiError } from '@/lib/api/api-error';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import {
  createPlanTemplate,
  getPlanTemplate,
  listPlanTemplates,
  updatePlanTemplate,
} from '@/lib/treatment-plans/plan-templates-api';
import { crown, endo, endoCrownTemplate, oldSealant, post, sealantTemplate } from './plan-template-fixtures';

jest.mock('../../lib/treatment-plans/plan-templates-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-templates-api'),
  listPlanTemplates: jest.fn(),
  getPlanTemplate: jest.fn(),
  createPlanTemplate: jest.fn(),
  updatePlanTemplate: jest.fn(),
}));
jest.mock('../../lib/odontogram/catalog-api', () => ({
  ...jest.requireActual('../../lib/odontogram/catalog-api'),
  listCatalogItems: jest.fn(),
}));

const mockedList = jest.mocked(listPlanTemplates);
const mockedGet = jest.mocked(getPlanTemplate);
const mockedCreate = jest.mocked(createPlanTemplate);
const mockedUpdate = jest.mocked(updatePlanTemplate);
const mockedCatalog = jest.mocked(listCatalogItems);

function renderManager(allowed = true) {
  return render(
    <>
      <PlanTemplatesManager token="tok" allowed={allowed} />
      <Toaster />
    </>,
  );
}

describe('PlanTemplatesManager (DX-559)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedCatalog.mockResolvedValue([endo, post, crown, oldSealant]);
  });

  it('sin rol ADMIN: no pide nada y dice quién las gestiona', () => {
    renderManager(false);
    expect(screen.getByText('Solo administración gestiona las plantillas de plan.')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lista activas e inactivas con procedimientos, visitas, estado y lo desactivado en el catálogo', async () => {
    mockedList.mockResolvedValue([sealantTemplate, endoCrownTemplate]);
    renderManager();
    expect(await screen.findByText('2 plantillas')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { includeInactive: true });
    const table = screen.getByRole('table', { name: 'Plantillas de plan' });
    const rows = within(table).getAllByRole('row');
    // Por nombre: «Endodoncia + corona» antes que «Sellantes».
    expect(rows[1]).toHaveTextContent('Endodoncia + corona');
    expect(rows[1]).toHaveTextContent('Activa');
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual(
      expect.arrayContaining(['3', '3']),
    );
    expect(rows[2]).toHaveTextContent('Sellantes');
    expect(rows[2]).toHaveTextContent('Desactivada');
    expect(rows[2]).toHaveTextContent('1 desactivado en el catálogo');
  });

  it('vacío: la primaria «Nueva plantilla» vive en el vacío y no hay contador', async () => {
    mockedList.mockResolvedValue([]);
    renderManager();
    const empty = await screen.findByText('Aún no hay plantillas de plan');
    expect(within(empty.parentElement as HTMLElement).getByRole('button', { name: 'Nueva plantilla' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Nueva plantilla' })).toHaveLength(1);
    expect(screen.queryByText(/0 plantillas/)).not.toBeInTheDocument();
  });

  it('si la carga falla, «Reintentar» vuelve a pedirla', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedList.mockResolvedValueOnce([endoCrownTemplate]);
    const user = userEvent.setup();
    renderManager();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos cargar las plantillas de plan/i);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('1 plantilla')).toBeInTheDocument();
  });

  it('crea «Endodoncia + corona» en 3 visitas con etiqueta, intervalos y superficies', async () => {
    mockedList.mockResolvedValue([]);
    mockedCreate.mockResolvedValue(endoCrownTemplate);
    const user = userEvent.setup();
    renderManager();
    await screen.findByText('Aún no hay plantillas de plan');
    await user.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva plantilla de plan' });
    expect(dialog).toHaveTextContent('Sin precios: el precio sale de la lista vigente del paciente al aplicarla.');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Endodoncia + corona');

    const l1 = await within(dialog).findByRole('listitem', { name: 'Procedimiento 1' });
    // El desactivado no se ofrece para una línea nueva.
    expect(within(l1).queryByRole('option', { name: /Sellante antiguo/ })).not.toBeInTheDocument();
    await user.selectOptions(within(l1).getByLabelText('Procedimiento'), endo.id);

    await user.click(within(dialog).getByRole('button', { name: 'Añadir procedimiento' }));
    const l2 = within(dialog).getByRole('listitem', { name: 'Procedimiento 2' });
    await user.selectOptions(within(l2).getByLabelText('Procedimiento'), post.id);
    await user.clear(within(l2).getByLabelText('Visita'));
    await user.type(within(l2).getByLabelText('Visita'), '2');
    await user.click(within(l2).getByLabelText('Pide superficies'));

    await user.click(within(dialog).getByRole('button', { name: 'Añadir procedimiento' }));
    const l3 = within(dialog).getByRole('listitem', { name: 'Procedimiento 3' });
    await user.selectOptions(within(l3).getByLabelText('Procedimiento'), crown.id);
    await user.clear(within(l3).getByLabelText('Visita'));
    await user.type(within(l3).getByLabelText('Visita'), '3');

    const v1 = within(dialog).getByRole('listitem', { name: 'Visita 1' });
    await user.type(within(v1).getByLabelText('Etiqueta'), 'Conductometría');
    expect(within(v1).queryByLabelText('Días desde la visita anterior')).not.toBeInTheDocument();
    await user.type(
      within(within(dialog).getByRole('listitem', { name: 'Visita 2' })).getByLabelText('Días desde la visita anterior'),
      '7',
    );
    await user.type(
      within(within(dialog).getByRole('listitem', { name: 'Visita 3' })).getByLabelText('Días desde la visita anterior'),
      '14',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Endodoncia + corona',
        visitIntervals: { '2': 7, '3': 14 },
        lines: [
          { catalogItemId: endo.id, quantity: 1, visit: 1, visitLabel: 'Conductometría', asksSurfaces: false },
          { catalogItemId: post.id, quantity: 1, visit: 2, visitLabel: null, asksSurfaces: true },
          { catalogItemId: crown.id, quantity: 1, visit: 3, visitLabel: null, asksSurfaces: false },
        ],
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('1 plantilla')).toBeInTheDocument();
  });

  it('reordena las líneas con subir y bajar y quita una; el PATCH lleva la versión', async () => {
    mockedList.mockResolvedValue([endoCrownTemplate]);
    mockedUpdate.mockResolvedValue({ ...endoCrownTemplate, version: 4 });
    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByText('Endodoncia + corona'));
    const dialog = await screen.findByRole('dialog', { name: 'Editar plantilla de plan' });
    await within(dialog).findByRole('listitem', { name: 'Procedimiento 1' });

    await user.click(within(dialog).getByRole('button', { name: 'Bajar el procedimiento 1' }));
    await user.click(within(dialog).getByRole('button', { name: 'Quitar el procedimiento 3' }));
    expect(within(dialog).getByRole('button', { name: 'Subir el procedimiento 1' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    const [, id, input] = mockedUpdate.mock.calls[0];
    expect(id).toBe('tpl-1');
    expect(input.version).toBe(3);
    expect(input.lines?.map((l) => l.catalogItemId)).toEqual([post.id, endo.id]);
    // Las etiquetas van por visita: la de la visita 1 sigue en su línea.
    expect(input.lines?.[1]).toMatchObject({ visit: 1, visitLabel: 'Conductometría' });
    expect(input.visitIntervals).toEqual({ '2': 7 });
  });

  it('marca el procedimiento desactivado en el catálogo y lo conserva al guardar', async () => {
    mockedList.mockResolvedValue([sealantTemplate]);
    renderManager();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Sellantes'));
    const dialog = await screen.findByRole('dialog', { name: 'Editar plantilla de plan' });
    const l1 = await within(dialog).findByRole('listitem', { name: 'Procedimiento 1' });
    expect(within(l1).getByText('Desactivado en el catálogo')).toBeInTheDocument();
    expect(within(l1).getByLabelText('Procedimiento')).toHaveValue(oldSealant.id);
    expect(within(l1).getByRole('option', { name: /Sellante antiguo \(desactivado en el catálogo\)/ })).toBeInTheDocument();
  });

  it('409 STALE: banner con «Recargar», que trae la versión guardada', async () => {
    mockedList.mockResolvedValue([endoCrownTemplate]);
    mockedUpdate.mockRejectedValue(
      new ApiError(409, 'stale', { code: 'PLAN_TEMPLATE_STALE', messages: ['La plantilla cambió mientras la editabas: recárgala.'] }),
    );
    mockedGet.mockResolvedValue({ ...endoCrownTemplate, name: 'Endodoncia y corona', version: 5 });
    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByText('Endodoncia + corona'));
    const dialog = await screen.findByRole('dialog', { name: 'Editar plantilla de plan' });
    await within(dialog).findByRole('listitem', { name: 'Procedimiento 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(dialog).findByText(/cambió mientras la editabas/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Recargar' }));
    await waitFor(() => expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Endodoncia y corona'));
    expect(mockedGet).toHaveBeenCalledWith('tok', 'tpl-1');
    expect(screen.getByText('Endodoncia y corona')).toBeInTheDocument();
  });

  it('409 DUPLICATE_NAME: el error va junto al nombre', async () => {
    mockedList.mockResolvedValue([endoCrownTemplate]);
    mockedUpdate.mockRejectedValue(
      new ApiError(409, 'dup', {
        code: 'PLAN_TEMPLATE_DUPLICATE_NAME',
        messages: ['Ya existe una plantilla de plan con ese nombre.'],
      }),
    );
    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByText('Endodoncia + corona'));
    const dialog = await screen.findByRole('dialog', { name: 'Editar plantilla de plan' });
    await within(dialog).findByRole('listitem', { name: 'Procedimiento 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    const name = within(dialog).getByLabelText('Nombre');
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'));
    expect(name).toHaveAccessibleDescription('Ya existe una plantilla de plan con ese nombre.');
  });

  it('404 con `position`: el error va en la línea afectada', async () => {
    mockedList.mockResolvedValue([endoCrownTemplate]);
    mockedUpdate.mockRejectedValue(
      new ApiError(404, 'nf', {
        code: 'PLAN_TEMPLATE_CATALOG_ITEM_NOT_FOUND',
        messages: ['El procedimiento de la línea 2 no existe en el catálogo de esta clínica.'],
        position: 1,
      }),
    );
    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByText('Endodoncia + corona'));
    const dialog = await screen.findByRole('dialog', { name: 'Editar plantilla de plan' });
    await within(dialog).findByRole('listitem', { name: 'Procedimiento 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    const l2 = within(dialog).getByRole('listitem', { name: 'Procedimiento 2' });
    expect(await within(l2).findByText(/línea 2 no existe en el catálogo/)).toBeInTheDocument();
  });

  it('desactiva desde el «⋯» de la fila con la versión leída', async () => {
    mockedList.mockResolvedValue([endoCrownTemplate]);
    mockedUpdate.mockResolvedValue({ ...endoCrownTemplate, active: false, version: 4 });
    const user = userEvent.setup();
    renderManager();
    await screen.findByText('1 plantilla');
    const row = screen.getAllByRole('row')[1];
    await user.click(within(row).getByRole('button', { name: /acciones/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl-1', { active: false, version: 3 }));
    expect(await screen.findByText('Desactivada')).toBeInTheDocument();
  });
});
