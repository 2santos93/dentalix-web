import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DX-274-bis: las categorías predefinidas de gastos usaban dos regionalismos
 * («Alquiler» y «Limpieza y cafetería» son los términos neutros). El producto
 * es mundial y nada regional entra; esta guarda impide que vuelvan, en
 * cualquier fichero versionado (código, pruebas, e2e, `schema.d.ts`,
 * documentación). Gemela de la guarda de la API. Los términos se arman por
 * partes para que este fichero no se delate a sí mismo; la autoprueba fija
 * que cada uno se detecta.
 */
const REPO_ROOT = join(__dirname, "..", "..");

/**
 * La única excepción: esta guarda. La web no guarda ni conoce los nombres
 * anteriores (el alias de entrada vive en la API).
 */
const EXCLUDED: readonly RegExp[] = [
  /^src\/architecture\/no-regional-expense-categories\.test\.ts$/,
];

const RENT = "arr" + "iend";
const CLEANING = "as" + String.raw`eo\s+y\s+cafeter[ií]a`;

const FORBIDDEN = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${RENT}(?:o|os|a|as)?(?![\\p{L}\\p{N}_])|${CLEANING})`,
  "iu",
);

export function namesRegionalExpenseCategory(line: string): boolean {
  return FORBIDDEN.test(line);
}

const BINARY = /\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|xlsx)$/i;

function trackedTextFiles(): string[] {
  return execFileSync("git", ["ls-files"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter((file) => file !== "" && !BINARY.test(file));
}

describe("categorías de gastos sin regionalismos (DX-274-bis)", () => {
  it("ningún fichero versionado fuera de las excepciones los nombra", () => {
    const files = trackedTextFiles();
    expect(files.length).toBeGreaterThan(1000);
    const hits = files
      .filter((file) => !EXCLUDED.some((rule) => rule.test(file)))
      .flatMap((file) =>
        readFileSync(join(REPO_ROOT, file), "utf8")
          .split("\n")
          .flatMap((line, i) =>
            namesRegionalExpenseCategory(line)
              ? [`${file}:${i + 1}: ${line.trim().slice(0, 120)}`]
              : [],
          ),
      );
    expect(hits).toEqual([]);
  });

  it("cada excepción sigue haciendo falta", () => {
    const files = trackedTextFiles();
    for (const rule of EXCLUDED) {
      expect({
        rule: rule.source,
        used: files.some((file) => rule.test(file)),
      }).toEqual({ rule: rule.source, used: true });
    }
  });

  it("la guarda detecta cada término y deja pasar lo parecido", () => {
    const rent = "Arr" + "iendo";
    const cleaning = "As" + "eo y cafetería";
    for (const line of [
      `category: '${rent}',`,
      `@ApiProperty({ example: '${rent}' })`,
      `/** ${rent} de un trabajo reclamado. */`,
      `RUNNING con el ${rent.toLowerCase()} vencido`,
      `${rent.toUpperCase()}S vencidos`,
      `category: '${cleaning}',`,
      `'${cleaning.toLowerCase().replace("í", "i")}'`,
      `${cleaning.toUpperCase().replace(" Y ", "   Y ")}`,
      `?category=${rent}&locationId=loc-2`,
    ]) {
      expect({ line, caught: namesRegionalExpenseCategory(line) }).toEqual({
        line,
        caught: true,
      });
    }
    for (const line of [
      "category: 'Alquiler',",
      "category: 'Limpieza y cafetería',",
      "La reserva de un trabajo reclamado.",
      "aseo dental",
      "cafetería",
      "Arrendador del local",
      "arrendamiento",
    ]) {
      expect({ line, caught: namesRegionalExpenseCategory(line) }).toEqual({
        line,
        caught: false,
      });
    }
  });
});
