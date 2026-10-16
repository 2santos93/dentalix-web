import type { NextConfig } from "next";
import { securityHeaderRules } from "./src/lib/security/security-headers";
import { apiRewrites } from "./src/lib/api/api-base";

const nextConfig: NextConfig = {
  // El indicador de dev de Next se planta abajo a la izquierda, justo encima del
  // pie del sidebar: con el sidebar en rail cubre el botón de cuenta entero y lo
  // deja inclicable. A la derecha no estorba a nada.
  devIndicators: {
    position: "bottom-right",
  },
  // No anunciar el framework (`x-powered-by: Next.js`) — DX-061.
  poweredByHeader: false,
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
};

export default nextConfig;
