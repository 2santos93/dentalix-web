import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from './segmented-control';

type V = 'mes' | 'semana' | 'dia';
const options = [
  { value: 'mes' as const, label: 'Mes' },
  { value: 'semana' as const, label: 'Semana' },
  { value: 'dia' as const, label: 'Día', buttonProps: { 'data-testid': 'seg-dia' } },
];

function Harness({ semantics, onChange }: { semantics?: 'radio' | 'toggle'; onChange?: (v: V) => void }) {
  const [value, setValue] = useState<V>('semana');
  return (
    <SegmentedControl
      aria-label="Vista"
      value={value}
      semantics={semantics}
      options={options}
      onValueChange={(v) => {
        onChange?.(v);
        setValue(v);
      }}
    />
  );
}

describe('SegmentedControl', () => {
  it('radio: radiogroup con aria-checked y una sola parada de tabulación', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Vista' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Semana' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Mes' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: 'Semana' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('seg-dia')).toBeInTheDocument();
  });

  it('radio: las flechas mueven y eligen, con vuelta; Inicio/Fin a los extremos', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Semana' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Día' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Día' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Mes' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'Día' })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('dia');
  });

  it('toggle: botones aria-pressed; las flechas solo mueven el foco y Enter elige', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness semantics="toggle" onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Vista' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Mes' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('mes');
    expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('el elegido es superficie + tinta, nunca el acento', () => {
    render(<Harness />);
    const selected = screen.getByRole('radio', { name: 'Semana' });
    expect(selected.className).toContain('bg-surface');
    expect(selected.className).not.toMatch(/primary/);
  });

  it('clic en el ya elegido no emite; opción deshabilitada se salta', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SegmentedControl
        aria-label="Dentición"
        value="a"
        onValueChange={onChange}
        size="sm"
        fullWidthOnMobile
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
          { value: 'c', label: 'C' },
        ]}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'A' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.getByRole('radiogroup').className).toContain('w-full');
  });
});

describe('SegmentedControl — activación manual con radio', () => {
  it('las flechas mueven el foco sin elegir; Espacio elige', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SegmentedControl
        aria-label="Dentición"
        activation="manual"
        value="p"
        onValueChange={onChange}
        options={[
          { value: 'p', label: 'Permanente' },
          { value: 'm', label: 'Mixta' },
        ]}
      />,
    );
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Mixta' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('m');
  });
});
