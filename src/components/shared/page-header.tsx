import * as React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /**
   * Optional block rendered under the title (and under `description`, when
   * both are present): a compact identity strip, a scope marker, anything
   * that qualifies the title without being a sentence about the page.
   *
   * `description` stays a plain string on purpose — it is the one-line
   * explanation eight pages already pass. This is the structured slot, added
   * for the patient record's header, where the qualifier is a list of values
   * plus a marker rather than prose.
   *
   * **El hueco no pone su propio margen**: lo pone lo que se le pasa. Hay
   * marcas de alcance que deciden en el cliente si existen (ver
   * `ClinicWideNote`), y un margen aquí dejaría un hueco fantasma cada vez que
   * la marca no se pinta.
   */
  meta?: React.ReactNode;
  /**
   * La acción primaria de una FICHA (editar el paciente, guardar el perfil).
   *
   * En las LISTAS no va aquí: va en `ListToolbar`, a la altura de los filtros
   * —ver el porqué en ese componente—. La cabecera de una lista es solo la
   * identidad de la pantalla.
   */
  actions?: React.ReactNode;
}

/**
 * Molecule: el bloque de identidad de la pantalla — título, una línea de apoyo
 * y, en las fichas, la acción primaria a la derecha.
 *
 * `sm:items-start` alinea la acción con la primera línea del título y no con el
 * centro óptico del bloque: en una ficha con tira de identidad y marca de
 * alcance, un botón centrado contra tres líneas de texto queda flotando en
 * medio de la nada.
 *
 * El margen inferior (32px) es la separación deliberada entre la identidad de la
 * pantalla y su contenido: es el intervalo más grande de la página, y por eso lo
 * demás puede ir apretado sin que todo pese lo mismo.
 */
export function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      {/* `min-w-0` + `break-words`: a long patient name must shrink and wrap
          inside its own column instead of pushing the actions off-screen. */}
      <div className="min-w-0 break-words">
        <h1 className="t-display text-ink">{title}</h1>
        {/* `max-w-[68ch]`: la línea de apoyo es prosa y se lee en medida de
            prosa. Sin tope, en escritorio se estiraba los 1150px del contenido
            y una frase de once palabras se leía como un pie de página. */}
        {description ? (
          <p className="t-body mt-1.5 max-w-[68ch] text-pretty text-muted">
            {description}
          </p>
        ) : null}
        {meta ?? null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
