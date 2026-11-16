import { render, screen, waitFor } from "@testing-library/react";
import { ReminderSettingsModal } from "./reminder-settings-modal";
import {
  updateReminderSettings,
  type LocationReminderSettings,
} from "@/lib/reminders/reminders-api";
import { setupUser } from "@/lib/test/user";

jest.mock("../../lib/reminders/reminders-api", () => ({
  ...jest.requireActual("../../lib/reminders/reminders-api"),
  updateReminderSettings: jest.fn(),
}));
const mockedUpdate = updateReminderSettings as jest.MockedFunction<
  typeof updateReminderSettings
>;

const SETTINGS: LocationReminderSettings = {
  locationId: "loc-1",
  locationName: "Sede Norte",
  enabled: true,
  leadHours: [48, 2],
  calendarAlarmHours: 24,
  sendAnamnesis: false,
  updatedAt: "2026-11-01T00:00:00.000Z",
};

function renderModal(settings = SETTINGS) {
  const onSaved = jest.fn();
  render(
    <ReminderSettingsModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      settings={settings}
      onSaved={onSaved}
    />,
  );
  return { onSaved };
}

describe("ReminderSettingsModal · alarma del calendario (DX-469)", () => {
  beforeEach(() => mockedUpdate.mockReset());

  it("parte de la alarma de la sede y la manda con el resto; 0 la quita", async () => {
    mockedUpdate.mockResolvedValue({ ...SETTINGS, calendarAlarmHours: 0 });
    const user = setupUser();
    const { onSaved } = renderModal();
    const alarm = screen.getByLabelText("Aviso en el calendario del paciente");
    expect(alarm).toHaveValue(24);
    expect(alarm).toHaveAccessibleDescription(
      /su móvil le avisa estas horas antes/,
    );
    await user.clear(alarm);
    await user.type(alarm, "0");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("tok", "loc-1", {
        enabled: true,
        leadHours: [48, 2],
        calendarAlarmHours: 0,
        sendAnamnesis: false,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("fuera de 0..168 o vacío: error junto al campo, con foco, y no envía", async () => {
    const user = setupUser();
    renderModal();
    const alarm = screen.getByLabelText("Aviso en el calendario del paciente");
    for (const value of ["169", ""]) {
      await user.clear(alarm);
      if (value) await user.type(alarm, value);
      await user.click(screen.getByRole("button", { name: "Guardar" }));
      expect(
        await screen.findByText(
          "La alarma del calendario debe ser de 0 a 168 horas antes (0 la quita).",
        ),
      ).toBeInTheDocument();
      expect(alarm).toHaveAttribute("aria-invalid", "true");
      expect(alarm).toHaveFocus();
    }
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});

describe("ReminderSettingsModal · anamnesis con el recordatorio (DX-290)", () => {
  beforeEach(() => mockedUpdate.mockReset());

  it("apagado por defecto; al marcarlo se manda y explica el criterio", async () => {
    mockedUpdate.mockResolvedValue({ ...SETTINGS, sendAnamnesis: true });
    const user = setupUser();
    renderModal();
    const box = screen.getByRole("checkbox", {
      name: "Enviar la anamnesis con el recordatorio",
    });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(
      /pacientes nuevos o con la anamnesis caducada el día de la cita/,
    );
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("tok", "loc-1", {
        enabled: true,
        leadHours: [48, 2],
        calendarAlarmHours: 24,
        sendAnamnesis: true,
      }),
    );
  });
});
