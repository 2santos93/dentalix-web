import {
  configChangeItems as items_,
  configChangeText,
  fieldLabel,
} from "./config-change";
import { regionalFormat } from "@/lib/format/regional-format";

// Una sede de Madrid: coma decimal («2,5»).
const fmt = regionalFormat({ locale: "es-ES", hourCycle: "h23" });
const configChangeItems = (metadata: Parameters<typeof items_>[0]) =>
  items_(metadata, fmt);

describe("configChangeItems (DX-360)", () => {
  it("edición: solo lo que cambió, con su antes y su después, en un orden fijo (nombre y duración primero)", () => {
    const items = configChangeItems({
      reason: "APPOINTMENT_TYPE_UPDATED",
      changedFields: ["color", "durationMinutes"],
      configChange: {
        // La API ordena por nombre de campo; la pantalla, por importancia.
        before: { color: "#0E7490", durationMinutes: 60 },
        after: { color: "#B45309", durationMinutes: 75 },
      },
    });
    expect(items).toEqual([
      {
        field: "durationMinutes",
        label: "Duración",
        kind: "changed",
        before: "60",
        after: "75 min",
      },
      {
        field: "color",
        label: "Color",
        kind: "changed",
        before: "#0E7490",
        after: "#B45309",
      },
    ]);
    expect(configChangeText(items!)).toBe(
      "Duración: 60 → 75 min · Color: #0E7490 → #B45309",
    );
  });

  it("alta: solo los valores nuevos; retiro: solo los anteriores", () => {
    expect(
      configChangeItems({
        reason: "PAYER_CREATED",
        configChange: {
          after: { name: "Sanitas", type: "INSURER", active: true },
        },
      }),
    ).toEqual([
      { field: "name", label: "Nombre", kind: "added", value: "Sanitas" },
      { field: "type", label: "Tipo", kind: "added", value: "Aseguradora" },
      { field: "active", label: "Activo", kind: "added", value: "Sí" },
    ]);
    expect(
      configChangeItems({
        reason: "APPOINTMENT_TYPE_DELETED",
        configChange: { before: { name: "Urgencia", isUrgent: false } },
      }),
    ).toEqual([
      { field: "name", label: "Nombre", kind: "removed", value: "Urgencia" },
      { field: "isUrgent", label: "Urgencia", kind: "removed", value: "No" },
    ]);
  });

  it("null como «—», booleanos como Sí/No, listas cortas unidas por comas", () => {
    expect(
      configChangeItems({
        reason: "REMINDER_SETTINGS_UPDATED",
        changedFields: ["enabled", "leadHours"],
        configChange: {
          before: { enabled: false, leadHours: [] },
          after: { enabled: true, leadHours: [24, 2] },
        },
      }),
    ).toEqual([
      {
        field: "enabled",
        label: "Recordatorios activados",
        kind: "changed",
        before: "No",
        after: "Sí",
      },
      {
        field: "leadHours",
        label: "Antelación",
        kind: "changed",
        before: "—",
        after: "24, 2 h",
      },
    ]);
    expect(
      configChangeItems({
        reason: "INVENTORY_ITEM_UPDATED",
        changedFields: ["sku"],
        configChange: { before: { sku: null }, after: { sku: "GUA-01" } },
      }),
    ).toEqual([
      {
        field: "sku",
        label: "SKU",
        kind: "changed",
        before: "—",
        after: "GUA-01",
      },
    ]);
  });

  it("valores con código: tipo de pagador y de movimiento, estado del dominio, reloj; hash abreviado", () => {
    expect(
      configChangeItems({
        reason: "INVENTORY_MOVEMENT_RECORDED",
        configChange: { after: { type: "OUT", quantity: 2.5 } },
      }),
    ).toEqual([
      { field: "type", label: "Tipo", kind: "added", value: "Salida" },
      { field: "quantity", label: "Cantidad", kind: "added", value: "2,5" },
    ]);
    expect(
      configChangeItems({
        reason: "DOMAIN_REGISTERED",
        configChange: {
          after: { host: "citas.sonrisa.co", status: "PENDING" },
        },
      }),
    ).toEqual([
      {
        field: "host",
        label: "Dominio",
        kind: "added",
        value: "citas.sonrisa.co",
      },
      { field: "status", label: "Estado", kind: "added", value: "Pendiente" },
    ]);
    const policy = configChangeItems({
      reason: "PRIVACY_POLICY_PUBLISHED",
      changedFields: ["marketingText"],
      configChange: {
        before: { version: 1, contentHash: "a".repeat(64) },
        after: { version: 2, contentHash: "b".repeat(64) },
      },
    });
    expect(policy).toEqual([
      {
        field: "version",
        label: "Versión",
        kind: "changed",
        before: "1",
        after: "2",
      },
      {
        field: "contentHash",
        label: "Huella del contenido",
        kind: "changed",
        before: "aaaaaaaaaaaa…",
        after: "bbbbbbbbbbbb…",
      },
      // El texto no se guarda: se dice que cambió.
      {
        field: "marketingText",
        label: "Casilla «Comunicaciones comerciales»",
        kind: "hidden",
      },
    ]);
    expect(
      configChangeItems({
        reason: "LOCATION_CREATED",
        configChange: {
          after: { name: "Centro", hourCycle: "h23", phone: null },
        },
      }),
    ).toEqual([
      { field: "name", label: "Nombre", kind: "added", value: "Centro" },
      { field: "hourCycle", label: "Reloj", kind: "added", value: "24 horas" },
      { field: "phone", label: "Teléfono", kind: "added", value: "—" },
    ]);
  });

  it("un texto que solo figura en changedFields (cuerpo, notas) se dice que cambió, sin valor", () => {
    const items = configChangeItems({
      reason: "CONSENT_TEMPLATE_UPDATED",
      changedFields: ["body", "version"],
      configChange: { before: { version: 3 }, after: { version: 4 } },
    });
    expect(items).toEqual([
      {
        field: "version",
        label: "Versión",
        kind: "changed",
        before: "3",
        after: "4",
      },
      { field: "body", label: "Texto", kind: "hidden" },
    ]);
    expect(configChangeText(items!)).toBe("Versión: 3 → 4 · Texto: cambió");
    // Solo cambió el texto: no hay configChange, pero sí qué cambió.
    expect(
      configChangeItems({
        reason: "PRESCRIPTION_TEMPLATE_UPDATED",
        changedFields: ["items", "notes"],
      }),
    ).toEqual([
      { field: "items", label: "Medicamentos", kind: "hidden" },
      { field: "notes", label: "Notas", kind: "hidden" },
    ]);
  });

  it("un campo sin etiqueta se lee igual, con su nombre en palabras", () => {
    expect(fieldLabel("maxDailySlots")).toBe("Max daily slots");
    expect(
      configChangeItems({
        reason: "PAYER_UPDATED",
        configChange: {
          before: { maxDailySlots: 3 },
          after: { maxDailySlots: 4 },
        },
      }),
    ).toEqual([
      {
        field: "maxDailySlots",
        label: "Max daily slots",
        kind: "changed",
        before: "3",
        after: "4",
      },
    ]);
  });

  it("sin configChange ni un cambio de configuración: null (no añade nada a otros eventos)", () => {
    expect(configChangeItems({})).toBeNull();
    expect(
      configChangeItems({
        reason: "STAFF_UPDATED",
        changedFields: ["fullName"],
      }),
    ).toBeNull();
    expect(
      configChangeItems({ reason: "LOCATION_SCHEDULE_REPLACED" }),
    ).toBeNull();
    expect(
      configChangeItems({ configChange: { before: {}, after: {} } }),
    ).toBeNull();
  });
});

it('DX-515: el nº de factura externa y la leyenda del recibo con su antes y después', () => {
  const items = configChangeItems(
    {
      reason: 'EXTERNAL_INVOICE_NUMBER',
      configChange: { before: { externalInvoiceNumber: null }, after: { externalInvoiceNumber: 'F-0001' } },
    },
  );
  expect(items).toEqual([expect.objectContaining({ field: 'externalInvoiceNumber', label: 'Nº de factura externa' })]);
  const legend = configChangeItems(
    {
      reason: 'RECEIPT_LEGEND',
      configChange: {
        before: { receiptLegendOverride: false, receiptLegend: null },
        after: { receiptLegendOverride: true, receiptLegend: 'De la sede' },
      },
    },
  );
  expect(legend?.map((i) => i.label)).toEqual(['Leyenda propia de la sede', 'Leyenda del recibo']);
});
