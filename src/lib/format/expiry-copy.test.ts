import { commissionPaymentsCopy } from '@/components/commissions/commission-payments';
import { patientAccessCopy } from '@/components/patient-access/patient-access-dialog';
import { sendPaymentLinkCopy } from '@/components/payment-links/send-payment-link-modal';

// DX-298-bis: «Caduca el …» con una hora en 12 h («11:00 a. m.») salía con
// doble punto («a. m..»). Las frases se cierran con endSentence (DX-378).
const H12 = '2 dic 2026, 11:00 a. m.';
const H24 = '2 dic 2026, 11:00';

describe('«Caduca el …» sin doble punto (DX-298-bis)', () => {
  it.each([
    ['enlace de acceso del paciente', patientAccessCopy.expires],
    ['firma del recibo de comisión', commissionPaymentsCopy.expires],
    ['enlace de pago', sendPaymentLinkCopy.expires],
  ])('%s', (_name, expires) => {
    expect(expires(H12)).not.toContain('..');
    expect(expires(H12)).toContain('Caduca el 2 dic 2026, 11:00 a. m.');
    expect(expires(H24)).toContain('Caduca el 2 dic 2026, 11:00.');
  });
});
