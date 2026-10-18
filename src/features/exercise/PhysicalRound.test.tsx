import { act, fireEvent, render, screen } from '@testing-library/react';
import { CORRECT_PAUSE_MS, WRONG_PAUSE_MS } from './round-pace';
import { expect, it, vi } from 'vitest';
import {
  physicalFeatures,
  physicalFeaturesUpTo,
} from '../../content/physical-features';
import { createSeededRandom } from '../../domain/random';
import { loadPhysicalMap } from '../../map/load-physical-map';
import { createRound, physicalTarget } from '../../domain/round';
import { PhysicalRound } from './PhysicalRound';

/*
 * Физический слой приезжает отдельным куском сборки, и карта берёт его
 * `import()`-ом. Загружается он здесь, один раз на файл: дальше карта
 * получает его прямо при монтировании, и проверки остаются синхронными — как
 * и в браузере, где кусок дотянут заранее.
 */
beforeAll(async () => {
  await loadPhysicalMap();
});

function renderRound(
  exerciseType: 'find-on-map' | 'name-target',
  features: readonly (typeof physicalFeatures)[number][] = physicalFeatures,
) {
  const onFinish = vi.fn();
  const onExit = vi.fn();

  const { container } = render(
    <PhysicalRound
      features={features}
      exerciseType={exerciseType}
      language="ru"
      roundId="r1"
      seed={11}
      onFinish={onFinish}
      onExit={onExit}
    />,
  );

  return { container, onFinish, onExit };
}

/*
 * Пул сужается на «Повторить ошибки», справочник — нет: на карте нарисованы
 * все объекты, иначе в повторе одной ошибки на ней остался бы один — он же
 * ответ.
 */
it('в повторе одного объекта карта рисует весь справочник', () => {
  const { container } = renderRound('find-on-map', physicalFeatures.slice(0, 1));

  const onMap = new Set(
    [...container.querySelectorAll('[data-feature-id]')].map(
      (mark) => mark.getAttribute('data-feature-id') ?? '',
    ),
  );
  expect(onMap.size).toBeGreaterThan(1);
});

it('спрашивает все объекты подряд', () => {
  renderRound('find-on-map');

  expect(screen.getByText(/Вопрос 1 из 41/)).toBeInTheDocument();
});

it('в «найти» вопрос называет объект, а карта его не подписывает', () => {
  const { container } = renderRound('find-on-map');

  expect(screen.getByTestId('exercise-target')).not.toHaveTextContent(
    'Объект на карте',
  );
  expect(container.querySelector('.physical-layer')).toHaveAttribute(
    'data-labels',
    'false',
  );

});

it('в «назвать» даёт четыре имени того же вида', () => {
  renderRound('name-target');

  const options = screen.getAllByTestId('choice-option');
  /*
   * «Того же вида» — одной семьи, а не одного рода: река, её участок и канал
   * нарисованы одним пером, и линию отвлекают линии.
   */
  const kinds = options.map((option) => {
    const kind = physicalFeatures.find(
      (feature) => feature.id === option.dataset.choiceId,
    )!.kind;

    return kind === 'gorge' || kind === 'canal' ? 'river' : kind;
  });

  expect(options).toHaveLength(4);
  expect(new Set(kinds).size).toBe(1);
});

/**
 * Ответ — объектом карты с клавиатуры: нажатие указателем карта разбирает
 * сама (отличает касание от сдвига), а Enter на цели — тот же ответ без этой
 * разборки. Доступное имя цели — «название, 中文»; у реки несколько кусков
 * линии, отвечает любой.
 */
function answerOnMap(nameRu: string) {
  fireEvent.keyDown(
    screen.getAllByRole('button', { name: new RegExp(`^${nameRu}, `) })[0],
    { key: 'Enter' },
  );
}

it('верный ответ на карте ведёт к следующему вопросу', () => {
  vi.useFakeTimers();
  try {
    renderRound('find-on-map');

    const asked = screen.getByTestId('exercise-target').textContent!;

    answerOnMap(asked);
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(screen.getByTestId('exercise-target').textContent).not.toBe(asked);
  } finally {
    vi.useRealTimers();
  }
});

it('после ошибки называет верный объект и едет дальше сам', () => {
  vi.useFakeTimers();
  try {
    renderRound('find-on-map');

    const asked = screen.getByTestId('exercise-target').textContent!;
    const target = physicalFeatures.find((feature) => feature.nameRu === asked)!;
    const wrong = physicalFeatures.find((feature) => feature.nameRu !== asked)!;

    answerOnMap(wrong.nameRu);

    expect(screen.getByText('Этот объект стоит повторить')).toBeTruthy();
    const stated = screen.getByTestId('exercise-target').textContent!;
    expect(stated).toContain(target.nameRu);
    expect(stated).toContain(target.nameZh);
    expect(screen.queryByRole('button', { name: 'Далее' })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(WRONG_PAUSE_MS);
    });

    expect(screen.queryByText('Этот объект стоит повторить')).toBeNull();
    expect(screen.getByTestId('exercise-target').textContent).not.toContain(
      target.nameRu,
    );
  } finally {
    vi.useRealTimers();
  }
});

it('даёт прервать раунд', () => {
  const { onExit } = renderRound('name-target');

  fireEvent.click(screen.getByRole('button', { name: /Прервать раунд/ }));

  expect(onExit).toHaveBeenCalled();
});

it('сузившийся пул не сужает выбор: отвлекающие берутся из всех двенадцати', () => {
  // Так выглядит «Повторить ошибки» после двух промахов — по реке и по форме.
  // Своими же отвлекающими на вопросе про реку остался бы один вариант.
  const pool = physicalFeatures.filter(
    (feature) => feature.id === 'yangtze' || feature.id === 'gobi',
  );

  renderRound('name-target', pool);

  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

it('озеро отвлекают только озёрами: знак от заливки отличается видом', () => {
  renderRound(
    'name-target',
    physicalFeatures.filter((feature) => feature.kind === 'lake'),
  );

  const options = screen.getAllByTestId('choice-option');
  const kinds = options.map(
    (option) =>
      physicalFeatures.find((feature) => feature.id === option.dataset.choiceId)!
        .kind,
  );

  expect(options).toHaveLength(4);
  expect(new Set(kinds)).toEqual(new Set(['lake']));
});

it('каждый набор спрашивает свои цели ровно по разу', () => {
  for (const [set, length] of [
    /* Ущелья входят с первого набора: они рядом со своей рекой. Канал — тоже: он линия, как реки. */
    ['base', 21],
    ['ranges', 28],
    ['all', 41],
  ] as const) {
    const pool = physicalFeaturesUpTo(set);
    const round = createRound(
      pool.map((feature) => physicalTarget(feature.id)),
      {
        roundId: 'r1',
        exerciseTypes: ['find-on-map'],
        language: 'ru',
        random: createSeededRandom(5),
      },
    );

    expect(round.questions, `набор ${set}`).toHaveLength(length);
    expect(new Set(round.questions.map((q) => q.target.id)).size).toBe(length);
  }
});

/*
 * Ущелья лежат на Янцзы, и один отрезок карты делят два ответа. Ученик,
 * ткнувший в самое узнаваемое место реки, не должен получать ошибку: часть
 * засчитывается целому. Обратное неверно — когда спрошены ущелья, годится
 * только сам отрезок.
 */
function answerOnLine(container: HTMLElement, featureId: string): void {
  /* Линии отвечают с клавиатуры: указателем в них целятся по координате. */
  fireEvent.keyDown(container.querySelector(`[data-feature-id="${featureId}"]`)!, {
    key: 'Enter',
  });
}

it('в вопросе о Янцзы попадание в ущелья тоже верно', () => {
  vi.useFakeTimers();
  try {
    const yangtze = physicalFeatures.find((one) => one.id === 'yangtze')!;
    const { container, onFinish } = renderRound('find-on-map', [yangtze]);

    answerOnLine(container, 'three-gorges');
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS + WRONG_PAUSE_MS);
    });

    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0][0][0].isCorrect).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it('в вопросе об ущельях попадание в другую часть Янцзы — ошибка', () => {
  vi.useFakeTimers();
  try {
    const gorges = physicalFeatures.find((one) => one.id === 'three-gorges')!;
    const { container, onFinish } = renderRound('find-on-map', [gorges]);

    answerOnLine(container, 'yangtze');
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS + WRONG_PAUSE_MS);
    });

    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0][0][0].isCorrect).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

/* Вид рельефа выбирается прямо на карте раунда и уходит в `App`. */
it('рисует рельеф в выбранном виде и даёт его сменить', () => {
  const onReliefStyleChange = vi.fn();
  const { container } = render(
    <PhysicalRound
      features={physicalFeatures}
      exerciseType="find-on-map"
      language="ru"
      roundId="r1"
      seed={11}
      onFinish={() => {}}
      onExit={() => {}}
      reliefStyle="ink"
      onReliefStyleChange={onReliefStyleChange}
    />,
  );

  expect(container.querySelector('[data-relief="ink"] .china-map')).not.toBeNull();
  expect(screen.getByRole('radio', { name: 'Тушью' })).toBeChecked();

  fireEvent.click(screen.getByRole('radio', { name: 'В цвете' }));

  expect(onReliefStyleChange).toHaveBeenCalledWith('color');
});
