import { render, screen } from '@testing-library/react';
import { ClinicWideNote } from './clinic-wide-note';
import { setActiveLocationId } from '@/lib/locations/location-store';

// Sin mocks: `location-store` es localStorage puro y jsdom lo implementa, así
// que el test ejercita el MISMO camino que la app (misma decisión que
// `business-hours-form.test.tsx`, que solo simula la capa de red).
beforeEach(() => {
  window.localStorage.clear();
});

describe('ClinicWideNote', () => {
  it('con una sede activa avisa de que el dato es de toda la clínica', async () => {
    setActiveLocationId('sede-norte');

    render(<ClinicWideNote>Los pacientes son de toda la clínica.</ClinicWideNote>);

    expect(
      await screen.findByText('Los pacientes son de toda la clínica.'),
    ).toBeInTheDocument();
  });

  it('en "Todas las sedes" no dice nada: no hay contradicción que explicar', () => {
    setActiveLocationId(null);

    const { container } = render(
      <ClinicWideNote>Los pacientes son de toda la clínica.</ClinicWideNote>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
