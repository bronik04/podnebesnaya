import { act, fireEvent, screen } from '@testing-library/react';
import { CORRECT_PAUSE_MS } from '../features/exercise/round-pace';

/**
 * Проводит раунд за разбор ответа, каким бы он ни был: верный ответ ведёт
 * дальше сам через `CORRECT_PAUSE_MS`, а после ошибки раунд стоит, пока
 * ученик не нажмёт «Дальше» (решение владельца от 2026-10-18). Тесту, которому
 * важен итог, а не исход каждого ответа, незачем знать, какой был ответ.
 *
 * Зовётся под поддельными часами (`vi.useFakeTimers()`).
 */
export function passFeedback() {
  act(() => {
    vi.advanceTimersByTime(CORRECT_PAUSE_MS);
  });

  const next = screen.queryByRole('button', { name: /^Дальше/ });
  if (next !== null) {
    fireEvent.click(next);
  }
}
