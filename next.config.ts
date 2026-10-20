import type { NextConfig } from "next";
import { securityHeaderRules } from "./src/lib/security/security-headers";
import { API_PROXY_MAX_BODY_BYTES, apiRewrites } from "./src/lib/api/api-base";

const nextConfig: NextConfig = {
  // El indicador de dev de Next se planta abajo a la izquierda, justo encima del
  // pie del sidebar: con el sidebar en rail cubre el botón de cuenta entero y lo
  // deja inclicable. A la derecha no estorba a nada.
  devIndicators: {
    position: "bottom-right",
  },
  // No anunciar el framework (`x-powered-by: Next.js`) — DX-061.
  poweredByHeader: false,
  // La web no usa `next/image` (las imágenes son `<img>`: logos del tenant en
  // hosts arbitrarios, data URLs de firmas). Con `unoptimized` el endpoint
  // `/_next/image` responde 404 y no se expone el optimizador de imágenes, que
  // acumula avisos de seguridad (RCE con AVIF, SSRF) — DX-080. Si algún día se
  // adopta `next/image`, quitar esto y configurar `remotePatterns` al mínimo.
  images: {
    unoptimized: true,
  },
  // Cabeceras de seguridad en todas las rutas (anti-clickjacking, nosniff,
  // referrer y permissions) — DX-061. Ver `security-headers.ts`.
  async headers() {
    return securityHeaderRules();
  },
  // El navegador llama a la API por el MISMO origen (`/api/v1` en el host de la
  // clínica) y Next lo reenvía a NEXT_PUBLIC_API_URL: así la cookie HttpOnly del
  // refresh es del host de la clínica (DX-062, ver `api-base.ts`).
  async rewrites() {
    return apiRewrites();
  },
  experimental: {
    // Sin esto Next corta a 10 MB el cuerpo que reenvía por el rewrite y una
    // subida de documento de 10–20 MB llega truncada a la API (DX-151).
    proxyClientMaxBodySize: API_PROXY_MAX_BODY_BYTES,
  },
};

export default nextConfig;
