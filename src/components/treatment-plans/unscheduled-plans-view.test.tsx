import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnscheduledPlansView } from "./unscheduled-plans-view";
import { listUnscheduledPlans } from "@/lib/treatment-plans/plan-visits-api";
jest.mock("../../lib/treatment-plans/plan-visits-api", () => ({
  listUnscheduledPlans: jest.fn(),
}));
jest.mock("../../lib/locations/locations-api", () => ({
  listLocations: jest.fn().mockResolvedValue([{ id: "l1", name: "Principal" }]),
}));
jest.mock("./schedule-visit-dialog", () => ({
  ScheduleVisitDialog: () => null,
}));
beforeEach(() => jest.clearAllMocks());
it("muestra esqueleto, vacío y reintenta un error", async () => {
  jest
    .mocked(listUnscheduledPlans)
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValue({ items: [], nextCursor: null, limit: 25 });
  const user = userEvent.setup();
  render(<UnscheduledPlansView token="token" />);
  expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: "Reintentar" }));
  expect(
    await screen.findByText(
      "No hay tratamiento aceptado pendiente de agendar en esta sede",
    ),
  ).toBeInTheDocument();
});
it("muestra importe y moneda independientes, siguiente visita y enlace seguro WhatsApp", async () => {
  jest.mocked(listUnscheduledPlans).mockResolvedValue({
    items: [
      {
        planId: "p1",
        patientId: "a",
        patientName: "Ana Pérez",
        patientWhatsApp: "573001234567",
        currency: "COP",
        total: 100000,
        daysSinceAccepted: 10,
        nextVisit: 2,
        visitLabel: "Corona",
        minimumDate: "2027-04-01T05:00:00Z",
        minimumDay: "2027-04-01",
        planItemIds: ["i1"],
        itemCount: 1,
        locationId: "l1",
        acceptedAt: "2026-10-01",
        optionLabel: null,
      },
    ],
    nextCursor: null,
    limit: 25,
  });
  render(<UnscheduledPlansView token="token" />);
  expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
  expect(screen.getByText("COP")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Agendar a Ana Pérez" }),
  ).toBeInTheDocument();
  const href = screen
    .getByRole("link", { name: "WhatsApp a Ana Pérez" })
    .getAttribute("href")!;
  expect(href).toContain("https://wa.me/573001234567");
  expect(decodeURIComponent(href)).not.toContain("Corona");
  await waitFor(() => expect(listUnscheduledPlans).toHaveBeenCalled());
});
