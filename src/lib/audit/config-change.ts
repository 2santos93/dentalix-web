import type { AuditEvent } from "@/lib/audit/audit-api";
import { payerTypeLabel } from "@/components/payers/payer-labels";
import { MOVEMENT_TYPE_LABELS } from "@/components/inventory/movement-format";
import type { RegionalFormat } from "@/lib/format/regional-format";
import { sedeNumber } from "@/lib/format/sede-number";

type AuditMetadata = AuditEvent["metadata"];
type ConfigSide = NonNullable<
  NonNullable<AuditMetadata["configChange"]>["after"]
>;
type ConfigValue = ConfigSide[string];

/**
 * DX-360: un campo de un cambio de configuración, ya en palabras. Una edición
 * lleva el antes y el después; un alta, el valor nuevo; un retiro, el que
 * tenía; un texto que la API no guarda (cuerpo, notas), solo que cambió.
 */
export type ConfigChangeItem = { field: string; label: string } & (
  | { kind: "changed"; before: string; after: string }
  | { kind: "added" | "removed"; value: string }
  | { kind: "hidden" }
);

/**
 * Etiqueta de cada campo conocido. El orden de este mapa es el orden en
 * pantalla: lo que identifica el recurso primero (la API ordena por nombre).
 */
const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  title: "Título",
  host: "Dominio",
  durationMinutes: "Duración",
  color: "Color",
  isUrgent: "Urgencia",
  type: "Tipo",
  quantity: "Cantidad",
  sku: "SKU",
  unit: "Unidad",
  minStock: "Stock mínimo",
  itemCount: "Nº de medicamentos",
  items: "Medicamentos",
  version: "Versión",
  contentHash: "Huella del contenido",
  enabled: "Recordatorios activados",
  leadHours: "Antelación",
  status: "Estado",
  active: "Activo",
  country: "País",
  currency: "Moneda",
  timeZone: "Zona horaria",
  locale: "Formato regional",
  hourCycle: "Reloj",
  phone: "Teléfono",
  defaultPhoneRegion: "Región telefónica",
  body: "Texto",
  notes: "Notas",
  policyText: "Texto completo de la política",
  generalText: "Casilla «Datos personales»",
  sensitiveHealthText: "Casilla «Datos sensibles de salud»",
  marketingText: "Casilla «Comunicaciones comerciales»",
  // DX-515: recibo no fiscal.
  receiptTitle: "Título del recibo",
  receiptLegendOverride: "Leyenda propia de la sede",
  receiptLegend: "Leyenda del recibo",
  externalInvoiceNumber: "Nº de factura externa",
};
const FIELD_ORDER = Object.keys(FIELD_LABELS);

/** Unidad que sigue al valor (una sola vez, tras el después). */
const FIELD_UNITS: Record<string, string> = {
  durationMinutes: "min",
  leadHours: "h",
};

const DOMAIN_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  VERIFIED: "Verificado",
  DISABLED: "Desactivado",
};
const HOUR_CYCLE_LABELS: Record<string, string> = {
  h12: "12 horas",
  h23: "24 horas",
  h24: "24 horas",
};

/** Eventos de configuración de DX-360 (también los que solo traen `changedFields`). */
const CONFIG_REASON =
  /^(LOCATION_CREATED|DOMAIN_REGISTERED|PRIVACY_POLICY_PUBLISHED|REMINDER_SETTINGS_UPDATED|INVENTORY_MOVEMENT_RECORDED|(APPOINTMENT_TYPE|PAYER|CONSENT_TEMPLATE|PRESCRIPTION_TEMPLATE|INVENTORY_ITEM)_(CREATED|UPDATED|DELETED))$/;

const NONE = "—";

/** Un campo sin etiqueta, legible: `maxDailySlots` → «Max daily slots». */
export function fieldLabel(field: string): string {
  const known = FIELD_LABELS[field];
  if (known) return known;
  const words = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function scalar(
  field: string,
  value: string | number,
  fmt: RegionalFormat | null,
): string {
  // Con los separadores de la sede de la pantalla (DX-378), como el resto del registro.
  if (typeof value === "number") return sedeNumber(value, fmt);
  if (field === "type")
    return (
      MOVEMENT_TYPE_LABELS[value as keyof typeof MOVEMENT_TYPE_LABELS] ??
      payerTypeLabel(value)
    );
  if (field === "status") return DOMAIN_STATUS_LABELS[value] ?? value;
  if (field === "hourCycle") return HOUR_CYCLE_LABELS[value] ?? value;
  // El hash entero (64 hex) no se lee y desbordaría la tarjeta: basta el inicio.
  if (field === "contentHash" && value.length > 12)
    return `${value.slice(0, 12)}…`;
  return value;
}

/** El valor en palabras, sin unidad; `null` si no hay valor («—»). */
function bare(
  field: string,
  value: ConfigValue | undefined,
  fmt: RegionalFormat | null,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value))
    return value.length === 0
      ? null
      : value.map((v) => scalar(field, v, fmt)).join(", ");
  return scalar(field, value, fmt);
}

function withUnit(field: string, text: string | null): string {
  if (text === null) return NONE;
  const unit = FIELD_UNITS[field];
  return unit ? `${text} ${unit}` : text;
}

function byScreenOrder(a: string, b: string): number {
  const rank = (f: string) => {
    const i = FIELD_ORDER.indexOf(f);
    return i === -1 ? FIELD_ORDER.length : i;
  };
  return rank(a) - rank(b);
}

/**
 * DX-360: qué cambió en un evento de configuración (`metadata.configChange`),
 * campo a campo, con los números en el formato de la sede. null si el evento no es un cambio de configuración: así no
 * añade nada a los demás eventos.
 */
export function configChangeItems(
  metadata: AuditMetadata,
  fmt: RegionalFormat | null,
): ConfigChangeItem[] | null {
  const change = metadata.configChange;
  const isConfig =
    change !== undefined ||
    (metadata.reason !== undefined && CONFIG_REASON.test(metadata.reason));
  if (!isConfig) return null;
  const before = change?.before;
  const after = change?.after;
  const fields = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ].sort(byScreenOrder);

  const items: ConfigChangeItem[] = fields.map((field) => {
    const label = fieldLabel(field);
    if (before && after) {
      const from = bare(field, before[field], fmt);
      const to = bare(field, after[field], fmt);
      // La unidad va una sola vez, tras el después («60 → 75 min»).
      return {
        field,
        label,
        kind: "changed",
        before: from === null || to === null ? withUnit(field, from) : from,
        after: withUnit(field, to),
      };
    }
    const side = (after ?? before) as ConfigSide;
    return {
      field,
      label,
      kind: after ? "added" : "removed",
      value: withUnit(field, bare(field, side[field], fmt)),
    };
  });

  // Lo que la API no guarda (texto libre o largo) figura solo en changedFields.
  const hidden = (metadata.changedFields ?? [])
    .filter((f) => !fields.includes(f))
    .sort(byScreenOrder);
  for (const field of hidden)
    items.push({ field, label: fieldLabel(field), kind: "hidden" });

  return items.length > 0 ? items : null;
}

/** El valor de un campo como se lee: «60 → 75 min», «Salud Plena», «cambió». */
export function configChangeValue(item: ConfigChangeItem): string {
  if (item.kind === "changed") return `${item.before} → ${item.after}`;
  if (item.kind === "hidden") return "cambió";
  return item.value;
}

/** Todo el cambio en una línea: «Duración: 60 → 75 min · Color: #0E7490 → #B45309». */
export function configChangeText(items: readonly ConfigChangeItem[]): string {
  return items
    .map((item) => `${item.label}: ${configChangeValue(item)}`)
    .join(" · ");
}
