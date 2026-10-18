import { act, fireEvent, render, screen } from '@testing-library/react';
import { CORRECT_PAUSE_MS } from './round-pace';
import { useAutoAdvance } from './use-auto-advance';

/** Пробный компонент: хук нельзя вызвать вне рендера. */
function Probe({
  isCorrect,
  onAdvance,
}: {
  readonly isCorrect: boolean;
  readonly onAdvance: () => void;
}) {
  const { schedule, waiting, proceed } = useAutoAdvance();

  return (
    <>
      <button type="button" onClick={() => schedule(isCorrect, onAdvance)}>
        ответить
      </button>
      {waiting ? (
        <button type="button" onClick={proceed}>
          дальше
        </button>
      ) : null}
    </>
  );
}

it('планирует переход после верного ответа на CORRECT_PAUSE_MS', () => {
  vi.useFakeTimers();
  try {
    const advance = vi.fn();
    render(<Probe isCorrect onAdvance={advance} />);

    fireEvent.click(screen.getByRole('button', { name: 'ответить' }));
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS - 1);
    });
    expect(advance).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(advance).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'дальше' })).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

/*
 * После ошибки раунд стоит, пока ученик сам не пойдёт дальше (решение
 * владельца от 2026-10-18): за две секунды автоперехода он не успевал
 * разглядеть свой ответ и верный.
 */
it('после ошибки сам не едет: ждёт, пока ученик пойдёт дальше', () => {
  vi.useFakeTimers();
  try {
    const advance = vi.fn();
    render(<Probe isCorrect={false} onAdvance={advance} />);

    fireEvent.click(screen.getByRole('button', { name: 'ответить' }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(advance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'дальше' }));
    expect(advance).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'дальше' })).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

/* Пробел и Enter приходят и на кнопку, и на окно: второй вызов — не второй шаг. */
it('повторный «дальше» не переводит раунд дважды', () => {
  const advance = vi.fn();
  function Twice() {
    const { schedule, proceed } = useAutoAdvance();

    return (
      <>
        <button type="button" onClick={() => schedule(false, advance)}>
          ответить
        </button>
        <button
          type="button"
          onClick={() => {
            proceed();
            proceed();
          }}
        >
          дальше
        </button>
      </>
    );
  }
  render(<Twice />);

  fireEvent.click(screen.getByRole('button', { name: 'ответить' }));
  fireEvent.click(screen.getByRole('button', { name: 'дальше' }));

  expect(advance).toHaveBeenCalledOnce();
});

/*
 * Главный довод докстринга хука: уход с экрана посреди паузы не должен
 * переводить раунд, которого уже нет. Без очистки в эффекте размонтирования
 * `advance` дёрнул бы уже отсутствующий компонент — здесь это вызов колбэка,
 * который в ExerciseRound/CityRound/PhysicalRound меняет состояние раунда.
 */
it('уход с экрана посреди паузы не вызывает переход', () => {
  vi.useFakeTimers();
  try {
    const advance = vi.fn();
    const { unmount } = render(<Probe isCorrect onAdvance={advance} />);

    fireEvent.click(screen.getByRole('button', { name: 'ответить' }));
    unmount();

    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(advance).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
