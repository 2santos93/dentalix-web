import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // DX-063: el texto de un error de la API llega en inglés técnico («Insufficient
  // role», «Patient not found»). Lo que se enseña sale SOLO de
  // `apiErrorMessage()` (src/lib/api/error-message.ts), así que fuera de
  // src/lib/api no se lee `.message`/`.messages` de un error. Lo comprueba
  // src/lib/api/error-message-lint.test.ts.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/api/**", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name=/^messages?$/][object.name=/^(e|err|error|ex|exc|exception|apiError|apiErr|cause|reason|failure)$/]",
          message:
            "No leas `.message` de un error: puede venir en inglés técnico. Usa apiErrorMessage() de @/lib/api/error-message.",
        },
        {
          selector:
            ":matches(ConditionalExpression[test.operator='instanceof'][test.right.name='ApiError'], IfStatement[test.operator='instanceof'][test.right.name='ApiError'], LogicalExpression[left.operator='instanceof'][left.right.name='ApiError']) MemberExpression[property.name=/^messages?$/]:not([object.name=/^(e|err|error|ex|exc|exception|apiError|apiErr|cause|reason|failure)$/])",
          message:
            "No muestres `ApiError.message`: usa apiErrorMessage() de @/lib/api/error-message, que da el texto en español.",
        },
        {
          selector:
            "MemberExpression[property.name=/^messages?$/][object.type='TSAsExpression'][object.typeAnnotation.typeName.name='ApiError']",
          message:
            "No muestres `ApiError.message`: usa apiErrorMessage() de @/lib/api/error-message, que da el texto en español.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
