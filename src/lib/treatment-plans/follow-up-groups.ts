import { formatCurrency } from '@/lib/format/currency';
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
        daysSincePresented: item.daysSincePresented,
        options: [item],
      });
      continue;
    }
    group.options.push(item);
    if (item.presentedAt < group.presentedAt) group.presentedAt = item.presentedAt;
    group.daysSincePresented = Math.max(group.daysSincePresented, item.daysSincePresented);
  }
  return [...groups.values()];
}

/**
 * El monto de la fila: el de la opción si es una; el rango «mín – máx» si
 * todas comparten moneda; si no, cada moneda con su rango, separadas por « · »
 * (nunca se suman monedas distintas).
 */
export function followUpAmount(options: readonly PendingFollowUpItem[]): string {
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
        ? formatCurrency(min, currency)
        : `${formatCurrency(min, currency)} – ${formatCurrency(max, currency)}`;
    })
    .join(' · ');
}
