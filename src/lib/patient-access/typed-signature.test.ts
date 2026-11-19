import { renderTypedSignature, TYPED_SIGNATURE_INK } from './typed-signature';

function fakeDocument(width: (font: string, text: string) => number, context = true) {
  const ctx: {
    font: string;
    fillStyle: string;
    textBaseline: string;
    textAlign: string;
    measureText: jest.Mock<{ width: number }, [string]>;
    fillText: jest.Mock;
  } = {
    font: '',
    fillStyle: '',
    textBaseline: '',
    textAlign: '',
    measureText: jest.fn((text: string): { width: number } => ({ width: width(ctx.font, text) })),
    fillText: jest.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: jest.fn(() => (context ? ctx : null)),
    toDataURL: jest.fn(() => 'data:image/png;base64,ABC'),
  };
  const doc = { createElement: jest.fn(() => canvas) } as unknown as Document;
  return { doc, ctx, canvas };
}

const sizeOf = (font: string) => Number(/(\d+)px/.exec(font)?.[1] ?? 0);

test('vacío o solo espacios: null, sin lienzo', () => {
  const { doc } = fakeDocument(() => 100);
  expect(renderTypedSignature('   ', doc)).toBeNull();
  expect(doc.createElement).not.toHaveBeenCalled();
});

test('pinta el nombre recortado con tinta fija y letra manuscrita, y entrega el PNG', () => {
  const { doc, ctx, canvas } = fakeDocument(() => 300);
  expect(renderTypedSignature('  María   José Pérez ', doc)).toBe('data:image/png;base64,ABC');
  expect(ctx.fillText).toHaveBeenCalledWith('María José Pérez', 24, 80, expect.any(Number));
  expect(ctx.fillStyle).toBe(TYPED_SIGNATURE_INK);
  expect(ctx.font).toMatch(/^italic 64px .*cursive$/);
  expect(canvas.width).toBe(348);
  expect(canvas.height).toBe(160);
  expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
});

test('un nombre muy largo encoge la letra hasta caber (≤ 1200 px de ancho)', () => {
  const { doc, ctx, canvas } = fakeDocument((font, text) => sizeOf(font) * text.length * 0.6);
  renderTypedSignature('M'.repeat(40), doc);
  expect(sizeOf(ctx.font)).toBeLessThan(64);
  expect(canvas.width).toBeLessThanOrEqual(1200);
});

test('sin lienzo 2D: null (la pantalla ofrece «Dibujar»)', () => {
  const { doc } = fakeDocument(() => 100, false);
  expect(renderTypedSignature('Ana', doc)).toBeNull();
});
