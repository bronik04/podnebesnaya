import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { regions } from '../../content/regions';
import type { RoundSummary } from '../../domain/progress-rules';
import { RoundResultsPage } from './RoundResultsPage';

const SUMMARY: RoundSummary = {
  total: 34,
  correct: 30,
  accuracy: 30 / 34,
  durationMs: 245_000,
  targetsToReview: [
    { kind: 'region', id: 'sichuan' },
    { kind: 'region', id: 'yunnan' },
  ],
};

function renderResults(
  overrides: Partial<ComponentProps<typeof RoundResultsPage>> = {},
) {
  render(
    <RoundResultsPage
      summary={SUMMARY}
      targets={regions}
      bestAccuracy={0.9}
      isProgressSaved
      onRepeatMistakes={() => {}}
      onNewRound={() => {}}
      onExit={() => {}}
      {...overrides}
    />,
  );
}

it('показывает точность и число верных ответов', () => {
  renderResults();

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('88%');
  expect(screen.getByText('30 из 34')).toBeInTheDocument();
});

it('показывает время без оценки', () => {
  renderResults();

  expect(screen.getByText('Время').nextElementSibling).toHaveTextContent(
    '4 мин 5 с',
  );
});

it('называет темы для повторения', () => {
  renderResults();

  expect(screen.getByText(/Сычуань/)).toBeInTheDocument();
  expect(screen.getByText(/Юньнань/)).toBeInTheDocument();
});

it('показывает личный рекорд', () => {
  renderResults();

  expect(screen.getByText('Личный рекорд').nextElementSibling).toHaveTextContent(
    '90%',
  );
});

it('предлагает повторить ошибки', () => {
  const repeat = vi.fn();
  renderResults({ onRepeatMistakes: repeat });

  fireEvent.click(screen.getByRole('button', { name: /^Повторить ошибки/ }));

  expect(repeat).toHaveBeenCalledOnce();
});

it('не предлагает повторить ошибки, когда их нет', () => {
  renderResults({
    summary: { ...SUMMARY, correct: 34, accuracy: 1, targetsToReview: [] },
  });

  expect(screen.queryByRole('button', { name: /^Повторить ошибки/ })).toBeNull();
  expect(
    screen.getByRole('heading', { level: 2, name: 'Ошибок нет' }),
  ).toBeInTheDocument();
});

it('подпись кнопки повтора считается из того же списка, что и на экране', () => {
  renderResults({
    summary: {
      ...SUMMARY,
      correct: 27,
      accuracy: 27 / 34,
      targetsToReview: [
        { kind: 'region', id: 'sichuan' },
        { kind: 'region', id: 'yunnan' },
        { kind: 'region', id: 'hunan' },
        { kind: 'region', id: 'hebei' },
        { kind: 'region', id: 'gansu' },
        { kind: 'region', id: 'jilin' },
        { kind: 'region', id: 'anhui' },
      ],
    },
  });

  expect(screen.getAllByRole('listitem')).toHaveLength(7);
  expect(
    screen.getByRole('button', { name: 'Повторить ошибки: 7 регионов' }),
  ).toBeInTheDocument();
});

/*
 * Предложение про «все ошибки за 14 дней» объясняло расхождение, которого
 * больше нет. Если оно вернётся — вернётся и расхождение.
 */
it('не объясняет расхождение, которого нет', () => {
  renderResults();

  expect(screen.queryByText(/за последние 14 дней/)).toBeNull();
});

it('показывает карту раунда, когда её дали', () => {
  renderResults({ roundMap: <div data-testid="round-map" /> });

  expect(screen.getByTestId('round-map')).toBeInTheDocument();
});

it('обходится без карты, когда её не дали', () => {
  renderResults();

  expect(screen.queryByTestId('round-map')).toBeNull();
});

it('предупреждает, когда прогресс не сохраняется', () => {
  renderResults({ isProgressSaved: false });

  expect(screen.getByRole('status')).toHaveTextContent(
    'Прогресс не сохранится: хранилище недоступно.',
  );
});

it('начинает новый раунд и возвращает к режимам', () => {
  const newRound = vi.fn();
  const exit = vi.fn();
  renderResults({ onNewRound: newRound, onExit: exit });

  fireEvent.click(screen.getByRole('button', { name: 'Новый раунд' }));
  fireEvent.click(screen.getByRole('button', { name: 'К режимам' }));

  expect(newRound).toHaveBeenCalledOnce();
  expect(exit).toHaveBeenCalledOnce();
});

it('говорит, что прогресс сохранён, когда хранилище доступно', () => {
  renderResults();

  expect(
    screen.getByText('Прогресс сохранён на этом компьютере.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('status')).toBeNull();
});

/* Заливки карты различаются цветом и узором, но смысл каждой написан словом. */
it('под картой итога — обозначения словами и числом', () => {
  renderResults({ roundMap: <p>карта</p> });

  const legend = screen.getByRole('list', { name: 'Обозначения' });

  expect(legend).toHaveTextContent('верно · 30');
  expect(legend).toHaveTextContent('ошибка · 4');
  /* Полный раунд: несыгранных регионов на карте нет, и строки о них тоже. */
  expect(legend).not.toHaveTextContent('не спрашивали');
});

it('после суженного раунда обозначения называют и несыгранные регионы', () => {
  renderResults({ roundMap: <p>карта</p>, hasUnasked: true });

  expect(screen.getByRole('list', { name: 'Обозначения' })).toHaveTextContent(
    'не спрашивали',
  );
});

/* Образец несёт узор карты, а не свой: иначе легенду не прочесть без цвета. */
it('образец ошибки залит тем же узором, что карта', () => {
  const { container } = render(
    <RoundResultsPage
      summary={SUMMARY}
      targets={regions}
      bestAccuracy={0.9}
      isProgressSaved
      roundMap={<p>карта</p>}
      onRepeatMistakes={() => {}}
      onNewRound={() => {}}
      onExit={() => {}}
    />,
  );

  const fills = [...container.querySelectorAll('.results-swatch rect')].map(
    (rect) => rect.getAttribute('fill'),
  );

  expect(fills).toContain('url(#map-hatch-failed)');
});

it('без карты нет и обозначений', () => {
  renderResults();

  expect(screen.queryByRole('list', { name: 'Обозначения' })).toBeNull();
});

/*
 * У ошибки — ссылка на её карточку в справочнике (решение владельца от
 * 2026-10-18): разобрать, что перепутал, тут же, а не искать в атласе самому.
 * Куда ведёт ссылка, знает `App`; у кого карточки нет, у того и ссылки нет.
 */
it('ведёт от ошибки в справочник', () => {
  const opened: string[] = [];
  renderResults({
    referenceOf: (id) => (id === 'sichuan' ? () => opened.push(id) : null),
  });

  fireEvent.click(screen.getByRole('button', { name: 'В справочник — Сычуань' }));

  expect(opened).toEqual(['sichuan']);
  expect(
    screen.queryByRole('button', { name: 'В справочник — Юньнань' }),
  ).toBeNull();
});

it('без справочника ссылок у ошибок нет', () => {
  renderResults();

  expect(screen.queryByRole('button', { name: /^В справочник/ })).toBeNull();
});
