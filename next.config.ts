import type { NextConfig } from "next";
import { securityHeaderRules } from "./src/lib/security/security-headers";

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
};

export default nextConfig;
