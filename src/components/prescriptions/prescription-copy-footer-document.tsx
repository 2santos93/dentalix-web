/**
 * DX-468: el pie de la copia de la receta para el paciente («Copia para el
 * paciente…» o el de la clínica). Es papel como la receta (tinta fija sobre
 * blanco, sea cual sea el tema) y sale también al imprimir o guardar como PDF
 * (`prescription-print-root` lo reabre frente a la base de impresión).
 */
export function PrescriptionCopyFooterDocument({ text }: { text: string }) {
  return (
    <p
      data-testid="prescription-copy-footer"
      className="prescription-print-root border-t border-[#e5e7eb] bg-white px-4 py-4 text-sm font-medium text-[#111827] sm:px-10 print:px-0"
    >
      {text}
    </p>
  );
}
