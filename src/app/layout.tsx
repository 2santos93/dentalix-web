import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/errors/toaster";
import { fetchBranding } from "@/lib/branding";
import { accentStyleSheet } from "@/lib/color/accent";
import { parseTenantFromHost } from "@/lib/tenant";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  // Prefer the tenant resolved by middleware (forwarded on the request via
  // `x-tenant`); fall back to parsing `host` directly so this still works
  // when middleware didn't run (e.g. unit tests, static rendering contexts).
  const tenant = h.get("x-tenant") ?? parseTenantFromHost(h.get("host"));
  const branding = await fetchBranding(tenant);
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
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
