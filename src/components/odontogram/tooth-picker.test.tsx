import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToothPicker } from './tooth-picker';

describe('ToothPicker', () => {
  it('escribir el código FDI es la vía rápida, y sigue existiendo', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<ToothPicker value="" onChange={onChange} inputId="tp-tooth-number" />);

    await user.type(screen.getByLabelText(/código fdi/i), '2');
    expect(onChange).toHaveBeenCalledWith('2');
  });

  it('tocar el diente en el mapa escribe el mismo valor: las dos vías no pueden discrepar', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<ToothPicker value="" onChange={onChange} inputId="tp-tooth-number" />);

    // El mapa ES `OdontogramChart`: cada diente es un grupo con su número FDI.
    await user.click(screen.getByRole('button', { name: /^26$/ }));
    expect(onChange).toHaveBeenCalledWith('26');
  });

  it('confirma en texto qué diente quedó elegido', () => {
    render(<ToothPicker value="26" onChange={() => {}} inputId="tp-tooth-number" />);
    expect(screen.getByRole('status')).toHaveTextContent('Diente 26 seleccionado');
  });

  it('un temporal válido se acepta y explica por qué no se marca en el mapa', () => {
    // El backend acepta 51-85; la carta solo dibuja los 32 permanentes. Sin
    // este aviso el usuario cree que el picker no respondió.
    render(<ToothPicker value="52" onChange={() => {}} inputId="tp-tooth-number" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Diente 52 seleccionado');
    expect(status).toHaveTextContent(/temporal/i);
  });

  it('un código imposible se señala como todavía inválido', () => {
    render(<ToothPicker value="99" onChange={() => {}} inputId="tp-tooth-number" />);
    expect(screen.getByRole('status')).toHaveTextContent(/todavía no es un código fdi válido/i);
  });

  it('sin nada elegido lo dice, en vez de dejar el estado en blanco', () => {
    render(<ToothPicker value="" onChange={() => {}} inputId="tp-tooth-number" />);
    expect(screen.getByRole('status')).toHaveTextContent(/ningún diente seleccionado/i);
  });

  it('el `inputId` que recibe es el que lleva el campo, para que una etiqueta externa lo apunte', () => {
    render(<ToothPicker value="" onChange={() => {}} inputId="tp-tooth-number" />);
    expect(screen.getByLabelText(/código fdi/i)).toHaveAttribute('id', 'tp-tooth-number');
  });
});
