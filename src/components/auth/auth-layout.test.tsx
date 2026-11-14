import { render, screen } from '@testing-library/react';
import { AuthLayout } from './auth-layout';
import { HERO_IMAGES } from '@/lib/auth/hero-images';

jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: jest.fn() }),
}));

describe('AuthLayout', () => {
  it('on a clinic host the H1 is the clinic and the task is the support line; «Dentalix» does not show', () => {
    const { container } = render(
      <AuthLayout clinic={{ name: 'Clínica Sonrisa', logoUrl: null }} task="Inicia sesión en tu cuenta">
        <form />
      </AuthLayout>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Clínica Sonrisa');
    expect(screen.getByText('Inicia sesión en tu cuenta')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Dentalix/);
  });

  it('a clinic logo goes in the header, decorative (the name is already the H1)', () => {
    const { container } = render(
      <AuthLayout clinic={{ name: 'Clínica Sonrisa', logoUrl: 'https://cdn.example.com/logo.png' }} task="Acepta tu invitación">
        <form />
      </AuthLayout>,
    );
    const logo = container.querySelector('header img');
    expect(logo).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
    expect(logo).toHaveAttribute('alt', '');
  });

  it('without a clinic (apex) the H1 is the task and «Dentalix» shows once, as the wordmark', () => {
    const { container } = render(
      <AuthLayout clinic={null} task="Inicia sesión" caption="Tu clínica, siempre al día">
        <form />
      </AuthLayout>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inicia sesión');
    expect(container.textContent?.match(/Dentalix/g)).toHaveLength(1);
    // Sin heroImage: el panel lateral es tipográfico.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Tu clínica, siempre al día')).toBeInTheDocument();
  });

  it('with a heroImage the side panel shows that photo with its alt, and the caption over a veil', () => {
    const hero = HERO_IMAGES[2];
    const { container } = render(
      <AuthLayout clinic={null} task="Inicia sesión" caption="Tu clínica, siempre al día" heroImage={hero}>
        <form />
      </AuthLayout>,
    );
    const img = screen.getByAltText(hero.alt);
    expect(img).toHaveAttribute('src', hero.src);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img.className).toContain('object-cover');
    // El panel es el único con foto, y la frase sigue ahí, en blanco.
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(screen.getByText('Tu clínica, siempre al día')).toHaveClass('text-white');
    expect(img.closest('div')).toHaveClass('hidden', 'lg:flex');
    // Velo neutro, sin color de marca.
    expect(container.querySelector('[aria-hidden].bg-gradient-to-t')?.className).toMatch(/from-black\//);
  });

  it('DX-117 (FE-023): la foto es un <picture>: bajo lg un GIF en línea (sin petición) y desde lg AVIF, WebP y el JPG de respaldo', () => {
    const hero = HERO_IMAGES[0];
    const { container } = render(
      <AuthLayout clinic={null} task="Inicia sesión" heroImage={hero}>
        <form />
      </AuthLayout>,
    );
    const picture = container.querySelector('picture');
    expect(picture).not.toBeNull();
    const sources = Array.from(picture!.querySelectorAll('source'));
    // El orden importa: el navegador usa la primera que encaja.
    expect(sources.map((s) => [s.getAttribute('media'), s.getAttribute('type'), s.getAttribute('srcset')])).toEqual([
      ['not all and (min-width: 1024px)', null, expect.stringMatching(/^data:image\/gif;base64,/)],
      ['(min-width: 1024px)', 'image/avif', hero.avif],
      ['(min-width: 1024px)', 'image/webp', hero.webp],
    ]);
    expect(picture!.querySelector('img')).toHaveAttribute('src', hero.src);
  });

  it('the H1 and header are unchanged by the photo', () => {
    render(
      <AuthLayout clinic={null} task="Inicia sesión" heroImage={HERO_IMAGES[0]}>
        <form />
      </AuthLayout>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inicia sesión');
  });
});
