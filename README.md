This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Variables de entorno

Copia `.env.example` a `.env.local`. La URL de la API y el origen de los
ficheros son variables de **servidor** que se leen en runtime (DX-083), así la
misma imagen sirve en staging y en producción:

| Variable | Para qué | Por defecto (fuera de producción) |
|---|---|---|
| `API_URL` | Destino del proxy `/api/v1` (`src/proxy.ts`), SSR y subida de la importación | `http://localhost:3000/api/v1` |
| `FILES_ORIGIN` | Origen del bucket en la CSP (`img-src`, `frame-src`, `connect-src`) | el origen de `API_URL` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Dominio raíz de las clínicas; se incrusta al compilar (build-arg de la imagen) | `dentalix.local` |

**Migración**: `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_FILES_ORIGIN` ya no se
leen. Si siguen en tu `.env.local`, renómbralas a `API_URL` y `FILES_ORIGIN`;
la web avisa al arrancar mientras no lo hagas. En producción (`next start` o
la imagen) la web no arranca sin una `API_URL` http(s) válida.

Imagen de producción: `Dockerfile` (`output: 'standalone'`); runbook en
`dentalix-docs/docs/operacion/despliegue.md`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Pruebas e2e y PDF

La suite e2e requiere `pdftotext` de Poppler para verificar el texto de los PDF. En macOS instala `brew install poppler`; en Debian o Ubuntu instala el paquete `poppler-utils`. Después ejecuta `scripts/e2e-ci.sh setup` antes de las demás fases de la suite.
