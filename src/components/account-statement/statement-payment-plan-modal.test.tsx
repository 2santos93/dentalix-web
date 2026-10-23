import { render, screen, within } from "@testing-library/react";
import { StatementPaymentPlanModal } from "./statement-payment-plan-modal";
import {
  listBillablePlans,
  type BillablePlan,
} from "@/lib/payments/billable-plans-api";

jest.mock("../../lib/payments/billable-plans-api", () => ({
  ...jest.requireActual("../../lib/payments/billable-plans-api"),
  listBillablePlans: jest.fn(),
}));
jest.mock("../../lib/payment-plans/payment-plan-api", () => ({
  createPaymentPlan: jest.fn(),
}));

const mockedList = listBillablePlans as jest.MockedFunction<
  typeof listBillablePlans
>;

const withPaymentPlan: BillablePlan = {
  id: "plan-cop",
  status: "ACCEPTED",
  currency: "COP",
  createdAt: "2026-08-01T15:00:00.000Z",
  total: 3000000,
  paid: 0,
  paidOtherCurrencies: [],
  balance: 3000000,
  hasActivePaymentPlan: true,
};

it("si todos los planes ya tienen cuotas, no manda a recepción a la pestaña clínica que no ve", async () => {
  mockedList.mockResolvedValue([withPaymentPlan]);
  render(
    <StatementPaymentPlanModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      patientId="pat-1"
      onCreated={jest.fn()}
    />,
  );
  const dialog = screen.getByRole("dialog");
  const notice = await within(dialog).findByText(
    /ya tienen un plan de cuotas activo/i,
  );
  expect(notice).toHaveTextContent(/administrador/i);
  expect(notice).not.toHaveTextContent(/cancélalo/i);
  expect(within(dialog).getByRole("button", { name: "Crear" })).toBeDisabled();
});
