import { fireEvent, render, screen, within } from '@testing-library/react';
import { regions } from '../../content/regions';
import {
  answerFillRound,
  createFillRound,
  currentTarget,
  isFillRoundFinished,
  type FillRound,
} from '../../domain/fill-round';
import { createSeededRandom } from '../../domain/random';
import { FillMapResultsPage } from './FillMapResultsPage';
import { describe, it, expect, vi } from 'vitest';

function finishedRound(): FillRound {
  let round = createFillRound(regions, {
    roundId: 'r1',
    language: 'ru',
    random: createSeededRandom(1),
  });

  for (let i = 0; i < regions.length; i += 1) {
    round = answerFillRound(round, {
      answeredId: currentTarget(round).targetId,
      durationMs: 1000,
      answeredAt: '2026-08-04T10:00:00.000Z',
    }).round;
  }

  return round;
}

/** Первый регион берётся со второй попытки: в раунде есть что повторять. */
function roundWithMistake(): FillRound {
  let round = createFillRound(regions, {
    roundId: 'r1',
    language: 'ru',
    random: createSeededRandom(1),
  });

  const asked = currentTarget(round).targetId;
  const other = regions.find((region) => region.id !== asked)!.id;
  round = answerFillRound(round, {
    answeredId: other,
    durationMs: 1000,
    answeredAt: '2026-08-04T10:00:00.000Z',
  }).round;

  while (!isFillRoundFinished(round)) {
    round = answerFillRound(round, {
      answeredId: currentTarget(round).targetId,
      durationMs: 1000,
      answeredAt: '2026-08-04T10:00:00.000Z',
    }).round;
  }

  return round;
}

type RenderOverrides = {
  readonly round?: FillRound;
  readonly onRepeatMistakes?: () => void;
};

function renderResults({
  round = finishedRound(),
  onRepeatMistakes = () => {},
}: RenderOverrides = {}) {
  return render(
    <FillMapResultsPage
      round={round}
      regions={regions}
      isProgressSaved
      onRepeatMistakes={onRepeatMistakes}
      onNewRound={() => {}}
      onExit={() => {}}
    />,
  );
}

it('показывает разбивку по исходам', () => {
  renderResults();

  const breakdown = screen.getByTestId('fill-breakdown');

  const value = (term: string) =>
    within(breakdown).getByText(term).nextElementSibling?.textContent;

  expect(value('С первого раза')).toBe('34');
  expect(value('Со второго')).toBe('0');
  expect(value('Не угадано')).toBe('0');
});

it('показывает заполненную карту', () => {
  const { container } = renderResults();

  expect(container.querySelector('[data-map-variant="fill"]')).not.toBeNull();
  expect(
    container.querySelector('[data-region-id="sichuan"]')?.getAttribute('data-outcome'),
  ).toBe('first-try');
});

it('называет время раунда', () => {
  renderResults();

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('34 с');
});

describe('кнопка «Повторить ошибки»', () => {
  it('на чистом раунде кнопки «Повторить ошибки» нет', () => {
    renderResults();

    expect(screen.queryByRole('button', { name: /Повторить ошибки/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Заполнить заново' })).toHaveClass(
      'primary',
    );
  });

  it('подпись кнопки считается из того же списка, что и на экране', () => {
    const onRepeatMistakes = vi.fn();
    renderResults({ round: roundWithMistake(), onRepeatMistakes });

    const review = screen.getByRole('list', { name: 'Стоит повторить' });
    const repeat = screen.getByRole('button', {
      name: `Повторить ошибки: ${within(review).getAllByRole('listitem').length} регион`,
    });
    fireEvent.click(repeat);

    expect(onRepeatMistakes).toHaveBeenCalledTimes(1);
    expect(repeat).toHaveClass('primary');
    expect(screen.getByRole('button', { name: 'Заполнить заново' })).toHaveClass(
      'secondary',
    );
  });

  /*
   * Предложение про «все ошибки за 14 дней» объясняло расхождение, которого
   * больше нет. Если оно вернётся — вернётся и расхождение.
   */
  it('не объясняет расхождение, которого нет', () => {
    renderResults({ round: roundWithMistake() });

    expect(screen.queryByText(/за последние 14 дней/)).toBeNull();
  });
});
