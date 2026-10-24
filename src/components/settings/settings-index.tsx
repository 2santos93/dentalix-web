import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getTokenRole } from '@/lib/auth/token-role';
import { visibleSettingsSections } from './settings-sections';

/**
 * Índice de Ajustes (DX-282): una sección por tema, cada una una lista de filas
 * separadas por filetes dentro de una sola tarjeta (DESIGN.md: «prefer a
 * labeled section over another card»). Cada fila es un enlace de al menos
 * 44 px de alto con su etiqueta y una línea de apoyo. El hover es `bg` y no
 * `surface-2`: sobre `surface-2` el gris de la línea de apoyo baja a 4,34:1
 * (excepción anotada en DESIGN.md, «Tables»).
 *
 * El rol sale del token (el de ESTA clínica) y solo decide qué se pinta: quien
 * entre por la URL a una pantalla sin permiso recibe el 403 de la API.
 */
export function SettingsIndex({ token }: { token: string }) {
  const sections = visibleSettingsSections(getTokenRole(token));

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      {sections.map((section) => {
        const headingId = `settings-section-${section.id}`;
        return (
          <section key={section.id} aria-labelledby={headingId} className="flex flex-col gap-3">
            <h2 id={headingId} className="t-title text-ink">
              {section.title}
            </h2>
            <ul
              aria-labelledby={headingId}
              className="divide-y divide-hairline overflow-hidden rounded-xl border border-border bg-surface"
            >
              {section.entries.map(({ href, label, description, icon: Icon }) => {
                const slug = href.split('/').pop();
                const labelId = `settings-entry-${slug}`;
                const descriptionId = `settings-entry-${slug}-description`;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      // Nombre = la etiqueta; la línea de apoyo, descripción: la
                      // lista de enlaces del lector de pantalla no lee frases.
                      aria-labelledby={labelId}
                      aria-describedby={descriptionId}
                      className="flex min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    >
                      <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span id={labelId} className="text-sm font-medium text-ink">
                          {label}
                        </span>
                        <span id={descriptionId} className="text-sm text-muted">
                          {description}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
