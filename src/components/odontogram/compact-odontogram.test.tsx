import { render, screen } from '@testing-library/react';
import { CompactOdontogram } from './compact-odontogram';

describe('DX-560 · CompactOdontogram', () => {
  it('es una imagen con los dientes de la visita, marcados y sin controles', () => {
    const { container } = render(<CompactOdontogram teeth={['16', '26']} />);
    const img = screen.getByRole('img', { name: 'Dientes de esta visita: 16, 26' });
    expect(img).toBeInTheDocument();
    expect(container.querySelectorAll('[data-tooth]')).toHaveLength(32);
    const marked = [...container.querySelectorAll('[data-marked="true"]')].map((g) => g.getAttribute('data-tooth'));
    expect(marked.sort()).toEqual(['16', '26']);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('[tabindex]')).toBeNull();
  });

  it('con solo temporales dibuja la dentición temporal (20 dientes)', () => {
    const { container } = render(<CompactOdontogram teeth={['55', '85']} />);
    expect(container.querySelectorAll('[data-tooth]')).toHaveLength(20);
    expect(container.querySelector('[data-tooth="55"]')).toHaveAttribute('data-marked', 'true');
    expect(container.querySelector('[data-tooth="16"]')).toBeNull();
  });

  it('mixta: el temporal en su posición y el permanente en las demás', () => {
    const { container } = render(<CompactOdontogram teeth={['55', '36']} />);
    expect(container.querySelector('[data-tooth="55"]')).toHaveAttribute('data-marked', 'true');
    expect(container.querySelector('[data-tooth="15"]')).toBeNull();
    expect(container.querySelector('[data-tooth="36"]')).toHaveAttribute('data-marked', 'true');
    expect(container.querySelectorAll('[data-tooth]')).toHaveLength(32);
  });
});
