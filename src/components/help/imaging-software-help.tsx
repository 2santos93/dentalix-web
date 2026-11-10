import { PageHeader } from '@/components/shared/page-header';

// Copy as constants (i18n-ready). Pasos genéricos y con reservas: los menús
// cambian según la versión de cada programa, así que aquí no se inventan rutas
// de menú exactas ni se promete ninguna integración (DX-484).
export const imagingHelpCopy = {
  title: 'Dar de alta al paciente en el software de imagen',
  description:
    'Dentalix no se conecta con el software de imagen: el paciente se da de alta allí a mano, con el código que da Dentalix.',
  howTitle: 'Cómo funciona',
  how: [
    'Cada paciente tiene en Dentalix un código estable, que no cambia: lo ves en la cabecera de su ficha («Código 1042») con el botón «Copiar».',
    'En la ficha, el menú «⋯» › «Datos para el software de imagen» muestra los datos que hay que copiar: código, apellidos, nombre, fecha de nacimiento y sexo. También los puedes descargar en un .txt.',
    'En el software de imagen, crea el paciente usando ese código como ID del paciente (o número de ficha) y con los mismos apellidos, nombre, fecha de nacimiento y sexo.',
    'Si ese programa no acepta tildes ni la «ñ», usa las líneas «sin tildes» de los datos.',
    'Así, cuando busques al paciente por su código en los dos sitios, encontrarás a la misma persona.',
  ],
  versionNote:
    'Los nombres de los menús y de los campos cambian según la versión y la configuración de cada programa. Si no encuentras una opción, consulta la ayuda del fabricante o a quien te lo instaló.',
  products: [
    {
      id: 'sidexis',
      name: 'Sidexis',
      steps: [
        'Busca la opción para crear un paciente nuevo (suele estar en la gestión o el registro de pacientes).',
        'En el campo de ID del paciente (o número de ficha) pega el código de Dentalix.',
        'Escribe los apellidos, el nombre, la fecha de nacimiento y el sexo tal como aparecen en los datos de Dentalix.',
        'Guarda el paciente y comprueba que lo encuentras buscando por el código.',
      ],
    },
    {
      id: 'romexis',
      name: 'Romexis',
      steps: [
        'Busca la opción para añadir un paciente nuevo en la gestión de pacientes.',
        'En el campo de ID del paciente pega el código de Dentalix.',
        'Completa apellidos, nombre, fecha de nacimiento y sexo con los datos de Dentalix.',
        'Guarda y comprueba que el paciente aparece al buscar por el código.',
      ],
    },
    {
      id: 'dexis',
      name: 'Dexis',
      steps: [
        'Busca la opción para crear un paciente nuevo.',
        'En el campo de ID del paciente o número de ficha (chart number) pega el código de Dentalix.',
        'Escribe apellidos, nombre, fecha de nacimiento y sexo como en los datos de Dentalix.',
        'Guarda y comprueba que lo encuentras buscando por el código.',
      ],
    },
    {
      id: 'cs-imaging',
      name: 'CS Imaging',
      steps: [
        'Busca la opción para crear un paciente nuevo en la lista de pacientes.',
        'En el campo de ID del paciente (o número de ficha) pega el código de Dentalix.',
        'Completa apellidos, nombre, fecha de nacimiento y sexo con los datos de Dentalix.',
        'Guarda y comprueba que el paciente aparece al buscar por el código.',
      ],
    },
  ],
  otherTitle: 'Otro software de imagen',
  other:
    'Con cualquier otro programa el método es el mismo: crea el paciente con el código de Dentalix como ID y con los mismos datos.',
};

/**
 * Ayuda de DX-484: cómo dar de alta al paciente en Sidexis, Romexis, Dexis o
 * CS Imaging con el código de Dentalix. Contenido estático, sin datos del
 * paciente. Un componente (y no JSX en `app/`) para poder probarlo.
 */
export function ImagingSoftwareHelp() {
  const c = imagingHelpCopy;
  return (
    <article className="min-w-0 max-w-[68ch]">
      <PageHeader title={c.title} description={c.description} />
      <div className="flex flex-col gap-8">
        <section aria-labelledby="como-funciona" className="flex flex-col gap-3">
          <h2 id="como-funciona" className="t-title text-ink">
            {c.howTitle}
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-ink">
            {c.how.map((line) => (
              <li key={line} className="break-words">
                {line}
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted">{c.versionNote}</p>
        </section>

        {c.products.map((product) => (
          <section key={product.id} aria-labelledby={`software-${product.id}`} className="flex flex-col gap-3">
            <h2 id={`software-${product.id}`} className="t-title text-ink">
              {product.name}
            </h2>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-ink">
              {product.steps.map((step) => (
                <li key={step} className="break-words">
                  {step}
                </li>
              ))}
            </ol>
          </section>
        ))}

        <section aria-labelledby="software-otro" className="flex flex-col gap-3">
          <h2 id="software-otro" className="t-title text-ink">
            {c.otherTitle}
          </h2>
          <p className="text-sm text-ink">{c.other}</p>
        </section>
      </div>
    </article>
  );
}
