import type { Equipment, EquipmentDetail, EquipmentMaintenance } from '@/lib/equipment/equipment-api';

/** Un equipo de prueba (DX-542): activo, sin programa, en la sede `norte`. */
export function equipmentFixture(partial: Partial<Equipment> & { id: string; name: string }): Equipment {
  return {
    tenantId: 't1',
    locationId: 'norte',
    locationName: 'Sede Norte',
    chairId: null,
    chairName: null,
    category: 'AUTOCLAVE',
    brand: null,
    model: null,
    serialNumber: null,
    sanitaryRegistration: null,
    riskClass: null,
    acquiredOn: null,
    maintenanceIntervalMonths: null,
    status: 'ACTIVE',
    retiredOn: null,
    retiredReason: null,
    notes: null,
    lastMaintenanceOn: null,
    nextMaintenanceOn: null,
    maintenanceStatus: 'UNSCHEDULED',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}


/** Un mantenimiento de prueba, vivo. */
export function maintenanceFixture(
  partial: Partial<EquipmentMaintenance> & { id: string; performedOn: string },
): EquipmentMaintenance {
  return {
    equipmentId: 'e1',
    kind: 'PREVENTIVE',
    technician: null,
    company: null,
    description: 'Revisión',
    cost: null,
    currency: null,
    nextDueOn: null,
    createdById: 'admin',
    createdByName: 'Ana Admin',
    createdAt: '2026-10-01T15:00:00.000Z',
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    ...partial,
  };
}

export function equipmentDetailFixture(
  partial: Partial<EquipmentDetail> & { id: string; name: string },
): EquipmentDetail {
  return { ...equipmentFixture(partial), maintenances: [], ...partial };
}
