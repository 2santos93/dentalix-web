'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileX, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { equipmentHref, getEquipment, type EquipmentDetail } from '@/lib/equipment/equipment-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SectionError } from '@/components/errors/section-error';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { EquipmentLifeSheet } from './equipment-life-sheet';

const copy = {
  toolbar: 'Acciones de la hoja de vida',
  print: 'Imprimir',
  back: 'Volver a la hoja de vida',
  loading: 'Preparando la hoja de vida…',
  loadError: 'No pudimos cargar la hoja de vida del equipo.',
  notFoundTitle: 'Este equipo no existe en la clínica.',
  notFoundHint: 'Ábrelo desde Ajustes › Equipos biomédicos.',
  documentTitle: (name: string) => `Hoja de vida · ${name}`,
};

interface EquipmentPrintViewProps {
  token: string;
  equipmentId: string;
}

/**
 * La hoja de vida lista para el papel (DX-542): la barra lleva `print:hidden`
 * y el documento cabe en A4 o carta; «Imprimir» abre el diálogo del navegador
 * (que también guarda como PDF). Fechas e importes con el formato de la sede
 * del equipo; sin él, «—» y el aviso de la sede, y no se imprime.
 */
export function EquipmentPrintView({ token, equipmentId }: EquipmentPrintViewProps) {
  const [detail, setDetail] = useState<EquipmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const stamp = useSedeStamp(token, [detail?.locationId]);

  useEffect(() => {
    let cancelled = false;
    getEquipment(token, equipmentId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setNotFound(err instanceof ApiError && (err.status === 404 || err.status === 400));
        setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, equipmentId, reloadKey]);

  const formatReady = detail !== null && stamp.ready && stamp.notice === null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface-sunken print:min-h-0 print:bg-white">
      {detail ? <title>{copy.documentTitle(detail.name)}</title> : null}
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        <Button asChild variant="ghost" className="justify-start">
          <Link href={equipmentHref(equipmentId)}>
            <ChevronLeft aria-hidden />
            {copy.back}
          </Link>
        </Button>
        <Button type="button" onClick={() => window.print()} disabled={!formatReady}>
          <Printer aria-hidden />
          {copy.print}
        </Button>
      </div>

      <main className="flex-1 px-0 py-0 sm:px-4 sm:py-8 print:p-0">
        {detail ? (
          <div className="mx-auto flex w-full max-w-[190mm] flex-col gap-3 print:max-w-none">
            <SedeStampNote stamp={stamp} className="mx-4 sm:mx-0" />
            <div className="border-y border-border bg-surface sm:rounded-lg sm:border print:border-0">
              <EquipmentLifeSheet equipment={detail} stamp={stamp} />
            </div>
          </div>
        ) : notFound ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState role="status" icon={<FileX aria-hidden />} title={copy.notFoundTitle} description={copy.notFoundHint} />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <SectionError
              description={error}
              onRetry={() => {
                setError(null);
                setReloadKey((k) => k + 1);
              }}
            />
          </div>
        ) : (
          <p role="status" className="px-4 py-8 text-center text-sm text-muted">
            {copy.loading}
          </p>
        )}
      </main>
    </div>
  );
}
