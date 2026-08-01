import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador de dev de Next se planta abajo a la izquierda, justo encima del
  // pie del sidebar: con el sidebar en rail cubre el botón de cuenta entero y lo
  // deja inclicable. A la derecha no estorba a nada.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
