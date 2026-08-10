import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './pagination';

describe('Pagination', () => {
  it('renders nothing when everything fits on one page', () => {
    const { container } = render(
      <Pagination page={1} pageSize={20} total={20} onPageChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the list is empty', () => {
    const { container } = render(
      <Pagination page={1} pageSize={20} total={0} onPageChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the first response lands (pageSize still 0, so total/pageSize is not a number)', () => {
    const { container } = render(
      <Pagination page={1} pageSize={0} total={0} onPageChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    // Even with a known total, an unusable pageSize must not render NaN pages.
    const { container: c2 } = render(
      <Pagination page={1} pageSize={0} total={137} onPageChange={() => {}} />,
    );
    expect(c2).toBeEmptyDOMElement();
  });

  it('shows the visible range and the page count', () => {
    render(<Pagination page={1} pageSize={20} total={137} onPageChange={() => {}} />);
    expect(screen.getByText('1–20 de 137')).toBeInTheDocument();
    // 137 / 20 -> 7 pages
    expect(screen.getAllByText(/página 1 de 7/i).length).toBeGreaterThan(0);
  });

  it('clamps the range on the last page instead of overshooting the total', () => {
    // Page 7 of 137 items: items 121..137, NOT 121..140.
    render(<Pagination page={7} pageSize={20} total={137} onPageChange={() => {}} />);
    expect(screen.getByText('121–137 de 137')).toBeInTheDocument();
  });

  it('disables "Anterior" on the first page and "Siguiente" on the last', () => {
    const { unmount } = render(
      <Pagination page={1} pageSize={20} total={60} onPageChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /siguiente/i })).not.toBeDisabled();
    unmount();

    render(<Pagination page={3} pageSize={20} total={60} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: /anterior/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('calls onPageChange with the next/previous page', async () => {
    const onPageChange = jest.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} pageSize={20} total={137} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole('button', { name: /anterior/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('disables both controls while a page is in flight', () => {
    render(<Pagination page={2} pageSize={20} total={137} onPageChange={() => {}} disabled />);
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('exposes the controls under a labeled navigation landmark', () => {
    render(<Pagination page={1} pageSize={20} total={137} onPageChange={() => {}} />);
    expect(screen.getByRole('navigation', { name: /paginación/i })).toBeInTheDocument();
  });
});
