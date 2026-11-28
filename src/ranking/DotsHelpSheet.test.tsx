import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DotsHelpSheet, { EXAMPLE_POINTS } from './DotsHelpSheet';

afterEach(cleanup);

describe('DotsHelpSheet', () => {
  it('shows the example computed with the real DOTS formula: 100 kg at 80 kg ≈ 69,0 pkt', () => {
    expect(EXAMPLE_POINTS).toBeCloseTo(68.95, 2);
    render(<DotsHelpSheet onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Jak liczymy punkty' })).toBeTruthy();
    expect(screen.getByText(/100 kg przy 80 kg masy ciała \(mężczyzna\) ≈ 69,0 pkt/)).toBeTruthy();
    expect(screen.getByText(/tylko punkty — nie ciężar, nie masa ciała, nie płeć/)).toBeTruthy();
  });

  it('uses gender-neutral wording and closes with the X', () => {
    const onClose = vi.fn();
    const { container } = render(<DotsHelpSheet onClose={onClose} />);
    expect(container.textContent).not.toMatch(/zaliczyłeś|zrobiłeś|mogli/);
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(onClose).toHaveBeenCalled();
  });
});
