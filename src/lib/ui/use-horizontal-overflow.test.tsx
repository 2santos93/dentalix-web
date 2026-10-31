import { render, screen } from '@testing-library/react';
import { useHorizontalOverflow } from './use-horizontal-overflow';

function Frame() {
  const [ref, overflows] = useHorizontalOverflow<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="frame" data-overflows={String(overflows)}>
      <span />
    </div>
  );
}

function renderWith(scrollWidth: number, clientWidth: number) {
  const scroll = jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
  const client = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
  render(<Frame />);
  scroll.mockRestore();
  client.mockRestore();
  return screen.getByTestId('frame');
}

beforeAll(() => {
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('useHorizontalOverflow', () => {
  it('no marca un marco cuyo contenido cabe', () => {
    expect(renderWith(300, 300)).toHaveAttribute('data-overflows', 'false');
  });

  it('marca un marco con 1 px de más, como el navegador y axe', () => {
    expect(renderWith(301, 300)).toHaveAttribute('data-overflows', 'true');
  });
});
