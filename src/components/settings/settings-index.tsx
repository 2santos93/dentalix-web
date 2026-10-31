import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getTokenRole } from '@/lib/auth/token-role';
import { visibleSettingsSections, type SettingsSection } from './settings-sections';

/**
 * Peso de un grupo en columna: sus filas más la cabecera (≈ 1,5 filas). Sirve
 * para repartir los grupos en dos columnas de alto parecido.
 */
function weight(section: SettingsSection): number {
  return section.entries.length + 1.5;
}

/**
 * Reparte los grupos en dos columnas SIN cambiar su orden: la primera se queda
 * con los primeros grupos hasta el corte que deja las dos columnas más
 * parecidas. Así se lee de arriba abajo y luego la segunda columna, y no queda
 * un hueco al lado de un grupo corto (el «masonry» de antes, crítica de Ajustes).
 */
export function splitSettingsColumns(sections: SettingsSection[]): [SettingsSection[], SettingsSection[]] {
  const total = sections.reduce((sum, s) => sum + weight(s), 0);
  let best = sections.length;
  let bestDiff = Infinity;
  let left = 0;
  for (let i = 0; i <= sections.length; i++) {
    const diff = Math.abs(total - 2 * left);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
    if (i < sections.length) left += weight(sections[i]);
  }
  return [sections.slice(0, best), sections.slice(best)];
}

/**
 * Índice de Ajustes (DX-282, B6): una sección por tema, cada una una lista de
 * filas separadas por filetes dentro de una sola tarjeta (DESIGN.md: «prefer a
 * labeled section over another card»). Cada fila es un enlace de al menos
 * 44 px con su etiqueta (= el título de la pantalla) y una línea de apoyo. El
 * hover es `canvas` y no `surface-sunken`: sobre `surface-sunken` el gris de la
 * línea de apoyo baja a 4,34:1 (excepción anotada en DESIGN.md, «Tables»).
 *
 * Desde `lg`, dos columnas equilibradas (`splitSettingsColumns`); en el
 * teléfono, una.
 *
 * El rol sale del token (el de ESTA clínica) y solo decide qué se pinta: quien
 * entre por la URL a una pantalla sin permiso recibe el 403 de la API.
 */
export function SettingsIndex({ token }: { token: string }) {
  const sections = visibleSettingsSections(getTokenRole(token));
  const columns = splitSettingsColumns(sections);

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      {columns.map((column, index) =>
        column.length > 0 ? (
          <div key={index} className="flex flex-col gap-8">
            {column.map((section) => (
              <IndexSection key={section.id} section={section} />
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}

function IndexSection({ section }: { section: SettingsSection }) {
  const headingId = `settings-section-${section.id}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="t-title text-ink">
        {section.title}
      </h2>
      <ul
        aria-labelledby={headingId}
        className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface"
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
                className="flex min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-text"
              >
                <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span id={labelId} className="text-sm font-medium text-ink">
                    {label}
                  </span>
                  <span id={descriptionId} className="text-sm text-pretty text-muted">
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
}
