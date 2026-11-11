#!/usr/bin/env node
// DX-117 (FE-021): el JS de primera carga de cada ruta de la app, en KB gzip,
// medido tras `next build`.
//
//   node scripts/bundle-report.mjs [--dist .next] [--out <fichero.json>]
//                                  [--budget "<ruta>:total=<KB>,own=<KB>"]...
//
// Método (el de AUDITORIA-FRONTEND-2026-10-19-2233, documentado aquí):
// - Los chunks de primera carga de una ruta son la unión de los `entryJSFiles`
//   de TODOS sus segmentos (layouts + page) del
//   `server/app/<ruta>/page_client-reference-manifest.js`, más los
//   `rootMainFiles` de `build-manifest.json` (runtime y framework). Es lo mismo
//   que calcula Next con Turbopack en `diagnostics/route-bundle-stats.json`
//   (`next/dist/build/route-bundle-stats.js`): si ese fichero existe se usa su
//   lista de chunks; si no, se lee de los manifests.
// - Cada chunk se comprime con gzip nivel 9 y se suman los tamaños (cada chunk
//   cuenta una vez por ruta).
// - `compartido` = chunks presentes en la primera carga de TODAS las rutas
//   (framework, runtime, layout raíz). `grupo` = chunks presentes en todas las
//   rutas del mismo grupo de rutas (p. ej. `(app)`: el shell con su sesión).
//   `propio` = total − grupo: lo que paga ESTA página por encima del shell.
//
// Escribe `<dist>/bundle-report.json` (o `--out`) y una tabla ordenada por
// total. Sale con 1 si se pasa un presupuesto (`--budget`) y una ruta lo
// supera, y con 2 si falta un manifest o su forma no es la esperada (mensaje
// claro, sin traza).
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export class ManifestError extends Error {}

/** Tamaño gzip (nivel 9, como la auditoría) de un buffer. */
export function gzipBytes(buf) {
  return gzipSync(buf, { level: 9 }).length;
}

/** Suma los tamaños de `files` (cada uno una vez) con `sizeOf(file)`. */
export function sumSizes(files, sizeOf) {
  let total = 0;
  for (const f of new Set(files)) total += sizeOf(f);
  return total;
}

/**
 * `/(app)/patients/[id]/page` → `/patients/[id]`: quita los grupos de rutas
 * `(x)`, los slots paralelos `@x` y el segmento final `page`.
 */
export function routeFromAppPath(appPath) {
  const segs = appPath
    .split('/')
    .filter((s) => s && !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@'));
  if (segs[segs.length - 1] === 'page') segs.pop();
  return `/${segs.join('/')}`;
}

/** Primer grupo de rutas del app path (`(app)`), o `''`. */
export function routeGroupOf(appPath) {
  const g = appPath.split('/').find((s) => s.startsWith('(') && s.endsWith(')'));
  return g ?? '';
}

/**
 * Evalúa el `page_client-reference-manifest.js` (asigna
 * `globalThis.__RSC_MANIFEST[appPath] = {...}`) en un contexto aislado y
 * devuelve los `entryJSFiles` de `appPath`.
 */
export function entryJsFilesFromManifestSource(source, appPath, fileForErrors = 'manifest') {
  const sandbox = { globalThis: {} };
  sandbox.self = sandbox.globalThis;
  try {
    vm.runInNewContext(source, sandbox, { timeout: 5000 });
  } catch (err) {
    throw new ManifestError(`${fileForErrors}: no se pudo evaluar (${err.message})`);
  }
  const rsc = sandbox.globalThis.__RSC_MANIFEST ?? sandbox.__RSC_MANIFEST;
  if (!rsc || typeof rsc !== 'object') {
    throw new ManifestError(`${fileForErrors}: no define __RSC_MANIFEST`);
  }
  const entry = rsc[appPath] ?? Object.values(rsc)[0];
  if (!entry || typeof entry.entryJSFiles !== 'object' || entry.entryJSFiles === null) {
    throw new ManifestError(`${fileForErrors}: __RSC_MANIFEST["${appPath}"] no tiene entryJSFiles (¿cambió la forma del manifest en esta versión de Next?)`);
  }
  const files = [];
  for (const [segment, list] of Object.entries(entry.entryJSFiles)) {
    if (!Array.isArray(list)) {
      throw new ManifestError(`${fileForErrors}: entryJSFiles["${segment}"] no es una lista`);
    }
    files.push(...list);
  }
  return files;
}

/**
 * Filas del informe. `routes` = [{ route, group, files }] (rutas relativas a
 * dist); `sizeOf(file)` = bytes gzip y `rawOf(file)` = bytes sin comprimir
 * (la auditoría daba las dos cifras). Ordenadas por total descendente.
 */
export function buildRows(routes, sizeOf, rawOf = () => 0) {
  const sets = routes.map((r) => new Set(r.files.filter((f) => f.endsWith('.js'))));
  const intersect = (list) =>
    list.length === 0 ? new Set() : new Set([...list[0]].filter((f) => list.every((s) => s.has(f))));
  const shared = intersect(sets);
  const byGroup = new Map();
  routes.forEach((r, i) => {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(sets[i]);
  });
  const groupShared = new Map([...byGroup].map(([g, list]) => [g, intersect(list)]));
  const rows = routes.map((r, i) => {
    const files = [...sets[i]].sort();
    const gShared = groupShared.get(r.group);
    const total = sumSizes(files, sizeOf);
    const sharedBytes = sumSizes(files.filter((f) => shared.has(f)), sizeOf);
    const groupBytes = sumSizes(files.filter((f) => gShared.has(f)), sizeOf);
    const own = files.filter((f) => !gShared.has(f));
    return {
      route: r.route,
      group: r.group,
      totalGzipBytes: total,
      sharedGzipBytes: sharedBytes,
      groupGzipBytes: groupBytes,
      ownGzipBytes: total - groupBytes,
      totalRawBytes: sumSizes(files, rawOf),
      ownRawBytes: sumSizes(own, rawOf),
      chunks: files.length,
      // Los chunks propios, del más pesado al más ligero.
      ownChunks: own
        .map((file) => ({ file, gzipBytes: sizeOf(file), rawBytes: rawOf(file) }))
        .sort((a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file)),
    };
  });
  rows.sort((a, b) => b.totalGzipBytes - a.totalGzipBytes || a.route.localeCompare(b.route));
  return rows;
}

/** `"/patients/[id]:total=200,own=75"` → { route, total, own } (KB). */
export function parseBudget(spec) {
  const idx = spec.lastIndexOf(':');
  if (idx <= 0) throw new ManifestError(`presupuesto mal escrito: «${spec}» (usa "<ruta>:total=<KB>,own=<KB>")`);
  const route = spec.slice(0, idx);
  const out = { route };
  for (const part of spec.slice(idx + 1).split(',')) {
    const [k, v] = part.split('=');
    const n = Number(v);
    if (!['total', 'own'].includes(k) || !Number.isFinite(n) || n <= 0) {
      throw new ManifestError(`presupuesto mal escrito: «${spec}» (usa "<ruta>:total=<KB>,own=<KB>")`);
    }
    out[k] = n;
  }
  return out;
}

/** Mensajes de las rutas que superan su presupuesto (KB = 1024 bytes). */
export function checkBudgets(rows, budgets) {
  const problems = [];
  for (const b of budgets) {
    const row = rows.find((r) => r.route === b.route);
    if (!row) {
      problems.push(`${b.route}: la ruta no está en el build`);
      continue;
    }
    for (const [key, field] of [['total', 'totalGzipBytes'], ['own', 'ownGzipBytes']]) {
      if (b[key] === undefined) continue;
      const kb = row[field] / 1024;
      if (kb > b[key]) problems.push(`${b.route}: ${key} ${kb.toFixed(1)} KB gzip > presupuesto ${b[key]} KB`);
    }
  }
  return problems;
}

const kb = (n) => (n / 1024).toFixed(1);

export function formatTable(rows) {
  const head = ['Ruta', 'Total KB', 'Compartido', 'Grupo', 'Propio KB', 'Total sin gzip', 'Propio sin gzip', 'Chunks'];
  const body = rows.map((r) => [
    `${r.group ? `${r.group} ` : ''}${r.route}`,
    kb(r.totalGzipBytes),
    kb(r.sharedGzipBytes),
    kb(r.groupGzipBytes),
    kb(r.ownGzipBytes),
    kb(r.totalRawBytes),
    kb(r.ownRawBytes),
    String(r.chunks),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  return [line(head), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

function readJson(file, what) {
  if (!existsSync(file)) throw new ManifestError(`falta ${what} (${file}); ¿se ejecutó \`next build\`?`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ManifestError(`${file}: JSON inválido (${err.message})`);
  }
}

/** Rutas de página de la app con sus chunks (relativos a dist) y su grupo. */
export function collectRoutes(distDir) {
  const appPaths = readJson(path.join(distDir, 'server', 'app-paths-manifest.json'), 'server/app-paths-manifest.json');
  if (typeof appPaths !== 'object' || appPaths === null || Array.isArray(appPaths)) {
    throw new ManifestError('server/app-paths-manifest.json: se esperaba un objeto { appPath: fichero }');
  }
  const pagePaths = Object.keys(appPaths).filter((p) => p.endsWith('/page') && !p.startsWith('/_'));
  if (pagePaths.length === 0) throw new ManifestError('server/app-paths-manifest.json: sin páginas `/…/page`');

  const statsFile = path.join(distDir, 'diagnostics', 'route-bundle-stats.json');
  if (existsSync(statsFile)) {
    const stats = readJson(statsFile, 'diagnostics/route-bundle-stats.json');
    if (!Array.isArray(stats) || stats.some((r) => typeof r?.route !== 'string' || !Array.isArray(r.firstLoadChunkPaths))) {
      throw new ManifestError('diagnostics/route-bundle-stats.json: se esperaba [{ route, firstLoadChunkPaths: [] }]');
    }
    const byRoute = new Map(stats.map((r) => [r.route, r.firstLoadChunkPaths]));
    // `firstLoadChunkPaths` es relativo al proyecto (`.next/static/…`).
    const projectDir = path.dirname(path.resolve(distDir));
    return pagePaths
      .map((p) => ({ appPath: p, route: routeFromAppPath(p) }))
      .filter(({ route }) => byRoute.has(route))
      .map(({ appPath, route }) => ({
        route,
        group: routeGroupOf(appPath),
        files: byRoute
          .get(route)
          .map((f) => path.relative(path.resolve(distDir), path.resolve(projectDir, f)).split(path.sep).join('/')),
      }));
  }

  const build = readJson(path.join(distDir, 'build-manifest.json'), 'build-manifest.json');
  if (!Array.isArray(build.rootMainFiles)) {
    throw new ManifestError('build-manifest.json: no tiene la lista rootMainFiles');
  }
  return pagePaths.map((p) => {
    const manifestFile = path.join(distDir, 'server', 'app', `${p}_client-reference-manifest.js`);
    if (!existsSync(manifestFile)) throw new ManifestError(`falta ${path.relative(distDir, manifestFile)}`);
    const entry = entryJsFilesFromManifestSource(readFileSync(manifestFile, 'utf8'), p, path.relative(distDir, manifestFile));
    return { route: routeFromAppPath(p), group: routeGroupOf(p), files: [...entry, ...build.rootMainFiles] };
  });
}

function main(argv) {
  let distDir = '.next';
  let out;
  const budgets = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dist') distDir = argv[++i];
    else if (a === '--out') out = argv[++i];
    else if (a === '--budget') budgets.push(parseBudget(argv[++i] ?? ''));
    else throw new ManifestError(`argumento desconocido: ${a}`);
  }
  out ??= path.join(distDir, 'bundle-report.json');

  const routes = collectRoutes(distDir);
  const cache = new Map();
  const measure = (f) => {
    if (cache.has(f)) return cache.get(f);
    const abs = path.join(distDir, f);
    if (!existsSync(abs)) throw new ManifestError(`el manifest nombra ${f} pero no existe en ${distDir}`);
    const buf = readFileSync(abs);
    const m = { gzip: gzipBytes(buf), raw: buf.length };
    cache.set(f, m);
    return m;
  };
  const rows = buildRows(routes, (f) => measure(f).gzip, (f) => measure(f).raw);
  const problems = checkBudgets(rows, budgets);
  const report = {
    method: 'unión de entryJSFiles (todos los segmentos) + rootMainFiles; gzip nivel 9 por chunk; propio = total − chunks comunes a su grupo de rutas',
    generatedAt: new Date().toISOString(),
    budgets,
    problems,
    rows,
  };
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  const table = formatTable(rows);
  console.log('JS de primera carga por ruta (KB gzip, nivel 9)\n');
  console.log(table);
  for (const r of rows.slice(0, 3)) {
    console.log(`\nChunks propios de ${r.route} (KB gzip / sin gzip):`);
    for (const c of r.ownChunks.slice(0, 12)) console.log(`  ${kb(c.gzipBytes).padStart(7)}  ${kb(c.rawBytes).padStart(8)}  ${c.file}`);
  }
  console.log(`\nInforme: ${out}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### JS de primera carga por ruta (KB gzip)\n\n\`\`\`\n${table}\n\`\`\`\n${problems.map((p) => `- ${p}`).join('\n')}\n`,
    );
  }
  for (const p of problems) console.error(`::error title=Presupuesto de JS::${p}`);
  return problems.length > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ManifestError) {
      console.error(`::error title=Informe de JS::${err.message}`);
      process.exitCode = 2;
    } else {
      throw err;
    }
  }
}
