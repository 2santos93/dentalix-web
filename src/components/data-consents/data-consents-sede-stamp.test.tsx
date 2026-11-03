import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { ConsentScopeFields } from './consent-scope-fields';
import { DataConsentsTab } from './data-consents-tab';
import { PrivacyPolicySettings } from './privacy-policy-settings';
import {
  EMPTY_SELECTION,
  getPatientDataConsents,
  getPrivacyPolicies,
} from '@/lib/data-consents/data-consents-api';
import { listLocations } from '@/lib/locations/locations-api';
import { consentRow, consentsFixture, policiesFixture, policyFixture, tokenForRole } from '@/lib/test/data-consents';
import { dateIn, dateTimeIn, STAMP_SEDES } from '@/lib/test/stamp';

/**
 * DX-354b: las autorizaciones y la política de datos no traen sede (REF): se
 * pintan con la sede de la pantalla. Caracas (`es-VE`, 12 h) y Berlín (`de-DE`,
 * 24 h), con la misma entrada.
 */
jest.mock('../../lib/data-consents/data-consents-api', () => ({
  ...jest.requireActual('../../lib/data-consents/data-consents-api'),
  getPatientDataConsents: jest.fn(),
  getPrivacyPolicies: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedGet = getPatientDataConsents as jest.MockedFunction<typeof getPatientDataConsents>;
const mockedPolicies = getPrivacyPolicies as jest.MockedFunction<typeof getPrivacyPolicies>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

const RECORDED = '2026-11-05T03:30:00.000Z';
const PUBLISHED = '2026-11-05T18:30:00.000Z';
const ADMIN = tokenForRole('ADMIN');

beforeEach(() => {
  jest.resetAllMocks();
  window.localStorage.clear();
  mockedPolicies.mockResolvedValue(policiesFixture(policyFixture({ publishedAt: PUBLISHED })));
  mockedGet.mockResolvedValue(consentsFixture([consentRow({ id: 'g', scope: 'GENERAL', recordedAt: RECORDED })]));
});

function Scope() {
  const [value, setValue] = useState(EMPTY_SELECTION);
  return (
    <ConsentScopeFields
      token="tok"
      idPrefix="t"
      policy={policyFixture({ publishedAt: PUBLISHED })}
      value={value}
      onChange={setValue}
    />
  );
}

describe.each([['caracas'], ['berlin']] as const)('con la pantalla en %s', (key) => {
  beforeEach(() => mockedLocations.mockResolvedValue([STAMP_SEDES[key]]));

  it('las autorizaciones del paciente: «desde» y el historial con el reloj de la sede', async () => {
    render(<DataConsentsTab token="tok" patientId="pat-1" />);
    const general = await screen.findByTestId('consent-status-GENERAL');
    await waitFor(() => expect(general).toHaveTextContent(`desde el ${dateIn(key, RECORDED)} · v1`));
    const table = screen.getByRole('table', { name: /historial de autorizaciones/i });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(dateTimeIn(key, RECORDED));
  });

  it('la política publicada: vigente e historial con el reloj de la sede', async () => {
    render(<PrivacyPolicySettings token={ADMIN} />);
    expect(await screen.findByText(new RegExp(`publicada el ${dateIn(key, PUBLISHED)} por`))).toBeInTheDocument();
  });

  it('el texto vigente de la política en las casillas', async () => {
    render(<Scope />);
    expect(await screen.findByText(new RegExp(`publicada el ${dateIn(key, PUBLISHED)}`))).toBeInTheDocument();
  });
});

it('Caracas y Berlín escriben distinto la misma fecha de registro', () => {
  expect(dateTimeIn('caracas', RECORDED)).not.toBe(dateTimeIn('berlin', RECORDED));
  // 03:30Z es el 4 de noviembre en Caracas y el 5 en Berlín.
  expect(dateIn('caracas', RECORDED)).not.toBe(dateIn('berlin', RECORDED));
});

it('sin formato: «—» en la frase, «Sin dato» en la tabla y el aviso una sola vez', async () => {
  mockedLocations.mockRejectedValue(new Error('red'));
  render(<DataConsentsTab token="tok" patientId="pat-1" />);
  const general = await screen.findByTestId('consent-status-GENERAL');
  await waitFor(() => expect(screen.getAllByText(/No se pudo saber el formato regional/)).toHaveLength(1));
  expect(general).toHaveTextContent('desde el — · v1');
  const table = screen.getByRole('table', { name: /historial de autorizaciones/i });
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Sin dato');
});
