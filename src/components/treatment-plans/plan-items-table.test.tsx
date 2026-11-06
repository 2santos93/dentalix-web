import { render, screen } from '@testing-library/react';
import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import type { TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { regionalFormat } from '@/lib/format/regional-format';
import { testStamp } from '@/lib/test/stamp';
import { ItemsTable } from './plan-items-table';
import { ITEM_WITHOUT_DISCOUNT } from './plan-fixture';

function catalogItem(id: string, labelEs: string): DentalCatalogItem {
  return {
    id,
    tenantId: 't1',
    code: id.toUpperCase(),
    category: null,
    kind: 'PROCEDURE',
    labelEs,
    labelEn: null,
    labelPt: null,
    color: '#00AAFF',
    defaultPrice: 10,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as DentalCatalogItem;
}

function item(id: string, catalogItemId: string, toothNumber: string): TreatmentPlanItem {
  return {
    id,
    tenantId: 't1',
    planId: 'plan-1',
    toothNumber,
    surfaces: [],
    catalogItemId,
    price: 10,
    discount: 0,
    visit: 1,
    ...ITEM_WITHOUT_DISCOUNT,
    status: 'PROPOSED',
    notes: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

const catalogById = new Map([
  ['cat-pro', catalogItem('cat-pro', 'Profilaxis')],
  ['cat-bla', catalogItem('cat-bla', 'Blanqueamiento')],
  ['cat-res', catalogItem('cat-res', 'Resina')],
]);

function renderTable(items: TreatmentPlanItem[]) {
  render(
    <ItemsTable
      items={items}
      catalogById={catalogById}
      currency="USD"
      catalogCurrency="USD"
      visit={null}
      feeRefs={new Map()}
      updatingItemId={null}
      onStatusChange={jest.fn()}
      onRemove={jest.fn()}
      selection={{ selectedIds: new Set(), onToggle: jest.fn() }}
      fmt={regionalFormat({ locale: 'es-VE', hourCycle: 'h12' })}
      stamp={testStamp()}
    />,
  );
}

/** Nombres accesibles de los controles con ese rol (tabla y lista del teléfono). */
function names(role: 'combobox' | 'checkbox'): string[] {
  return screen.getAllByRole(role, { hidden: true }).map((el) => el.getAttribute('aria-label') ?? '');
}

describe('ItemsTable: nombre de estado y selección de cada ítem (DX-546 · FE-111)', () => {
  it('un ítem sin diente nombra su procedimiento; uno con diente, el diente y el procedimiento', () => {
    renderTable([item('i1', 'cat-pro', ''), item('i2', 'cat-res', '16')]);
    expect(new Set(names('combobox'))).toEqual(
      new Set(['Estado del ítem · Profilaxis', 'Estado del ítem del diente 16 · Resina']),
    );
    expect(new Set(names('checkbox'))).toEqual(
      new Set(['Seleccionar el ítem · Profilaxis', 'Seleccionar el ítem del diente 16 · Resina']),
    );
  });

  it('ningún nombre queda colgando en «…del diente »', () => {
    renderTable([item('i1', 'cat-pro', ''), item('i2', 'cat-bla', '')]);
    for (const name of [...names('combobox'), ...names('checkbox')]) {
      expect(name).not.toMatch(/diente\s*$/);
      expect(name.trim()).not.toBe('');
    }
  });

  it('dos ítems sin diente dan nombres distintos, también con el mismo procedimiento (su número en la lista)', () => {
    renderTable([item('i1', 'cat-pro', ''), item('i2', 'cat-bla', ''), item('i3', 'cat-pro', '')]);
    // La tabla y la lista del teléfono pintan cada ítem una vez: cada nombre sale dos veces.
    const statuses = names('combobox');
    expect(new Set(statuses)).toEqual(
      new Set(['Estado del ítem 1 · Profilaxis', 'Estado del ítem · Blanqueamiento', 'Estado del ítem 3 · Profilaxis']),
    );
    expect(statuses).toHaveLength(6);
    const selects = names('checkbox');
    expect(new Set(selects).size).toBe(3);
  });
});
