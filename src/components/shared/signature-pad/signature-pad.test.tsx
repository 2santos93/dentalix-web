import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignaturePad } from './signature-pad';

// jsdom no implementa canvas: se simula el contexto 2D (para afirmar que se
// dibuja) y `toDataURL` (lo que el componente entrega al padre).
const ctx = {
  setTransform: jest.fn(),
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  lineWidth: 0,
  lineCap: '',
  lineJoin: '',
  strokeStyle: '',
};

// jsdom no trae PointerEvent: sin él, `pointerId` se pierde y no se pueden
// distinguir dos dedos. Basta con un MouseEvent que lo conserve.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

beforeAll(() => {
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  jest
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementation(() => 'data:image/png;base64,FIRMA');
  // jsdom tampoco implementa la captura de puntero.
  HTMLCanvasElement.prototype.setPointerCapture = jest.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
});

function draw(canvas: HTMLElement, points: [number, number][], pointerType = 'touch') {
  const [first, ...rest] = points;
  fireEvent.pointerDown(canvas, { clientX: first[0], clientY: first[1], pointerId: 1, pointerType, buttons: 1 });
  for (const [x, y] of rest) {
    fireEvent.pointerMove(canvas, { clientX: x, clientY: y, pointerId: 1, pointerType, buttons: 1 });
  }
  fireEvent.pointerUp(canvas, { pointerId: 1, pointerType });
}

describe('SignaturePad', () => {
  it('expone el lienzo con su etiqueta y la ayuda, y empieza vacío', () => {
    render(<SignaturePad label="Firma del paciente" hint="Firme con el dedo" onChange={jest.fn()} />);
    const canvas = screen.getByRole('img', { name: 'Firma del paciente' });
    expect(canvas).toHaveAccessibleDescription(/Firme con el dedo/);
    expect(screen.getByRole('status')).toHaveTextContent('Sin firma');
    expect(screen.getByRole('button', { name: /borrar/i })).toBeDisabled();
  });

  it('al terminar un trazo entrega un PNG y habilita «Borrar»', () => {
    const onChange = jest.fn();
    render(<SignaturePad label="Firma" onChange={onChange} />);
    draw(screen.getByRole('img', { name: 'Firma' }), [
      [10, 10],
      [40, 30],
      [80, 20],
    ]);

    expect(ctx.stroke).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith('data:image/png;base64,FIRMA');
    expect(screen.getByRole('status')).toHaveTextContent('Firma capturada');
    expect(screen.getByRole('button', { name: /borrar/i })).toBeEnabled();
  });

  it('funciona igual con ratón', () => {
    const onChange = jest.fn();
    render(<SignaturePad label="Firma" onChange={onChange} />);
    draw(
      screen.getByRole('img', { name: 'Firma' }),
      [
        [5, 5],
        [25, 25],
      ],
      'mouse',
    );
    expect(onChange).toHaveBeenCalledWith('data:image/png;base64,FIRMA');
  });

  it('un toque sin movimiento también cuenta como trazo (un punto)', () => {
    const onChange = jest.fn();
    render(<SignaturePad label="Firma" onChange={onChange} />);
    draw(screen.getByRole('img', { name: 'Firma' }), [[10, 10]]);
    expect(onChange).toHaveBeenCalledWith('data:image/png;base64,FIRMA');
  });

  it('«Borrar» limpia el lienzo y avisa con null', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<SignaturePad label="Firma" onChange={onChange} clearLabel="Borrar firma" />);
    draw(screen.getByRole('img', { name: 'Firma' }), [
      [10, 10],
      [30, 30],
    ]);

    await user.click(screen.getByRole('button', { name: 'Borrar firma' }));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Sin firma');
    expect(screen.getByRole('button', { name: 'Borrar firma' })).toBeDisabled();
  });

  it('deshabilitado no dibuja', () => {
    const onChange = jest.fn();
    render(<SignaturePad label="Firma" onChange={onChange} disabled />);
    draw(screen.getByRole('img', { name: 'Firma' }), [
      [10, 10],
      [30, 30],
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('un segundo dedo (o la palma) no se mezcla con el trazo en curso', () => {
    const onChange = jest.fn();
    render(<SignaturePad label="Firma" onChange={onChange} />);
    const canvas = screen.getByRole('img', { name: 'Firma' });
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'touch' });
    // La palma apoya mientras el dedo firma: ni abre trazo ni lo cierra.
    fireEvent.pointerDown(canvas, { clientX: 200, clientY: 150, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerMove(canvas, { clientX: 210, clientY: 150, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch' });
    expect(onChange).not.toHaveBeenCalled();

    ctx.beginPath.mockClear();
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 30, pointerId: 1, pointerType: 'touch' });
    // El repintado tiene UN solo trazo: la palma no abrió otro.
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('el lienzo no deja que el gesto desplace la página', () => {
    render(<SignaturePad label="Firma" onChange={jest.fn()} />);
    // `touch-none` = `touch-action: none` (jsdom no conserva esa propiedad en línea).
    expect(screen.getByRole('img', { name: 'Firma' })).toHaveClass('touch-none');
  });
});
