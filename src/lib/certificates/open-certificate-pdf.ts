import { saveBlob } from '@/lib/files/save-blob';
import { fetchCertificatePdf } from './certificates-api';

/** Cuánto vive la URL temporal del PDF abierto en otra pestaña (ms): el visor la lee al cargar. */
export const CERTIFICATE_PDF_URL_LIFETIME_MS = 60_000;

/**
 * «Imprimir» un certificado (DX-306): el PDF exige la sesión, así que no hay
 * enlace directo. La pestaña se abre YA, dentro del clic (si no, el bloqueador
 * de ventanas la frena), y se lleva al PDF cuando llega como `Blob`. Si el
 * navegador la bloqueó igualmente, el PDF se descarga. Un fallo cierra la
 * pestaña en blanco y se propaga: quien llama lo enseña (escalón 3 o 4).
 */
export async function openCertificatePdf(token: string, patientId: string, certificateId: string): Promise<void> {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const { blob, fileName } = await fetchCertificatePdf(token, patientId, certificateId);
    const pdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
    if (!tab) {
      saveBlob(pdf, fileName ?? `certificado-${certificateId}.pdf`);
      return;
    }
    const url = URL.createObjectURL(pdf);
    tab.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), CERTIFICATE_PDF_URL_LIFETIME_MS);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
