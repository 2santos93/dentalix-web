import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar, Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

describe('Tabs', () => {
  it('patrón ARIA de pestañas con activación manual: las flechas mueven el foco, Enter elige', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Secciones">
          <TabsTrigger value="a">Uno</TabsTrigger>
          <TabsTrigger value="b">Dos</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel uno</TabsContent>
        <TabsContent value="b">Panel dos</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tablist', { name: 'Secciones' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Uno' })).toHaveAttribute('aria-selected', 'true');
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveAttribute('aria-selected', 'false');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel dos');
  });

  it('subrayado en tinta: la pestaña activa no usa el texto de acento', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="x">
          <TabsTrigger value="a">Uno</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole('tab').className).toContain('data-[state=active]:text-ink');
  });
});

describe('TabBar', () => {
  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [value, setValue] = useState<'abonos' | 'turnos'>('abonos');
    return (
      <TabBar
        aria-label="Vistas de la caja"
        value={value}
        onValueChange={(v) => {
          onChange(v);
          setValue(v);
        }}
        items={[
          { value: 'abonos', label: 'Abonos', id: 'cash-tab-abonos', controls: 'cash-panel-abonos' },
          { value: 'turnos', label: 'Turnos', id: 'cash-tab-turnos', controls: 'cash-panel-turnos' },
        ]}
      />
    );
  }

  it('conserva los id y aria-controls de la página', () => {
    render(<Harness onChange={jest.fn()} />);
    const tab = screen.getByRole('tab', { name: 'Turnos' });
    expect(tab).toHaveAttribute('id', 'cash-tab-turnos');
    expect(tab).toHaveAttribute('aria-controls', 'cash-panel-turnos');
  });

  it('un clic emite una sola vez (mousedown + click), también con solo click', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Turnos' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('tab', { name: 'Abonos' }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('abonos');
  });
});
