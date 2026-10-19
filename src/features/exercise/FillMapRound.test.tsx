import { act, fireEvent, render, screen } from '@testing-library/react';
import { citiesUpTo } from '../../content/cities';
import { countries, type Country } from '../../content/countries';
import { landmarksUpTo } from '../../content/landmark-sets';
import {
  physicalFeatures,
  physicalFeaturesUpTo,
} from '../../content/physical-features';
import { loadPhysicalMap } from '../../map/load-physical-map';
import { regions } from '../../content/regions';
import type { Region } from '../../content/types';
import { FillMapRound, MISS_FLASH_MS, REVEAL_MS } from './FillMapRound';

function renderRound() {
  return render(
    <FillMapRound
      kind="region"
      targets={regions}
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
  expect(screen.queryByRole('button', { name: /^Дальше/ })).toBeNull();
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

/*
 * Карта на паузе показа остаётся на месте и в дереве доступности: области не
 * пропадают и не теряют фокус, а лишь помечены выключенными.
 */
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
    const areas = screen.getAllByRole('button', { name: /^.+, .+/ });
    expect(areas.length).toBeGreaterThan(0);
    for (const area of areas) {
      expect(area).toHaveAttribute('aria-disabled', 'true');
      expect(area).toHaveAttribute('tabindex', '0');
    }
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

describe('страны', () => {
  function renderCountryRound() {
    return render(
      <FillMapRound
        kind="country"
        targets={countries}
        language="ru"
        roundId="r1"
        seed={1}
        onFinish={() => {}}
        onExit={() => {}}
      />,
    );
  }

  function askedCountry(): Country {
    const name = screen.getByTestId('fill-target').textContent;

    return countries.find((country) => country.nameRu === name)!;
  }

  function countryButton(country: Country): HTMLElement {
    return screen.getByRole('button', {
      name: new RegExp(`^${country.nameRu}, ${country.nameZh}`),
    });
  }

  /* Слой стран подгружается отдельно: ответы ждут, пока он встанет. */
  async function countryLayerReady() {
    await screen.findAllByRole(
      'button',
      { name: new RegExp(`^${countries[0].nameRu}, `) },
      { timeout: 5000 },
    );
  }

  it('лёгкий уровень по странам закрашивает найденную страну', async () => {
    const { container } = renderCountryRound();
    await countryLayerReady();

    expect(screen.getByText('Найдите страну на карте.')).toBeInTheDocument();
    const first = askedCountry();
    fireEvent.click(countryButton(first));

    expect(
      container.querySelector(`[data-country-id="${first.id}"]`),
    ).toHaveAttribute('data-outcome', 'correct');
    expect(screen.getByTestId('fill-progress')).toHaveTextContent(
      `Закрашено 1 из ${countries.length}`,
    );
  });

  it('промах по стране называет её словом «страна»', async () => {
    renderCountryRound();
    await countryLayerReady();

    const asked = askedCountry();
    const other = countries.find((country) => country.id !== asked.id)!;
    fireEvent.click(countryButton(other));

    expect(
      screen.getByText('Не эта страна. Осталось попыток: 2.'),
    ).toBeInTheDocument();
  });

  it('нажатие по закрытой стране не тратит попытку', async () => {
    renderCountryRound();
    await countryLayerReady();

    const first = askedCountry();
    fireEvent.click(countryButton(first));
    fireEvent.click(countryButton(first));

    expect(screen.getByText('Попытка 1 из 3')).toBeInTheDocument();
    expect(screen.getByTestId('fill-progress')).toHaveTextContent('Закрашено 1 из');
    expect(screen.queryByText(/Не эта страна/)).toBeNull();
  });
});

describe('города', () => {
  const capitals = citiesUpTo('capital');
  const capitalIds = capitals.map((city) => city.id);

  function renderCityRound(targets = capitals) {
    return render(
      <FillMapRound
        kind="city"
        targets={targets}
        mapIds={capitalIds}
        language="ru"
        roundId="r1"
        seed={1}
        onFinish={() => {}}
        onExit={() => {}}
      />,
    );
  }

  /* Точек на карте: отдельные города и члены гроздей. */
  function drawnCityIds(container: HTMLElement): string[] {
    const singles = [...container.querySelectorAll('.city[data-city-id]')].map(
      (city) => city.getAttribute('data-city-id')!,
    );
    const clustered = [...container.querySelectorAll('.cluster-count')].reduce(
      (sum, count) => sum + Number(count.textContent),
      0,
    );

    return [...singles, ...Array.from({ length: clustered }, () => 'cluster')];
  }

  it('на лёгком уровне на карте только города набора', () => {
    const { container } = renderCityRound();

    const drawn = drawnCityIds(container);
    expect(drawn).toHaveLength(capitals.length);
    expect(
      drawn.filter((id) => id !== 'cluster').every((id) => capitalIds.includes(id)),
    ).toBe(true);
    expect(container.querySelector('.city[data-city-id="suzhou"]')).toBeNull();
    expect(screen.getByText('Найдите город на карте.')).toBeInTheDocument();
  });

  it('повтор одной ошибки рисует весь набор раунда', () => {
    const { container } = renderCityRound(capitals.slice(0, 1));

    expect(screen.getByTestId('fill-progress')).toHaveTextContent('Закрашено 0 из 1');
    expect(drawnCityIds(container)).toHaveLength(capitals.length);
  });
});

describe('закрытые цели у точек', () => {
  it('нажатие по закрытому городу не тратит попытку', () => {
    const capitals = citiesUpTo('capital');
    // Два города далеко от прочих: оба стоят отдельно, не в грозди.
    const far = capitals.filter((city) => ['urumqi', 'lhasa'].includes(city.id));
    render(
      <FillMapRound
        kind="city"
        targets={far}
        mapIds={capitals.map((city) => city.id)}
        language="ru"
        roundId="r1"
        seed={1}
        onFinish={() => {}}
        onExit={() => {}}
      />,
    );

    const name = screen.getByTestId('fill-target').textContent!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}, `) }));
    const closed = screen.getByRole('button', { name: new RegExp(`^${name}, .* — верно$`) });
    expect(closed).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(closed);

    expect(screen.getByText('Попытка 1 из 3')).toBeInTheDocument();
    expect(screen.queryByText(/Не этот город/)).toBeNull();
  });
});

describe('физическая карта', () => {
  /* Физический слой приезжает отдельным куском — как в `PhysicalRound.test`. */
  beforeAll(async () => {
    await loadPhysicalMap();
  });

  function renderPhysicalRound(targets = physicalFeaturesUpTo('base')) {
    const onFinish = vi.fn();
    const view = render(
      <FillMapRound
        kind="physical"
        targets={targets}
        language="ru"
        roundId="r1"
        seed={1}
        onFinish={onFinish}
        onExit={() => {}}
      />,
    );

    return { ...view, onFinish };
  }

  /* Линии и формы отвечают с клавиатуры: указателем в них целятся по координате. */
  function answerOn(container: HTMLElement, featureId: string) {
    fireEvent.keyDown(container.querySelector(`[role="button"][data-feature-id="${featureId}"]`)!, {
      key: 'Enter',
    });
  }

  function askedFeatureId(): string {
    const name = screen.getByTestId('fill-target').textContent;

    return physicalFeatures.find((feature) => feature.nameRu === name)!.id;
  }

  it('лёгкий уровень по физической карте помечает найденный объект', () => {
    const { container } = renderPhysicalRound();

    expect(screen.getByText('Найдите объект на карте.')).toBeInTheDocument();
    const asked = askedFeatureId();
    answerOn(container, asked);

    expect(
      container.querySelector(`[data-outcome][data-feature-id="${asked}"]`),
    ).toHaveAttribute('data-outcome', 'correct');
    expect(screen.getByTestId('fill-progress')).toHaveTextContent('Закрашено 1 из');
  });

  it('«Три ущелья» на вопрос о Янцзы засчитываются', () => {
    const yangtze = physicalFeatures.find((one) => one.id === 'yangtze')!;
    const { container, onFinish } = renderPhysicalRound([yangtze]);

    answerOn(container, 'three-gorges');

    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0][0].outcomes).toEqual({ yangtze: 'first-try' });
  });

  it('найденная Янцзы не красит ещё не спрошенные «Три ущелья»', () => {
    const pair = physicalFeatures.filter((one) =>
      ['yangtze', 'three-gorges'].includes(one.id),
    );
    const { container } = renderPhysicalRound(pair);

    const first = askedFeatureId();
    answerOn(container, first);
    const other = first === 'yangtze' ? 'three-gorges' : 'yangtze';

    expect(
      container.querySelector(`.river-line[data-feature-id="${other}"]`),
    ).not.toHaveAttribute('data-outcome');
  });

  it('на лёгком уровне нарисованы все объекты, а не набор', () => {
    const { container } = renderPhysicalRound();

    expect(container.querySelectorAll('.relief-shape')).toHaveLength(38);
    expect(container.querySelectorAll('.river-line')).toHaveLength(8);
  });
});

describe('достопримечательности', () => {
  function renderLandmarkRound(
    targets: ReturnType<typeof landmarksUpTo>,
    mapIds: readonly string[],
    seed = 1,
  ) {
    const onFinish = vi.fn();
    const view = render(
      <FillMapRound
        kind="landmark"
        targets={targets}
        mapIds={mapIds}
        language="ru"
        roundId="r1"
        seed={seed}
        onFinish={onFinish}
        onExit={() => {}}
      />,
    );

    return { ...view, onFinish };
  }

  it('на лёгком уровне на карте только звёзды набора', () => {
    const nature = landmarksUpTo('nature');
    const natureIds = nature.map((one) => one.id);
    const { container } = renderLandmarkRound(nature, natureIds);

    const singles = [...container.querySelectorAll('.landmark[data-landmark-id]')].map(
      (one) => one.getAttribute('data-landmark-id')!,
    );
    const clustered = [...container.querySelectorAll('.cluster-count')].reduce(
      (sum, count) => sum + Number(count.textContent),
      0,
    );
    expect(singles.every((id) => natureIds.includes(id))).toBe(true);
    expect(singles.length + clustered).toBe(nature.length);
    expect(screen.getByText('Найдите место на карте.')).toBeInTheDocument();
  });

  /* В повторе члены грозди вне пула не закроются никогда — исход всё равно виден. */
  it('гроздь в повторе получает исход, когда закрыт весь пул в ней', () => {
    const all = landmarksUpTo('all');
    const forbiddenCity = all.find((one) => one.id === 'forbidden-city')!;
    const { container } = renderLandmarkRound(
      [forbiddenCity, all.find((one) => one.id === 'potala')!],
      all.map((one) => one.id),
    );
    const cluster = () =>
      [...container.querySelectorAll('.map-cluster')].find((one) =>
        one.querySelector('[aria-label*="Запретный город"]'),
      )!;

    if (screen.getByTestId('fill-target').textContent !== 'Запретный город') {
      fireEvent.click(screen.getByRole('button', { name: /^Дворец Потала, / }));
    }
    fireEvent.click(cluster().querySelector('[role="button"]')!);

    expect(cluster()).toHaveAttribute('data-outcome', 'correct');
  });

  /* Закрытый член грозди ответа не примет — промах пишется открытым. */
  it('промах по грозди с закрытым первым членом тратит попытку', () => {
    const all = landmarksUpTo('all');
    const { container } = renderLandmarkRound(
      all.filter((one) => ['forbidden-city', 'temple-of-heaven', 'potala'].includes(one.id)),
      all.map((one) => one.id),
      // При этом сиде Потала спрашивают последней: пекинские звёзды к тому
      // времени закрыты.
      2,
    );
    const cluster = () =>
      [...container.querySelectorAll('.map-cluster')].find((one) =>
        one.querySelector('[aria-label*="Запретный город"]'),
      )!.querySelector('[role="button"]')!;

    // Сначала закрыть звёзды пекинской грозди, пока не спросят Потала.
    while (screen.getByTestId('fill-target').textContent !== 'Дворец Потала') {
      fireEvent.click(cluster());
    }
    // Сценарий тот, что нужен: обе пекинские звезды уже закрыты.
    expect(screen.getByTestId('fill-progress')).toHaveTextContent('Закрашено 2 из 3');
    fireEvent.click(cluster());

    expect(screen.getByText('Не это место. Осталось попыток: 2.')).toBeInTheDocument();
  });

  it('нажатие по грозди со спрошенным засчитывается', () => {
    const all = landmarksUpTo('all');
    const forbiddenCity = all.find((one) => one.id === 'forbidden-city')!;
    const { onFinish } = renderLandmarkRound(
      [forbiddenCity],
      all.map((one) => one.id),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /^Достопримечательности рядом: .*Запретный город/,
      }),
    );

    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0][0].outcomes).toEqual({
      'forbidden-city': 'first-try',
    });
  });
});
