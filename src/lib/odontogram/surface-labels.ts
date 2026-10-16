import type { ToothSurface } from '@/lib/odontogram/odontogram-api';

/** Nombre en español de cada cara del diente (odontograma, plan y presupuesto). */
export const SURFACE_LABELS: Record<ToothSurface, string> = {
  VESTIBULAR: 'Vestibular',
  LINGUAL: 'Lingual',
  MESIAL: 'Mesial',
  DISTAL: 'Distal',
  OCCLUSAL: 'Oclusal',
};

/** Orden en que se ofrecen las caras en los selectores. */
export const SURFACE_ORDER: ToothSurface[] = ['VESTIBULAR', 'MESIAL', 'OCCLUSAL', 'DISTAL', 'LINGUAL'];
