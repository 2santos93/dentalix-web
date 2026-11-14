/**
 * DX-516: un porcentaje configurado («3 %», «7,5 %»), con hasta 2 decimales y
 * la coma de los importes (`formatCurrency` usa el mismo locale). Vive en
 * lib/format: es el único sitio donde se fija el locale de un formateador.
 */
export function formatPercent(percent: number, locale = 'es'): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(percent)} %`;
}
