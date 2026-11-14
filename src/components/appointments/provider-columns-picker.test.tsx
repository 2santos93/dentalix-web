import { render, screen } from '@testing-library/react';
import { ProviderColumnsPicker } from './provider-columns-picker';
import { auditRenderedControls } from '@/lib/test/rendered-a11y';

it('DX-297 keeps singular/plural visible counts in the picker name with its purpose', () => {
  const snapshots = [];
  for (const selected of [['a'], ['a', 'b']]) {
    const view = render(<ProviderColumnsPicker staff={[
      { userId: 'a', fullName: 'Ana', role: 'DENTIST', locationIds: null },
      { userId: 'b', fullName: 'Luis', role: 'DENTIST', locationIds: null },
    ]} selected={selected} onChange={jest.fn()} />);
    snapshots.push({ html: view.container.innerHTML, selector: 'button' });
    view.unmount();
  }
  auditRenderedControls(snapshots);
  const view = render(<ProviderColumnsPicker staff={[]} selected={['a']} onChange={jest.fn()} />);
  expect(screen.getByRole('button')).toHaveAccessibleName('1 profesional · Profesionales en columnas');
  view.unmount();
});
