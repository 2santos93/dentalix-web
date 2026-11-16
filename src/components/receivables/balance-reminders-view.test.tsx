import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BalanceRemindersView } from "./balance-reminders-view";
import { parsePolicyDraft } from "./reminder-policy-dialog";
import {
  getBalanceReminders,
  markBalanceReminder,
  updateReminderPolicy,
  type BalanceReminderRow,
  type BalanceRemindersPage,
} from "@/lib/receivables/reminders-api";
import { ApiError } from "@/lib/api/client";
import { notifyError, notifySuccess } from "@/components/errors/notify";
import { listLocations } from "@/lib/locations/locations-api";
import { getTokenRole } from "@/lib/auth/token-role";
import { fetchClinicName } from "@/lib/clinic-branding";
import { clinicLocation } from "@/lib/test/locations";

jest.mock("../../lib/receivables/reminders-api", () => ({
  getBalanceReminders: jest.fn(),
  markBalanceReminder: jest.fn(),
  updateReminderPolicy: jest.fn(),
}));
jest.mock("../errors/notify", () => ({
  notifyError: jest.fn(),
  notifySuccess: jest.fn(),
}));
jest.mock("../../lib/locations/locations-api", () => ({
  listLocations: jest.fn(),
}));
jest.mock("../../lib/auth/token-role", () => ({ getTokenRole: jest.fn() }));
jest.mock("../../lib/clinic-branding", () => ({ fetchClinicName: jest.fn() }));

const mockedGet = jest.mocked(getBalanceReminders);
const mockedMark = jest.mocked(markBalanceReminder);

const POLICY = { days: [7, 30, 60], maxNotices: 3, minGapDays: 7 };

function row(overrides: Partial<BalanceReminderRow> = {}): BalanceReminderRow {
  return {
    patient: {
      id: "pat-1",
      fullName: "Ana Pérez",
      phone: "0412 555 0101",
      whatsApp: "584125550101",
    },
    locationId: "loc-1",
    oldestAgeDays: 35,
    ageApproximate: false,
    paymentsWithoutRateCount: 0,
    rateProviderTimedOut: false,
    currencies: [
      {
        currency: "USD",
        balance: 150,
        debt: 150,
        credit: 0,
        buckets: {
          current: 30,
          days0to30: 0,
          days31to60: 120.1,
          days61to90: 0,
          over90: 0,
        },
        oldestAgeDays: 35,
        ageApproximate: false,
        nextInstallment: null,
        paymentsWithoutRateCount: 0,
        rateProviderTimedOut: false,
      },
    ],
    lastPayment: null,
    nextInstallment: null,
    lastNote: null,
    promise: null,
    reminder: { stage: 2, stageDays: 30, noticesSent: 1, lastNoticeOn: "2026-10-23" },
    ...overrides,
  };
}

function page(
  items: BalanceReminderRow[],
  overrides: Partial<BalanceRemindersPage> = {},
): BalanceRemindersPage {
  return {
    asOf: "2026-11-15",
    scope: { location: null },
    policy: POLICY,
    items,
    total: items.length,
    page: 1,
    pageSize: 50,
    excluded: { openPromise: 0, optedOut: 0 },
    ...overrides,
  };
}

const flat = (text: string | null | undefined) =>
  (text ?? "").replace(/\s/g, " ");

describe("BalanceRemindersView (DX-146)", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedMark.mockReset();
    jest.mocked(notifyError).mockReset();
    jest.mocked(notifySuccess).mockReset();
    jest.mocked(listLocations).mockResolvedValue([clinicLocation()]);
    jest.mocked(getTokenRole).mockReturnValue("RECEPTION");
    jest.mocked(fetchClinicName).mockResolvedValue("Clínica Sonrisa");
  });

  it("pinta el esqueleto mientras carga", () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    render(<BalanceRemindersView token="tok" />);
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  });

  it("lista al paciente con lo vencido, el tramo, sus avisos y el WhatsApp con solo la clínica y el saldo", async () => {
    mockedGet.mockResolvedValue(
      page([row()], { excluded: { openPromise: 2, optedOut: 1 } }),
    );
    render(<BalanceRemindersView token="tok" />);

    const table = await screen.findByRole("table");
    const tr = within(table).getByRole("row", { name: /Ana Pérez/ });
    // Lo vencido (sin «por vencer»), sumado en céntimos.
    expect(flat(tr.textContent)).toContain("USD 120,10");
    expect(flat(tr.textContent)).not.toContain("USD 150,00");
    expect(flat(tr.textContent)).toContain("35 días");
    expect(flat(tr.textContent)).toContain("Tramo de 30 días");
    expect(flat(tr.textContent)).toContain("1 de 3 avisos");
    expect(flat(tr.textContent)).toContain("último el 23/10/2026");

    const whatsapp = await within(tr).findByRole("link", {
      name: /Escribir por WhatsApp a Ana Pérez/,
    });
    await waitFor(() =>
      expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain(
        "Clínica Sonrisa",
      ),
    );
    const href = flat(decodeURIComponent(whatsapp.getAttribute("href") ?? ""));
    expect(href).toMatch(/^https:\/\/wa\.me\/584125550101\?text=/);
    expect(href).toContain("Tienes un saldo vencido de USD 120,10.");
    // Sin el nombre del paciente ni nada clínico.
    expect(href).not.toContain("Ana");

    expect(
      screen.getByText(
        "Tramos: 7, 30 y 60 días de la deuda vencida más antigua · hasta 3 avisos por deuda · al menos 7 días entre avisos.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No aparecen 2 con compromiso de pago vigente y 1 dado de baja de los avisos.",
      ),
    ).toBeInTheDocument();
    // Recepción no cambia los tramos.
    expect(screen.queryByRole("button", { name: "Cambiar tramos" })).toBeNull();
  });

  it("sin WhatsApp válido lo dice, y aun así se puede marcar avisado", async () => {
    mockedGet.mockResolvedValue(
      page([row({ patient: { id: "pat-1", fullName: "Ana Pérez", phone: null, whatsApp: null } })]),
    );
    render(<BalanceRemindersView token="tok" />);
    expect(await screen.findByText("Sin WhatsApp")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Marcar avisado a Ana Pérez" }),
    ).toBeInTheDocument();
  });

  it("«Marcar avisado» lo saca de la lista y lo anuncia", async () => {
    mockedGet.mockResolvedValue(page([row(), row({ patient: { id: "pat-2", fullName: "Beto Ruiz", phone: null, whatsApp: null } })]));
    mockedMark.mockResolvedValue({} as never);
    render(<BalanceRemindersView token="tok" />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Marcar avisado a Ana Pérez" }),
    );
    expect(mockedMark).toHaveBeenCalledWith("tok", "pat-1", { channel: "WHATSAPP_LINK" });
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: /Ana Pérez/ })).toBeNull(),
    );
    expect(screen.getByRole("row", { name: /Beto Ruiz/ })).toBeInTheDocument();
    expect(notifySuccess).toHaveBeenCalledWith(
      "Ana Pérez: marcado como avisado. Vuelve a la lista en su siguiente tramo.",
    );
  });

  it("si otra persona ya lo marcó (409), avisa y recarga la lista", async () => {
    mockedGet
      .mockResolvedValueOnce(page([row()]))
      .mockResolvedValueOnce(page([]));
    mockedMark.mockRejectedValue(
      new ApiError(409, "Ya se marcó como avisado hoy: vuelve a aparecer en «Por avisar hoy» cuando le toque el siguiente aviso."),
    );
    render(<BalanceRemindersView token="tok" />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Marcar avisado a Ana Pérez" }),
    );
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(jest.mocked(notifyError).mock.calls[0][0]).toContain("Ya se marcó como avisado hoy");
    expect(await screen.findByText("Hoy no hay a quién avisar")).toBeInTheDocument();
  });

  it("vacío: «Hoy no hay a quién avisar»", async () => {
    mockedGet.mockResolvedValue(page([]));
    render(<BalanceRemindersView token="tok" />);
    expect(await screen.findByText("Hoy no hay a quién avisar")).toBeInTheDocument();
  });

  it("error con «Reintentar» que vuelve a pedir la lista", async () => {
    mockedGet
      .mockRejectedValueOnce(new Error("red"))
      .mockResolvedValueOnce(page([row()]));
    render(<BalanceRemindersView token="tok" />);
    expect(
      await screen.findByText("No pudimos cargar la lista de avisos."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("row", { name: /Ana Pérez/ })).toBeInTheDocument();
  });

  it("403: el aviso en español, sin pestañas ni lista", async () => {
    mockedGet.mockRejectedValue(
      new ApiError(403, "Tu rol no tiene acceso a la cartera: es para administración y recepción."),
    );
    render(<BalanceRemindersView token="tok" />);
    expect(
      await screen.findByText("Tu rol no tiene acceso a la cartera."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("ADMIN cambia los tramos y la lista se recarga", async () => {
    jest.mocked(getTokenRole).mockReturnValue("ADMIN");
    mockedGet.mockResolvedValue(page([row()]));
    jest.mocked(updateReminderPolicy).mockResolvedValue({ days: [5, 15], maxNotices: 2, minGapDays: 5 });
    render(<BalanceRemindersView token="tok" />);
    await userEvent.click(await screen.findByRole("button", { name: "Cambiar tramos" }));
    const dialog = await screen.findByRole("dialog");
    const set = async (label: string, value: string) => {
      const input = within(dialog).getByLabelText(label);
      await userEvent.clear(input);
      if (value) await userEvent.type(input, value);
    };
    await set("Tramo 1 (días)", "5");
    await set("Tramo 2 (días)", "15");
    await set("Tramo 3 (días)", "");
    await set("Máximo de avisos por deuda", "2");
    await set("Días mínimos entre avisos", "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar tramos" }));
    await waitFor(() =>
      expect(updateReminderPolicy).toHaveBeenCalledWith("tok", { days: [5, 15], maxNotices: 2, minGapDays: 5 }),
    );
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
  });
});

describe("parsePolicyDraft (DX-146)", () => {
  const ok = { stage0: "7", stage1: "30", stage2: "60", maxNotices: "3", minGapDays: "7" };

  it("acepta los tramos crecientes y salta los vacíos del final", () => {
    expect(parsePolicyDraft(ok).policy).toEqual(POLICY);
    expect(parsePolicyDraft({ ...ok, stage1: "", stage2: "" }).policy).toEqual({
      days: [7],
      maxNotices: 3,
      minGapDays: 7,
    });
  });

  it("rechaza con mensajes en español", () => {
    expect(parsePolicyDraft({ ...ok, stage0: "" }).errors.stage0).toBe("El primer tramo es obligatorio.");
    expect(parsePolicyDraft({ ...ok, stage1: "5" }).errors.stage1).toBe(
      "Cada tramo tiene que ser mayor que el anterior.",
    );
    expect(parsePolicyDraft({ ...ok, stage2: "400" }).errors.stage2).toBe(
      "Escribe un número entero de días entre 1 y 365.",
    );
    expect(parsePolicyDraft({ ...ok, maxNotices: "0" }).errors.maxNotices).toBe(
      "Escribe un número entero entre 1 y 10.",
    );
    expect(parsePolicyDraft({ ...ok, minGapDays: "7.5" }).errors.minGapDays).toBe(
      "Escribe un número entero entre 1 y 90.",
    );
  });
});
