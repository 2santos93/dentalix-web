/** @jest-environment-options {"url": "http://clinica.localhost/"} */
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { CurrencyTextsSync } from './currency-texts-sync';
import { apiFetch } from '@/lib/api/client';
import { usePathname } from 'next/navigation';
import { formatCurrency } from '@/lib/format/currency';
import { clinicCurrencyTexts, setClinicCurrencyTexts } from '@/lib/format/clinic-currency-texts';

jest.mock('next/navigation', () => ({ usePathname: jest.fn(() => '/dashboard') }));
jest.mock('../../lib/api/client', () => ({
  ...jest.requireActual('../../lib/api/client'),
  apiFetch: jest.fn(),
}));
const mockedFetch = jest.mocked(apiFetch);

/** Un hijo que pinta un importe al montarse (como cualquier pantalla). */
let mounts = 0;
function Amount() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <p>{formatCurrency(10, 'EUR')}</p>;
}

beforeEach(() => {
  mockedFetch.mockReset();
  jest.mocked(usePathname).mockReturnValue('/dashboard');
  mounts = 0;
  window.sessionStorage.clear();
  setClinicCurrencyTexts({});
});

describe('CurrencyTextsSync (DX-517)', () => {
  it('con la marca del servidor: el primer importe ya sale con el texto y no pide nada', () => {
    render(
      <CurrencyTextsSync value={{ EUR: '€' }}>
        <Amount />
      </CurrencyTextsSync>,
    );
    expect(screen.getByText('10,00 €')).toBeInTheDocument();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('sin marca del servidor: la pide desde el navegador y vuelve a montar una vez si cambia', async () => {
    mockedFetch.mockResolvedValue({ currencyTexts: { EUR: '€' } });
    render(
      <CurrencyTextsSync value={null}>
        <Amount />
      </CurrencyTextsSync>,
    );
    expect(screen.getByText('10,00 EUR')).toBeInTheDocument();
    expect(await screen.findByText('10,00 €')).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledWith('/public/tenant/branding');
    expect(mounts).toBe(2);
    expect(clinicCurrencyTexts()).toEqual({ EUR: '€' });
  });

  it('sin marca del servidor y con la copia de la pestaña al día: sale ya bien y no se vuelve a montar', async () => {
    setClinicCurrencyTexts({ EUR: '€' });
    mockedFetch.mockResolvedValue({ currencyTexts: { EUR: '€' } });
    render(
      <CurrencyTextsSync value={null}>
        <Amount />
      </CurrencyTextsSync>,
    );
    expect(screen.getByText('10,00 €')).toBeInTheDocument();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    expect(mounts).toBe(1);
  });

  it('si la marca falla, se queda lo que había', async () => {
    mockedFetch.mockRejectedValue(new Error('404'));
    render(
      <CurrencyTextsSync value={null}>
        <Amount />
      </CurrencyTextsSync>,
    );
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    expect(screen.getByText('10,00 EUR')).toBeInTheDocument();
  });

  it.each(['/register', '/register/verificar/token'])(
    'en %s la clínica aún no existe: no pide la marca, y al salir sin recargar sí',
    async (path) => {
      jest.mocked(usePathname).mockReturnValue(path);
      mockedFetch.mockResolvedValue({ currencyTexts: {} });
      const { rerender } = render(<CurrencyTextsSync value={null}>x</CurrencyTextsSync>);
      expect(mockedFetch).not.toHaveBeenCalled();

      jest.mocked(usePathname).mockReturnValue('/dashboard');
      rerender(<CurrencyTextsSync value={null}>x</CurrencyTextsSync>);
      await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    },
  );

  it('una ruta que solo empieza igual sigue pidiendo la marca', async () => {
    jest.mocked(usePathname).mockReturnValue('/registers');
    mockedFetch.mockResolvedValue({ currencyTexts: {} });
    render(<CurrencyTextsSync value={null}>x</CurrencyTextsSync>);
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
  });

  describe('DX-517-ter: el servidor dice clínica, ninguna o desconocida', () => {
    it('status clinic: el primer importe ya sale con el texto, sin pedir nada ni volver a montar', async () => {
      render(
        <CurrencyTextsSync status="clinic" value={{ VES: 'Bs.', EUR: '€' }}>
          <Amount />
        </CurrencyTextsSync>,
      );
      expect(screen.getByText('10,00 €')).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 0));
      expect(mockedFetch).not.toHaveBeenCalled();
      expect(mounts).toBe(1);
    });

    it('status clinic con la copia de la pestaña distinta (primera visita): tampoco se vuelve a montar', async () => {
      setClinicCurrencyTexts({ EUR: 'EUR€' });
      render(
        <CurrencyTextsSync status="clinic" value={{ EUR: '€' }}>
          <Amount />
        </CurrencyTextsSync>,
      );
      expect(screen.getByText('10,00 €')).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 0));
      expect(mounts).toBe(1);
      expect(clinicCurrencyTexts()).toEqual({ EUR: '€' });
    });

    it('status none: no pide nada y pinta sin textos (no hay clínica), aunque la pestaña guarde una copia', async () => {
      setClinicCurrencyTexts({ EUR: '€' });
      render(
        <CurrencyTextsSync status="none" value={null}>
          <Amount />
        </CurrencyTextsSync>,
      );
      expect(screen.getByText('10,00 EUR')).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 0));
      expect(mockedFetch).not.toHaveBeenCalled();
      expect(mounts).toBe(1);
    });

    it('status unknown: es el único caso que pide la marca (y puede volver a montar una vez)', async () => {
      mockedFetch.mockResolvedValue({ currencyTexts: { EUR: '€' } });
      render(
        <CurrencyTextsSync status="unknown" value={null}>
          <Amount />
        </CurrencyTextsSync>,
      );
      expect(await screen.findByText('10,00 €')).toBeInTheDocument();
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mounts).toBe(2);
    });

    it('status none en el registro: al salir sin recargar la pide una vez', async () => {
      jest.mocked(usePathname).mockReturnValue('/register');
      mockedFetch.mockResolvedValue({ currencyTexts: {} });
      const { rerender } = render(<CurrencyTextsSync status="none" value={null}>x</CurrencyTextsSync>);
      expect(mockedFetch).not.toHaveBeenCalled();
      jest.mocked(usePathname).mockReturnValue('/dashboard');
      rerender(<CurrencyTextsSync status="none" value={null}>x</CurrencyTextsSync>);
      await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
      jest.mocked(usePathname).mockReturnValue('/patients');
      rerender(<CurrencyTextsSync status="none" value={null}>x</CurrencyTextsSync>);
      await new Promise((r) => setTimeout(r, 0));
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
  });
});

