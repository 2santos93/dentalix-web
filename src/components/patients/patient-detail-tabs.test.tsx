import { useEffect, useRef, useState, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientDetailTabs, type PatientDetailTabKey } from './patient-detail-tabs';

// Mirrors how `patients/[id]/page.tsx` wires the tabs to its tabpanels: every
// panel element is always in the DOM (so `aria-controls` always resolves) but
// only the active one mounts its children, and activating a tab moves focus
// into the panel. The keyboard tests below therefore exercise the same
// tab-key -> panel-visibility -> focus contract the real page relies on.
function Panel({
  tab,
  activeTab,
  register,
  children,
}: {
  tab: PatientDetailTabKey;
  activeTab: PatientDetailTabKey;
  register: (tab: PatientDetailTabKey, el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const active = activeTab === tab;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tab}`}
      aria-labelledby={`tab-${tab}`}
      ref={(el) => register(tab, el)}
      tabIndex={-1}
      hidden={!active}
    >
      {active ? children : null}
    </div>
  );
}

function Harness() {
  const [activeTab, setActiveTab] = useState<PatientDetailTabKey>('data');
  const panels = useRef(new Map<PatientDetailTabKey, HTMLDivElement>());
  const firstRender = useRef(true);

  function register(tab: PatientDetailTabKey, el: HTMLDivElement | null) {
    if (el) panels.current.set(tab, el);
    else panels.current.delete(tab);
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    panels.current.get(activeTab)?.focus();
  }, [activeTab]);

  return (
    <div>
      <PatientDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tablistLabel="Ana García"
        dataLabel="Datos"
        clinicalHistoryLabel="Historia clínica"
        odontogramLabel="Odontograma"
        treatmentPlansLabel="Plan de tratamiento"
      />
      <Panel tab="data" activeTab={activeTab} register={register}>
        Datos panel
      </Panel>
      <Panel tab="clinical-history" activeTab={activeTab} register={register}>
        Historia clínica panel
      </Panel>
      <Panel tab="odontogram" activeTab={activeTab} register={register}>
        Odontograma panel
      </Panel>
      <Panel tab="treatment-plans" activeTab={activeTab} register={register}>
        Plan de tratamiento panel
      </Panel>
    </div>
  );
}

const TAB_NAMES = ['Datos', 'Historia clínica', 'Odontograma', 'Plan de tratamiento'];

describe('PatientDetailTabs', () => {
  it('renders the four tabs as native buttons', () => {
    render(<Harness />);
    for (const name of TAB_NAMES) {
      expect(screen.getByRole('tab', { name }).tagName).toBe('BUTTON');
    }
  });

  it('is a single tab stop: only the selected tab is in the Tab order', () => {
    render(<Harness />);

    expect(screen.getByRole('tab', { name: 'Datos' })).toHaveAttribute('tabindex', '0');
    for (const name of TAB_NAMES.slice(1)) {
      expect(screen.getByRole('tab', { name })).toHaveAttribute('tabindex', '-1');
    }
  });

  it('gives every tab an aria-controls that resolves to a panel in the DOM', () => {
    render(<Harness />);

    // The bug being fixed: only the ACTIVE tab's panel used to be rendered, so
    // the other three `aria-controls` pointed at nothing.
    for (const name of TAB_NAMES) {
      const id = screen.getByRole('tab', { name }).getAttribute('aria-controls');
      expect(id).toBeTruthy();
      expect(document.getElementById(id as string)).toBeInTheDocument();
    }
  });

  it('lets a user click the Odontograma tab and shows its panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('tab', { name: 'Odontograma' }));

    expect(screen.getByRole('tab', { name: 'Odontograma' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Odontograma panel')).toBeInTheDocument();
    expect(screen.queryByText('Datos panel')).not.toBeInTheDocument();
  });

  it('moves focus with Arrow Right/Left, wrapping around at both ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Datos' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Historia clínica' })).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Plan de tratamiento' })).toHaveFocus();

    // Past the last tab wraps to the first, and back the other way.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Datos' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Plan de tratamiento' })).toHaveFocus();
  });

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Plan de tratamiento' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Datos' })).toHaveFocus();
  });

  it('arrowing only moves focus — it does not activate the tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    await user.keyboard('{ArrowRight}{ArrowRight}');

    // Manual activation: three of the four panels fetch on mount, so arrowing
    // across the tablist must not mount them.
    expect(screen.getByRole('tab', { name: 'Odontograma' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByText('Datos panel')).toBeInTheDocument();
    expect(screen.queryByText('Odontograma panel')).not.toBeInTheDocument();
  });

  it('keeps the roving tabindex on the focused tab so Tab leaves the tablist', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    await user.keyboard('{ArrowRight}');
    const historyTab = screen.getByRole('tab', { name: 'Historia clínica' });
    expect(historyTab).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Datos' })).toHaveAttribute('tabindex', '-1');

    // One more Tab and the whole tablist is behind us: the remaining two tabs
    // are NOT stops of their own. (The panel takes focus only programmatically,
    // on activation — `tabIndex={-1}` — so here Tab simply leaves.)
    await user.tab();
    expect(screen.getByRole('tablist')).not.toContainElement(
      document.activeElement as HTMLElement | null,
    );
  });

  it('activates the focused tab with Enter and moves focus into its panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText('Datos panel')).toBeInTheDocument();

    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Historia clínica' })).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(screen.getByRole('tab', { name: 'Historia clínica' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Historia clínica panel')).toBeInTheDocument();
    expect(screen.queryByText('Datos panel')).not.toBeInTheDocument();
    // Focus followed the content instead of being stranded in the tablist.
    expect(screen.getByRole('tabpanel')).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tabpanel-clinical-history');
  });

  it('also activates the focused tab with Space', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Historia clínica' })).toHaveFocus();

    await user.keyboard(' ');

    expect(screen.getByRole('tab', { name: 'Historia clínica' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Historia clínica panel')).toBeInTheDocument();
  });

  it('hides the inactive panels from the accessibility tree', () => {
    render(<Harness />);

    // Four panel elements in the DOM, exactly one exposed.
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(4);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tabpanel-data');
  });
});

describe('PatientDetailTabs — pestaña opcional «Estado de cuenta»', () => {
  function renderTabs(accountStatementLabel?: string, onTabChange = jest.fn()) {
    render(
      <PatientDetailTabs
        activeTab="data"
        onTabChange={onTabChange}
        tablistLabel="Ana García"
        dataLabel="Datos"
        clinicalHistoryLabel="Historia clínica"
        odontogramLabel="Odontograma"
        treatmentPlansLabel="Plan de tratamiento"
        accountStatementLabel={accountStatementLabel}
      />,
    );
    return onTabChange;
  }

  it('no aparece sin etiqueta (rol sin acceso a pagos)', () => {
    renderTabs();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.queryByRole('tab', { name: 'Estado de cuenta' })).not.toBeInTheDocument();
  });

  it('con etiqueta es la quinta pestaña y entra en el recorrido con flechas', async () => {
    const user = userEvent.setup();
    const onTabChange = renderTabs('Estado de cuenta');
    expect(screen.getAllByRole('tab')).toHaveLength(5);

    await user.tab();
    await user.keyboard('{End}');
    const tab = screen.getByRole('tab', { name: 'Estado de cuenta' });
    expect(tab).toHaveFocus();
    expect(tab).toHaveAttribute('aria-controls', 'tabpanel-account-statement');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Datos' })).toHaveFocus();

    await user.click(tab);
    expect(onTabChange).toHaveBeenCalledWith('account-statement');
  });

  it('el tablist se desplaza de lado en vez de ensanchar la página', () => {
    renderTabs('Estado de cuenta');
    expect(screen.getByRole('tablist').className).toMatch(/overflow-x-auto/);
  });
});

describe('PatientDetailTabs — pestaña opcional «Consentimientos» (DX-006)', () => {
  function renderTabs(consentsLabel?: string, onTabChange = jest.fn()) {
    render(
      <PatientDetailTabs
        activeTab="data"
        onTabChange={onTabChange}
        tablistLabel="Ana García"
        dataLabel="Datos"
        clinicalHistoryLabel="Historia clínica"
        odontogramLabel="Odontograma"
        treatmentPlansLabel="Plan de tratamiento"
        consentsLabel={consentsLabel}
      />,
    );
    return onTabChange;
  }

  it('no aparece sin etiqueta (recepción)', () => {
    renderTabs();
    expect(screen.queryByRole('tab', { name: 'Consentimientos' })).not.toBeInTheDocument();
  });

  it('con etiqueta aparece al final y controla su panel', async () => {
    const user = userEvent.setup();
    const onTabChange = renderTabs('Consentimientos');
    const tab = screen.getByRole('tab', { name: 'Consentimientos' });
    expect(screen.getAllByRole('tab').at(-1)).toBe(tab);
    expect(tab).toHaveAttribute('aria-controls', 'tabpanel-consents');
    await user.click(tab);
    expect(onTabChange).toHaveBeenCalledWith('consents');
  });
});

describe('PatientDetailTabs — pestaña «Autorizaciones» (DX-037)', () => {
  it('va al final, después de «Estado de cuenta», y selecciona data-consents', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();
    render(
      <PatientDetailTabs
        activeTab="data"
        onTabChange={onTabChange}
        tablistLabel="Ana García"
        dataLabel="Datos"
        clinicalHistoryLabel="Historia clínica"
        odontogramLabel="Odontograma"
        treatmentPlansLabel="Plan de tratamiento"
        accountStatementLabel="Estado de cuenta"
        dataConsentsLabel="Autorizaciones"
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Datos',
      'Historia clínica',
      'Odontograma',
      'Plan de tratamiento',
      'Estado de cuenta',
      'Autorizaciones',
    ]);
    const tab = screen.getByRole('tab', { name: 'Autorizaciones' });
    expect(tab).toHaveAttribute('aria-controls', 'tabpanel-data-consents');
    await user.click(tab);
    expect(onTabChange).toHaveBeenCalledWith('data-consents');
  });
});

describe('PatientDetailTabs — pestaña opcional «Periodontograma» (DX-007)', () => {
  function renderTabs(perioLabel?: string, onTabChange = jest.fn()) {
    render(
      <PatientDetailTabs
        activeTab="data"
        onTabChange={onTabChange}
        tablistLabel="Ana García"
        dataLabel="Datos"
        clinicalHistoryLabel="Historia clínica"
        odontogramLabel="Odontograma"
        treatmentPlansLabel="Plan de tratamiento"
        perioLabel={perioLabel}
      />,
    );
    return onTabChange;
  }

  it('no aparece sin etiqueta (recepción)', () => {
    renderTabs();
    expect(screen.queryByRole('tab', { name: 'Periodontograma' })).not.toBeInTheDocument();
  });

  it('con etiqueta va justo después de «Odontograma» y selecciona perio', async () => {
    const user = userEvent.setup();
    const onTabChange = renderTabs('Periodontograma');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Datos',
      'Historia clínica',
      'Odontograma',
      'Periodontograma',
      'Plan de tratamiento',
    ]);
    const tab = screen.getByRole('tab', { name: 'Periodontograma' });
    expect(tab).toHaveAttribute('aria-controls', 'tabpanel-perio');
    await user.click(tab);
    expect(onTabChange).toHaveBeenCalledWith('perio');
  });
});

describe('PatientDetailTabs — pestaña opcional «Recetas» (DX-013)', () => {
  function renderTabs(prescriptionsLabel?: string, onTabChange = jest.fn()) {
    render(
      <PatientDetailTabs
        activeTab="data"
        onTabChange={onTabChange}
        tablistLabel="Ana García"
        dataLabel="Datos"
        consentsLabel="Consentimientos"
        prescriptionsLabel={prescriptionsLabel}
        dataConsentsLabel="Autorizaciones"
      />,
    );
    return onTabChange;
  }

  it('no aparece sin etiqueta (recepción)', () => {
    renderTabs();
    expect(screen.queryByRole('tab', { name: 'Recetas' })).not.toBeInTheDocument();
  });

  it('con etiqueta va después de «Consentimientos» y selecciona prescriptions', async () => {
    const user = userEvent.setup();
    const onTabChange = renderTabs('Recetas');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Datos',
      'Consentimientos',
      'Recetas',
      'Autorizaciones',
    ]);
    const tab = screen.getByRole('tab', { name: 'Recetas' });
    expect(tab).toHaveAttribute('aria-controls', 'tabpanel-prescriptions');
    await user.click(tab);
    expect(onTabChange).toHaveBeenCalledWith('prescriptions');
  });
});

describe('PatientDetailTabs — pestaña opcional «Accesos» (DX-009)', () => {
  function renderTabs(accessLogLabel?: string, onTabChange = jest.fn()) {
    render(
      <PatientDetailTabs
        activeTab="data"
        onTabChange={onTabChange}
        tablistLabel="Ana García"
        dataLabel="Datos"
        dataConsentsLabel="Autorizaciones"
        accessLogLabel={accessLogLabel}
      />,
    );
    return onTabChange;
  }

  it('no aparece sin etiqueta (roles que no son ADMIN)', () => {
    renderTabs();
    expect(screen.queryByRole('tab', { name: 'Accesos' })).not.toBeInTheDocument();
  });

  it('con etiqueta va la última y selecciona access-log', async () => {
    const user = userEvent.setup();
    const onTabChange = renderTabs('Accesos');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Datos',
      'Autorizaciones',
      'Accesos',
    ]);
    const tab = screen.getByRole('tab', { name: 'Accesos' });
    expect(tab).toHaveAttribute('aria-controls', 'tabpanel-access-log');
    await user.click(tab);
    expect(onTabChange).toHaveBeenCalledWith('access-log');
  });
});
