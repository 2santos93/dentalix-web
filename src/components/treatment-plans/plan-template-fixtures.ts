import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import type { PlanTemplate, TemplatePreview, TemplatePreviewLine } from '@/lib/treatment-plans/plan-templates-api';

// DX-559: fixtures de las plantillas de plan (catálogo en USD, clínica de Venezuela).

export function procedure(id: string, code: string, labelEs: string, active = true): DentalCatalogItem {
  return {
    id,
    tenantId: 't-1',
    code,
    category: null,
    kind: 'PROCEDURE',
    labelEs,
    labelEn: null,
    labelPt: null,
    color: 'gray',
    defaultPrice: 100,
    active,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

export const endo = procedure('cat-endo', 'END-01', 'Endodoncia unirradicular');
export const post = procedure('cat-post', 'POS-01', 'Poste de fibra');
export const crown = procedure('cat-crown', 'COR-01', 'Corona de zirconio');
export const oldSealant = procedure('cat-old', 'SEL-01', 'Sellante antiguo', false);

export const endoCrownTemplate: PlanTemplate = {
  id: 'tpl-1',
  tenantId: 't-1',
  name: 'Endodoncia + corona',
  active: true,
  version: 3,
  visitIntervals: { '2': 7, '3': 14 },
  lines: [
    {
      id: 'line-1',
      position: 0,
      catalogItemId: endo.id,
      catalogItemLabel: endo.labelEs,
      catalogItemCode: endo.code,
      catalogItemActive: true,
      quantity: 1,
      visit: 1,
      visitLabel: 'Conductometría',
      asksSurfaces: false,
    },
    {
      id: 'line-2',
      position: 1,
      catalogItemId: post.id,
      catalogItemLabel: post.labelEs,
      catalogItemCode: post.code,
      catalogItemActive: true,
      quantity: 1,
      visit: 2,
      visitLabel: null,
      asksSurfaces: true,
    },
    {
      id: 'line-3',
      position: 2,
      catalogItemId: crown.id,
      catalogItemLabel: crown.labelEs,
      catalogItemCode: crown.code,
      catalogItemActive: true,
      quantity: 1,
      visit: 3,
      visitLabel: null,
      asksSurfaces: false,
    },
  ],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

export const sealantTemplate: PlanTemplate = {
  ...endoCrownTemplate,
  id: 'tpl-2',
  name: 'Sellantes',
  active: false,
  version: 1,
  visitIntervals: {},
  lines: [
    {
      id: 'line-9',
      position: 0,
      catalogItemId: oldSealant.id,
      catalogItemLabel: oldSealant.labelEs,
      catalogItemCode: oldSealant.code,
      catalogItemActive: false,
      quantity: 4,
      visit: 1,
      visitLabel: null,
      asksSurfaces: true,
    },
  ],
};

export function previewLine(over: Partial<TemplatePreviewLine> & { lineId: string }): TemplatePreviewLine {
  return {
    position: 0,
    catalogItemId: endo.id,
    catalogItemLabel: endo.labelEs,
    catalogItemCode: endo.code,
    quantity: 1,
    templateVisit: 1,
    targetVisit: 1,
    visitLabel: null,
    asksSurfaces: false,
    unitPrice: 100,
    priceSource: 'CATALOG',
    agreementName: null,
    lineTotal: 100,
    priceMissing: false,
    priceIssue: null,
    skipped: null,
    ...over,
  };
}

export function preview(lines: TemplatePreviewLine[], over: Partial<TemplatePreview> = {}): TemplatePreview {
  return {
    planId: 'plan-1',
    templateId: endoCrownTemplate.id,
    templateVersion: endoCrownTemplate.version,
    currency: 'USD',
    currencyDigits: { minorUnits: 2, roundingDigits: 2 },
    visitOffset: 0,
    lines,
    visitIntervals: {},
    itemCount: lines.filter((l) => !l.skipped).reduce((n, l) => n + l.quantity, 0),
    total: lines.reduce((n, l) => n + (l.lineTotal ?? 0), 0),
    ...over,
  };
}
