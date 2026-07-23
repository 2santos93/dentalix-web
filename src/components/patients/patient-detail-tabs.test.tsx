import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientDetailTabs, type PatientDetailTabKey } from './patient-detail-tabs';

// Mirrors how `patients/[id]/page.tsx` wires the tabs to conditionally
// rendered tabpanels, so the keyboard test below exercises the same
// tab-key -> panel-visibility contract the real page relies on.
function Harness() {
  const [activeTab, setActiveTab] = useState<PatientDetailTabKey>('data');
  return (
    <div>
      <PatientDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tablistLabel="Ana García"
        dataLabel="Datos"
        clinicalHistoryLabel="Historia clínica"
      />
      {activeTab === 'data' && (
        <div role="tabpanel" id="tabpanel-data" aria-labelledby="tab-data">
          Datos panel
        </div>
      )}
      {activeTab === 'clinical-history' && (
        <div role="tabpanel" id="tabpanel-clinical-history" aria-labelledby="tab-clinical-history">
          Historia clínica panel
        </div>
      )}
    </div>
  );
}

describe('PatientDetailTabs', () => {
  it('renders both tabs as native buttons with no roving tabindex trap', () => {
    render(<Harness />);
    const dataTab = screen.getByRole('tab', { name: 'Datos' });
    const historyTab = screen.getByRole('tab', { name: 'Historia clínica' });

    expect(dataTab.tagName).toBe('BUTTON');
    expect(historyTab.tagName).toBe('BUTTON');
    // The bug being fixed: the inactive tab used to carry tabIndex={-1},
    // removing it from the Tab order entirely.
    expect(historyTab).not.toHaveAttribute('tabindex', '-1');
  });

  it('lets a keyboard-only user Tab to the inactive tab and activate it with Enter', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText('Datos panel')).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Datos' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('tab', { name: 'Historia clínica' })).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(screen.getByRole('tab', { name: 'Historia clínica' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Historia clínica panel')).toBeInTheDocument();
    expect(screen.queryByText('Datos panel')).not.toBeInTheDocument();
  });

  it('also activates the focused tab with Space', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    await user.tab();
    expect(screen.getByRole('tab', { name: 'Historia clínica' })).toHaveFocus();

    await user.keyboard(' ');

    expect(screen.getByRole('tab', { name: 'Historia clínica' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Historia clínica panel')).toBeInTheDocument();
  });
});
