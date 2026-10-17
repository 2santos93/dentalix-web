import type { NoteTemplate } from '@/lib/clinical-notes/note-templates-api';

/** Plantilla «Resina» del criterio de aceptación de DX-170 (ONE, MULTI, TEXT). */
export const resinTemplate: NoteTemplate = {
  id: 'tpl-resina',
  tenantId: 't1',
  name: 'Resina',
  category: 'Operatoria',
  body: 'Resina en superficie {{Superficie}} con {{Material}}. Observaciones: {{Observaciones}}.',
  active: true,
  prompts: [
    {
      id: 'p-sup',
      label: 'Superficie',
      type: 'ONE',
      options: ['O', 'M', 'D', 'V', 'L'],
      defaultValue: null,
      position: 0,
    },
    {
      id: 'p-mat',
      label: 'Material',
      type: 'MULTI',
      options: ['Resina A2', 'Ionómero', 'Adhesivo universal'],
      defaultValue: 'Resina A2',
      position: 1,
    },
    {
      id: 'p-obs',
      label: 'Observaciones',
      type: 'TEXT',
      options: [],
      defaultValue: null,
      position: 2,
    },
  ],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

export const prophylaxisTemplate: NoteTemplate = {
  ...resinTemplate,
  id: 'tpl-profilaxis',
  name: 'Profilaxis',
  category: 'Periodoncia',
  body: 'Profilaxis con {{Técnica}}.',
  prompts: [
    {
      id: 'p-tec',
      label: 'Técnica',
      type: 'MULTI',
      options: ['Ultrasonido', 'Curetas'],
      defaultValue: 'Ultrasonido',
      position: 0,
    },
  ],
};
