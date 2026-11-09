import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnscheduledPlansView } from "./unscheduled-plans-view";
import { listUnscheduledPlans } from "@/lib/treatment-plans/plan-visits-api";
import { listLocations } from "@/lib/locations/locations-api";
jest.mock("../../lib/treatment-plans/plan-visits-api", () => ({
  listUnscheduledPlans: jest.fn(),
}));
jest.mock("../../lib/locations/locations-api", () => ({
  // DX-378: sede con zona y formato (en-US, para que se note que no es «es»).
  listLocations: jest.fn(() =>
    Promise.resolve([
      jest.requireActual("../../lib/test/sede-clock").caracasSede({ id: "l1", name: "Principal", locale: "en-US" }),
    ]),
  ),
}));
jest.mock("./schedule-visit-dialog", () => ({
  ScheduleVisitDialog: () => null,
}));
beforeEach(() => jest.clearAllMocks());
it("muestra esqueleto, vacío y reintenta un error", async () => {
  jest
    .mocked(listUnscheduledPlans)
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValue({ items: [], nextCursor: null, limit: 25, total: 0 });
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
        patientWhatsApp: "584121234567",
        currency: "USD",
        total: 100000,
        daysSinceAccepted: 10,
        nextVisit: 2,
        visitLabel: "Corona",
        minimumDate: "2027-04-01T05:00:00Z",
        minimumDay: "2027-04-01",
        planItemIds: ["i1"],
        planItems: [],
        itemCount: 1,
        locationId: "l1",
        acceptedAt: "2026-10-01",
        optionLabel: null,
      },
    ],
    nextCursor: null,
    limit: 25,
    total: 1,
  });
  render(<UnscheduledPlansView token="token" />);
  expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
  // DX-378 (FE-078): fecha mínima e importe con el formato de la sede (en-US).
  expect(await screen.findByText("04/01/2027")).toBeInTheDocument();
  // Una sola moneda: el código va con el importe, no repetido al lado.
  expect(screen.getByText(/100,000/)).toHaveTextContent("USD");
  expect(screen.queryByText("USD")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Agendar a Ana Pérez" }),
  ).toBeInTheDocument();
  const href = screen
    .getByRole("link", { name: /^WhatsApp a Ana Pérez/ })
    .getAttribute("href")!;
  expect(href).toContain("https://wa.me/584121234567");
  expect(decodeURIComponent(href)).not.toContain("Corona");
  await waitFor(() => expect(listUnscheduledPlans).toHaveBeenCalled());
});
it("DX-283: si las sedes no cargan lo dice con reintento y se lee en singular un solo tratamiento", async () => {
  jest.mocked(listLocations).mockRejectedValue(new Error("network"));
  jest.mocked(listUnscheduledPlans).mockResolvedValue({
    items: [
      {
        planId: "p1",
        patientId: "a",
        patientName: "Ana Pérez",
        patientWhatsApp: null,
        currency: "USD",
        total: 100,
        daysSinceAccepted: 1,
        nextVisit: 1,
        visitLabel: null,
        minimumDate: "2027-04-01T05:00:00Z",
        minimumDay: "2027-04-01",
        planItemIds: ["i1"],
        planItems: [],
        itemCount: 1,
        locationId: "l1",
        acceptedAt: "2026-10-01",
        optionLabel: null,
      },
    ],
    nextCursor: null,
    limit: 25,
    total: 1,
  });
  const user = userEvent.setup();
  render(<UnscheduledPlansView token="token" />);
  expect(await screen.findByText(/1 tratamiento pendiente$/)).toBeInTheDocument();
  expect(await screen.findByText("No pudimos cargar las sedes.")).toBeInTheDocument();
  jest.mocked(listLocations).mockResolvedValue([]);
  const failure = screen.getByText("No pudimos cargar las sedes.").closest<HTMLElement>('[role="status"]')!;
  await user.click(within(failure).getByRole("button", { name: "Reintentar" }));
  await waitFor(() => expect(screen.queryByText("No pudimos cargar las sedes.")).not.toBeInTheDocument());
});
