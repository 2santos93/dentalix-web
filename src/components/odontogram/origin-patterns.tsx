import { ORIGIN_PATTERN_ID } from '@/lib/odontogram/origin';

/**
 * Tramas SVG de los orígenes externos (DX-120): rayado diagonal = «Ya
 * presente», punteado = «Otro profesional». Se definen una vez junto a la
 * carta; dientes y leyenda las referencian por id. `text-ink` fija el
 * `currentColor` de la trama, así sigue al tema claro u oscuro.
 */
export function OriginPatterns() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute text-ink">
      <defs>
        <pattern
          id={ORIGIN_PATTERN_ID.PRE_EXISTING}
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.8" />
        </pattern>
        <pattern id={ORIGIN_PATTERN_ID.OTHER_PROVIDER} patternUnits="userSpaceOnUse" width="6" height="6">
          <circle cx="3" cy="3" r="1.5" fill="currentColor" fillOpacity="0.8" />
        </pattern>
      </defs>
    </svg>
  );
}
