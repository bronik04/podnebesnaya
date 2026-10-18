import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { cultureCollectionsUpTo } from '../../content/culture-sets';
import { CultureRound } from './CultureRound';
import { passFeedback } from '../../test/round-pace';

/*
 * Готовность снимков подставлена: в jsdom картинки отказывают в первые же
 * миллисекунды, и прогрев там всегда мгновенный. А проверять надо как раз
 * долгий прогрев — тот, что бывает на школьном Wi-Fi, — поэтому единственная
 * граница, которую тут подменяют, это сам признак готовности. Тот же приём,
 * что в `physical-map-failure.test.tsx`.
 */
const preload = vi.hoisted(() => ({
  value: { ready: false, readyAt: null as number | null },
}));

vi.mock('./use-photo-preload', () => ({
  usePhotoPreload: () => preload.value,
}));

const POOL = cultureCollectionsUpTo('culture');

/*
 * Часы вопроса шли с появления экрана, а не с появления вопроса: пока
 * тренажёр показывал «Готовим снимки», время уже считалось, и первый ответ
 * получал в историю до двадцати секунд чужого ожидания. Столько же приписывал
 * себе и общий счётчик раунда.
 */
it('время первого ответа не считает прогрев снимков', () => {
  preload.value = { ready: false, readyAt: null };
  vi.useFakeTimers();

  try {
    const onFinish = vi.fn();
    const { rerender } = render(
      <CultureRound
        collections={POOL.slice(0, 1)}
        language="ru"
        roundId="round-1"
        seed={1}
        onFinish={onFinish}
        onExit={() => {}}
      />,
    );

    expect(screen.getByTestId('exercise-target')).toHaveTextContent(
      'Готовим снимки',
    );

    /* Долгий прогрев: предел ожидания снимков — двадцать секунд. */
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    /* Прогрев кончился ровно сейчас — так же, как сказал бы сам хук. */
    preload.value = { ready: true, readyAt: performance.now() };
    rerender(
      <CultureRound
        collections={POOL.slice(0, 1)}
        language="ru"
        roundId="round-1"
        seed={1}
        onFinish={onFinish}
        onExit={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByTestId('choice-option')[0]);
    passFeedback();

    expect(onFinish).toHaveBeenCalledOnce();
    const [attempt] = onFinish.mock.calls[0][0];
    expect(attempt.durationMs).toBeLessThan(1_000);
  } finally {
    vi.useRealTimers();
    preload.value = { ready: false, readyAt: null };
  }
});
