'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import { checkInQrUrl } from '@/lib/appointments/arrival-api';
import { useClinicBranding } from '@/components/brand/branding-context';
import { ClinicBrand } from '@/components/brand/clinic-brand';
import { Button } from '@/components/ui/button';

export const checkInPosterCopy = {
  title: 'Avisa de tu llegada',
  lead: 'Sin hacer fila en recepción.',
  steps: [
    'Escanea el código con la cámara de tu teléfono.',
    'Escribe tu número de documento y tu fecha de nacimiento.',
    'Toma asiento o pasa por recepción, según te diga la pantalla.',
  ],
  qrLabel: 'Código QR para avisar de tu llegada',
  print: 'Imprimir',
  missing: 'Falta el código: genera el QR desde Ajustes › Sedes y vuelve a abrir el cartel.',
};

/** Lo que trae el fragmento: `#t=<token>&sede=<nombre>`. */
export function readPosterHash(hash: string): { token: string; sede: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('t');
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return { token, sede: params.get('sede') ?? '' };
}

export function posterHref(token: string, sede: string): string {
  return `/print/llegada#${new URLSearchParams({ t: token, sede }).toString()}`;
}

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * DX-265: cartel A4 para la recepción o la puerta: la marca de la clínica, el
 * QR grande y tres pasos. Se imprime solo al abrirse; el botón queda para
 * repetir (no sale en el papel).
 */
export function CheckInPosterView() {
  const branding = useClinicBranding();
  // El fragmento solo existe en el navegador (en el servidor, `null`: nada que pintar aún).
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => null);
  const data = useMemo(() => (hash === null ? undefined : readPosterHash(hash)), [hash]);

  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [data]);

  if (data === undefined) return null;
  if (data === null) {
    return <p className="px-4 py-8 text-center text-sm text-muted">{checkInPosterCopy.missing}</p>;
  }
  const url = checkInQrUrl(window.location.origin, data.token);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center gap-8 bg-white px-6 py-10 text-center text-black print:min-h-0 print:py-0">
      <div className="flex w-full justify-end print:hidden">
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          <Printer aria-hidden /> {checkInPosterCopy.print}
        </Button>
      </div>
      <ClinicBrand variant="public" as="p" name={branding.name ?? data.sede} logoUrl={branding.logoUrl} />
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">{checkInPosterCopy.title}</h1>
        <p className="text-xl">{checkInPosterCopy.lead}</p>
        {data.sede ? <p className="text-lg">{data.sede}</p> : null}
      </div>
      <div className="rounded-xl border border-black/20 bg-white p-4">
        <QRCodeSVG value={url} size={320} level="M" title={checkInPosterCopy.qrLabel} />
      </div>
      <ol className="flex max-w-md list-decimal flex-col gap-2 pl-6 text-left text-lg">
        {checkInPosterCopy.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="break-all text-xs text-black/60">{url}</p>
    </main>
  );
}
