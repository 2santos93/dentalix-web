import { act, render, screen, waitFor } from "@testing-library/react";
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

function deferredWarnings() {
  let resolve!: (warnings: (typeof warning)[]) => void;
  const promise = new Promise<(typeof warning)[]>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("oculta el aviso de A inmediatamente al pasar a B pendiente", async () => {
  const pending = deferredWarnings();
  mockedGet
    .mockResolvedValueOnce([warning])
    .mockReturnValueOnce(pending.promise);
  const { rerender } = render(
    <PatientOptOutWarnings token="tok" patientId="patient-a" />,
  );
  await screen.findByText(/6 pacientes coincidentes/);
  rerender(<PatientOptOutWarnings token="tok" patientId="patient-b" />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando avisos");
  expect(
    screen.queryByRole("heading", { name: "Baja por mensaje sin aplicar" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/6 pacientes coincidentes/),
  ).not.toBeInTheDocument();
  await act(async () =>
    pending.resolve([{ ...warning, id: "warning-b", matchCount: 7 }]),
  );
  expect(screen.getByText(/7 pacientes coincidentes/)).toBeInTheDocument();
});

it("oculta el estado anterior mientras la consulta con token nuevo está pendiente", async () => {
  const pending = deferredWarnings();
  mockedGet
    .mockResolvedValueOnce([warning])
    .mockReturnValueOnce(pending.promise);
  const { rerender } = render(
    <PatientOptOutWarnings token="old-token" patientId="patient-a" />,
  );
  await screen.findByText(/6 pacientes coincidentes/);
  rerender(<PatientOptOutWarnings token="new-token" patientId="patient-a" />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando avisos");
  expect(
    screen.queryByText(/6 pacientes coincidentes/),
  ).not.toBeInTheDocument();
  expect(mockedGet).toHaveBeenLastCalledWith("new-token", "patient-a");
  await act(async () => pending.resolve([]));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("una respuesta tardía de A no reemplaza los avisos ya cargados de B", async () => {
  const first = deferredWarnings();
  const second = deferredWarnings();
  mockedGet
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { rerender } = render(
    <PatientOptOutWarnings token="tok" patientId="patient-a" />,
  );
  rerender(<PatientOptOutWarnings token="tok" patientId="patient-b" />);
  await act(async () =>
    second.resolve([{ ...warning, id: "warning-b", matchCount: 7 }]),
  );
  expect(screen.getByText(/7 pacientes coincidentes/)).toBeInTheDocument();
  await act(async () => first.resolve([warning]));
  expect(screen.getByText(/7 pacientes coincidentes/)).toBeInTheDocument();
  expect(
    screen.queryByText(/6 pacientes coincidentes/),
  ).not.toBeInTheDocument();
});
