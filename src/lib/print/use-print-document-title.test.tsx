import { render } from '@testing-library/react';
import { usePrintDocumentTitle } from './use-print-document-title';

function Probe({ specific }: { specific: string | null }) {
  usePrintDocumentTitle('Receta', specific);
  return null;
}

describe('usePrintDocumentTitle (DX-118)', () => {
  it('al cargar el título es el genérico; con el nombre solo entre beforeprint y afterprint', () => {
    render(<Probe specific="Receta · Ana Ruiz" />);
    expect(document.title).toBe('Receta');
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.title).toBe('Receta · Ana Ruiz');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Receta');
  });

  it('sin datos aún, imprime con el genérico', () => {
    render(<Probe specific={null} />);
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.title).toBe('Receta');
  });

  it('al desmontar deja de escuchar', () => {
    const { unmount } = render(<Probe specific="Receta · Ana Ruiz" />);
    unmount();
    document.title = 'Otra';
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.title).toBe('Otra');
  });
});
