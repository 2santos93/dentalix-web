import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrivacyPolicySettings } from './privacy-policy-settings';
import { ApiError } from '@/lib/api/client';
import {
  getPrivacyPolicies,
  publishPrivacyPolicy,
} from '@/lib/data-consents/data-consents-api';
import { POLICY_TEMPLATE } from '@/lib/data-consents/policy-template';
import { policiesFixture, policyFixture, tokenForRole } from '@/lib/test/data-consents';

jest.mock('../../lib/data-consents/data-consents-api', () => ({
  ...jest.requireActual('../../lib/data-consents/data-consents-api'),
  getPrivacyPolicies: jest.fn(),
  publishPrivacyPolicy: jest.fn(),
}));

const mockedGet = getPrivacyPolicies as jest.MockedFunction<typeof getPrivacyPolicies>;
const mockedPublish = publishPrivacyPolicy as jest.MockedFunction<typeof publishPrivacyPolicy>;

const ADMIN = tokenForRole('ADMIN');
const RECEPTION = tokenForRole('RECEPTION');

beforeEach(() => {
  mockedGet.mockReset();
  mockedPublish.mockReset();
});

it('muestra la versión vigente, sus textos y las anteriores', async () => {
  const v2 = policyFixture({ id: 'pol-2', version: 2, policyText: 'Texto v2' });
  mockedGet.mockResolvedValue({ current: v2, history: [v2, policyFixture()] });
  render(<PrivacyPolicySettings token={RECEPTION} />);

  expect(await screen.findByText(/versión 2 · publicada el 01\/10\/2026 por dra\. admin/i)).toBeInTheDocument();
  expect(screen.getByRole('region', { name: /versión 2/i })).toHaveTextContent('Texto v2');
  expect(screen.getByRole('button', { name: /versión 1/i })).toBeInTheDocument();
  // Recepción solo lee.
  expect(screen.queryByRole('button', { name: /publicar/i })).not.toBeInTheDocument();
  expect(screen.getByText(/solo un administrador puede publicar/i)).toBeInTheDocument();
});

const FILLED_POLICY = 'Responsable del tratamiento: Clínica Sonrisa, Av. Principal 10. Contacto: hola@sonrisa.test.';

it('vacío: ADMIN publica la primera versión tras rellenar la plantilla', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValueOnce(policiesFixture(null));
  mockedGet.mockResolvedValueOnce(policiesFixture());
  mockedPublish.mockResolvedValue(policyFixture());
  render(<PrivacyPolicySettings token={ADMIN} />);

  await user.click(await screen.findByRole('button', { name: /publicar la política/i }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText(/datos sensibles de salud/i)).toHaveValue(
    POLICY_TEMPLATE.sensitiveHealthText,
  );
  // Sin corchetes: user-event v14 los interpreta como teclas.
  const policy = within(dialog).getByLabelText('Texto completo de la política');
  await user.clear(policy);
  await user.type(policy, FILLED_POLICY);
  await user.click(within(dialog).getByRole('button', { name: /^publicar$/i }));

  expect(mockedPublish).toHaveBeenCalledWith(ADMIN, { ...POLICY_TEMPLATE, policyText: FILLED_POLICY });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByText(/versión 1 · publicada/i)).toBeInTheDocument();
});

it('publica aunque el texto de datos sensibles no diga las frases', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(policiesFixture());
  mockedPublish.mockResolvedValue(policyFixture());
  render(<PrivacyPolicySettings token={ADMIN} />);

  await user.click(await screen.findByRole('button', { name: /publicar nueva versión/i }));
  const dialog = await screen.findByRole('dialog');
  const sensitive = within(dialog).getByLabelText(/datos sensibles de salud/i);
  await user.clear(sensitive);
  await user.type(sensitive, 'I authorise the processing of my health data.');
  expect(within(dialog).queryByText(/falta|incluido|Dec\./)).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: /^publicar$/i }));

  expect(mockedPublish).toHaveBeenCalledWith(
    ADMIN,
    expect.objectContaining({ sensitiveHealthText: 'I authorise the processing of my health data.' }),
  );
});

it('no publica con marcadores de la plantilla', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(policiesFixture(null));
  render(<PrivacyPolicySettings token={ADMIN} />);

  await user.click(await screen.findByRole('button', { name: /publicar la política/i }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: /^publicar$/i }));

  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    'Sustituye los textos entre corchetes ([…]) por los datos de la clínica antes de publicar. Quedan: [Nombre de la clínica], [Dirección], [Correo o teléfono de contacto], [Normativa de protección de datos aplicable y autoridad ante la que reclamar, o borre este párrafo].',
  );
  expect(mockedPublish).not.toHaveBeenCalled();
});

it('nombra el campo donde queda un marcador fuera del texto de la política', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(policiesFixture(null));
  render(<PrivacyPolicySettings token={ADMIN} />);

  await user.click(await screen.findByRole('button', { name: /publicar la política/i }));
  const dialog = await screen.findByRole('dialog');
  const policy = within(dialog).getByLabelText('Texto completo de la política');
  await user.clear(policy);
  await user.type(policy, FILLED_POLICY);
  // fireEvent: user-event v14 interpreta los corchetes como teclas.
  fireEvent.change(within(dialog).getByLabelText('Casilla «Comunicaciones comerciales»'), {
    target: { value: 'Escriba a [Dirección].' },
  });
  await user.click(within(dialog).getByRole('button', { name: /^publicar$/i }));

  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    'Sustituye los textos entre corchetes ([…]) por los datos de la clínica antes de publicar. Quedan: [Dirección] (en la casilla «Comunicaciones comerciales»).',
  );
  expect(mockedPublish).not.toHaveBeenCalled();
});

it('la pista de datos sensibles está enlazada al campo', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(policiesFixture(null));
  render(<PrivacyPolicySettings token={ADMIN} />);

  await user.click(await screen.findByRole('button', { name: /publicar la política/i }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText('Casilla «Datos sensibles de salud»')).toHaveAccessibleDescription(
    'Conviene que diga que autorizar es voluntario, qué datos de salud se tratan y para qué.',
  );
  expect(within(dialog).queryByText(/falta|incluido|Dec\./)).not.toBeInTheDocument();
});

it('muestra el error de la API en el diálogo', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(policiesFixture());
  mockedPublish.mockRejectedValue(new ApiError(409, 'Otra versión se publicó a la vez.'));
  render(<PrivacyPolicySettings token={ADMIN} />);
  await user.click(await screen.findByRole('button', { name: /publicar nueva versión/i }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: /^publicar$/i }));
  expect(await within(dialog).findByText('Otra versión se publicó a la vez.')).toBeInTheDocument();
});

it('error de carga con reintento', async () => {
  const user = userEvent.setup();
  mockedGet.mockRejectedValueOnce(new Error('red'));
  mockedGet.mockResolvedValueOnce(policiesFixture());
  render(<PrivacyPolicySettings token={ADMIN} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos cargar/i);
  await user.click(screen.getByRole('button', { name: /reintentar/i }));
  expect(await screen.findByText(/versión 1 · publicada/i)).toBeInTheDocument();
});
