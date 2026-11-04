import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/client";
import { refundCredit } from "@/lib/patient-credit/patient-credit-api";
import { CreditRefundModal } from "./credit-refund-modal";
import type { CreditSource } from "./credit-balance";
import type { AccountStatementMovement } from "@/lib/account-statement/account-statement-api";
import { listLocations } from "@/lib/locations/locations-api";
import { clinicLocation } from "@/lib/test/locations";
import { moneyWithCode } from "@/lib/format/sede-number";
import { STAMP_FORMATS, STAMP_SEDES } from "@/lib/test/stamp";

jest.mock("../../lib/locations/locations-api", () => ({
  listLocations: jest.fn(),
}));
jest.mock("../../lib/patient-credit/patient-credit-api", () => ({
  ...jest.requireActual("../../lib/patient-credit/patient-credit-api"),
  refundCredit: jest.fn(),
}));
const mockedLocations = jest.mocked(listLocations);
const norm = (text: string | null) => (text ?? "").replace(/\s/g, " ");

const SOURCE = {
  planId: "cancelled",
  currency: "VES",
  credit: 120.5,
} as CreditSource;
// Un abono de 300,00 VES del 20 de octubre, que sirve de referencia de la devolución.
const PAYMENTS = [
  {
    id: "pay-1",
    amount: 300,
    currency: "VES",
    paidOn: "2026-10-20",
    treatmentPlanId: "cancelled",
  },
] as unknown as AccountStatementMovement[];

function renderModal() {
  render(
    <CreditRefundModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      source={SOURCE}
      payments={PAYMENTS}
      planName={(id) => `Plan ${id}`}
      onDone={jest.fn()}
    />,
  );
}

describe("CreditRefundModal con el formato de la sede (DX-354b)", () => {
  beforeEach(() =>
    mockedLocations.mockReset().mockResolvedValue([STAMP_SEDES.caracas]),
  );

  it.each([
    ["caracas", "VES 120,50", "VES 300,00 · 20/10/2026"],
    ["berlin", "120,50 VES", "300,00 VES · 20.10.2026"],
    ["miami", "VES 120.50", "VES 300.00 · 10/20/2026"],
  ] as const)(
    "el saldo y el abono de referencia (importe y fecha civil) salen con el formato de la sede %s",
    async (key, credit, payment) => {
      mockedLocations.mockResolvedValue([STAMP_SEDES[key]]);
      renderModal();
      const dialog = await screen.findByRole("dialog");
      await waitFor(() =>
        expect(norm(dialog.textContent)).toContain(
          norm(moneyWithCode(120.5, "VES", STAMP_FORMATS[key])),
        ),
      );
      expect(norm(dialog.textContent)).toContain(credit);
      expect(norm(dialog.textContent)).toContain(payment);
    },
  );

  it("sin formato de la sede: «—», un aviso con Reintentar y sin devolver a ciegas", async () => {
    mockedLocations.mockResolvedValue([
      clinicLocation({ locale: null, hourCycle: null }),
    ]);
    renderModal();
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findAllByRole("button", { name: "Reintentar" }),
    ).toHaveLength(1);
    expect(
      within(dialog).getByRole("button", { name: "Devolver" }),
    ).toBeDisabled();
    expect(norm(dialog.textContent)).not.toContain("120");
  });
});

describe("CreditRefundModal: tope diario de RECEPCIÓN (DX-462)", () => {
  beforeEach(() =>
    mockedLocations.mockReset().mockResolvedValue([STAMP_SEDES.caracas]),
  );

  it("el 403 de la API con lo que queda del tope diario se ve junto al formulario, en español", async () => {
    const message =
      "Supera tu tope diario de devoluciones en esta sede. Te quedan VES\u00a040,00 hoy; pide a un administrador que la registre.";
    jest.mocked(refundCredit).mockRejectedValueOnce(new ApiError(403, message));
    const user = userEvent.setup();
    renderModal();
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Devolver" }),
      ).toBeEnabled(),
    );
    await user.type(
      dialog.querySelector("#cr-amount") as HTMLInputElement,
      "60",
    );
    await user.type(
      dialog.querySelector("#cr-reason") as HTMLTextAreaElement,
      "El paciente se muda de ciudad",
    );
    await user.click(within(dialog).getByRole("button", { name: "Devolver" }));

    const alert = await within(dialog).findByText(
      /Supera tu tope diario de devoluciones en esta sede/,
    );
    expect(norm(alert.textContent)).toBe(norm(message));
    // El formulario sigue abierto con lo escrito: se puede corregir el importe.
    expect(dialog.querySelector("#cr-reason")).toHaveValue(
      "El paciente se muda de ciudad",
    );
  });
});
