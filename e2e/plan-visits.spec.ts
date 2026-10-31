import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type Locator,
} from "./support/test";
import { confirmCancellation } from "./support/cancellation";
import { randomUUID } from "node:crypto";
import { API_URL, tenantOrigin } from "./support/urls";
import { loginAs, accessTokenOf } from "./support/auth";
import { atSede, sedeDayFromToday } from "./support/clock";
import { chooseAppointmentStatus } from "./support/appointment-status";
import { fillDate } from "./support/dates";
import {
  meetsTouchTarget,
  waitForAnimationsSettled,
} from "./support/touch-targets";
import type { ApiSession } from "./support/api";
import {
  demoAdminSession,
  retireDemoLocation,
  reuseDemoLocation,
} from "./support/demo";
const origin = tenantOrigin("demo");
const password = "DemoDentalix2026!";
/**
 * DX-337: la clínica demo es compartida con otros specs («Comparar sedes»
 * lista todas sus sedes). Los tests usan UNA sede de pruebas con nombre fijo,
 * que se reutiliza entre ejecuciones y se desactiva en `afterAll`, y cada test
 * retira en `afterEach` lo que creó (citas, plan, paciente y tratamiento del
 * catálogo): así la lista «Aceptado sin agendar» de esa sede empieza vacía.
 */
const QA_LOCATION = "QA visitas e2e";
let locationId: string;
interface Created {
  patientId?: string;
  planId?: string;
  catalogId?: string;
  appointmentIds: string[];
}
let created: Created = { appointmentIds: [] };
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext();
  try {
    const admin = await demoAdminSession(api);
    locationId = await reuseDemoLocation(api, admin, QA_LOCATION);
    const schedule = await api.put(`${API_URL}/locations/schedule`, {
      headers: { ...admin.headers, "X-Location-Id": locationId },
      data: { ranges: [] },
    });
    expect(schedule.ok(), await schedule.text()).toBeTruthy();
  } finally {
    await api.dispose();
  }
});
test.afterEach(async ({ request }) => {
  const leftovers = created;
  created = { appointmentIds: [] };
  const admin = await demoAdminSession(request);
  await retire(
    request,
    {
      headers: { ...admin.headers, "X-Location-Id": locationId },
      origin: admin.origin,
    },
    leftovers,
  );
});
test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext();
  try {
    await retireDemoLocation(api, await demoAdminSession(api), locationId);
  } finally {
    await api.dispose();
  }
});
async function retire(
  request: APIRequestContext,
  admin: ApiSession,
  { patientId, planId, catalogId, appointmentIds }: Created,
) {
  const { headers } = admin;
  for (const id of appointmentIds) {
    const current = await request.get(`${API_URL}/appointments/${id}`, {
      headers,
    });
    expect(current.ok(), await current.text()).toBeTruthy();
    const { status } = (await current.json()) as { status: string };
    if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(status)) continue;
    const cancelled = await request.patch(`${API_URL}/appointments/${id}`, {
      headers,
      data: {
        status: "CANCELLED",
        cancelledByKind: "CLINIC",
        cancelReasonCode: "CLINIC_RESCHEDULE",
      },
    });
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
  }
  if (planId) {
    const plan = await request.patch(`${API_URL}/treatment-plans/${planId}`, {
      headers,
      data: { status: "CANCELLED" },
    });
    expect(plan.ok(), await plan.text()).toBeTruthy();
  }
  if (patientId) {
    const archived = await request.delete(`${API_URL}/patients/${patientId}`, {
      headers,
    });
    expect(archived.status(), await archived.text()).toBe(204);
  }
  if (catalogId) {
    const catalog = await request.patch(
      `${API_URL}/catalog/items/${catalogId}`,
      {
        headers,
        data: { active: false },
      },
    );
    expect(catalog.ok(), await catalog.text()).toBeTruthy();
  }
}
async function seed(request: APIRequestContext, tag: string) {
  const host = new URL(origin).host;
  const login = await request.post(`${API_URL}/auth/login`, {
    headers: { "X-Tenant-Host": host },
    data: { email: "admin@demo.dentalix.app", password },
  });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = {
    "X-Tenant-Host": host,
    Authorization: `Bearer ${accessToken}`,
  };
  async function post<T>(path: string, data: object) {
    const r = await request.post(API_URL + path, { headers, data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()) as T;
  }
  Object.assign(headers, { "X-Location-Id": locationId });
  const patient = await post<{ id: string }>("/patients", {
    firstName: "Visitas",
    lastName: tag,
    docType: "NATIONAL_ID",
    docNumber: tag,
    sex: "F",
    phone: "3001234567",
    countryCode: "CO",
  });
  created.patientId = patient.id;
  const catalog = await post<{ id: string }>("/catalog/items", {
    code: tag,
    kind: "PROCEDURE",
    labelEs: `Corona ${tag}`,
    color: "#3366CC",
    defaultPrice: 100000,
  });
  created.catalogId = catalog.id;
  const plan = await post<{ id: string }>(
    `/patients/${patient.id}/treatment-plans`,
    { currency: "COP" },
  );
  created.planId = plan.id;
  const itemIds: string[] = [];
  for (let n = 0; n < 3; n++) {
    const item = await post<{ id: string }>(
      `/treatment-plans/${plan.id}/items`,
      {
        toothNumber: String(44 + n),
        catalogItemId: catalog.id,
      },
    );
    itemIds.push(item.id);
  }
  return {
    locationId,
    itemIds,
    patientId: patient.id,
    planId: plan.id,
    headers,
    name: `Visitas ${tag}`,
  };
}
async function login(page: Page, email = "admin@demo.dentalix.app") {
  await loginAs(page, origin, email, password);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
    "desbordamiento horizontal",
  ).toBeLessThanOrEqual(0);
}
async function touchTargets(scope: Locator) {
  // Un diálogo recién abierto aún puede estar animando su entrada: se mide en reposo.
  await waitForAnimationsSettled(scope);
  const sizes = await scope
    .locator('button:visible,select:visible,a[href^="https://wa.me"]:visible')
    .evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          name: e.getAttribute("aria-label") ?? e.textContent,
          h: r.height,
          w: r.width,
        };
      }),
    );
  expect(sizes.length).toBeGreaterThan(0);
  expect(
    sizes.filter((s) => !meetsTouchTarget(s.h) || !meetsTouchTarget(s.w)),
    "controles deben medir al menos 44×44",
  ).toEqual([]);
}
async function readableText(scope: Locator) {
  // Read actual computed colors, including CSS color-mix/oklch and alpha layers.
  const samples = await scope.evaluate((root) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const color = (value: string): number[] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) =>
        i === 3 ? v / 255 : v,
      );
    };
    const over = (fg: number[], bg: number[]) =>
      [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
    const luminance = (rgb: number[]) =>
      rgb
        .map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [
      ...root.querySelectorAll<HTMLElement>(
        "h2,h3,h4,p,label,button,a,input,select,span",
      ),
    ]
      .filter(
        (e) =>
          e.checkVisibility() &&
          !e.closest(":disabled,[aria-disabled=true]") &&
          // Una casilla (`Checkbox` UX v2) no tiene texto: su \`color\` no
          // pinta nada (la caja la dibuja el primitivo, con borde
          // \`border-input\` ≥ 3:1). Solo se mide el texto.
          !e.matches('input[type="checkbox"],input[type="radio"]') &&
          (e.matches("input,select") ||
            [...e.childNodes].some(
              (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
            )),
      )
      .map((e) => {
        const chain: HTMLElement[] = [];
        for (let node: HTMLElement | null = e; node; node = node.parentElement)
          chain.push(node);
        let bg = [255, 255, 255];
        for (const node of chain.reverse())
          bg = over(color(getComputedStyle(node).backgroundColor), bg);
        const style = getComputedStyle(e);
        const fg = over(color(style.color), bg);
        const a = luminance(fg),
          b = luminance(bg);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const size = parseFloat(style.fontSize),
          weight = parseInt(style.fontWeight, 10);
        const minimum =
          size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
        return {
          text: (e.getAttribute("aria-label") ?? e.textContent ?? e.tagName)
            .trim()
            .slice(0, 90),
          ratio: Math.round(ratio * 100) / 100,
          minimum,
        };
      });
  });
  expect(samples.length).toBeGreaterThan(0);
  expect(
    samples.filter((s) => s.ratio < s.minimum),
    "contraste AA del texto visible",
  ).toEqual([]);
}
test.use({ actionTimeout: 15_000 });
test.setTimeout(120_000);
for (const width of [390, 1440])
  for (const theme of ["light", "dark"])
    test(`visitas y aceptado sin agendar ${width} ${theme}`, async ({
      page,
    }) => {
      const tag = `v256${randomUUID().slice(0, 8)}${width}${theme[0]}`;
      const data = await seed(page.request, tag);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        ({ theme, locationId }) => {
          localStorage.setItem("theme", theme);
          localStorage.setItem("dentalix.activeLocationId", locationId);
        },
        { theme, locationId: data.locationId },
      );
      await login(page);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await page.goto(
        `${origin}/patients/${data.patientId}?tab=treatment-plans`,
      );
      const board = page.getByRole("region", { name: "Plan por visitas" });
      await expect(board).toBeVisible();
      await board.getByLabel(/Mover a visita: diente 45,/).selectOption("2");
      await board.getByLabel(/Mover a visita: diente 46,/).selectOption("2");
      await board.getByLabel("Etiqueta de visita 1").fill("Cirugía");
      await board.getByLabel("Etiqueta de visita 2").fill("Corona");
      await board.getByLabel("Días desde la visita anterior").fill("90");
      await board.getByRole("button", { name: "Guardar visitas" }).click();
      await expect(
        board.getByRole("button", { name: "Guardar visitas" }),
      ).toBeDisabled();
      await expect(
        board.getByRole("heading", { name: "Visita 2 · Corona" }),
      ).toBeVisible();
      const stored = await page.request.get(
        `${API_URL}/treatment-plans/${data.planId}/visits`,
        { headers: data.headers },
      );
      expect(stored.ok(), await stored.text()).toBeTruthy();
      const organized = (await stored.json()) as {
        items: { id: string; visit: number; visitLabel: string }[];
        visitIntervals: Record<string, number>;
      };
      expect(organized.visitIntervals["2"]).toBe(90);
      expect(
        organized.items
          .filter((i) => i.visit === 2)
          .map((i) => i.id)
          .sort(),
      ).toEqual(data.itemIds.slice(1).sort());
      const accepted = await page.request.patch(
        `${API_URL}/treatment-plans/${data.planId}`,
        { headers: data.headers, data: { status: "ACCEPTED" } },
      );
      expect(accepted.ok(), await accepted.text()).toBeTruthy();
      await page.reload();
      await expect(
        board.getByRole("button", { name: "Agendar visita 2" }),
      ).toBeVisible();
      await noOverflow(page);
      await touchTargets(board);
      await readableText(board);
      await board
        .getByRole("heading", { name: "Plan por visitas", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `../.planning/backlog-wave-2026-10-21/qa/DX-256/plan-${width}-${theme}.png`,
      });
      await board
        .getByRole("heading", { name: "Visita 2 · Corona", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `../.planning/backlog-wave-2026-10-21/qa/DX-256/plan-visit2-${width}-${theme}.png`,
      });
      const launch = board.getByRole("button", { name: "Agendar visita 2" });
      await launch.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Agendar visita 2" });
      await expect(
        dialog
          .getByRole("group", { name: "Tratamientos de la visita" })
          .getByRole("checkbox"),
      ).toHaveCount(2);
      for (const check of await dialog
        .getByRole("group", { name: "Tratamientos de la visita" })
        .getByRole("checkbox")
        .all())
        await expect(check).toBeChecked();
      await expect(dialog.getByLabel("Motivo (opcional)")).toHaveValue(
        "Visita 2 · Corona",
      );
      const earliest = await dialog
        .getByLabel("Fecha", { exact: true })
        .inputValue();
      await expect(dialog.getByLabel("Fecha", { exact: true })).toHaveAttribute(
        "min",
        earliest,
      );
      const openingResponse = page.waitForResponse(
        (r) => r.url().includes("/openings?") && r.request().method() === "GET",
      );
      await dialog
        .getByRole("button", { name: "Buscar hueco", exact: true })
        .click();
      const opening = await openingResponse;
      expect(opening.ok(), await opening.text()).toBeTruthy();
      expect(new URL(opening.url()).searchParams.get("from")).toBe(earliest);
      await expect(
        dialog.getByRole("region", { name: "Huecos disponibles" }),
      ).toBeVisible();
      await noOverflow(page);
      await touchTargets(dialog);
      await readableText(dialog);
      await expect(
        dialog.getByRole("button", { name: "Buscar hueco" }),
      ).toBeVisible();
      await dialog.screenshot({
        path: `../.planning/backlog-wave-2026-10-21/qa/DX-256/dialog-${width}-${theme}.png`,
      });
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
        "foco queda dentro del diálogo",
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      const pdf = await page.context().newPage();
      await pdf.goto(
        `${origin}/print/patients/${data.patientId}/treatment-plans/${data.planId}`,
      );
      await expect(
        pdf
          .getByText("Visita 2 · Corona · intervalo mínimo 90 días", {
            exact: true,
          })
          .filter({ visible: true }),
      ).toBeVisible();
      await noOverflow(pdf);
      await pdf.screenshot({
        path: `../.planning/backlog-wave-2026-10-21/qa/DX-256/quote-${width}-${theme}.png`,
        fullPage: true,
      });
      await pdf.emulateMedia({ media: "print" });
      await expect(
        pdf.getByRole("rowheader", {
          name: "Visita 2 · Corona · intervalo mínimo 90 días",
          exact: true,
        }),
      ).toBeVisible();
      await expect(pdf.locator("tr.quote-item")).toHaveCount(3);
      await pdf.close();
      // Reserve visit 1 through fixtures so reception sees visit 2 as the next work.
      const staffResponse = await page.request.get(`${API_URL}/staff`, {
        headers: data.headers,
      });
      expect(staffResponse.ok(), await staffResponse.text()).toBeTruthy();
      const staff = (await staffResponse.json()) as {
        userId: string;
        role: string;
      }[];
      const providerId = staff.find((s) => s.role === "ADMIN")!.userId;
      const day = sedeDayFromToday(180 + Math.floor(Math.random() * 1000));
      const first = await page.request.post(`${API_URL}/appointments`, {
        headers: data.headers,
        data: {
          patientId: data.patientId,
          providerId,
          start: atSede(day, "08:00").toISOString(),
          end: atSede(day, "08:30").toISOString(),
          planItemIds: [data.itemIds[0]],
          reason: `QA ${tag} visita 1`,
        },
      });
      expect(first.ok(), await first.text()).toBeTruthy();
      created.appointmentIds.push(((await first.json()) as { id: string }).id);
      await page.context().clearCookies();
      await login(page, "recepcion@demo.dentalix.app");
      const receptionHeaders = {
        ...data.headers,
        Authorization: `Bearer ${await accessTokenOf(page)}`,
      };
      const forbidden = await page.request.patch(
        `${API_URL}/treatment-plans/${data.planId}/visits`,
        {
          headers: receptionHeaders,
          data: {
            items: organized.items.map((i) => ({
              itemId: i.id,
              visit: i.visit,
              visitLabel: i.visitLabel,
            })),
            visitIntervals: { "2": 90 },
          },
        },
      );
      expect(forbidden.status()).toBe(403);
      await page.goto(
        `${origin}/patients/${data.patientId}?tab=treatment-plans`,
      );
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: data.name, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Datos", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Plan de tratamiento", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("region", { name: "Plan por visitas" }),
      ).toHaveCount(0);
      await page.goto(origin + "/presupuestos");
      await page.getByRole("tab", { name: "Aceptado sin agendar" }).click();
      const list = page.getByRole("region", {
        name: "Tratamiento aceptado sin agendar",
      });
      await list
        .getByRole("combobox", { name: "Sede", exact: true })
        .selectOption(data.locationId);
      const card = list.getByRole("listitem").filter({
        has: page.getByRole("link", { name: data.name, exact: true }),
      });
      await expect(card).toContainText(
        "Visita 2 · Corona · 2 tratamientos pendientes",
      );
      await expect(card).toContainText("COP");
      await expect(card).toContainText("200.000");
      const whatsapp = card.getByRole("link", {
        name: `WhatsApp a ${data.name}`,
      });
      const url = new URL((await whatsapp.getAttribute("href"))!);
      expect(url.pathname).toBe("/573001234567");
      expect(url.searchParams.get("text")).not.toMatch(
        /Corona|Cirugía|Visita|tratamiento/i,
      );
      await noOverflow(page);
      await touchTargets(list);
      await readableText(list);
      await page.screenshot({
        path: `../.planning/backlog-wave-2026-10-21/qa/DX-256/list-${width}-${theme}.png`,
        fullPage: true,
      });
      const scheduleButton = card.getByRole("button", {
        name: `Agendar a ${data.name}`,
      });
      await scheduleButton.focus();
      await page.keyboard.press("Enter");
      const receptionDialog = page.getByRole("dialog", {
        name: "Agendar visita 2",
      });
      await expect(
        receptionDialog
          .getByRole("group", { name: "Tratamientos de la visita" })
          .getByRole("checkbox"),
      ).toHaveCount(2);
      for (const item of await receptionDialog
        .getByRole("group", { name: "Tratamientos de la visita" })
        .getByRole("checkbox")
        .all())
        await expect(item).toBeChecked();
      const form = receptionDialog.getByRole("form", { name: "Agendar cita" });
      await form
        .getByLabel("Profesional", { exact: true })
        .selectOption(providerId);
      await form.getByLabel("Fecha", { exact: true }).fill(day);
      await form.getByLabel("Hora de inicio").fill("10:15");
      await form.getByLabel("Hora de fin").fill("10:45");
      const savedResponse = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname.endsWith("/appointments") &&
          r.request().method() === "POST",
      );
      await form
        .getByRole("button", { name: "Agendar cita", exact: true })
        .click();
      const saved = await savedResponse;
      expect(saved.status(), await saved.text()).toBe(201);
      const appointment = (await saved.json()) as {
        id: string;
        planItemIds: string[];
        reason: string;
        locationId: string;
      };
      created.appointmentIds.push(appointment.id);
      expect(appointment.planItemIds.sort()).toEqual(
        data.itemIds.slice(1).sort(),
      );
      expect(appointment.reason).toBe("Visita 2 · Corona");
      expect(appointment.locationId).toBe(data.locationId);
      await expect(receptionDialog).toBeHidden();
      await expect(card).toHaveCount(0);
      await expect(
        list.getByText(
          "No hay tratamiento aceptado pendiente de agendar en esta sede",
          { exact: true },
        ),
      ).toBeVisible();
      await page.screenshot({
        path: `../.planning/backlog-wave-2026-10-21/qa/DX-256/scheduled-${width}-${theme}.png`,
        fullPage: true,
      });
      const persisted = await page.request.get(
        `${API_URL}/appointments/${appointment.id}`,
        { headers: receptionHeaders },
      );
      expect(persisted.ok(), await persisted.text()).toBeTruthy();
      expect((await persisted.json()).planItemIds.sort()).toEqual(
        data.itemIds.slice(1).sort(),
      );
      const duplicate = await page.request.post(`${API_URL}/appointments`, {
        headers: receptionHeaders,
        data: {
          patientId: data.patientId,
          providerId,
          start: atSede(day, "11:15").toISOString(),
          end: atSede(day, "11:45").toISOString(),
          planItemIds: data.itemIds.slice(1),
        },
      });
      expect(duplicate.status()).toBe(409);
      expect((await duplicate.json()).message).toContain("otra cita");
      await page.goto(origin + "/agenda");
      await page.getByRole("button", { name: "Día", exact: true }).click();
      await page.getByRole("button", { name: "Lista", exact: true }).click();
      await fillDate(page, "Fecha", day);
      const status = page.getByRole("combobox", {
        name: /^Estado de la cita de 10:15–10:45/,
      });
      await expect(status).toHaveText("Agendada");
      await chooseAppointmentStatus(status, "Cancelada");
      await confirmCancellation(page);
      await expect(status).toHaveText("Cancelada");
      await page.goto(origin + "/presupuestos");
      await page.getByRole("tab", { name: "Aceptado sin agendar" }).click();
      await list
        .getByRole("combobox", { name: "Sede", exact: true })
        .selectOption(data.locationId);
      await expect(card).toContainText(
        "Visita 2 · Corona · 2 tratamientos pendientes",
      );
      await expect(card).toContainText("200.000");
      await page.screenshot({
        path: `../.planning/backlog-wave-2026-10-21/qa/DX-256/cancelled-${width}-${theme}.png`,
        fullPage: true,
      });
    });

test("lista: carga, error de red, reintento y vacío con backend real", async ({
  page,
}) => {
  const data = await seed(page.request, `v256state${randomUUID().slice(0, 8)}`);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await login(page, "recepcion@demo.dentalix.app");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  await page.route("**/treatment-plans/unscheduled?**", async (route) => {
    if (first) {
      first = false;
      await gate;
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await page.goto(origin + "/presupuestos");
  await page.getByRole("tab", { name: "Aceptado sin agendar" }).click();
  const list = page.getByRole("region", {
    name: "Tratamiento aceptado sin agendar",
  });
  try {
    await expect(
      list.getByRole("status", { name: "Cargando", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "../.planning/backlog-wave-2026-10-21/qa/DX-256/state-loading-390-dark.png",
      fullPage: true,
    });
  } finally {
    release();
  }
  await expect(list.getByRole("alert")).toBeVisible();
  await expect(list.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await page.screenshot({
    path: "../.planning/backlog-wave-2026-10-21/qa/DX-256/state-error-390-dark.png",
    fullPage: true,
  });
  await list.getByRole("button", { name: "Reintentar" }).focus();
  await page.keyboard.press("Enter");
  await expect(list.getByRole("alert")).toHaveCount(0);
  await list
    .getByRole("combobox", { name: "Sede", exact: true })
    .selectOption(data.locationId);
  await expect(
    list.getByText(
      "No hay tratamiento aceptado pendiente de agendar en esta sede",
      { exact: true },
    ),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: "../.planning/backlog-wave-2026-10-21/qa/DX-256/state-empty-390-dark.png",
    fullPage: true,
  });
});
