/**
 * DX-250: comprobación estructural con axe-core en jsdom del panel (con el aviso
 * de «email no salió» y el selector de otras indicaciones) y de la página
 * pública. jsdom no calcula colores ni diseño: el contraste y el desbordamiento
 * a 390 y 1440 px los cubre el e2e (`e2e/post-op-instructions.spec.ts`).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { AppointmentPostOpPanel } from './appointment-postop-panel';
import { PublicPostOpView } from './public-postop-view';
import {
  deliverPostOp,
  getAppointmentPostOp,
  getPublicPostOp,
  markPublicPostOpOpened,
} from '@/lib/postop/postop-api';
import { testAgendaClock } from '@/lib/test/sede-clock';

jest.mock('../../lib/postop/postop-api', () => ({
  ...jest.requireActual('../../lib/postop/postop-api'),
  getAppointmentPostOp: jest.fn(),
  deliverPostOp: jest.fn(),
  getPublicPostOp: jest.fn(),
  markPublicPostOpOpened: jest.fn(),
}));

const SERIOUS = new Set(['serious', 'critical']);

async function blocking(element: Element) {
  const results = await axe.run(element, {
    // jsdom no pinta: sin colores ni geometría (lo cubre el e2e).
    rules: { 'color-contrast': { enabled: false }, 'region': { enabled: false } },
  });
  return results.violations
    .filter((v) => SERIOUS.has(v.impact ?? ''))
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

const T1 = { id: 'tpl-ext', code: 'EXO', title: 'Tras una extracción', version: 2 };
const T2 = { id: 'tpl-endo', code: 'ENDO', title: 'Tras una endodoncia', version: 3 };

describe('postop: axe estructural (DX-250)', () => {
  it('el panel con sugeridas, otras y el aviso persistente del email que no salió', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    (getAppointmentPostOp as jest.Mock).mockResolvedValue({
      patientId: 'pat-1',
      suggested: [T1],
      others: [T2],
      email: { allowed: true, reason: null, toMasked: 'a***@correo.com', toResponsible: true },
      whatsapp: { phone: '584145550101', reason: null },
      locationPhone: null,
      deliveries: [],
    });
    (deliverPostOp as jest.Mock).mockResolvedValue({
      delivery: {
        id: 'del-1', patientId: 'pat-1', appointmentId: 'appt-1', templateId: T1.id, templateCode: 'EXO',
        templateTitle: T1.title, templateVersion: 2, channel: 'EMAIL', deliveredAt: '2026-10-20T15:30:00.000Z',
        deliveredByName: 'Laura Gómez', recipientMasked: 'a***@correo.com', sentToResponsible: true,
        firstOpenedAt: null, linkExpiresAt: null, emailStatus: 'NOT_SENT',
      },
      publicUrl: 'https://demo.dentalix.app/indicaciones/tok_abc',
      whatsapp: null,
      sentTo: null,
      sentToResponsible: true,
      emailQueued: false,
    });
    const { container } = render(
      <AppointmentPostOpPanel clock={testAgendaClock()} token="tok" appointmentId="appt-1" />,
    );
    expect(await blocking(await screen.findByRole('region', { name: 'Indicaciones' }))).toEqual([]);
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar por email' }));
    await screen.findByText('El email no salió');
    expect(await blocking(container)).toEqual([]);
  });

  it('la página pública con teléfono', async () => {
    (getPublicPostOp as jest.Mock).mockResolvedValue({
      clinic: { name: 'Clínica Sonrisas', logoUrl: null, primaryColor: '#1E3A8A' },
      locationPhone: '+58 212 555 0101',
      title: 'Tras una extracción',
      code: 'POI-EXO',
      version: 2,
      renderedText: 'Hola Ana:\n\nMuerde la gasa 30 minutos.',
      deliveredAt: '2026-10-16T15:00:00.000Z',
    });
    (markPublicPostOpOpened as jest.Mock).mockResolvedValue(undefined);
    const { container } = render(<PublicPostOpView linkToken="tok-1" />);
    await screen.findByRole('link', { name: /555 0101/ });
    expect(await blocking(container)).toEqual([]);
  });
});
