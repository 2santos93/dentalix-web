import { ImageResponse } from 'next/og';
import { fetchBrandingForHost } from '@/lib/branding';
import { iconColors, iconMonogram, isIconSize } from '@/lib/pwa/web-manifest';

// DX-405: icono de la app instalable (y `apple-touch-icon`) de la clínica del
// host: sus iniciales sobre su color. Un cuadrado propio y no el logo, que
// puede no ser cuadrado ni estar en un tamaño útil. `?maskable=1` deja el
// margen de seguridad de los iconos adaptables de Android.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ size: string }> }): Promise<Response> {
  const size = Number((await ctx.params).size);
  if (!isIconSize(size)) return new Response(null, { status: 404 });
  const maskable = new URL(req.url).searchParams.get('maskable') === '1';
  const branding = await fetchBrandingForHost(req.headers.get('host'));
  const { fill, ink } = iconColors(branding.primaryColor);
  const letters = iconMonogram(branding.name);
  const scale = maskable ? 0.3 : letters.length > 1 ? 0.4 : 0.5;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: fill,
          color: ink,
          fontSize: Math.round(size * scale),
          fontWeight: 600,
          letterSpacing: '-0.02em',
          // iOS redondea el `apple-touch-icon` (180) él mismo: va a sangre.
          borderRadius: maskable || size === 180 ? 0 : Math.round(size * 0.18),
        }}
      >
        {letters}
      </div>
    ),
    { width: size, height: size, headers: { 'cache-control': 'public, max-age=300' } },
  );
}
