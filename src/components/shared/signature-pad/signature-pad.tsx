'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const copy = {
  clear: 'Borrar',
  placeholder: 'Firme aquí',
  empty: 'Sin firma',
  captured: 'Firma capturada',
};

/**
 * Tinta fija y fondo blanco: la firma es un documento que se imprime, así que
 * se ve igual en modo claro y oscuro (misma excepción de fidelidad de
 * impresión que el estado de cuenta y el comprobante de abono).
 */
const INK = '#111827';
const LINE_WIDTH = 2.5;
/** Más resolución no aporta a una firma y engorda el PNG (la API topa 200 KB). */
const MAX_PIXEL_RATIO = 2;

/** Punto normalizado (0..1) al tamaño del lienzo: sobrevive a un redimensionado. */
interface Point {
  x: number;
  y: number;
}

export interface SignaturePadProps {
  /** Nombre accesible y etiqueta visible del lienzo. */
  label: string;
  /** Instrucción bajo el lienzo (p. ej. «Firme con el dedo o el ratón»). */
  hint?: string;
  /**
   * PNG (`data:image/png;base64,…`) al terminar cada trazo; `null` al borrar.
   * El componente no es controlado: el padre solo recibe el resultado.
   */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  clearLabel?: string;
  /** Alto del lienzo en px CSS (el ancho llena el contenedor). */
  height?: number;
  className?: string;
}

/**
 * Lienzo de firma reutilizable (DX-006; lo reutiliza DX-037). Pointer Events:
 * dedo, lápiz y ratón con el mismo código. `touch-action: none` evita que el
 * gesto de firmar desplace o haga zoom en la página en un móvil o una tablet.
 *
 * Los trazos se guardan normalizados y se repintan al cambiar el tamaño del
 * contenedor (rotar la tablet no borra la firma). El lienzo se dibuja a la
 * densidad del dispositivo (hasta 2x) para que el trazo no salga borroso.
 *
 * Accesibilidad: el lienzo es un `img` con nombre y descripción, y un `status`
 * anuncia si hay firma. Firmar exige un gesto: no hay alternativa por teclado,
 * igual que en papel; el botón «Borrar» sí es operable con teclado.
 */
export function SignaturePad({
  label,
  hint,
  onChange,
  disabled = false,
  clearLabel = copy.clear,
  height = 160,
  className,
}: SignaturePadProps) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  /** Puntero que está firmando; otro dedo o la palma se ignoran mientras tanto. */
  const activePointer = useRef<number | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const context = useCallback((): CanvasRenderingContext2D | null => {
    return canvasRef.current?.getContext('2d') ?? null;
  }, []);

  /** Ajusta la resolución interna al tamaño en pantalla y repinta los trazos. */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    const width = canvas.clientWidth || canvas.width;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    // Reasignar el tamaño realoca el lienzo: solo si cambió (no en cada
    // movimiento del dedo, que en una tablet modesta se nota).
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    for (const stroke of strokes.current) {
      if (stroke.length === 0) continue;
      const [first, ...rest] = stroke;
      ctx.beginPath();
      ctx.moveTo(first.x * width, first.y * height);
      if (rest.length === 0) {
        // Un toque sin movimiento: un trazo mínimo, que con `lineCap: round` es un punto.
        ctx.lineTo(first.x * width + 0.1, first.y * height);
      }
      for (const p of rest) ctx.lineTo(p.x * width, p.y * height);
      ctx.stroke();
    }
  }, [context, height]);

  useEffect(() => {
    redraw();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [redraw]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width || 1;
    const h = rect.height || height;
    return {
      x: Math.min(Math.max((event.clientX - rect.left) / width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / h, 0), 1),
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.preventDefault();
    if (activePointer.current !== null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointer.current = event.pointerId;
    strokes.current.push([pointFrom(event)]);
    redraw();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId || disabled) return;
    event.preventDefault();
    strokes.current[strokes.current.length - 1].push(pointFrom(event));
    redraw();
  }

  function finishStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setIsEmpty(false);
    onChange(canvasRef.current?.toDataURL('image/png') ?? null);
  }

  function handleClear() {
    strokes.current = [];
    activePointer.current = null;
    redraw();
    setIsEmpty(true);
    onChange(null);
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="text-sm font-medium text-ink">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={disabled || isEmpty}
        >
          <Eraser aria-hidden />
          {clearLabel}
        </Button>
      </div>
      <div
        ref={wrapRef}
        className={cn(
          'relative overflow-hidden rounded-lg border border-border bg-white',
          disabled && 'opacity-50',
        )}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-labelledby={labelId}
          aria-describedby={hint ? hintId : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          style={{ height }}
          className={cn(
            'block w-full touch-none select-none',
            disabled ? 'cursor-not-allowed' : 'cursor-crosshair',
          )}
        />
        {/* Línea de firma y marca de agua: solo guían, no se exportan. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-[#cbd5e1]"
        />
        {isEmpty ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-10 left-6 text-sm text-[#64748b]"
          >
            {copy.placeholder}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        {hint ? (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        ) : (
          <span />
        )}
        <p role="status" className="text-xs text-muted">
          {isEmpty ? copy.empty : copy.captured}
        </p>
      </div>
    </div>
  );
}
