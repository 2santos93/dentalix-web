import * as React from 'react';

export const externalLinkCopy = {
  newTab: '(se abre en una pestaña nueva)',
};

type ExternalLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'>;

/**
 * DX-118 (FE-036): el único enlace que abre pestaña nueva. Lo avisa a quien no
 * lo ve: añade «(se abre en una pestaña nueva)» al texto (sr-only) o, si el
 * enlace se nombra con `aria-label`, al final de ese nombre. `rel` corta la
 * ventana que lo abre (`noopener`) y el Referer (`noreferrer`): un enlace a
 * WhatsApp o a un visor no necesita saber de dónde viene.
 *
 * Sirve como hijo de `<Button asChild>`: recibe y reenvía `ref` y props.
 */
export const ExternalLink = React.forwardRef<HTMLAnchorElement, ExternalLinkProps>(function ExternalLink(
  { children, 'aria-label': ariaLabel, ...props },
  ref,
) {
  return (
    <a
      ref={ref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel ? `${ariaLabel} ${externalLinkCopy.newTab}` : undefined}
      {...props}
    >
      {children}
      {ariaLabel ? null : <span className="sr-only"> {externalLinkCopy.newTab}</span>}
    </a>
  );
});
