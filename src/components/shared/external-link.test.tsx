import { render, screen } from '@testing-library/react';
import { ExternalLink, externalLinkCopy } from './external-link';
import { Button } from '@/components/ui/button';

// DX-118 (FE-036): todo enlace que abre pestaña nueva lo avisa.
describe('ExternalLink', () => {
  it('abre en pestaña nueva sin opener ni referer y lo dice en el nombre accesible', () => {
    render(<ExternalLink href="https://wa.me/58412">WhatsApp</ExternalLink>);
    const link = screen.getByRole('link', { name: `WhatsApp ${externalLinkCopy.newTab}` });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent(externalLinkCopy.newTab);
  });

  it('con aria-label, el aviso va al final del nombre y no se duplica en el texto', () => {
    render(
      <ExternalLink href="/print/x" aria-label="Imprimir el recibo">
        <svg aria-hidden />
      </ExternalLink>,
    );
    const link = screen.getByRole('link', { name: `Imprimir el recibo ${externalLinkCopy.newTab}` });
    expect(link).not.toHaveTextContent(externalLinkCopy.newTab);
  });

  it('sirve como hijo de Button asChild', () => {
    render(
      <Button asChild variant="secondary">
        <ExternalLink href="/print/x">Imprimir</ExternalLink>
      </Button>,
    );
    const link = screen.getByRole('link', { name: `Imprimir ${externalLinkCopy.newTab}` });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.className).toContain('inline-flex');
  });
});
