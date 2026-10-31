import type { NextConfig } from "next";
import { securityHeaderRules } from "./src/lib/security/security-headers";
import { API_PROXY_MAX_BODY_BYTES } from "./src/lib/api/api-base";

const nextConfig: NextConfig = {
  // DX-083: `.next/standalone` con un `server.js` mínimo y solo las
  // dependencias que se usan; es lo que copia el Dockerfile. Nada de la
  // configuración de despliegue (URL de la API, origen de ficheros) se fija al
  // compilar: ver `src/lib/api/api-base.ts`.
  output: "standalone",
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
  // clínica) y Next lo reenvía a la API: así la cookie HttpOnly del refresh es
  // del host de la clínica (DX-062). Ese reenvío NO es un `rewrites()` de aquí
  // (se fijaría al compilar): lo hace `src/proxy.ts` con `API_URL` leída en
  // runtime (DX-083).
  experimental: {
    // DX-259 (OPS-038): Next copia en memoria el cuerpo de cada petición que
    // reescribe, y por defecto hasta 10 MB; 1 MB basta para la API (los
    // documentos van directos al bucket y la importación de pacientes, por
    // `/api/import-upload/*` en streaming). Ver `api-base.ts`.
    proxyClientMaxBodySize: API_PROXY_MAX_BODY_BYTES,
  },
};

export default nextConfig;
