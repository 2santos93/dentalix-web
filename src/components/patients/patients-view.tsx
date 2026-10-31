'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listPatients, type Patient } from '@/lib/patients/patients-api';
import { listPayers, type Payer } from '@/lib/payers/payers-api';
import { PatientsTable } from '@/components/patients/patients-table';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { ListToolbar, ResultCount } from '@/components/shared/list-toolbar';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { SectionError } from '@/components/errors/section-error';
import { FieldError } from '@/components/errors/field-error';
import { useSedeClock } from '@/lib/locations/sede-clock';
import { ClinicWideNote } from '@/components/locations/clinic-wide-note';

// Corto para no notarse al teclear, largo para no lanzar una petición por
// tecla. Mismo valor que el resto de las listas.
const SEARCH_DEBOUNCE_MS = 300;

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Pacientes',
  description: 'Gestiona la base de pacientes de tu clínica.',
  clinicWideNote:
    'La ficha de paciente es compartida: ves todos los pacientes de la clínica, no solo los de la sede activa.',
  newPatient: 'Nuevo paciente',
  searchLabel: 'Buscar por nombre, apellido o documento',
  // La búsqueda de la API mira nombre, apellido y documento —no el teléfono—:
  // el placeholder no promete lo que no hace (informe K2). Corto para caber
  // entero en los 288px del buscador; la lupa ya dice «buscar».
  searchPlaceholder: 'Nombre o documento',
  countNoun: 'paciente',
  countNounPlural: 'pacientes',
  genericError: 'No pudimos cargar los pacientes.',
  // Filtra por la cobertura del paciente (DX-153): «Cobertura: Aseguradora Norte» se
  // entiende; «Todos los pagadores» suelto no decía qué filtraba.
  payerFilterLabel: 'Cobertura',
  allPayers: 'Todas',
  payersError: 'No cargaron los pagadores',
};

interface PatientsViewProps {
  token: string;
}

/**
 * Listado de pacientes: cabecera de identidad, barra con buscador y acción
 * primaria, recuento, tabla y paginación — el mismo contrato que
 * `InventoryView`, `CatalogView` y `StaffView`.
 *
 * Vive aquí y no en `page.tsx` por simetría con esas tres: la página resuelve la
 * sesión y la vista implementa el contrato. Antes esta pantalla era la excepción
 * —doscientas líneas de estado dentro del componente de ruta—, lo que además la
 * dejaba sin tests: no había forma de montarla sin el store de auth.
 */
export function PatientsView({ token }: PatientsViewProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // Server-side pagination: `page` drives the fetch; `total`/`pageSize` come
  // BACK from the response (the API clamps pageSize, so never assume the
  // requested value — see ListPatientsUseCase.normalizePageSize).
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(0);
  // `searchInput` es lo tecleado; `search` lo consultado. Separarlos permite el
  // debounce sin que el campo se sienta lento. Misma forma que en catálogo,
  // personal e inventario.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Filtro por pagador (DX-153). Vacío = todos. En memoria, como la búsqueda.
  const [payerId, setPayerId] = useState('');
  const [payers, setPayers] = useState<Payer[]>([]);
  const [payersFailed, setPayersFailed] = useState(false);
  const [payersRetry, setPayersRetry] = useState(0);
  // «Última atención» se pinta con la fecha de la sede (DX-378). Las sedes ya
  // las leyó el shell: la sesión las cachea, no es otra petición.
  const sedeClock = useSedeClock(token);
  const clock = sedeClock.status === 'ready' ? sedeClock.clock : null;

  // El catálogo de pagadores es una opción de un control: si falla, el listado
  // sigue funcionando y el fallo se dice junto al select (escalón 2).
  useEffect(() => {
    let cancelled = false;
    async function loadPayers() {
      try {
        const res = await listPayers(token);
        if (cancelled) return;
        setPayers(res);
        setPayersFailed(false);
      } catch {
        if (!cancelled) setPayersFailed(true);
      }
    }
    void loadPayers();
    return () => {
      cancelled = true;
    };
  }, [token, payersRetry]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      setSearch(searchInput.trim());
      // Una búsqueda nueva vuelve a la página 1: quedarse en la 3 de un
      // resultado que ahora tiene una sola deja la tabla vacía sin motivo.
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounce);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    // Fetch inside an async fn (not directly in the effect body) so the
    // `setLoading(true)` that re-shows the skeleton on a page change doesn't
    // trip `react-hooks/set-state-in-effect` — same shape as `AgendaView` /
    // `CatalogView`'s loaders.
    async function load() {
      setLoading(true);
      try {
        const res = await listPatients(token, {
          page,
          ...(search ? { query: search } : {}),
          ...(payerId ? { payerId } : {}),
        });
        if (cancelled) return;
        setPatients(res.items);
        setTotal(res.total);
        setPageSize(res.pageSize);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, copy.genericError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [token, retryCount, page, search, payerId]);

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        meta={<ClinicWideNote>{copy.clinicWideNote}</ClinicWideNote>}
      />

      {/* Un solo bloque apretado (12px) para buscar → contar → leer: los tres
          pasos son el mismo gesto. La separación grande de la página es la que
          hay sobre él, contra la cabecera. */}
      <div className="flex flex-col gap-3">
        <ListToolbar
          searchLabel={copy.searchLabel}
          searchPlaceholder={copy.searchPlaceholder}
          value={searchInput}
          onChange={setSearchInput}
          action={
            <Button asChild>
              <Link href="/patients/new">
                <Plus /> {copy.newPatient}
              </Link>
            </Button>
          }
        >
          {payersFailed ? (
            <FieldError
              label={copy.payersError}
              onRetry={() => {
                setPayersFailed(false);
                setPayersRetry((c) => c + 1);
              }}
              className="sm:w-56"
            />
          ) : (
            // Etiqueta visible DENTRO del control («Cobertura  Todas ▾»): ocupa
            // lo mismo que el select y dice qué filtra. Es un <label> de
            // verdad, así que también es el nombre accesible.
            <div className="relative sm:w-60">
              <label
                htmlFor="patients-payer-filter"
                className="pointer-events-none absolute top-1/2 left-3 z-[1] -translate-y-1/2 text-sm text-muted"
              >
                {copy.payerFilterLabel}
              </label>
              <NativeSelect
                id="patients-payer-filter"
                value={payerId}
                onChange={(e) => {
                  setPayerId(e.target.value);
                  setPage(1);
                }}
                selectClassName="pl-[5.75rem]"
              >
                <option value="">{copy.allPayers}</option>
                {payers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </ListToolbar>

        {!loading && !error ? (
          <ResultCount
            total={total}
            noun={copy.countNoun}
            nounPlural={copy.countNounPlural}
          />
        ) : null}

        {error ? (
          <SectionError
            description={error}
            onRetry={() => {
              setLoading(true);
              setError(null);
              setRetryCount((c) => c + 1);
            }}
          />
        ) : (
          <>
            <PatientsTable
              patients={patients}
              loading={loading}
              filtered={search !== '' || payerId !== ''}
              payerOnly={search === '' && payerId !== ''}
              clock={clock}
            />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              disabled={loading}
            />
          </>
        )}
      </div>
    </>
  );
}
