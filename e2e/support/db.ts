import { execFileSync } from 'node:child_process';

/**
 * La base e2e por psql, como dueño (`E2E_DATABASE_URL`, que `scripts/e2e-ci.sh`
 * arma con `PG_HOST`, `PG_PORT`, `PG_SUPERUSER`, `PG_SUPERPASS` y
 * `E2E_DB_NAME`). Solo para fixtures que la API ya no deja crear.
 */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;

/**
 * Deja una sede «sin revisar» (`"regionalSettingsReviewedAt" = NULL`): el estado
 * de las sedes anteriores a G1 que rellenó la función D5. Desde DX-312 (R7) el
 * registro sin sede ya no existe, así que la API no puede crear una.
 */
export function markLocationUnreviewed(locationId: string): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  // El id va como variable de psql (`:'id'`, entre comillas y escapada), no
  // pegado al SQL. psql solo sustituye variables en lo que lee, no en `-c`:
  // por eso el SQL entra por stdin.
  execFileSync('psql', [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `id=${locationId}`], {
    input: `UPDATE locations SET "regionalSettingsReviewedAt" = NULL WHERE id = :'id';`,
  });
}

/**
 * DX-380: el reintento del abono lleva `hours` horas pendiente (como si se
 * hubiera cobrado sin tasa ayer). La API no deja fechar el alta del reintento:
 * la pone la BD.
 */
export function ageRateBacklog(paymentId: string, hours: number): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync(
    'psql',
    [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `id=${paymentId}`, '-v', `hours=${Math.trunc(hours)}`],
    {
      input: `UPDATE payment_base_retries SET "createdAt" = timezone('UTC', now()) - make_interval(hours => :hours) WHERE "paymentId" = :'id';`,
    },
  );
}

/**
 * DX-402: deja el reintento del abono en el backoff que tendría tras más de
 * 24 h sin tasa (varios intentos y el siguiente a `hours` vista), como en la
 * QA de DX-380: registrar la tasa tiene que adelantarlo, no esperar.
 */
export function postponeRateRetry(paymentId: string, hours: number): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync(
    'psql',
    [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `id=${paymentId}`, '-v', `hours=${Math.trunc(hours)}`],
    {
      input: `UPDATE payment_base_retries SET "attempts" = 5, "lastReason" = 'NO_RATE', "nextAttemptAt" = timezone('UTC', now()) + make_interval(hours => :hours) WHERE "paymentId" = :'id';`,
    },
  );
}

/**
 * DX-452: adelanta el próximo tick del barrido del reparto de abonos
 * (`payment-allocations.sweep`, cron de cada minuto en la API) a este
 * instante. El worker de la suite (APP_ROLE=all, JOBS_POLL_INTERVAL_MS=250)
 * lo ve en su siguiente vuelta, encola el barrido y lo corre: el test no
 * espera al minuto del cron. Es el mismo estado que el worker escribe al
 * sincronizar la tarea (`job_schedules.nextRunAt`); la API no cambia. El
 * barrido es idempotente y `singleton`: si el anterior sigue en curso, este
 * tick se salta y el siguiente `fireAllocationsSweepNow` (o el cron) lo recoge.
 */
export function fireAllocationsSweepNow(): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync('psql', [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1'], {
    input: `UPDATE job_schedules SET "nextRunAt" = timezone('UTC', now()) WHERE "name" = 'payment-allocations.sweep.every-minute';`,
  });
}

/**
 * Lleva la última rotación de la familia del refresh `refreshToken` (claim
 * `sid`) fuera de la gracia de la API (JWT_REFRESH_REUSE_GRACE_SECONDS, ≤ 60
 * s): desde ahí, reusar el token anterior es reuso (401 y sesión revocada).
 */
export function ageRefreshRotation(refreshToken: string): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  const claims = JSON.parse(Buffer.from(refreshToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    sid?: string;
  };
  if (!claims.sid) throw new Error('el refresh no tiene familia (sid)');
  execFileSync('psql', [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `sid=${claims.sid}`], {
    input: `UPDATE refresh_sessions SET "rotatedAt" = "rotatedAt" - interval '5 minutes' WHERE id = :'sid'::uuid;`,
  });
}

/**
 * DX-379 (C): el presupuesto del plan vence (su último día válido pasa a hace
 * dos días en UTC, que en cualquier sede de América ya es pasado). La API no
 * deja fechar la emisión: la pone el día de la sede al presentar.
 */
export function expirePlanQuote(planId: string): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync('psql', [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `id=${planId}`], {
    input: `UPDATE treatment_plans SET "quoteIssuedOn" = (timezone('UTC', now()))::date - 3, "quoteValidUntil" = (timezone('UTC', now()))::date - 2 WHERE id = :'id';`,
  });
}

/**
 * DX-342: el responsable se dio de alta hace `days` días (cuando el paciente
 * aún era menor). La API pone `createdAt` al dar de alta y no deja fecharlo:
 * sin esto, un paciente que ya cumplió la mayoría de edad no puede tener un
 * responsable «de cuando era menor».
 */
export function backdateResponsibleParty(partyId: string, days: number): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync(
    'psql',
    [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `id=${partyId}`, '-v', `days=${Math.trunc(days)}`],
    {
      input: `UPDATE patient_responsible_parties SET "createdAt" = "createdAt" - make_interval(days => :days) WHERE id = :'id';`,
    },
  );
}

/**
 * DX-265: trae una cita (agendada lejos, a mediodía de la sede) a «dentro de
 * `minutes` minutos» con el reloj de la BD, de 5 minutos de duración: la API no
 * deja agendar en la ventana de «Ya llegué» sin depender de la hora a la que
 * corra la suite. La sede va en una zona lejos de su medianoche.
 */
export function moveAppointmentToNow(appointmentId: string, minutes: number): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync(
    'psql',
    [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-v', `id=${appointmentId}`, '-v', `m=${Math.trunc(minutes)}`],
    {
      input: `UPDATE appointments SET "start" = timezone('UTC', now()) + make_interval(mins => :m), "end" = timezone('UTC', now()) + make_interval(mins => :m + 5) WHERE id = :'id';`,
    },
  );
}

/**
 * DX-260: una cita agendada lejos pasa a ATENDIDA en el pasado (`start` y `end`
 * en instantes UTC): la API no deja agendar ni atender citas pasadas, y la
 * retención mide visitas de hasta dos años atrás.
 */
export function backdateCompletedAppointment(appointmentId: string, start: Date, end: Date): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  execFileSync(
    'psql',
    [
      E2E_DATABASE_URL,
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `id=${appointmentId}`,
      '-v',
      `s=${start.toISOString()}`,
      '-v',
      `e=${end.toISOString()}`,
    ],
    {
      input: `UPDATE appointments SET "start" = (:'s'::timestamptz AT TIME ZONE 'UTC'), "end" = (:'e'::timestamptz AT TIME ZONE 'UTC'), "status" = 'COMPLETED' WHERE id = :'id';`,
    },
  );
}

/**
 * DX-275: como `backdateCompletedAppointment`, y además las horas del panel
 * «En clínica» (llegada, sillón, listo para cobrar). `null` = sin esa hora
 * (la cita se completó saltándose el paso).
 */
export function backdateTimedAppointment(
  appointmentId: string,
  start: Date,
  end: Date,
  marks: { arrivedAt: Date | null; seatedAt: Date | null; readyForCheckoutAt: Date | null },
): void {
  if (!E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL no definido');
  const at = (d: Date | null) => (d ? d.toISOString() : '');
  execFileSync(
    'psql',
    [
      E2E_DATABASE_URL,
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `id=${appointmentId}`,
      '-v',
      `s=${start.toISOString()}`,
      '-v',
      `e=${end.toISOString()}`,
      '-v',
      `a=${at(marks.arrivedAt)}`,
      '-v',
      `c=${at(marks.seatedAt)}`,
      '-v',
      `r=${at(marks.readyForCheckoutAt)}`,
    ],
    {
      input: `UPDATE appointments SET "start" = (:'s'::timestamptz AT TIME ZONE 'UTC'), "end" = (:'e'::timestamptz AT TIME ZONE 'UTC'), "status" = 'COMPLETED', "arrivedAt" = (NULLIF(:'a', '')::timestamptz AT TIME ZONE 'UTC'), "seatedAt" = (NULLIF(:'c', '')::timestamptz AT TIME ZONE 'UTC'), "readyForCheckoutAt" = (NULLIF(:'r', '')::timestamptz AT TIME ZONE 'UTC') WHERE id = :'id';`,
    },
  );
}
