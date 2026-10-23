import { render, screen, waitFor } from "@testing-library/react";
import { PatientOptOutWarnings } from "./patient-opt-out-warnings";
import { getPatientOptOutWarnings } from "@/lib/patients/communication-api";
import { setupUser } from "@/lib/test/user";

jest.mock("../../lib/patients/communication-api", () => ({
  getPatientOptOutWarnings: jest.fn(),
}));
const mockedGet = jest.mocked(getPatientOptOutWarnings);
const warning = {
  id: "warning-1",
  createdAt: "2026-10-23T10:00:00.000Z",
  matchCount: 6,
  maxMatches: 5,
};

beforeEach(() => jest.clearAllMocks());
it("muestra aviso durable, fecha y recuentos sin datos de contacto", async () => {
  mockedGet.mockResolvedValue([warning]);
  render(<PatientOptOutWarnings token="tok" patientId="p1" />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando avisos");
  expect(
    await screen.findByRole("heading", {
      name: "Baja por mensaje sin aplicar",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText(/23\/10\/2026/)).toBeInTheDocument();
  expect(
    screen.getByText(/6 pacientes coincidentes · máximo 5/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/No se desactivaron los recordatorios/),
  ).toBeInTheDocument();
  expect(mockedGet).toHaveBeenCalledWith("tok", "p1");
});
it("si falla permite reintentar sin ocultar el aviso", async () => {
  mockedGet
    .mockRejectedValueOnce(new Error("red"))
    .mockResolvedValueOnce([warning]);
  const user = setupUser();
  render(<PatientOptOutWarnings token="tok" patientId="p1" />);
  await user.click(await screen.findByRole("button", { name: "Reintentar" }));
  expect(
    await screen.findByRole("heading", {
      name: "Baja por mensaje sin aplicar",
    }),
  ).toBeInTheDocument();
});
it("sin avisos no agrega un bloque vacío", async () => {
  mockedGet.mockResolvedValue([]);
  const { container } = render(
    <PatientOptOutWarnings token="tok" patientId="p1" />,
  );
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});
