'use client';
import { ChevronDown, Users } from 'lucide-react';
import type { StaffMember } from '@/lib/appointments/staff-api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Columnas como mucho (la API rechaza más de 12 `providerIds`). */
export const MAX_PROVIDER_COLUMNS = 12;

const copy = {
  trigger: (n: number) => (n === 1 ? '1 profesional' : `${n} profesionales`),
  label: 'Profesionales en columnas',
  limit: `Hasta ${MAX_PROVIDER_COLUMNS}`,
};

interface ProviderColumnsPickerProps {
  staff: StaffMember[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

/**
 * Selector múltiple de profesionales de la vista Día en columnas (DX-121).
 * Menú de Radix con casillas: teclado (flechas, Espacio), foco devuelto al
 * cerrar. Mantiene el orden del personal y al menos una columna.
 */
export function ProviderColumnsPicker({
  staff,
  selected,
  onChange,
  disabled = false,
}: ProviderColumnsPickerProps) {
  function toggle(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    if (next.size === 0) return;
    onChange(staff.map((s) => s.userId).filter((userId) => next.has(userId)));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="sm" disabled={disabled} aria-label={`${copy.trigger(selected.length)} · ${copy.label}`}>
          <Users aria-hidden /> {copy.trigger(selected.length)}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>
          {copy.label} · {copy.limit}
        </DropdownMenuLabel>
        {staff.map((s) => {
          const checked = selected.includes(s.userId);
          return (
            <DropdownMenuCheckboxItem
              key={s.userId}
              checked={checked}
              disabled={!checked && selected.length >= MAX_PROVIDER_COLUMNS}
              // Sin cerrar el menú: se marcan varios seguidos.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(value) => toggle(s.userId, value === true)}
            >
              {s.fullName}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
