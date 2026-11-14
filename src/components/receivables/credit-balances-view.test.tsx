import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreditBalancesView } from "./credit-balances-view";
import { CarteraTabs } from "./cartera-tabs";
import {
  getCreditBalances,
  type CreditBalanceRow,
  type CreditBalancesPage,
} from "@/lib/receivables/credit-balances-api";
import { ApiError } from "@/lib/api/client";
import { notifyError } from "@/components/errors/notify";
import { listLocations } from "@/lib/locations/locations-api";
import { getTokenRole } from "@/lib/auth/token-role";
import { clinicLocation } from "@/lib/test/locations";
import { regionalFormat } from "@/lib/format/regional-format";
import { CREDIT_BALANCES_PAGE_SIZE } from "./use-credit-balances";

jest.mock("../../lib/receivables/credit-balances-api", () => ({
  getCreditBalances: jest.fn(),
}));
jest.mock("../errors/notify", () => ({ notifyError: jest.fn() }));
jest.mock("../../lib/locations/locations-api", () => ({
  listLocations: jest.fn(),
}));
jest.mock("../../lib/auth/token-role", () => ({ getTokenRole: jest.fn() }));

const mockedGet = getCreditBalances as jest.MockedFunction<
  typeof getCreditBalances
>;
const mockedNotify = notifyError as jest.MockedFunction<typeof notifyError>;

function row(overrides: Partial<CreditBalanceRow> = {}): CreditBalanceRow {
  return {
    patient: { id: "pat-1", fullName: "Ana Pérez" },
    location: { id: "loc-1", name: "Sede principal" },
    currency: "VES",
    amount: 360,
    since: "2026-10-19",
    ageDays: 15,
    ...overrides,
  };
}

function page(
  items: CreditBalanceRow[],
  overrides: Partial<CreditBalancesPage> = {},
): CreditBalancesPage {
  return {
    asOf: "2026-11-03",
    scope: { location: { id: "loc-1", name: "Sede principal" } },
    items,
    total: items.length,
    page: 1,
    pageSize: CREDIT_BALANCES_PAGE_SIZE,
    totals: [],
    paymentsWithoutRateCount: 0,
    rateProviderTimedOut: false,
    ...overrides,
  };
}

const flat = (text: string | null | undefined) =>
  (text ?? "").replace(/\s/g, " ");

describe("CreditBalancesView (DX-430)", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedNotify.mockReset();
    jest.mocked(listLocations).mockResolvedValue([clinicLocation()]);
    jest.mocked(getTokenRole).mockReturnValue("RECEPTION");
  });

  it("pinta el esqueleto mientras carga", () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    render(<CreditBalancesView token="tok" />);
    expect(
      screen.getByRole("status", { name: "Cargando" }),
    ).toBeInTheDocument();
  });

  it("lista al paciente con su sede, el importe con código ISO, la antigüedad y un enlace a su estado de cuenta", async () => {
    mockedGet.mockResolvedValue(page([row()]));
    render(<CreditBalancesView token="tok" />);

    const table = await screen.findByRole("table");
    const tableRow = within(table).getByRole("row", { name: /Ana Pérez/ });
    expect(flat(tableRow.textContent)).toContain("VES 360,00");
    expect(within(tableRow).getByText("Sede principal")).toBeInTheDocument();
    expect(within(tableRow).getByText("19/10/2026")).toBeInTheDocument();
    expect(flat(tableRow.textContent)).toContain("15 días");
    expect(
      within(tableRow).getByRole("link", { name: /^Ana Pérez/ }),
    ).toHaveAttribute("href", "/patients/pat-1?tab=account-statement");
    expect(screen.getByTestId("scope-marker")).toHaveTextContent(
      "Sede principal",
    );
    expect(screen.getByText("1 saldo a favor")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Antigüedad contada al 03/11/2026, en días del calendario de la sede.",
      ),
    ).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith("tok", {
      page: 1,
      pageSize: CREDIT_BALANCES_PAGE_SIZE,
    });
  });

  it("un paciente con saldo en dos monedas sale en dos filas, cada una con su código", async () => {
    mockedGet.mockResolvedValue(
      page([
        row({ currency: "USD", amount: 10 }),
        row({ currency: "VES", amount: 360 }),
      ]),
    );
    render(<CreditBalancesView token="tok" />);
    const rows = await screen.findAllByRole("row", { name: /Ana Pérez/ });
    expect(rows).toHaveLength(2);
    expect(flat(rows[0].textContent)).toContain("USD 10,00");
    expect(flat(rows[1].textContent)).toContain("VES 360,00");
  });

  it("cada fila usa el formato de SU sede, no el de la pantalla", async () => {
    jest
      .mocked(listLocations)
      .mockResolvedValue([
        clinicLocation({
          id: "loc-1",
          name: "Sede principal",
          locale: "es-VE",
        }),
        clinicLocation({
          id: "loc-2",
          name: "Sede Miami",
          locale: "en-US",
          currency: "USD",
        }),
      ]);
    mockedGet.mockResolvedValue(
      page([
        row({ patient: { id: "a", fullName: "Ana Pérez" }, amount: 1234.5 }),
        row({
          patient: { id: "b", fullName: "Beto Ruiz" },
          location: { id: "loc-2", name: "Sede Miami" },
          currency: "USD",
          amount: 1234.5,
        }),
      ]),
    );
    render(<CreditBalancesView token="tok" />);
    const ana = await screen.findByRole("row", { name: /Ana Pérez/ });
    const beto = screen.getByRole("row", { name: /Beto Ruiz/ });
    expect(flat(ana.textContent)).toContain("VES 1.234,50");
    expect(within(ana).getByText("19/10/2026")).toBeInTheDocument();
    expect(flat(beto.textContent)).toContain("USD 1,234.50");
    expect(
      within(beto).getByText(
        regionalFormat({ locale: "en-US", hourCycle: "h12" }).civilDate(
          "2026-10-19",
        ),
      ),
    ).toBeInTheDocument();
  });

  it("un abono de hoy dice «hoy» y uno sin fecha, «Sin fecha»", async () => {
    mockedGet.mockResolvedValue(
      page([
        row({
          patient: { id: "a", fullName: "Ana Pérez" },
          since: "2026-11-03",
          ageDays: 0,
        }),
        row({
          patient: { id: "b", fullName: "Beto Ruiz" },
          since: null,
          ageDays: null,
        }),
      ]),
    );
    render(<CreditBalancesView token="tok" />);
    const ana = await screen.findByRole("row", { name: /Ana Pérez/ });
    expect(flat(ana.textContent)).toContain("hoy");
    expect(
      within(screen.getByRole("row", { name: /Beto Ruiz/ })).getByText(
        "Sin fecha",
      ),
    ).toBeInTheDocument();
  });

  it("vacío: «Ningún paciente con saldo a favor»", async () => {
    mockedGet.mockResolvedValue(page([]));
    render(<CreditBalancesView token="tok" />);
    expect(
      await screen.findByText("Ningún paciente con saldo a favor"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cargar más" }),
    ).not.toBeInTheDocument();
  });

  it("error con «Reintentar» que vuelve a pedir la primera página", async () => {
    mockedGet
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(page([row()]));
    const user = userEvent.setup();
    render(<CreditBalancesView token="tok" />);
    expect(
      await screen.findByText("No pudimos cargar los saldos a favor."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("un rol sin Cartera no ve las pestañas ni un instante (se lee del token, antes de que responda la API)", () => {
    jest.mocked(getTokenRole).mockReturnValue("DENTIST");
    mockedGet.mockReturnValue(new Promise(() => {}));
    render(
      <CreditBalancesView
        token="tok"
        tabs={{
          nav: <CarteraTabs active="saldo-a-favor" onChange={() => {}} />,
          panelId: "p",
          tabId: "t",
        }}
      />,
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("un rol ilegible cuenta como sin permiso: sin pestañas", () => {
    jest.mocked(getTokenRole).mockReturnValue(null);
    mockedGet.mockReturnValue(new Promise(() => {}));
    render(
      <CreditBalancesView
        token="tok"
        tabs={{
          nav: <CarteraTabs active="saldo-a-favor" onChange={() => {}} />,
          panelId: "p",
          tabId: "t",
        }}
      />,
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("un paciente con saldo en dos sedes sale en dos filas, cada una con su sede y su formato", async () => {
    jest
      .mocked(listLocations)
      .mockResolvedValue([
        clinicLocation({
          id: "loc-1",
          name: "Sede principal",
          locale: "es-VE",
        }),
        clinicLocation({ id: "loc-2", name: "Sede Miami", locale: "en-US" }),
      ]);
    mockedGet.mockResolvedValue(
      page([
        row({ amount: 50, currency: "VES" }),
        row({
          amount: 20,
          currency: "VES",
          location: { id: "loc-2", name: "Sede Miami" },
        }),
      ]),
    );
    render(<CreditBalancesView token="tok" />);
    const rows = await screen.findAllByRole("row", { name: /Ana Pérez/ });
    expect(rows).toHaveLength(2);
    expect(flat(rows[0].textContent)).toContain("Sede principal");
    expect(flat(rows[1].textContent)).toContain("Sede Miami");
    expect(flat(rows[1].textContent)).toContain("VES 20.00");
  });

  it("403: el aviso de rol y ninguna pestaña", async () => {
    mockedGet.mockRejectedValue(
      new ApiError(
        403,
        "Tu rol no tiene acceso a la cartera: es para administración y recepción.",
      ),
    );
    render(
      <CreditBalancesView
        token="tok"
        tabs={{
          nav: <CarteraTabs active="saldo-a-favor" onChange={() => {}} />,
          panelId: "p",
          tabId: "t",
        }}
      />,
    );
    expect(
      await screen.findByText("Tu rol no tiene acceso a la cartera."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  describe("«Cargar más» (DX-181)", () => {
    const many = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) =>
        row({
          patient: { id: `pat-${from + i}`, fullName: `Paciente ${from + i}` },
          amount: 1000 - (from + i),
        }),
      );

    it("añade la página siguiente al final, anuncia cuántos llegaron y quita el botón al terminar", async () => {
      mockedGet
        .mockResolvedValueOnce(page(many(1, 25), { total: 30 }))
        .mockResolvedValueOnce(page(many(26, 30), { total: 30, page: 2 }));
      const user = userEvent.setup();
      render(<CreditBalancesView token="tok" />);
      await screen.findByRole("table");
      expect(screen.getByText("Se muestran 25 de 30.")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cargar más" }));

      expect(
        await screen.findByRole("row", { name: /Paciente 30/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("row", { name: /Paciente 1\b/ }),
      ).toBeInTheDocument();
      expect(mockedGet).toHaveBeenLastCalledWith("tok", {
        page: 2,
        pageSize: CREDIT_BALANCES_PAGE_SIZE,
      });
      expect(
        screen.getByText("Se añadieron 5 saldos a la lista."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Cargar más" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("30 saldos a favor")).toBeInTheDocument();
    });

    it("no repite una fila que ya estaba", async () => {
      mockedGet
        .mockResolvedValueOnce(page(many(1, 25), { total: 27 }))
        .mockResolvedValueOnce(
          page([...many(25, 25), ...many(26, 27)], { total: 27, page: 2 }),
        );
      const user = userEvent.setup();
      render(<CreditBalancesView token="tok" />);
      await screen.findByRole("table");
      await user.click(screen.getByRole("button", { name: "Cargar más" }));
      await screen.findByRole("row", { name: /Paciente 27/ });
      expect(
        screen.getAllByRole("row", { name: /Paciente 25\b/ }),
      ).toHaveLength(1);
      expect(
        screen.getByText("Se añadieron 2 saldos a la lista."),
      ).toBeInTheDocument();
    });

    it("si falla, la lista queda como estaba y el aviso de fondo reintenta ESA página", async () => {
      mockedGet
        .mockResolvedValueOnce(page(many(1, 25), { total: 30 }))
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(page(many(26, 30), { total: 30, page: 2 }));
      const user = userEvent.setup();
      render(<CreditBalancesView token="tok" />);
      await screen.findByRole("table");
      await user.click(screen.getByRole("button", { name: "Cargar más" }));

      await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
      expect(mockedNotify.mock.calls[0][0]).toBe(
        "No pudimos cargar más saldos a favor.",
      );
      expect(
        screen.getByRole("row", { name: /Paciente 25\b/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cargar más" }),
      ).toBeInTheDocument();

      mockedNotify.mock.calls[0][1]?.onRetry?.();
      expect(
        await screen.findByRole("row", { name: /Paciente 30/ }),
      ).toBeInTheDocument();
      expect(mockedGet).toHaveBeenLastCalledWith("tok", {
        page: 2,
        pageSize: CREDIT_BALANCES_PAGE_SIZE,
      });
    });
  });

  it("avisa si hay abonos en otra moneda sin tasa: el saldo a favor puede ser mayor", async () => {
    mockedGet.mockResolvedValue(page([row()], { paymentsWithoutRateCount: 2 }));
    render(<CreditBalancesView token="tok" />);
    await screen.findByRole("table");
    expect(
      screen.getByText(/el saldo a favor puede ser mayor/),
    ).toBeInTheDocument();
  });

  it("con pestañas: el panel queda rotulado por la pestaña activa", async () => {
    mockedGet.mockResolvedValue(page([row()]));
    render(
      <CreditBalancesView
        token="tok"
        tabs={{
          nav: <CarteraTabs active="saldo-a-favor" onChange={() => {}} />,
          panelId: "cartera-panel-saldo-a-favor",
          tabId: "cartera-tab-saldo-a-favor",
        }}
      />,
    );
    await screen.findByRole("table");
    expect(screen.getByRole("tab", { name: "Saldo a favor" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "cartera-tab-saldo-a-favor",
    );
  });
});
