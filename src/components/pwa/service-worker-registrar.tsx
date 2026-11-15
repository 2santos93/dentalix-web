'use client';
import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/offline/service-worker';

/** DX-405: registra `/sw.js` (solo en producción) tras la primera carga. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
