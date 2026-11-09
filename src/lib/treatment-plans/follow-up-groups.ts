import type { PendingFollowUpItem } from './plan-options-api';

/**
 * Una fila de «Presupuestos por seguir» (D2): UNA conversación con el
 * paciente. Las alternativas A/B de un mismo plan (`optionGroupId`) van juntas
 * en la misma fila; un plan suelto es su propio grupo. La API pagina por
 * grupo, así que un grupo nunca llega partido entre dos páginas.
 */
export interface FollowUpGroup {
  /** `optionGroupId` del grupo, o el `planId` del plan suelto. */
  key: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  patientWhatsApp: string | null;
  /** La presentación MÁS antigua del grupo: la que decide a quién llamar primero. */
  presentedAt: string;
  /** La sede donde se presentó esa opción más antigua: con su reloj sale la fecha, el importe y el WhatsApp de la fila. */
  presentedLocationId: string;
  daysSincePresented: number;
  /** Las opciones por seguir, en el orden de la API (de la más antigua a la más nueva). */
  options: PendingFollowUpItem[];
}

export function followUpGroupKey(item: PendingFollowUpItem): string {
  return item.optionGroupId ?? item.planId;
}

/**
 * Agrupa las filas de una página por grupo de opciones, en el orden en que
 * aparece cada grupo por primera vez (la API ya los manda seguidos; con una
 * API anterior, que paginaba por opción, agrupa igual lo que traiga la página).
 */
export function groupFollowUp(items: readonly PendingFollowUpItem[]): FollowUpGroup[] {
  const groups = new Map<string, FollowUpGroup>();
  for (const item of items) {
    const key = followUpGroupKey(item);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        key,
        patientId: item.patientId,
        patientName: item.patientName,
        patientPhone: item.patientPhone,
        patientWhatsApp: item.patientWhatsApp,
        presentedAt: item.presentedAt,
        presentedLocationId: item.presentedLocationId,
        daysSincePresented: item.daysSincePresented,
        options: [item],
      });
      continue;
    }
    group.options.push(item);
    if (item.presentedAt < group.presentedAt) {
      group.presentedAt = item.presentedAt;
      group.presentedLocationId = item.presentedLocationId;
    }
    group.daysSincePresented = Math.max(group.daysSincePresented, item.daysSincePresented);
  }
  return [...groups.values()];
}

/**
 * El monto de la fila: el de la opción si es una; el rango «mín – máx» si
 * todas comparten moneda; si no, cada moneda con su rango, separadas por « · »
 * (nunca se suman monedas distintas).
 */
export function followUpAmount(
  options: readonly PendingFollowUpItem[],
  /** DX-522: el importe con el formato de la sede (`sedeMoney`). */
  money: (amount: number, currency: string) => string,
): string {
  const byCurrency = new Map<string, number[]>();
  for (const o of options) {
    const list = byCurrency.get(o.currency) ?? [];
    list.push(o.total);
    byCurrency.set(o.currency, list);
  }
  return [...byCurrency.entries()]
    .map(([currency, totals]) => {
      const min = Math.min(...totals);
      const max = Math.max(...totals);
      return min === max
        ? money(min, currency)
        : `${money(min, currency)} – ${money(max, currency)}`;
    })
    .join(' · ');
}

/** La validez que enseña una fila de «Presupuestos por seguir» (DX-379). */
export interface FollowUpValidity {
  /** Último día válido (`YYYY-MM-DD`, inclusive). */
  validUntil: string;
  expired: boolean;
  /** La sede de la opción, para pintar el día con su formato. */
  locationId: string;
}

/**
 * La validez de la fila: la de la opción que vence (o venció) antes. Si alguna
 * opción ya venció, manda la vencida: es lo que hay que decirle al paciente.
 * Sin fechas en ninguna opción (planes anteriores a DX-379), `null`.
 */
export function followUpValidity(options: readonly PendingFollowUpItem[]): FollowUpValidity | null {
  const dated = options.filter((o): o is PendingFollowUpItem & { quoteValidUntil: string } => Boolean(o.quoteValidUntil));
  if (dated.length === 0) return null;
  const expired = dated.filter((o) => o.quoteExpired);
  const pool = expired.length > 0 ? expired : dated;
  const first = pool.reduce((a, b) => (b.quoteValidUntil < a.quoteValidUntil ? b : a));
  return { validUntil: first.quoteValidUntil, expired: first.quoteExpired, locationId: first.presentedLocationId };
}
