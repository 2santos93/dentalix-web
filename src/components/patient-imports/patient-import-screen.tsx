'use client';
import * as React from 'react';
import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { ImportHistory } from './import-history';
import { PatientImportWizard } from './patient-import-wizard';

const copy = {
  forbiddenTitle: 'Solo un administrador puede importar pacientes',
  forbiddenHint: 'Pide a un administrador de la clínica que haga la importación.',
};

/**
 * Ajustes → Importar pacientes (DX-107): el asistente arriba y el historial
 * de lotes debajo. Cuando un lote cambia de estado se recarga el historial.
 */
export function PatientImportScreen({ token, allowed }: { token: string; allowed: boolean }) {
  const [historyKey, setHistoryKey] = React.useState(0);
  const reloadHistory = React.useCallback(() => setHistoryKey((k) => k + 1), []);
  // G1-B: los recuentos van con el formato de la sede de la pantalla (la de escritura del lote);
  // sin él, «—» y el aviso. La importación sigue funcionando: solo cambia cómo se pintan.
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);

  if (!allowed) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {sedeFormat.status === 'error' ? (
        <SedeConfigError kind="locale" variant="note" onRetry={sedeFormat.retry} description={sedeFormat.message} />
      ) : null}
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <PatientImportWizard
          token={token}
          onBatchChange={reloadHistory}
          fmt={fmt}
          formatLoading={sedeFormat.status === 'loading'}
        />
      </div>
      <ImportHistory token={token} reloadKey={historyKey} fmt={fmt} />
    </div>
  );
}
