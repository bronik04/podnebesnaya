import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { CORRECT_PAUSE_MS, WRONG_PAUSE_MS } from './round-pace';
import { cityById } from '../../content/cities';
import { regions } from '../../content/regions';
import type { Region } from '../../content/types';
import type { QuestionLanguage } from '../../domain/question-language';
import type { ExerciseType } from '../../domain/round';
import { ChinaMap } from '../../map/ChinaMap';
import { ExerciseRound } from './ExerciseRound';

const SHORT_POOL = regions.slice(0, 3);

function renderRound(
  exerciseTypes: readonly ExerciseType[] = ['find-on-map'],
  language: QuestionLanguage = 'ru',
  onFinish = () => {},
  pool: readonly Region[] = regions,
) {
  return render(
    <ExerciseRound
      regions={pool}
      exerciseTypes={exerciseTypes}
      language={language}
      roundId="round-1"
      seed={1}
      onFinish={onFinish}
      onExit={() => {}}
    />,
  );
}

/** Название административного центра региона: оно живёт в справочнике городов. */
function capitalOf(region: Region): string {
  return cityById(region.capitalCityId)!.nameRu;
}

function asked(): string {
  return screen.getByTestId('exercise-target').textContent ?? '';
}

function askedRegion(): Region {
  const label = asked();

  return regions.find((region) =>
    [region.nameRu, region.nameZh].includes(label),
  )!;
}

function answerCorrectly() {
  const target = askedRegion();

  fireEvent.click(
    screen.getByRole('button', { name: `${target.nameRu}, ${target.nameZh}` }),
  );
}

function answerWrongly() {
  const target = askedRegion();
  const other = regions.find((region) => region.id !== target.id)!;

  fireEvent.click(
    screen.getByRole('button', { name: `${other.nameRu}, ${other.nameZh}` }),
  );
}

it('переводит к следующему вопросу сам, без кнопки, после верного ответа', () => {
  vi.useFakeTimers();
  try {
    renderRound();
    const before = asked();

    answerCorrectly();

    expect(screen.queryByRole('button', { name: 'Далее' })).toBeNull();
    /*
     * На паузу встаёт печать 对 со словом (редизайн, 2026-10-14) — это
     * отметка исхода, а не разбор: кнопки нет, раунд едет сам.
     */
    expect(screen.getByText('Верно')).toBeInTheDocument();

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
    const target = askedRegion();

    answerWrongly();

    expect(screen.getByText('Этот регион стоит повторить')).toBeTruthy();
    expect(asked()).toContain(target.nameRu);
    expect(screen.queryByRole('button', { name: 'Далее' })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(WRONG_PAUSE_MS);
    });

    expect(screen.queryByText('Этот регион стоит повторить')).toBeNull();
    expect(asked()).not.toContain(target.nameRu);
  } finally {
    vi.useRealTimers();
  }
});

it('на русском спрашивает русским названием', () => {
  renderRound();

  expect(regions.map((region) => region.nameRu)).toContain(asked());
});

it('на китайском спрашивает иероглифами', () => {
  renderRound(['find-on-map'], 'zh');

  expect(regions.map((region) => region.nameZh)).toContain(asked());
});

it('в режиме «найти на карте» отвечают выбором области', () => {
  vi.useFakeTimers();
  try {
    renderRound();
    const before = asked();

    answerCorrectly();
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(asked()).not.toBe(before);
  } finally {
    vi.useRealTimers();
  }
});

it('в режиме «регион — столица» отвечают выбором варианта', () => {
  vi.useFakeTimers();
  try {
    renderRound(['match-pair']);
    const target = askedRegion();

    // По доступному имени: цифра-подсказка скрыта от читалки и в имя не входит.
    fireEvent.click(screen.getByRole('button', { name: capitalOf(target) }));
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(asked()).not.toBe(target.nameRu);
  } finally {
    vi.useRealTimers();
  }
});

/*
 * Карта в «регион — столица» — иллюстрация, а не поле ответа: она показывает
 * спрошенный регион, но отвечают кнопками. Нажатие по области не должно
 * считаться ответом (спек RoundStage, решение 2026-08-17).
 */
it('в «регион — столица» карта подсвечивает спрошенный регион и не отвечает', () => {
  renderRound(['match-pair']);
  const target = askedRegion();

  const area = document.querySelector(`#${target.id}`)!;
  expect(area.getAttribute('data-selected')).toBe('true');
  expect(area.getAttribute('tabindex')).toBe('-1');

  fireEvent.click(area);

  // Ответ не засчитан: варианты живы, разбор не начался.
  expect(screen.queryByText('Эту пару стоит повторить')).toBeNull();
  const options = screen.getAllByTestId('choice-option');
  expect(options.every((option) => !(option as HTMLButtonElement).disabled)).toBe(
    true,
  );
});

it('меняет вид задания от вопроса к вопросу, когда типов несколько', () => {
  vi.useFakeTimers();
  try {
    renderRound(['find-on-map', 'match-pair']);

    expect(screen.queryAllByTestId('choice-option')).toHaveLength(0);

    answerCorrectly();
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
  } finally {
    vi.useRealTimers();
  }
});

it('заголовок вопроса помечен языком, когда спрашивают иероглифами', () => {
  renderRound(['find-on-map'], 'zh');

  expect(screen.getByTestId('exercise-target')).toHaveAttribute('lang', 'zh-Hans');
});

it('на русском заголовок вопроса языком не помечен', () => {
  renderRound();

  expect(screen.getByTestId('exercise-target')).not.toHaveAttribute('lang');
});

it('первый фокусируемый элемент — ответ, а не ссылка на лицензию', () => {
  const { container } = renderRound();

  const first = container.querySelector(
    'a[href], button:not([disabled]), [tabindex="0"]',
  );

  expect(first).toHaveAttribute('data-region-id');
});

it('не печатает названия выносок: иначе Макао и Гонконг — готовые ответы', () => {
  const { container } = renderRound();

  const labels = [...container.querySelectorAll('.map-callout text')];

  expect(labels).not.toHaveLength(0);
  for (const label of labels) {
    expect((label as SVGElement).style.display, label.textContent ?? '').toBe(
      'none',
    );
  }
});

it('на экране темы выноски подписаны: там карту разглядывают, а не отвечают', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
    />,
  );

  const labels = [...container.querySelectorAll('.map-callout text')];

  expect(labels).not.toHaveLength(0);
  for (const label of labels) {
    expect((label as SVGElement).style.display).toBe('');
  }
});

/*
 * Плашка должна называть верный ответ, а не цель вопроса: цель — регион,
 * она уже названа в самом вопросе, а проверяют здесь столицу.
 */
it('в «регион — столица» после ошибки плашка называет столицу, а не регион', () => {
  vi.useFakeTimers();
  try {
    renderRound(['match-pair']);
    const target = askedRegion();
    const correctCapital = capitalOf(target);

    // Неверный вариант — любая кнопка, в чьём тексте нет верной столицы.
    const wrongOption = screen
      .getAllByTestId('choice-option')
      .find((option) => within(option).queryByText(correctCapital) === null)!;
    fireEvent.click(wrongOption);

    expect(asked()).toContain(correctCapital);
    expect(asked()).not.toBe(target.nameRu);
    // Подводка над плашкой тоже про ответ, а не про вопрос: столица — часть пары.
    expect(screen.getByText('Эту пару стоит повторить')).toBeTruthy();
    expect(screen.queryByText('Этот регион стоит повторить')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('сообщает о завершении раунда, не требуя нажатия на последнем вопросе', () => {
  vi.useFakeTimers();
  try {
    const finish = vi.fn();
    renderRound(['match-pair'], 'ru', finish, SHORT_POOL);

    for (let index = 0; index < SHORT_POOL.length; index += 1) {
      const target = askedRegion();
      fireEvent.click(screen.getByRole('button', { name: capitalOf(target) }));
      act(() => {
        vi.advanceTimersByTime(CORRECT_PAUSE_MS);
      });
    }

    expect(finish).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

/*
 * Ошибка на последнем вопросе не отменяет завершение раунда: раунд едет
 * дальше сам и после паузы-ошибки (2000 мс), а не только после верной
 * паузы (500 мс).
 */
it('последний вопрос с ошибкой всё равно завершает раунд', () => {
  vi.useFakeTimers();
  try {
    const finish = vi.fn();
    const pool = regions.slice(0, 2);
    renderRound(['find-on-map'], 'ru', finish, pool);

    answerCorrectly();
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    answerWrongly();
    act(() => {
      vi.advanceTimersByTime(WRONG_PAUSE_MS);
    });

    expect(finish).toHaveBeenCalledOnce();
    expect(finish.mock.calls[0][0]).toHaveLength(pool.length);
  } finally {
    vi.useRealTimers();
  }
});

/*
 * Пул сужается на «Повторить ошибки», а справочник — нет. Отвлекающие и сама
 * карта обязаны брать все тридцать четыре области:
 * нарисованы на карте всё равно все, и повтор одной ошибки не должен
 * превращаться в вопрос с единственным вариантом.
 */
const SINGLE_POOL = regions.slice(0, 1);

it('в повторе одного региона вариантов всё равно четыре', () => {
  renderRound(['name-target'], 'ru', () => {}, SINGLE_POOL);

  expect(screen.getByText('Вопрос 1 из 1')).toBeInTheDocument();
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

it('в повторе одного региона столицу тоже выбирают из четырёх', () => {
  renderRound(['match-pair'], 'ru', () => {}, SINGLE_POOL);

  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

it('в повторе одного региона карта называет остальные области по-русски', () => {
  const { container } = renderRound(['find-on-map'], 'ru', () => {}, SINGLE_POOL);
  const other = regions.find((region) => region.id !== SINGLE_POOL[0].id)!;

  expect(
    container
      .querySelector(`[data-region-id="${other.mapAreaId}"]`)
      ?.getAttribute('aria-label'),
  ).toContain(other.nameRu);
});

it('в повторе одного региона ответ закрывает всю карту, а не одну область', () => {
  const { container } = renderRound(['find-on-map'], 'ru', () => {}, SINGLE_POOL);
  answerCorrectly();

  const areas = container.querySelectorAll('[data-region-id]');
  const closed = container.querySelectorAll('[data-region-id][data-answer-state]');
  expect(closed).toHaveLength(areas.length);
});
