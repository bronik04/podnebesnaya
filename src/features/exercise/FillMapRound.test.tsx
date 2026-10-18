import { act, fireEvent, render, screen } from '@testing-library/react';
import { regions } from '../../content/regions';
import type { Region } from '../../content/types';
import { FillMapRound, MISS_FLASH_MS, REVEAL_MS } from './FillMapRound';

function renderRound() {
  return render(
    <FillMapRound
      regions={regions}
      language="ru"
      roundId="r1"
      seed={1}
      onFinish={() => {}}
      onExit={() => {}}
    />,
  );
}

/** На первом уровне в заголовке стоит русское название спрошенного региона. */
function askedRegion(): Region {
  const name = screen.getByTestId('fill-target').textContent;

  return regions.find((region) => region.nameRu === name)!;
}

/**
 * Ответ — нажатием на область карты. Доступное имя области собрано в
 * ChinaMap.tsx как `{nameRu}, {nameZh}`.
 */
function regionButton(region: Region): HTMLElement {
  // У закрытого региона к имени приписан исход, поэтому имя ищется по началу.
  return screen.getByRole('button', {
    name: new RegExp(`^${region.nameRu}, ${region.nameZh}`),
  });
}

function answerWith(region: Region) {
  fireEvent.click(regionButton(region));
}

/** Любой ещё открытый регион, кроме спрошенного: закрытый ответа не примет. */
function anyOtherRegion(region: Region): Region {

  return regions.find(
    (candidate) =>
      candidate.id !== region.id &&
      regionButton(candidate).getAttribute('aria-disabled') !== 'true',
  )!;
}

it('после верного ответа сразу спрашивает следующий регион без кнопки «Далее»', () => {
  renderRound();
  const first = askedRegion();

  answerWith(first);

  expect(askedRegion().id).not.toBe(first.id);
  expect(screen.queryByRole('button', { name: 'Далее' })).toBeNull();
});

it('промах уменьшает счётчик попыток и не меняет вопрос', () => {
  renderRound();
  const asked = askedRegion();

  answerWith(anyOtherRegion(asked));

  expect(screen.getByRole('status')).toHaveTextContent('Осталось попыток: 2');
  expect(askedRegion().id).toBe(asked.id);
});

it('промах не закрашивает нажатый регион, а только вспыхивает на нём', () => {
  const { container } = renderRound();
  const asked = askedRegion();
  const other = anyOtherRegion(asked);

  answerWith(other);

  const area = container.querySelector(`[data-region-id="${other.id}"]`);

  expect(area?.getAttribute('data-outcome')).toBeNull();
  expect(area?.getAttribute('data-highlight')).toBe('miss');
});

it('вспышка промаха гаснет сама', () => {
  vi.useFakeTimers();
  try {
    const { container } = renderRound();
    const asked = askedRegion();

    answerWith(anyOtherRegion(asked));
    act(() => {
      vi.advanceTimersByTime(MISS_FLASH_MS);
    });

    expect(container.querySelector('[data-highlight="miss"]')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('на экране нет панели обратной связи', () => {
  const { container } = renderRound();

  expect(container.querySelector('.answer-feedback')).toBeNull();
});

it('показывает счётчик закрашенных регионов', () => {
  renderRound();

  expect(screen.getByTestId('fill-progress')).toHaveTextContent('0 из 34');
});

it('не печатает названия выносок: иначе Макао и Гонконг — готовые ответы', () => {
  const { container } = renderRound();

  const labels = [...container.querySelectorAll('.map-callout text')];

  expect(labels).not.toHaveLength(0);
  expect(container.querySelector('.china-map')).toHaveAttribute(
    'data-map-variant',
    'fill',
  );
  for (const label of labels) {
    expect((label as SVGElement).style.display, label.textContent ?? '').toBe(
      'none',
    );
  }
});

it('показывает ненайденный регион и только потом идёт дальше', () => {
  vi.useFakeTimers();
  try {
    const { container } = renderRound();
    const asked = askedRegion();

    for (let i = 0; i < 3; i += 1) {
      answerWith(anyOtherRegion(asked));
      act(() => {
        vi.advanceTimersByTime(MISS_FLASH_MS);
      });
    }

    expect(
      container
        .querySelector(`[data-region-id="${asked.id}"]`)
        ?.getAttribute('data-highlight'),
    ).toBe('reveal');
    expect(screen.getByRole('status')).toHaveTextContent('Попытки кончились');

    act(() => {
      vi.advanceTimersByTime(REVEAL_MS);
    });

    expect(container.querySelector('[data-highlight="reveal"]')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Найдите регион на карте');
  } finally {
    vi.useRealTimers();
  }
});

it('во время показа не принимает ответ, но карта остаётся', () => {
  vi.useFakeTimers();
  try {
    renderRound();
    const asked = askedRegion();

    for (let i = 0; i < 3; i += 1) {
      answerWith(anyOtherRegion(asked));
      act(() => {
        vi.advanceTimersByTime(MISS_FLASH_MS);
      });
    }

    const progressBefore = screen.getByTestId('fill-progress').textContent;
    const next = askedRegion();
    answerWith(next);

    expect(screen.getByTestId('fill-progress')).toHaveTextContent(progressBefore!);
    expect(screen.getAllByRole('button', { name: /^.+, .+/ }).length).toBeGreaterThan(0);
  } finally {
    vi.useRealTimers();
  }
});

it('первый фокусируемый элемент — область карты', () => {
  const { container } = renderRound();

  const first = container.querySelector(
    'a[href], button:not([disabled]), [tabindex="0"]',
  );

  expect(first).toHaveAttribute('data-region-id');
});

it('карта на экране раунда без заголовка «Интерактивная карта»', () => {
  renderRound();

  expect(
    screen.queryByRole('heading', { name: 'Интерактивная карта' }),
  ).toBeNull();
});
