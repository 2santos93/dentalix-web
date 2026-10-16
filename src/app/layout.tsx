import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/errors/toaster";
import { fetchBranding } from "@/lib/branding";
import { primaryForeground } from "@/lib/color/contrast";
import { parseTenantFromHost } from "@/lib/tenant";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  // The tenant picks the FILL; the ink on top of it is ours to derive (see the
  // comment on the <style> below). `null` for an unparseable color — then only
  // the fill is injected, exactly as before.
  const primaryFg = branding.primaryColor
    ? primaryForeground(branding.primaryColor)
    : null;

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {branding.primaryColor && (
          // `!important` guarantees the tenant brand color applies in BOTH
          // light and dark mode: `.dark { --color-primary: ... }` in
          // tokens.css has equal specificity to this injected `:root` rule,
          // so without `!important` a dark-mode session could fall back to
          // the default blue instead of the tenant's color. The dark-mode
          // default only takes effect when no tenant override exists.
          //
          // The FOREGROUND ships in the same rule, for the same reason and
          // one more: `--color-primary-fg` is the ink on top of that fill
          // (primary buttons, default badges, the selected tooth's FDI
          // number). Left alone it stays #FFFFFF in light mode — white on a
          // light tenant hue — and, because the fill above is `!important`
          // while the fg is not, `.dark` would flip the ink to #052730 over
          // a dark tenant hue. Deriving it from the injected hue's relative
          // luminance (see `@/lib/color/contrast`) keeps the pair legible
          // under any brand color; it is `!important` so `.dark` can't
          // desynchronise the two halves again.
          <style>{`:root{--color-primary:${branding.primaryColor} !important${
            primaryFg ? `;--color-primary-fg:${primaryFg} !important` : ""
          }}`}</style>
        )}
      </head>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
