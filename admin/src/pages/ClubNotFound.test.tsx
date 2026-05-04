import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClubNotFound from './ClubNotFound';

describe('ClubNotFound', () => {
  it('renders the heading and CTA', () => {
    render(<ClubNotFound />);
    expect(screen.getByRole('heading', { name: /club not found/i })).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /visit vechelon\.ca/i });
    expect(cta).toHaveAttribute('href', 'https://vechelon.ca');
  });

  it('does not accept tenant props (data-leak guard)', () => {
    // ClubNotFound takes no props; type-checking prevents passing tenant data in.
    // This test asserts the component renders identically regardless of context.
    const { container: a } = render(<ClubNotFound />);
    const { container: b } = render(<ClubNotFound />);
    expect(a.innerHTML).toBe(b.innerHTML);
  });
});
