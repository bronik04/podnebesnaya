import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { regions } from '../content/regions';
import { ChinaMap } from './ChinaMap';
import { LandmarkLayer } from './LandmarkLayer';
import { LANDMARK_POINTS } from './landmark-points';

function renderLayer(props: Partial<Parameters<typeof LandmarkLayer>[0]> = {}) {
  return render(
    <svg>
      <LandmarkLayer {...props} />
    </svg>,
  );
}

it('рисует звезду каждой достопримечательности вне гроздей', () => {
  const { container } = renderLayer({ points: LANDMARK_POINTS.slice(0, 1) });

  expect(container.querySelectorAll('.landmark-mark')).toHaveLength(1);
});

it('отдаёт нажатие своей достопримечательностью', () => {
  const select = vi.fn();
  const point = LANDMARK_POINTS.find(
    (one) => one.landmark.id === 'potala',
  ) as (typeof LANDMARK_POINTS)[number];

  renderLayer({ points: [point], onSelect: select });

  fireEvent.click(
    screen.getByRole('button', { name: 'Дворец Потала, 布达拉宫' }),
  );

  expect(select).toHaveBeenCalledWith(['potala']);
});

/*
 * Три пекинских объекта стоят в полутора единицах карты друг от друга при цели
 * нажатия в семнадцать: без грозди они были бы одним пятном с тремя целями
 * поверх.
 */
it('собирает пекинские объекты в гроздь', () => {
  renderLayer({ onSelect: () => {} });

  expect(
    screen.getByRole('button', {
      name: /Достопримечательности рядом: Запретный город/,
    }),
  ).toBeInTheDocument();
});

/*
 * Гроздь — одна цель ответа, а не врезка с лупой (решение владельца от
 * 2026-08-30): нажатие отдаёт всех её членов, а кто из них спрошен, решает
 * раунд.
 */
it('нажатие по грозди отдаёт всех её членов', () => {
  const select = vi.fn();
  renderLayer({ onSelect: select });

  fireEvent.click(
    screen.getByRole('button', {
      name: /Достопримечательности рядом: Запретный город/,
    }),
  );

  expect(select).toHaveBeenCalledWith([
    'forbidden-city',
    'temple-of-heaven',
    'summer-palace',
  ]);
});

/*
 * Слой без обработчика только показывает: ни ролей, ни остановок Tab. Иначе в
 * атласе появилось бы 38 узлов, которые ничего не делают.
 */
it('без обработчика не пускает звёзды в обход клавиатурой', () => {
  const { container } = renderLayer();

  expect(screen.queryAllByRole('button')).toHaveLength(0);

  for (const hit of container.querySelectorAll('.landmark-hit')) {
    expect(hit.getAttribute('tabindex')).toBe('-1');
    expect(hit.getAttribute('aria-hidden')).toBe('true');
  }
});

/*
 * В «назвать» слой не интерактивен, и спрошенный объект внутри грозди обязан
 * быть виден на самой грозди — иначе вопроса на карте просто нет.
 */
it('помечает гроздь со спрошенным объектом', () => {
  const { container } = renderLayer({ selectedLandmarkId: 'summer-palace' });

  const marked = container.querySelector('.map-cluster[data-selected="true"]');

  expect(marked).not.toBeNull();
  expect(marked?.getAttribute('data-cluster-id')).toBe('cluster:forbidden-city');
});

/*
 * Спрошенная одиночная звезда крупнее прочих и с кольцом: знак прежнего
 * размера, отличавшийся только заливкой, приходилось искать по всей карте.
 */
it('увеличивает спрошенную звезду', () => {
  const { container } = renderLayer({ selectedLandmarkId: 'potala' });

  const selected = container.querySelector(
    '.landmark[data-selected="true"] .landmark-mark',
  );
  const plain = container.querySelector(
    '.landmark[data-selected="false"] .landmark-mark',
  );

  /* Поперечник звезды: наибольшее расстояние между её вершинами. */
  function spanOf(points: string | null | undefined): number {
    const vertices = (points ?? '')
      .split(' ')
      .map((pair) => pair.split(',').map(Number));

    return Math.max(
      ...vertices.flatMap(([x1, y1]) =>
        vertices.map(([x2, y2]) => Math.hypot(x1 - x2, y1 - y2)),
      ),
    );
  }

  expect(selected).not.toBeNull();
  expect(spanOf(selected?.getAttribute('points'))).toBeGreaterThan(
    spanOf(plain?.getAttribute('points')),
  );
});

/*
 * После ответа звезда несёт исход: верная — нефритом, ошибочная — киноварью
 * (решение владельца от 2026-10-18). Прежде верная звезда после ошибки не
 * показывалась вовсе, и найти её на карте было нечем.
 */
it('помечает исход у одиночной звезды', () => {
  const potala = LANDMARK_POINTS.find((one) => one.landmark.id === 'potala')!;
  const other = LANDMARK_POINTS.find(
    (one) => one.landmark.id !== 'potala' && one.landmark.regionId !== 'beijing',
  )!;
  const { container } = renderLayer({
    points: [potala, other],
    outcomes: { potala: 'correct', [other.landmark.id]: 'incorrect' },
  });

  expect(
    container.querySelector('.landmark[data-landmark-id="potala"]'),
  ).toHaveAttribute('data-outcome', 'correct');
  expect(
    container.querySelector(`.landmark[data-landmark-id="${other.landmark.id}"]`),
  ).toHaveAttribute('data-outcome', 'incorrect');
});

it('гроздь берёт исход своего члена', () => {
  renderLayer({ onSelect: () => {}, outcomes: { 'forbidden-city': 'correct' } });

  const cluster = screen
    .getByRole('button', { name: /Достопримечательности рядом: Запретный город/ })
    .closest('.map-cluster');
  expect(cluster).toHaveAttribute('data-outcome', 'correct');
});

it('ставит звезде исход «со второй попытки» и называет его', () => {
  const point = LANDMARK_POINTS.find((one) => one.landmark.id === 'potala')!;
  const { container } = renderLayer({
    points: [point],
    onSelect: () => {},
    outcomes: { potala: 'second-try' },
  });

  expect(container.querySelector('[data-landmark-id="potala"].landmark')).toHaveAttribute(
    'data-outcome',
    'second-try',
  );
  expect(
    screen.getByRole('button', { name: 'Дворец Потала, 布达拉宫 — верно со второй попытки' }),
  ).toBeInTheDocument();
});

it('рисует только звёзды из `landmarkIds`', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      showsLandmarks
      landmarkIds={['potala']}
    />,
  );

  expect(
    [...container.querySelectorAll('.landmark')].map((one) =>
      one.getAttribute('data-landmark-id'),
    ),
  ).toEqual(['potala']);
});

it('гроздь за раунд получает исход, только когда закрыты все её члены', () => {
  const { container, rerender } = renderLayer({
    onSelect: () => {},
    outcomes: { 'forbidden-city': 'correct' },
    outcomesAccumulate: true,
  });
  const cluster = () =>
    [...container.querySelectorAll('.map-cluster')].find((one) =>
      one.querySelector('[aria-label*="Запретный город"]'),
    )!;
  expect(cluster()).not.toHaveAttribute('data-outcome');

  const members = cluster()
    .querySelector('[role="button"]')!
    .getAttribute('aria-label')!
    .replace('Достопримечательности рядом: ', '')
    .split(', ')
    .map((name) => LANDMARK_POINTS.find((one) => one.landmark.nameRu === name)!.landmark.id);
  rerender(
    <svg>
      <LandmarkLayer
        onSelect={() => {}}
        outcomesAccumulate
        outcomes={Object.fromEntries(
          members.map((id, index) => [id, index === 0 ? 'second-try' : 'correct']),
        )}
      />
    </svg>,
  );

  expect(cluster()).toHaveAttribute('data-outcome', 'second-try');
});
