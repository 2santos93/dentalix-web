import type { ReactNode } from 'react';
import { SettingsShell } from '@/components/settings/settings-nav';

/**
 * Marco de todas las pantallas de Ajustes (B6): en escritorio ancho, la
 * sub-navegación persistente a la izquierda. Cada pantalla sigue con su propia
 * guarda de sesión; esto solo pone el marco.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
