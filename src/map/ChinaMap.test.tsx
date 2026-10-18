import { fireEvent, render, screen } from '@testing-library/react';
import { regions } from '../content/regions';
import { ChinaMap } from './ChinaMap';
import { loadPhysicalMap } from './load-physical-map';
import { lakeMarks } from './lake-marks';
import { RIVER_SHAPES } from './river-hit';
import {
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_MIN_X,
  MAP_VIEWBOX_MIN_Y,
  MAP_VIEWBOX_WIDTH,
} from './target-size';

/*
 * Физический слой приезжает отдельным куском сборки, и карта берёт его
 * `import()`-ом. Загружается он здесь, один раз на файл: дальше карта
 * получает его прямо при монтировании, и проверки остаются синхронными — как
 * и в браузере, где кусок дотянут заранее.
 */
beforeAll(async () => {
  await loadPhysicalMap();
});

it('selects Sichuan when its map area receives Enter', () => {
  const select = vi.fn();
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={select}
      onClear={() => {}}
    />,
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'Сычуань, 四川省' }), {
    key: 'Enter',
  });

  expect(select).toHaveBeenCalledWith('sichuan');
});

it('selects Sichuan when its map area receives Space', () => {
  const select = vi.fn();
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={select}
      onClear={() => {}}
    />,
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'Сычуань, 四川省' }), {
    key: ' ',
  });

  expect(select).toHaveBeenCalledWith('sichuan');
});

it('announces the selected region in text', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId="sichuan"
      onSelect={() => {}}
      onClear={() => {}}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('Выбрано: Сычуань (四川省)');

});

it('clears the selection with Escape', () => {
  const clear = vi.fn();
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId="sichuan"
      onSelect={() => {}}
      onClear={clear}
    />,
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'Сычуань, 四川省' }), {
    key: 'Escape',
  });

  expect(clear).toHaveBeenCalledOnce();
});

it('карта больше не печатает атрибуцию: её ставит страница', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
    />,
  );

  expect(screen.queryByRole('link', { name: 'CC BY 4.0' })).toBeNull();
});

it('retains region types for future exercise logic', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
    />,
  );

  expect(document.querySelector('#sichuan')).toHaveAttribute(
    'data-region-kind',
    'province',
  );
  expect(document.querySelector('#beijing')).toHaveAttribute(
    'data-region-kind',
    'municipality',
  );
  expect(document.querySelector('#xinjiang')).toHaveAttribute(
    'data-region-kind',
    'autonomous-region',
  );
  expect(document.querySelector('#hong-kong')).toHaveAttribute(
    'data-region-kind',
    'sar',
  );
});

it('отмечает область состоянием ответа', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      answerStates={{ sichuan: 'correct', yunnan: 'incorrect' }}
    />,
  );

  expect(document.querySelector('#sichuan')).toHaveAttribute(
    'data-answer-state',
    'correct',
  );
  expect(document.querySelector('#yunnan')).toHaveAttribute(
    'data-answer-state',
    'incorrect',
  );
  expect(document.querySelector('#hebei')).not.toHaveAttribute('data-answer-state');
});

/*
 * У мелкой области верный ответ рисуется кольцом вокруг её цели нажатия:
 * сам контур Пекина меньше точки, и нефритовая заливка терялась рядом со
 * штриховкой промаха.
 */
it('цель нажатия мелкой области несёт исход своей области', () => {
  const { rerender } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      answerStates={{ beijing: 'correct', xinjiang: 'incorrect' }}
    />,
  );

  const hit = document.querySelector('[data-hit-region-id="beijing"]');
  expect(hit).toHaveAttribute('data-answer-state', 'correct');
  expect(
    document.querySelector('[data-hit-region-id="shanghai"]'),
  ).not.toHaveAttribute('data-answer-state');

  rerender(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
    />,
  );

  expect(hit).not.toHaveAttribute('data-answer-state');
});

it('помечает недоступную область для вспомогательных технологий', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      answerStates={{ tibet: 'disabled' }}
    />,
  );

  expect(document.querySelector('#tibet')).toHaveAttribute('aria-disabled', 'true');
});

it('не даёт выбрать область, у которой уже есть результат ответа', () => {
  const select = vi.fn();
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={select}
      onClear={() => {}}
      answerStates={{ sichuan: 'correct', yunnan: 'incorrect' }}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Сычуань, 四川省' }));
  fireEvent.click(screen.getByRole('button', { name: 'Юньнань, 云南省' }));

  expect(select).not.toHaveBeenCalled();
  expect(document.querySelector('#sichuan')).toHaveAttribute('aria-disabled', 'true');
});

it('не выбирает недоступную область', () => {
  const select = vi.fn();
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={select}
      onClear={() => {}}
      answerStates={{ sichuan: 'disabled' }}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Сычуань, 四川省' }));

  expect(select).not.toHaveBeenCalled();
});

it('в неинтерактивном режиме не выбирает область', () => {
  const select = vi.fn();
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId="sichuan"
      onSelect={select}
      onClear={() => {}}
      interactive={false}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Сычуань, 四川省' }));

  expect(select).not.toHaveBeenCalled();
});

it('в неинтерактивном режиме убирает области из обхода клавиатурой', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId="sichuan"
      onSelect={() => {}}
      onClear={() => {}}
      interactive={false}
    />,
  );

  expect(document.querySelector('#sichuan')).toHaveAttribute('tabindex', '-1');
  expect(
    [...document.querySelectorAll('[data-region-id]')].every(
      (area) => area.getAttribute('tabindex') === '-1',
    ),
  ).toBe(true);
});

it('в неинтерактивном режиме всё равно подсвечивает выбранное', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId="sichuan"
      onSelect={() => {}}
      onClear={() => {}}
      interactive={false}
    />,
  );

  expect(document.querySelector('#sichuan')).toHaveAttribute('data-selected', 'true');
});

it('в неинтерактивном режиме не называет подсвеченный регион', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId="sichuan"
      onSelect={() => {}}
      onClear={() => {}}
      interactive={false}
    />,
  );

  expect(screen.queryByText(/Выбрано: Сычуань/)).toBeNull();
  expect(screen.queryByRole('list', { name: 'Список регионов карты' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Сычуань (四川省)' })).toBeNull();
});

it('в неинтерактивном режиме объясняет, что на карте есть подсветка', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId="sichuan"
      onSelect={() => {}}
      onClear={() => {}}
      interactive={false}
    />,
  );

  expect(screen.getByText('На карте подсвечена одна область.')).toBeInTheDocument();
});

it('в неинтерактивном режиме не зовёт выбирать регион на карте', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId="sichuan"
      onSelect={() => {}}
      onClear={() => {}}
      interactive={false}
    />,
  );

  expect(screen.queryByText('Выберите регион на схеме или в списке.')).toBeNull();
});

it('на экране ответа карта не печатает заголовок и подсказку', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      usage="answer"
    />,
  );

  expect(
    screen.queryByRole('heading', { name: 'Интерактивная карта' }),
  ).toBeNull();
  expect(screen.queryByText('Выберите регион на схеме или в списке.')).toBeNull();
  expect(
    screen.getByRole('region', { name: 'Карта регионов' }),
  ).toBeInTheDocument();
});

it('на экране ответа карта не объявляет выбор: о нём говорит карточка ответа', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      usage="answer"
    />,
  );

  expect(screen.queryByRole('status')).toBeNull();
});

it('на экране ответа список регионов ставит страница, а не карта', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      usage="answer"
    />,
  );

  expect(screen.queryByRole('list', { name: 'Список регионов карты' })).toBeNull();
});

it('в режиме «назвать регион» карта и на экране ответа объясняет подсветку', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId="sichuan"
      onSelect={() => {}}
      onClear={() => {}}
      usage="answer"
      interactive={false}
    />,
  );

  expect(screen.getByText('На карте подсвечена одна область.')).toBeInTheDocument();
});

it('нажатие на увеличенную цель выбирает мелкий регион, а не соседний', () => {
  const select = vi.fn();
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={select}
      onClear={() => {}}
    />,
  );

  // Цель Пекина заходит на территорию Хэбэя: у самого Пекина под палец есть
  // 19 px при требуемых 24 (см. scripts/generate-hit-targets.ts).
  const hit = container.querySelector('[data-hit-region-id="beijing"]')!;
  fireEvent.click(hit);

  expect(select).toHaveBeenCalledWith('beijing');
});

it('справочная карта красит области по типу региона', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
    />,
  );

  const areas = [...container.querySelectorAll('[data-region-id]')];

  expect(areas).not.toHaveLength(0);
  for (const area of areas) {
    expect(
      area.getAttribute('data-region-kind'),
      area.getAttribute('data-region-id') ?? '',
    ).toMatch(/^(province|autonomous-region|municipality|sar)$/);
  }
  expect(container.querySelector('[data-land-tone]')).toBeNull();
});

it('в игровом режиме отмечает только закрытые регионы', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      variant="fill"
      outcomes={{ sichuan: 'first-try', hunan: 'failed' }}
    />,
  );

  expect(
    container.querySelector('[data-region-id="sichuan"]')?.getAttribute('data-outcome'),
  ).toBe('first-try');
  expect(
    container.querySelector('[data-region-id="hunan"]')?.getAttribute('data-outcome'),
  ).toBe('failed');
  expect(
    container.querySelector('[data-region-id="yunnan"]')?.getAttribute('data-outcome'),
  ).toBeNull();
  expect(container.querySelector('.china-map')?.getAttribute('data-map-variant')).toBe(
    'fill',
  );
});

it('отмечает промах и показ разными видами подсветки', () => {
  const { container, rerender } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      variant="fill"
      highlight={{ regionId: 'gansu', kind: 'miss' }}
    />,
  );

  expect(
    container.querySelector('[data-region-id="gansu"]')?.getAttribute('data-highlight'),
  ).toBe('miss');
  expect(
    container.querySelector('[data-region-id="hunan"]')?.getAttribute('data-highlight'),
  ).toBeNull();

  rerender(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      variant="fill"
      highlight={{ regionId: 'hunan', kind: 'reveal' }}
    />,
  );

  expect(
    container.querySelector('[data-region-id="hunan"]')?.getAttribute('data-highlight'),
  ).toBe('reveal');
  expect(
    container.querySelector('[data-region-id="gansu"]')?.getAttribute('data-highlight'),
  ).toBeNull();
});

it('в игровом режиме карта не заводит второй aria-live о выборе', () => {
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      variant="fill"
    />,
  );

  expect(screen.queryByRole('status')).toBeNull();
});

it('не выбирает уже закрашенный регион', () => {
  const select = vi.fn();
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={select}
      onClear={() => {}}
      variant="fill"
      outcomes={{ sichuan: 'first-try' }}
    />,
  );

  fireEvent.click(container.querySelector('[data-region-id="sichuan"]')!);

  expect(select).not.toHaveBeenCalled();
  expect(container.querySelector('[data-region-id="sichuan"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

it('называет исход региона в доступном имени', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      variant="fill"
      outcomes={{ sichuan: 'second-try', hunan: 'failed' }}
    />,
  );

  expect(container.querySelector('[data-region-id="sichuan"]')).toHaveAttribute(
    'aria-label',
    'Сычуань, 四川省 — взят со второй попытки',
  );
  expect(container.querySelector('[data-region-id="hunan"]')).toHaveAttribute(
    'aria-label',
    'Хунань, 湖南省 — не угадан',
  );
});

it('на паузе не отвечает, но область и фокус остаются на месте', () => {
  const select = vi.fn();
  render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={select}
      onClear={() => {}}
      variant="fill"
      paused
    />,
  );

  const area = screen.getByRole('button', { name: 'Сычуань, 四川省' });
  area.focus();
  fireEvent.click(area);

  expect(select).not.toHaveBeenCalled();
  expect(area).toHaveAttribute('aria-disabled', 'true');
  expect(document.activeElement).toBe(area);
});

it('в режиме освоенности размечает области состоянием и называет его словом', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      variant="progress"
      usage="answer"
      interactive={false}
      progressStates={{ hunan: 'mastered', hubei: 'in-progress' }}
    />,
  );

  const hunan = container.querySelector('[data-region-id="hunan"]')!;
  const hubei = container.querySelector('[data-region-id="hubei"]')!;
  const sichuan = container.querySelector('[data-region-id="sichuan"]')!;

  expect(hunan.getAttribute('data-progress-state')).toBe('mastered');
  expect(hunan.getAttribute('aria-label')).toContain('освоен');
  expect(hubei.getAttribute('data-progress-state')).toBe('in-progress');
  expect(sichuan.getAttribute('data-progress-state')).toBe('untouched');
});

it('вид physical показывает ступени рельефа и реки', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      variant="physical"
    />,
  );

  expect(container.querySelector('.physical-layer')).toBeInTheDocument();
  /* Шесть рек, участок одной из них — Три ущелья — и Великий канал. */
  expect(container.querySelectorAll('.river-line')).toHaveLength(8);
});

it('в остальных видах физического слоя нет', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
    />,
  );

  expect(container.querySelector('.physical-layer')).not.toBeInTheDocument();
});

/** Точка на самой длинной части линии реки: берём её из настоящей геометрии. */
function pointOnRiver(featureId: string): readonly [number, number] {
  const parts = RIVER_SHAPES.find((river) => river.featureId === featureId)!.parts;
  const longest = parts.reduce(
    (best, part) => (part.length > best.length ? part : best),
    parts[0],
  );

  return longest[Math.floor(longest.length / 2)];
}

/**
 * Карта в jsdom не имеет размеров, а перевод координат без них невозможен.
 * Рамка задаётся ровно по viewBox: единица карты равна пикселю, и точку из
 * геометрии можно подставить в событие без пересчёта.
 */
function renderPhysical(onSelectFeature: (featureId: string) => void) {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      variant="physical"
      onSelectFeature={onSelectFeature}
    />,
  );

  const map = container.querySelector('.china-map')!;
  const svg = map.querySelector('svg')!;
  svg.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: MAP_VIEWBOX_WIDTH,
      height: MAP_VIEWBOX_HEIGHT,
    }) as DOMRect;

  const at = (point: readonly [number, number], dy = 0) => ({
    clientX: point[0] - MAP_VIEWBOX_MIN_X,
    clientY: point[1] - MAP_VIEWBOX_MIN_Y + dy,
  });

  return { container, map, at };
}

it('в физическом виде нажатие рядом с рекой отвечает рекой', () => {
  const onSelectFeature = vi.fn();
  const { map, at } = renderPhysical(onSelectFeature);

  // Мимо линии на три единицы: в саму её ширину не попали, лента накрывает.
  fireEvent.click(map, at(pointOnRiver('yangtze'), 3));

  expect(onSelectFeature).toHaveBeenCalledWith('yangtze');
});

it('нажатие вдали от всех рек рекой не отвечает', () => {
  const onSelectFeature = vi.fn();
  const { map, at } = renderPhysical(onSelectFeature);

  fireEvent.click(map, at([-10, -10]));

  expect(onSelectFeature).not.toHaveBeenCalled();
});

it('река под курсором помечается, хотя курсор не на самой линии', () => {
  const { container, map, at } = renderPhysical(() => {});

  fireEvent.pointerMove(map, at(pointOnRiver('yellow-river'), 3));

  expect(
    container.querySelector('.river-line[data-feature-id="yellow-river"]'),
  ).toHaveAttribute('data-hovered', 'true');
});

it('в физическом виде нажатие по форме отвечает формой', () => {
  const onSelectFeature = vi.fn();
  const { map, at } = renderPhysical(onSelectFeature);

  // Середина Тибетского нагорья: вдали и от рек, и от знаков озёр.
  fireEvent.click(map, at([219, 360]));

  expect(onSelectFeature).toHaveBeenCalledWith('tibetan-plateau');
});

/*
 * Прежде здесь побеждала форма, и это был дефект: узел нагорья перехватывал
 * нажатие раньше, чем считалось расстояние до реки. Полтора десятка раз это
 * ловилось как «в реку на нагорье невозможно попасть».
 */
it('река побеждает форму и в верховьях, где узел формы перехватывал нажатие', () => {
  const onSelectFeature = vi.fn();
  const { map, at } = renderPhysical(onSelectFeature);
  const [x, y] = RIVER_SHAPES.find((river) => river.featureId === 'yangtze')!
    .parts[0][0];

  fireEvent.click(map, at([x + 1.5, y + 1.5]));

  expect(onSelectFeature).toHaveBeenCalledWith('yangtze');
});

/*
 * Маска прячет ступени за границей, но нажатия не отсекает — этим она и
 * отличается от прежней обрезки. Точка в Индии южнее Гималаев лежит внутри
 * контура Тибетского нагорья, и без проверки суши нагорье выбиралось бы там.
 */
it('за границей страны форма не выбирается', () => {
  const onSelectFeature = vi.fn();
  const { map, at } = renderPhysical(onSelectFeature);

  fireEvent.click(map, at([120, 430]));

  expect(onSelectFeature).not.toHaveBeenCalled();
});

/*
 * Прежде наведение доходило только до линии реки и до подписи: крупная форма
 * под курсором ничем не отличалась от соседней. Точка — середина Тибетского
 * нагорья, вдали и от рек, и от знаков озёр.
 */
it('наведение помечает форму рельефа, а не только подпись', () => {
  const { container, map, at } = renderPhysical(() => {});

  fireEvent.pointerMove(map, at([219, 360]));

  expect(
    container.querySelector('.relief-shape[data-feature-id="tibetan-plateau"]'),
  ).toHaveAttribute('data-hovered', 'true');
});

it('знак озера побеждает форму, на которой стоит', () => {
  const onSelectFeature = vi.fn();
  const { map, at } = renderPhysical(onSelectFeature);
  const qinghai = lakeMarks(1).find((mark) => mark.featureId === 'qinghai-lake')!;

  fireEvent.click(map, at([qinghai.hitX, qinghai.hitY]));

  expect(onSelectFeature).toHaveBeenCalledWith('qinghai-lake');
});

it('река перехватывает нажатие у формы, через которую идёт', () => {
  // Хуанхэ идёт через Лёссовое плато. Промах по реке при вопросе о плато —
  // честный промах, а не дефект: молча пропускать его значило бы подсказывать.
  const onSelectFeature = vi.fn();
  const { map, at } = renderPhysical(onSelectFeature);

  fireEvent.click(map, at(pointOnRiver('yellow-river')));

  expect(onSelectFeature).toHaveBeenCalledWith('yellow-river');
});

/*
 * Витрина идёт с `usage="answer"` — ни заголовка, ни строки выбора ей
 * не нужно, — но вопроса на ней нет, а выдать можно только ответ. Исключение
 * из защиты от утечки ответа проверяется здесь: без этого правило можно было
 * бы упростить обратно, и подписи выносок пропали бы с первого экрана — либо,
 * наоборот, вернулись бы в раунд «Назвать регион», где они и есть ответ.
 */
it('на витрине выноски подписаны: вопроса на ней нет', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      interactive={false}
      usage="answer"
      onOpenRegion={() => {}}
    />,
  );

  const labels = [...container.querySelectorAll('.map-callout text')];

  expect(labels).not.toHaveLength(0);
  for (const label of labels) {
    expect((label as SVGElement).style.display).toBe('');
  }
});

/*
 * Дверь целиком, а не тридцать четыре кнопки: фокус областям витрины не
 * даётся, и объявлять их управлением значило бы обещать читалке экрана путь,
 * которого с клавиатуры нет. В атлас оттуда ведёт соседняя кнопка.
 */
it('на витрине области не объявлены кнопками и не берут фокус', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      interactive={false}
      usage="answer"
      onOpenRegion={() => {}}
    />,
  );

  const area = container.querySelector('[data-region-id="sichuan"]');

  expect(area).toHaveAttribute('tabindex', '-1');
  expect(area).not.toHaveAttribute('role');
  expect(screen.queryByRole('button', { name: 'Сычуань, 四川省' })).toBeNull();
});

/* Нажатие по области витрины уводит на другую поверхность, а не выбирает. */
it('витрина отдаёт нажатие переходом, а не выбором', () => {
  const open = vi.fn();
  const select = vi.fn();
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={select}
      onClear={() => {}}
      interactive={false}
      usage="answer"
      onOpenRegion={open}
    />,
  );

  fireEvent.click(container.querySelector('[data-region-id="hunan"]') as Element);

  expect(open).toHaveBeenCalledWith('hunan');
  expect(select).not.toHaveBeenCalled();
});

/*
 * В раундах, где отвечают точкой или звездой, регионы не выбираются, и
 * выноски Макао и Гонконга скрываются целиком — вместе с кружком и поводком:
 * пустые кружки в море спорили бы с гроздью городов дельты. Скрытый кружок не
 * должен оставаться и остановкой Tab.
 */
it('прячет выноски целиком там, где регионы не цель', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      interactive={false}
      usage="answer"
      showsCallouts={false}
    />,
  );

  const callouts = [...container.querySelectorAll<SVGElement>('.map-callout')];

  expect(callouts).not.toHaveLength(0);
  for (const callout of callouts) {
    expect(callout.style.display).toBe('none');
  }
});

/* На физической карте маркер типа региона ничего не означает. */
it('на физической карте выносок нет', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      variant="physical"
    />,
  );

  for (const callout of [...container.querySelectorAll<SVGElement>('.map-callout')]) {
    expect(callout.style.display).toBe('none');
  }
});

/*
 * Атлас — поверхность справочная: «Макао» и «Гонконг» там содержание, а не
 * ответ, и правило утечки обходится явным признаком. Без этого теста признак
 * можно было бы потерять, и подписи пропали бы из атласа снова.
 */
it('с явным признаком показывает подписи выносок и на поверхности ответа', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      usage="answer"
      showsCalloutLabels
    />,
  );

  const labels = [...container.querySelectorAll<SVGElement>('.map-callout text')];

  expect(labels).not.toHaveLength(0);
  for (const label of labels) {
    expect(label.style.display).toBe('');
  }
});

/* В раунде по регионам маркеры остаются целями, но подписи молчат. */
it('в раунде по регионам оставляет маркеры выносок без подписей', () => {
  const { container } = render(
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      usage="answer"
    />,
  );

  for (const callout of [...container.querySelectorAll<SVGElement>('.map-callout')]) {
    expect(callout.style.display).toBe('');
  }
  for (const label of [...container.querySelectorAll<SVGElement>('.map-callout text')]) {
    expect(label.style.display).toBe('none');
  }
});
