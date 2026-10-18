import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CORRECT_PAUSE_MS } from './round-pace';
import { landmarksUpTo } from '../../content/landmark-sets';
import { LandmarkRound, type LandmarkRoundProps } from './LandmarkRound';
import { passFeedback } from '../../test/round-pace';

function renderRound(overrides: Partial<LandmarkRoundProps> = {}) {
  return render(
    <LandmarkRound
      landmarks={landmarksUpTo('monuments')}
      exerciseType="find-on-map"
      language="ru"
      roundId="test"
      seed={1}
      onFinish={() => {}}
      onExit={() => {}}
      {...overrides}
    />,
  );
}

function askedName(): string {
  return screen.getByTestId('exercise-target').textContent as string;
}

/*
 * Ответ по звезде: скучившиеся объекты — одна цель, и нажатие по грозди со
 * спрошенным объектом само есть верный ответ (решение владельца от
 * 2026-08-30). Так же отвечает и ученик.
 */
function answerOnMap(name: string) {
  const own = new RegExp(`^${name},`);
  const inCluster = new RegExp(`Достопримечательности рядом:.* ${name}`);

  fireEvent.click(
    screen.queryByRole('button', { name: own }) ??
      screen.getByRole('button', { name: inCluster }),
  );
}

it('засчитывает верную звезду и идёт к следующему вопросу', () => {
  vi.useFakeTimers();
  try {
    renderRound();

    const asked = askedName();
    answerOnMap(asked);
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(askedName()).not.toBe(asked);
  } finally {
    vi.useRealTimers();
  }
});

/*
 * Гроздь — одна цель: три пекинских объекта не разведёт никакое разумное
 * увеличение, а тренажёр спрашивает «где это», не «в какой части Пекина».
 * Нажатие по грозди со спрошенным объектом — верный ответ.
 */
it('засчитывает нажатие по грозди со спрошенным объектом', () => {
  const finish = vi.fn();
  vi.useFakeTimers();
  try {
    /* Один вопрос — про Запретный город; на карте он в пекинской грозди. */
    renderRound({
      landmarks: landmarksUpTo('monuments').filter(
        (one) => one.id === 'forbidden-city',
      ),
      onFinish: finish,
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /Достопримечательности рядом:.*Запретный город/,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(finish).toHaveBeenCalledWith([
      expect.objectContaining({ isCorrect: true }),
    ]);
  } finally {
    vi.useRealTimers();
  }
});

/* Гроздь без спрошенного объекта — обычный промах, как чужая звезда. */
it('считает промахом нажатие по чужой грозди', () => {
  const finish = vi.fn();
  vi.useFakeTimers();
  try {
    renderRound({
      landmarks: landmarksUpTo('monuments').filter((one) => one.id === 'potala'),
      onFinish: finish,
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /Достопримечательности рядом:.*Запретный город/,
      }),
    );
    passFeedback();

    expect(finish).toHaveBeenCalledWith([
      expect.objectContaining({ isCorrect: false }),
    ]);
  } finally {
    vi.useRealTimers();
  }
});

/*
 * После ошибки на карте видны обе звезды: верная — нефритом, своя — киноварью
 * (решение владельца от 2026-10-18). Прежде верная не показывалась вовсе.
 */
it('после промаха помечает верную звезду и ошибочную', () => {
  const { container } = renderRound({
    landmarks: landmarksUpTo('monuments').filter((one) => one.id === 'potala'),
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: /Достопримечательности рядом:.*Запретный город/,
    }),
  );

  expect(
    container.querySelector('.landmark[data-landmark-id="potala"]'),
  ).toHaveAttribute('data-outcome', 'correct');
  expect(
    screen
      .getByRole('button', { name: /Достопримечательности рядом:.*Запретный город/ })
      .closest('.map-cluster'),
  ).toHaveAttribute('data-outcome', 'incorrect');
  expect(screen.getByRole('button', { name: /^Дальше/ })).toBeInTheDocument();
});

/* Карта в раундах по достопримечательностям чистая: решение владельца. */
it('не показывает городов и физической карты', () => {
  const { container } = renderRound();

  expect(container.querySelector('.city-layer')).toBeNull();
  expect(container.querySelector('.physical-layer')).toBeNull();
  expect(container.querySelector('.landmark-layer')).not.toBeNull();
});

it('в «назвать» прячет звёзды от подписей и даёт четыре имени', () => {
  const { container } = renderRound({ exerciseType: 'name-target' });

  /* Подпись не спрятана стилем, а не рисуется вовсе — даже у спрошенной. */
  expect(container.querySelector('.landmark-label')).toBeNull();
  expect(screen.getAllByRole('button', { name: /./ }).length).toBeGreaterThan(3);
});

/* В «достопримечательность — регион» звёзд нет вовсе: они и есть ответ. */
it('в «объект — регион» прячет звёзды вовсе', () => {
  const { container } = renderRound({ exerciseType: 'match-pair' });

  expect(container.querySelector('.landmark-layer')).toBeNull();
});

/*
 * Пул сужается на «Повторить ошибки», справочник — нет. Звёзды на карте
 * рисуются из справочника, а не из пула: иначе в повторе одной ошибки на
 * карте осталась бы одна звезда — она же ответ.
 */
const SINGLE_POOL = landmarksUpTo('monuments').slice(0, 1);

it('в повторе одной достопримечательности карта рисует весь справочник', () => {
  const { container } = renderRound({ exerciseType: 'find-on-map', landmarks: SINGLE_POOL });

  const onMap = new Set(
    [...container.querySelectorAll('[data-landmark-id]')].map(
      (mark) => mark.getAttribute('data-landmark-id') ?? '',
    ),
  );
  expect(onMap.size).toBeGreaterThan(SINGLE_POOL.length);
});

it('в повторе одной достопримечательности вариантов всё равно четыре', () => {
  renderRound({ exerciseType: 'name-target', landmarks: SINGLE_POOL });

  expect(screen.getByText('Вопрос 1 из 1')).toBeInTheDocument();
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

