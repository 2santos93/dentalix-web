import type { PayerCountry, PayerType } from '@/lib/payers/payers-api';

export const PAYER_TYPE_LABELS: Record<PayerType, string> = {
  MUTUA_ES: 'Mutua (España)',
  PREPAGADA_CO: 'Prepagada (Colombia)',
  EPS_CO: 'EPS (Colombia)',
  EMPRESA: 'Empresa',
  OTRO: 'Otro / sin clasificar',
};

export const PAYER_COUNTRY_LABELS: Record<PayerCountry, string> = {
  CO: 'Colombia',
  ES: 'España',
};

/** Texto de la columna «País» cuando el pagador no tiene país. */
export const PAYER_NO_COUNTRY_LABEL = '—';
