import { useEffect } from 'react';

/**
 * DX-118 (FE-033): el `<title>` de una vista imprimible NO lleva el nombre del
 * paciente mientras la pestaña está abierta: el historial del navegador de
 * recepción (un PC compartido) guarda los títulos. El título con el nombre
 * (el que da nombre al PDF al «Guardar como PDF») se pone justo al imprimir
 * (`beforeprint`) y se quita al terminar (`afterprint`).
 *
 * `generic` es el título neutro de la vista («Receta»); `specific`, el del
 * documento con sus datos, o `null` mientras no han llegado (se imprime con
 * el genérico).
 */
export function usePrintDocumentTitle(generic: string, specific: string | null): void {
  useEffect(() => {
    document.title = generic;
    const before = () => {
      document.title = specific ?? generic;
    };
    const after = () => {
      document.title = generic;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [generic, specific]);
}
