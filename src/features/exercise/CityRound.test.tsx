import { act, fireEvent, render, screen } from '@testing-library/react';
import { CORRECT_PAUSE_MS, WRONG_PAUSE_MS } from './round-pace';
import { citiesUpTo } from '../../content/cities';
import { regions } from '../../content/regions';
import type { City } from '../../content/types';
import type { ExerciseType } from '../../domain/round';
import { CityRound } from './CityRound';

/** Ответ — нажатием на цель карты: её доступное имя — «название, 中文». */
function mapTarget(nameRu: string): HTMLElement {
  const escaped = nameRu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return screen.getByRole('button', { name: new RegExp(`^${escaped}, `) });
}

const capitals = citiesUpTo('capital');
const shortPool = capitals.slice(0, 3);

function renderRound(
  exerciseType: ExerciseType = 'find-on-map',
  cities: readonly City[] = capitals,
  onFinish = () => {},
) {
  return render(
    <CityRound
      cities={cities}
      exerciseType={exerciseType}
      language="ru"
      roundId="round-1"
      seed={1}
      onFinish={onFinish}
      onExit={() => {}}
    />,
  );
}

function asked(): string {
  return screen.getByTestId('exercise-target').textContent ?? '';
}

function askedCity(): City {
  return capitals.find((city) => city.nameRu === asked())!;
}

it('спрашивает город по имени и принимает ответ на карте', () => {
  vi.useFakeTimers();
  try {
    renderRound();
    const before = asked();
    fireEvent.click(mapTarget(askedCity().nameRu));
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(asked()).not.toBe(before);
  } finally {
    vi.useRealTimers();
  }
});

it('в «найти город» отвечают и нажатием по точке', () => {
  vi.useFakeTimers();
  try {
    const { container } = renderRound();
    const before = asked();

    fireEvent.click(
      container.querySelector(`.city[data-city-id="${askedCity().id}"] .city-hit`)!,
    );
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(asked()).not.toBe(before);
  } finally {
    vi.useRealTimers();
  }
});

it('после ошибки называет верный ответ и едет дальше сам', () => {
  vi.useFakeTimers();
  try {
    renderRound();
    const target = askedCity();
    const other = capitals.find((city) => city.id !== target.id)!;

    fireEvent.click(mapTarget(other.nameRu));

    expect(screen.getByText('Этот город стоит повторить')).toBeTruthy();
    expect(asked()).toContain(target.nameRu);
    expect(asked()).toContain(target.nameZh);
    expect(screen.queryByRole('button', { name: 'Далее' })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(WRONG_PAUSE_MS);
    });

    expect(screen.queryByText('Этот город стоит повторить')).toBeNull();
    expect(asked()).not.toContain(target.nameRu);
  } finally {
    vi.useRealTimers();
  }
});

it('в «назвать город» показывает четыре имени и подсвечивает спрошенную точку', () => {
  const { container } = renderRound('name-target');

  expect(asked()).toBe('Город на карте');
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
  expect(container.querySelectorAll('.city[data-selected="true"]')).toHaveLength(1);
});

/*
 * Точка города в «город — регион» и есть ответ: показать её значит спросить
 * «где Чэнду» и тут же поставить туда кружок.
 */
it('в «город — регион» прячет точки и отвечают нажатием по области', () => {
  vi.useFakeTimers();
  try {
    const { container } = renderRound('match-pair');
    const before = asked();
    const target = askedCity();

    expect(container.querySelector('.city-layer')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(regionNameOf(target.regionId)) }),
    );
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(asked()).not.toBe(before);
  } finally {
    vi.useRealTimers();
  }
});

it('сообщает о завершении раунда', () => {
  vi.useFakeTimers();
  try {
    const finish = vi.fn();
    renderRound('find-on-map', shortPool, finish);

    for (let index = 0; index < shortPool.length; index += 1) {
      const target = shortPool.find((city) => city.nameRu === asked())!;
      fireEvent.click(mapTarget(target.nameRu));
      act(() => {
        vi.advanceTimersByTime(CORRECT_PAUSE_MS);
      });
    }

    expect(finish).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

function regionNameOf(regionId: string): string {
  return regions.find((region) => region.id === regionId)!.nameRu;
}

/*
 * После ошибки в «город — регион» карта должна показать, где на самом деле
 * лежит область: без этого ученик знает, что ошибся, но не видит, куда
 * нужно было нажать.
 */
it('в «город — регион» после ошибки называет регион и штрихует его на карте', () => {
  vi.useFakeTimers();
  try {
    const { container } = renderRound('match-pair');
    const target = askedCity();
    const other = capitals.find((city) => city.regionId !== target.regionId)!;

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(regionNameOf(other.regionId)) }),
    );

    expect(asked()).toContain(target.nameRu);
    expect(asked()).toContain(regionNameOf(target.regionId));
    expect(
      container.querySelector(
        `[data-region-id="${target.regionId}"][data-answer-state="correct"]`,
      ),
    ).not.toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

/*
 * В «найти город» подпись выдавала бы ответ наведением курсора — точку
 * достаточно было бы обвести мышью. Подписи не спрятаны стилем, а не
 * рисуются вовсе: слой не создаёт узла даже у точки под курсором.
 */
it.each(['find-on-map', 'name-target'] as const)(
  'в игре %s не подписывает города на карте',
  (exerciseType) => {
    const { container } = renderRound(exerciseType);

    const hit = container.querySelector('.city-hit');
    expect(hit).not.toBeNull();
    fireEvent.pointerEnter(hit as Element);

    expect(container.querySelector('.city-label')).toBeNull();
  },
);

/*
 * Пул сужается на «Повторить ошибки», справочник — нет. Точки на карте берутся
 * из справочника городов, а не из пула: иначе в повторе одной ошибки на карте
 * осталась бы одна точка — она же ответ.
 */
const SINGLE_POOL = capitals.slice(0, 1);

it('в повторе одного города карта рисует весь справочник, а не пул', () => {
  const { container } = renderRound('find-on-map', SINGLE_POOL);

  const onMap = new Set(
    [...container.querySelectorAll('[data-city-id]')].map(
      (mark) => mark.getAttribute('data-city-id') ?? '',
    ),
  );
  expect(onMap.size).toBeGreaterThan(SINGLE_POOL.length);
});

it('в повторе одного города вариантов всё равно четыре', () => {
  renderRound('name-target', SINGLE_POOL);

  expect(screen.getByText('Вопрос 1 из 1')).toBeInTheDocument();
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

