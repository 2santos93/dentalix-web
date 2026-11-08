import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { BrandingProvider } from "@/components/brand/branding-context";
import { CurrencyTextsSync } from "@/components/brand/currency-texts-sync";
import { Toaster } from "@/components/errors/toaster";
import { brandingForRequest } from "@/lib/branding";
import { accentStyleSheet } from "@/lib/color/accent";
import "./globals.css";

// Inter variable with the optical-size axis: text forms at UI sizes, display
// forms on headings, one file (DESIGN.md → Typography).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dentalix",
  description: "Plataforma de gestión odontológica",
};

// A4: `viewport-fit=cover` hace que `env(safe-area-inset-*)` resuelva (barra
// inferior del móvil sobre el indicador de inicio de iOS). El color de la barra
// del sistema es el lienzo (`--color-canvas` de tokens.css, claro y oscuro), no
// el acento: una barra de estado teñida pelearía con la calma clínica.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F9FC" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F14" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  // DX-517-ter: la marca de la clínica de ESTE host, en el servidor, para que
  // el primer HTML ya la traiga (sin parpadeo ni remontaje). Por el `Host` que
  // recibió Next: el mismo que su proxy manda a la API como X-Forwarded-Host
  // para las llamadas del navegador. Una consulta por petición (React
  // `cache`, la comparte `authContext`) y caché por host de 30 s.
  const branding = await brandingForRequest(h.get("host"));
  // Nonce de la CSP de esta petición (lo genera proxy.ts, DX-062).
  const nonce = h.get("x-nonce") ?? undefined;
  // The tenant picks ONE color; the whole accent family (fill, ink on it,
  // hover, text, subtle, border — light and dark) is derived from it with
  // guaranteed AA contrast (see `@/lib/color/accent`). `null` for an
  // unparseable color — then the factory tokens stay.
  const accentCss = branding.primaryColor
    ? accentStyleSheet(branding.primaryColor)
    : null;

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        {accentCss && (
          // Both blocks carry `!important`: `.dark` in tokens.css has the
          // same specificity as this `:root`, and the injected `.dark` block
          // comes after the injected `:root`, so each theme keeps its own
          // derived family and the factory dark accent never leaks in.
          <style>{accentCss}</style>
        )}
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <ThemeProvider nonce={nonce}>
          <BrandingProvider
            status={branding.status}
            value={{ name: branding.name, logoUrl: branding.logoUrl, primaryColor: branding.primaryColor }}
          >
            {/* DX-517: el texto propio de cada moneda, antes de pintar ningún importe. */}
            <CurrencyTextsSync status={branding.status} value={branding.currencyTexts}>
              {children}
            </CurrencyTextsSync>
          </BrandingProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
