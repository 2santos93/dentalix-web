import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleVisitDialog } from "./schedule-visit-dialog";
import { getPatient, type Patient } from "@/lib/patients/patients-api";
import { listStaff } from "@/lib/appointments/staff-api";
import { listLocations } from "@/lib/locations/locations-api";
import { caracasSede } from "@/lib/test/sede-clock";
import { findOpenings } from "@/lib/appointments/waitlist-api";
jest.mock("../../lib/patients/patients-api", () => ({ getPatient: jest.fn() }));
jest.mock("../../lib/appointments/staff-api", () => ({ listStaff: jest.fn() }));
jest.mock("../../lib/locations/locations-api", () => ({
  listLocations: jest.fn(),
}));
jest.mock("../../lib/appointments/waitlist-api", () => ({
  findOpenings: jest.fn(),
}));
jest.mock("../appointments/appointment-form", () => ({
  AppointmentForm: ({
    defaultProviderId,
    defaultStartTime,
  }: {
    defaultProviderId?: string;
    defaultStartTime?: string;
  }) => (
    <p data-testid="appointment-slot">
      {defaultStartTime
        ? `${defaultProviderId} ${defaultStartTime}`
        : "Horario manual"}
    </p>
  ),
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(getPatient)
    .mockResolvedValue({
      id: "p1",
      firstName: "Ana",
      lastName: "Pérez",
    } as Patient);
  jest
    .mocked(listLocations)
    // DX-378: sede en Caracas (UTC−4) y 12 h; Jest corre con TZ=UTC.
    .mockResolvedValue([caracasSede({ id: "l1", name: "Principal" })]);
  jest.mocked(listStaff).mockResolvedValue([
    {
      userId: "reception",
      fullName: "Aarón Recepción",
      role: "RECEPTION",
      locationIds: null,
    },
    {
      userId: "outside",
      fullName: "Berta Fuera",
      role: "DENTIST",
      locationIds: ["l2"],
    },
    {
      userId: "doctor",
      fullName: "Clara Doctora",
      role: "DENTIST",
      locationIds: ["l1"],
    },
    {
      userId: "admin",
      fullName: "Dora Admin",
      role: "ADMIN",
      locationIds: null,
    },
  ]);
  jest
    .mocked(findOpenings)
    .mockResolvedValue({
      openings: [
        { start: "2027-04-01T09:00:00Z", end: "2027-04-01T09:30:00Z" },
      ],
      truncated: false,
    } as Awaited<ReturnType<typeof findOpenings>>);
});
function mount() {
  render(
    <ScheduleVisitDialog
      token="tok"
      patientId="p1"
      locationId="l1"
      visit={{
        number: 2,
        label: "Corona",
        minimumDate: "2027-04-01T05:00:00Z",
        minimumDay: "2027-04-01",
        minDaysAfterPrevious: 90,
        planItemIds: ["x"],
      }}
      onClose={jest.fn()}
      onCreated={jest.fn()}
    />,
  );
}
it("solo ofrece profesionales que atienden en la sede y elige el primero válido", async () => {
  mount();
  const select = await screen.findByLabelText("Profesional para buscar hueco");
  expect(
    screen.queryByRole("option", { name: "Aarón Recepción" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "Berta Fuera" }),
  ).not.toBeInTheDocument();
  expect(select).toHaveValue("doctor");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Buscar hueco" }));
  await waitFor(() =>
    expect(findOpenings).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({
        providerId: "doctor",
        locationId: "l1",
        from: "2027-04-01",
      }),
    ),
  );
});
it("cambiar profesional limpia el hueco y los resultados anteriores", async () => {
  mount();
  const user = userEvent.setup();
  const select = await screen.findByLabelText("Profesional para buscar hueco");
  await user.click(screen.getByRole("button", { name: "Buscar hueco" }));
  await user.click(await screen.findByRole("button", { name: /jue, 1 abr ·/ }));
  expect(screen.getByTestId("appointment-slot")).toHaveTextContent("doctor");
  await user.selectOptions(select, "admin");
  expect(screen.getByTestId("appointment-slot")).toHaveTextContent(
    "Horario manual",
  );
  expect(
    screen.queryByRole("region", { name: "Huecos disponibles" }),
  ).not.toBeInTheDocument();
});

it("DX-378: los huecos y la hora propuesta van en el reloj de la sede, no en el del navegador", async () => {
  mount();
  const user = userEvent.setup();
  await screen.findByLabelText("Profesional para buscar hueco");
  expect(screen.getByText(/Fecha mínima sugerida: 01\/04\/2027/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Buscar hueco" }));
  // 09:00 UTC son las 5:00 a. m. en Caracas.
  const slot = await screen.findByRole("button", { name: "jue, 1 abr · 5:00 a. m. – 5:30 a. m." });
  await user.click(slot);
  expect(screen.getByTestId("appointment-slot")).toHaveTextContent("doctor 05:00");
});
