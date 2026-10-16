import { render, screen, waitFor, within } from '@testing-library/react';
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

it('vacío: ADMIN publica la primera versión partiendo de la plantilla', async () => {
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
  await user.click(within(dialog).getByRole('button', { name: /^publicar$/i }));

  expect(mockedPublish).toHaveBeenCalledWith(ADMIN, POLICY_TEMPLATE);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByText(/versión 1 · publicada/i)).toBeInTheDocument();
});

it('avisa de las frases obligatorias que faltan y no publica', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(policiesFixture());
  render(<PrivacyPolicySettings token={ADMIN} />);

  await user.click(await screen.findByRole('button', { name: /publicar nueva versión/i }));
  const dialog = await screen.findByRole('dialog');
  const sensitive = within(dialog).getByLabelText(/datos sensibles de salud/i);
  await user.clear(sensitive);
  await user.type(sensitive, 'Autorizo mis datos sensibles.');
  expect(within(dialog).getByText(/no está obligado/i).closest('li')).toHaveTextContent(/falta/);
  await user.click(within(dialog).getByRole('button', { name: /^publicar$/i }));
  expect(mockedPublish).not.toHaveBeenCalled();
  expect(within(dialog).getByRole('alert')).toHaveTextContent(/falta información obligatoria/i);
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
