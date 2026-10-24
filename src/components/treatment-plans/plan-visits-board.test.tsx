import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanVisitsBoard } from "./plan-visits-board";
import {
  getPlanVisits,
  updatePlanVisits,
} from "@/lib/treatment-plans/plan-visits-api";
import type { TreatmentPlan } from "@/lib/treatment-plans/treatment-plans-api";
jest.mock("../../lib/treatment-plans/plan-visits-api", () => ({
  getPlanVisits: jest.fn(),
  updatePlanVisits: jest.fn(),
}));
jest.mock("./schedule-visit-dialog", () => ({
  ScheduleVisitDialog: () => null,
}));
const plan = {
  id: "plan1",
  patientId: "patient1",
  status: "ACCEPTED",
  visitIntervals: { "2": 90 },
  items: [
    {
      id: "a",
      visit: 1,
      visitLabel: "Cirugía",
      toothNumber: "46",
      status: "ACCEPTED",
    },
    {
      id: "b",
      visit: 2,
      visitLabel: "Corona",
      toothNumber: "46",
      status: "ACCEPTED",
    },
  ],
} as unknown as TreatmentPlan;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getPlanVisits).mockResolvedValue({
    planId: "plan1",
    items: [],
    visitIntervals: { "2": 90 },
    visits: [
      {
        number: 1,
        label: "Cirugía",
        minimumDate: "2027-01-01T00:00:00Z",
        minimumDay: "2027-01-01",
        minDaysAfterPrevious: 0,
        planItemIds: ["a"],
      },
      {
        number: 2,
        label: "Corona",
        minimumDate: "2027-04-01T00:00:00Z",
        minimumDay: "2027-04-01",
        minDaysAfterPrevious: 90,
        planItemIds: ["b"],
      },
    ],
  });
});
it("agrupa por visita y permite mover sin arrastrar a un odontólogo", async () => {
  const user = userEvent.setup();
  const changed = jest.fn();
  jest.mocked(updatePlanVisits).mockResolvedValue({
    planId: "plan1",
    items: [],
    visitIntervals: {},
    visits: [],
  });
  render(
    <PlanVisitsBoard
      token="token"
      plan={plan}
      role="DENTIST"
      onChanged={changed}
      renderItems={(items) => <p>{items.map((i) => i.id).join(",")}</p>}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Visita 1 · Cirugía" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Visita 2 · Corona" }),
  ).toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText("Mover a visita: diente 46, ítem 1"),
    "2",
  );
  await user.click(screen.getByRole("button", { name: "Guardar visitas" }));
  await waitFor(() =>
    expect(updatePlanVisits).toHaveBeenCalledWith(
      "token",
      "plan1",
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ itemId: "a", visit: 2 }),
        ]),
      }),
    ),
  );
});
it("recepción puede agendar pero no cambiar visitas", async () => {
  render(
    <PlanVisitsBoard
      token="token"
      plan={plan}
      role="RECEPTION"
      onChanged={jest.fn()}
      renderItems={() => null}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Guardar visitas" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Mover a visita/)).not.toBeInTheDocument();
  expect(
    await screen.findByRole("button", { name: "Agendar visita 2" }),
  ).toBeInTheDocument();
});
it("incorpora ítems nuevos y recarga la disponibilidad al aceptar sin recargar la página", async () => {
  const { rerender } = render(
    <PlanVisitsBoard
      token="token"
      plan={{ ...plan, status: "DRAFT" }}
      role="DENTIST"
      onChanged={jest.fn()}
      renderItems={(items) => <p>{items.map((i) => i.id).join(",")}</p>}
    />,
  );
  await waitFor(() => expect(getPlanVisits).toHaveBeenCalledTimes(1));
  const next = {
    ...plan,
    items: [
      ...(plan.items ?? []),
      { ...(plan.items ?? [])[0], id: "new-item", visit: 1 },
    ],
  };
  rerender(
    <PlanVisitsBoard
      token="token"
      plan={next}
      role="DENTIST"
      onChanged={jest.fn()}
      renderItems={(items) => <p>{items.map((i) => i.id).join(",")}</p>}
    />,
  );
  expect(screen.getByText("a,new-item")).toBeInTheDocument();
  await waitFor(() => expect(getPlanVisits).toHaveBeenCalledTimes(2));
});
it("al marcar DONE con la misma fecha del plan oculta la visita agotada y recarga sus ítems", async () => {
  const { rerender } = render(
    <PlanVisitsBoard
      token="token"
      plan={plan}
      role="DENTIST"
      onChanged={jest.fn()}
      renderItems={() => null}
    />,
  );
  await screen.findByRole("button", { name: "Agendar visita 2" });
  const done = {
    ...plan,
    items: (plan.items ?? []).map((i) => ({
      ...i,
      status: i.id === "b" ? ("DONE" as const) : ("ACCEPTED" as const),
    })),
  };
  rerender(
    <PlanVisitsBoard
      token="token"
      plan={done}
      role="DENTIST"
      onChanged={jest.fn()}
      renderItems={() => null}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Agendar visita 2" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(getPlanVisits).toHaveBeenCalledTimes(2));
});
it("muestra el día civil autoritativo aunque el instante caiga en el día anterior del navegador", async () => {
  const data = await jest.mocked(getPlanVisits).getMockImplementation()!(
    "token",
    "plan1",
  );
  jest
    .mocked(getPlanVisits)
    .mockResolvedValue({
      ...data,
      visits: data.visits.map((v) =>
        v.number === 2
          ? {
              ...v,
              minimumDate: "2027-03-31T22:00:00Z",
              minimumDay: "2027-04-01",
            }
          : v,
      ),
    });
  render(
    <PlanVisitsBoard
      token="token"
      plan={plan}
      role="DENTIST"
      onChanged={jest.fn()}
      renderItems={() => null}
    />,
  );
  expect(await screen.findByText("01/04/2027")).toBeInTheDocument();
});
it("DX-291: un ítem sin diente (cargo administrativo) no deja «diente ,» en la etiqueta", () => {
  const feePlan = {
    ...plan,
    items: [{ id: "fee", visit: 1, visitLabel: null, toothNumber: "", status: "DONE" }],
  } as unknown as TreatmentPlan;
  render(
    <PlanVisitsBoard
      token="token"
      plan={feePlan}
      role="DENTIST"
      onChanged={jest.fn()}
      renderItems={() => null}
    />,
  );
  expect(screen.getByLabelText("Mover a visita: sin diente, ítem 1")).toBeInTheDocument();
});
