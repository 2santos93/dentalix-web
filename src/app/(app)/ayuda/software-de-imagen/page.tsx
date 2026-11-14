import type { Metadata } from 'next';
import { ImagingSoftwareHelp } from '@/components/help/imaging-software-help';

// DX-484: ayuda estática (sin datos del paciente) enlazada desde «Datos para
// el software de imagen» de la ficha.
export const metadata: Metadata = {
  title: 'Software de imagen · Ayuda · Dentalix',
};

export default function ImagingSoftwareHelpPage() {
  return <ImagingSoftwareHelp />;
}
