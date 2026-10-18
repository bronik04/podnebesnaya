import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { physicalFeatures } from '../../content/physical-features';
import { regions } from '../../content/regions';
import { loadPhysicalMap } from '../../map/load-physical-map';
import { AtlasPage } from './AtlasPage';

/*
 * Физический слой приезжает отдельным куском сборки, и карта берёт его
 * `import()`-ом. Загружается он здесь, один раз на файл: дальше карта
 * получает его прямо при монтировании, и проверки остаются синхронными — как
 * и в браузере, где кусок дотянут заранее.
 */
beforeAll(async () => {
  await loadPhysicalMap();
});

function renderAtlas(selectedRegionId: string | null = null) {
  const onSelect = vi.fn();
  const onTrain = vi.fn();
  const onClear = vi.fn();

  const { container } = render(
    <AtlasPage
      regions={regions}
      selectedRegionId={selectedRegionId}
      onSelect={onSelect}
      onClear={onClear}
      zoom={1}
      onZoomChange={() => {}}
      onTrain={onTrain}
      onOpenCollection={() => {}}
    />,
  );

  return { container, onSelect, onTrain, onClear };
}

/*
 * Полноэкранный вид разворачивает браузер, а jsdom Fullscreen API не знает:
 * свойства ставит тест и он же их убирает. Приём тот же, что в
 * `use-fullscreen.test.tsx` и `RoundStage.test.tsx`.
 */
function withFullscreenApi() {
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
}

/** Браузер отвечает событием: состояние читается из него, а не из вызова. */
function enterFullscreen(element: Element) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: element,
  });
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'));
  });
}

afterEach(() => {
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  Reflect.deleteProperty(document, 'fullscreenElement');
  Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
  Reflect.deleteProperty(document, 'exitFullscreen');
  vi.restoreAllMocks();
});

it('без выбора приглашает выбрать регион, а не отчитывается о пустоте', () => {
  renderAtlas();

  expect(
    screen.getByText(/Выберите регион на карте/),
  ).toBeInTheDocument();
});

/*
 * Пустая половина экрана рядом с картой читается как поломка, а не как
 * приглашение. Числа берутся из справочников — проверка держит и это.
 */
it('до выбора рассказывает, что лежит в каждом виде карты', () => {
  renderAtlas();

  expect(screen.getByText(/Справочник по карте/)).toBeInTheDocument();
  expect(screen.getByText(/34 региона провинциального уровня/)).toBeInTheDocument();
  expect(
    screen.getByText(
      /41 объект: реки, их участки и канал, формы рельефа, озёра, крайние точки и моря/,
    ),
  ).toBeInTheDocument();
});

it('убирает вводку, когда регион выбран', () => {
  renderAtlas('hunan');

  expect(screen.queryByText(/Справочник по карте/)).toBeNull();
});

it('показывает карточку выбранного региона со всеми формами названия', () => {
  renderAtlas('hunan');

  const card = screen.getByTestId('atlas-region-card');

  expect(card).toHaveTextContent('Хунань');
  expect(card).toHaveTextContent('湖南');

  expect(card).toHaveTextContent('Чанша');
  expect(card).toHaveTextContent('长沙');
});

it('называет тип единицы словом, а не только цветом на карте', () => {
  renderAtlas('tibet');

  expect(screen.getByTestId('atlas-region-card')).toHaveTextContent(
    'Автономный район',
  );
});

/*
 * Список регионов из атласа убран: выбирают на карте, а карточка слева
 * рассказывает о выбранном. Тест сторожит именно отсутствие — вернувшийся
 * список снова занял бы половину колонки, ничего не добавив к карте, у
 * которой те же 34 области уже несут `role="button"` и свои имена.
 */
it('не дублирует карту списком регионов', () => {
  renderAtlas();

  expect(
    screen.queryByRole('list', { name: 'Список регионов карты' }),
  ).toBeNull();
  expect(screen.queryByLabelText('Найти регион')).toBeNull();
});

it('область карты доступна с клавиатуры и названа словом', () => {
  const { container } = renderAtlas();
  const area = container.querySelector('[data-region-id="hunan"]')!;

  expect(area).toHaveAttribute('role', 'button');
  expect(area).toHaveAttribute('tabindex', '0');
  expect(area.getAttribute('aria-label')).toMatch(/Хунань/);
});

it('выбор области карты отдаётся наверх тем же обработчиком', () => {
  const { container, onSelect } = renderAtlas();

  fireEvent.click(container.querySelector('[data-region-id="hunan"]')!);

  expect(onSelect).toHaveBeenCalledWith('hunan');
});

it('зовёт в тренировку и не повторяет шапку кнопкой выхода', () => {
  const { onTrain } = renderAtlas();

  fireEvent.click(
    screen.getByRole('button', { name: /Проверить себя на карте/ }),
  );

  expect(onTrain).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /кабинет|главную/i })).toBeNull();
});

it('переключает карту между политической и физической', () => {
  const { container } = renderAtlas();

  expect(container.querySelector('.physical-layer')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: 'Физическая' }));

  expect(container.querySelector('.physical-layer')).toBeInTheDocument();
});

it('показывает шкалу высот под физической картой', () => {
  renderAtlas();

  fireEvent.click(screen.getByRole('radio', { name: 'Физическая' }));

  const scale = screen.getByRole('figure', { name: 'Высота, м над уровнем моря' });

  for (const tick of ['200', '500', '1000', '2000', '3000', '4000']) {
    expect(within(scale).getByText(tick)).toBeInTheDocument();
  }

  expect(within(scale).getByText('равнины')).toBeInTheDocument();
  expect(within(scale).getByText('нагорье')).toBeInTheDocument();
});

/*
 * Вид рельефа — только у физической карты, и выбор уходит наверх: его держит
 * `App`, чтобы раунд открылся в том же виде.
 */
it('на физической карте предлагает рельеф в цвете или тушью', () => {
  const onReliefStyleChange = vi.fn();
  const { container } = render(
    <AtlasPage
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      zoom={1}
      onZoomChange={() => {}}
      onTrain={() => {}}
      onOpenCollection={() => {}}
      reliefStyle="color"
      onReliefStyleChange={onReliefStyleChange}
    />,
  );

  expect(screen.queryByRole('group', { name: 'Рельеф' })).toBeNull();

  fireEvent.click(screen.getByRole('radio', { name: 'Физическая' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Тушью' }));

  expect(onReliefStyleChange).toHaveBeenCalledWith('ink');
  expect(container.querySelector('.atlas-map')).toHaveAttribute(
    'data-relief',
    'color',
  );
});

it('не показывает шкалу на политической карте', () => {
  renderAtlas();

  expect(
    screen.queryByRole('figure', { name: 'Высота, м над уровнем моря' }),
  ).toBeNull();
});

it('в физическом виде выбранная река открывает свою карточку', () => {
  renderAtlas();

  fireEvent.click(screen.getByRole('radio', { name: 'Физическая' }));
  fireEvent.keyDown(screen.getByLabelText(/Хуанхэ/), { key: 'Enter' });

  const card = screen.getByTestId('atlas-region-card');

  expect(card).toHaveTextContent('Хуанхэ');
  expect(card).toHaveTextContent('黄河');
  expect(card).toHaveTextContent('Река');
});

/*
 * Ссылка «В справочник» с итогов раунда по физической карте открывает атлас
 * сразу на карточке объекта, а не на политической карте с приглашением.
 */
it('открывается на объекте физической карты, если его передали', () => {
  render(
    <AtlasPage
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      zoom={1}
      onZoomChange={() => {}}
      onTrain={() => {}}
      onOpenCollection={() => {}}
      initialFeatureId="yellow-river"
    />,
  );

  expect(screen.getByRole('radio', { name: 'Физическая' })).toBeChecked();
  expect(screen.getByTestId('atlas-region-card')).toHaveTextContent('Хуанхэ');
});

it('возврат к политической карте сбрасывает выбранный объект', () => {
  renderAtlas('hunan');

  fireEvent.click(screen.getByRole('radio', { name: 'Физическая' }));
  fireEvent.keyDown(screen.getByLabelText(/Хуанхэ/), { key: 'Enter' });
  fireEvent.click(screen.getByRole('radio', { name: 'Политическая' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Физическая' }));

  // Река осталась бы выбранной, если бы переключение вида её не снимало.
  expect(screen.getByTestId('atlas-region-card')).toHaveTextContent('Хунань');
});

it('карточка региона показывает справку с темами и строкой источников', () => {
  renderAtlas('sichuan');

  const card = screen.getByTestId('atlas-region-card');

  expect(card).toHaveTextContent('Справка');
  expect(card).toHaveTextContent('Убежище большой панды');
  expect(card).toHaveTextContent(/Источники: /);
  expect(card).toHaveTextContent('Britannica');
  expect(card).toHaveTextContent('ЮНЕСКО');
  // В строке — короткие имена; полное имя организации не печатается.
  expect(card).not.toHaveTextContent('Encyclopaedia Britannica');
});

/*
 * Прежде здесь стоял обратный тест: у объектов не было фактов, и проверялось,
 * что блок молча не рендерится. Факты написаны — проверяется то, ради чего
 * блок и делали. Темы берутся из справочника, а не переписываются сюда: тест
 * о том, что справка дошла до карточки, а не о том, что в ней написано.
 */
it('показывает справку физического объекта с источниками', () => {
  const feature = physicalFeatures.find(({ id }) => id === 'yellow-river');
  renderAtlas();

  fireEvent.click(screen.getByRole('radio', { name: 'Физическая' }));
  fireEvent.keyDown(screen.getByLabelText(/Хуанхэ/), { key: 'Enter' });

  const card = screen.getByTestId('atlas-region-card');

  expect(card).toHaveTextContent('Хуанхэ');
  expect(card).toHaveTextContent('Справка');
  expect(card).toHaveTextContent('Источники:');
  for (const fact of feature?.facts ?? []) {
    expect(card).toHaveTextContent(fact.title);
  }
});

/* У каждой цели справка есть: без неё карточка снова замолчала бы. */
it('не оставляет ни одной цели без справки', () => {
  for (const feature of physicalFeatures) {
    expect(
      feature.facts.length,
      `${feature.id}: фактов ${feature.facts.length}`,
    ).toBeGreaterThanOrEqual(2);
  }
});

/*
 * Шкала стояла в колонке, а карта внутри колонки центрирована по пропорции:
 * при карте в 426 px шкала занимала 844 px. На листе вопроса ширины не
 * возникает вовсе, и карта забирает обратно высоту, которую занимала шкала.
 */
it('ставит шкалу высот на лист карты, а не в колонку', () => {
  const { container } = renderAtlas();

  fireEvent.click(screen.getByRole('radio', { name: 'Физическая' }));

  const scale = container.querySelector('.relief-scale');

  expect(scale).not.toBeNull();
  expect(scale?.closest('.china-map-frame')).not.toBeNull();
});

it('на политическом виде шкалы нет', () => {
  const { container } = renderAtlas();

  expect(container.querySelector('.relief-scale')).toBeNull();
});

/*
 * Привязка `regionIds` уже есть у коллекций — карточка читает её с другой
 * стороны: со страницы коллекции виден её регион, из атласа — коллекции
 * региона. Новой сущности не появляется.
 */
it('ведёт из карточки региона в его коллекции', () => {
  const onOpenCollection = vi.fn();

  render(
    <AtlasPage
      regions={regions}
      selectedRegionId="shaanxi"
      onSelect={() => {}}
      onClear={() => {}}
      zoom={1}
      onZoomChange={() => {}}
      onTrain={() => {}}
      onOpenCollection={onOpenCollection}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: /Шёлковый путь/ }));

  expect(onOpenCollection).toHaveBeenCalledWith('silk-road');
});

/* Коллекции привязаны к регионам: у физического объекта блока нет. */
it('не показывает коллекции у физического объекта', () => {
  const { container } = renderAtlas();

  fireEvent.click(screen.getByRole('radio', { name: 'Физическая' }));
  fireEvent.keyDown(screen.getByLabelText(/Хуанхэ/), { key: 'Enter' });

  expect(container.querySelector('.atlas-collections')).toBeNull();
});

/*
 * Переключатель вида стоял полосой над картой и оказывался в пустоте: колонка
 * под карту 1004 px, лист 781, и он стоял в 111 px слева от листа и в 84 px
 * над ним. Управление картой лежит на карте.
 */
it('переключатель вида лежит на самом листе, а не полосой над ним', () => {
  const { container } = renderAtlas();

  const frame = container.querySelector('.china-map-frame');
  const kind = container.querySelector('.atlas-map-kind');

  expect(kind).not.toBeNull();
  expect(frame?.contains(kind as Node)).toBe(true);
});

/* Приём тот же, что в раунде: те же слова и тот же родной полноэкранный API. */
it('разворачивает атлас на весь экран той же кнопкой, что и раунд', () => {
  withFullscreenApi();
  const { container } = renderAtlas();
  const shell = container.querySelector('.atlas-shell');

  expect(shell).toHaveAttribute('data-expanded', 'false');

  fireEvent.click(screen.getByRole('button', { name: 'Во весь экран' }));
  expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalledTimes(1);

  enterFullscreen(shell as Element);

  expect(shell).toHaveAttribute('data-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Свернуть' })).toBeInTheDocument();
});

/* Без Fullscreen API (iPhone) кнопки нет вовсе: обещать нечего. */
it('без Fullscreen API кнопки разворота нет', () => {
  renderAtlas();

  expect(screen.queryByRole('button', { name: 'Во весь экран' })).toBeNull();
});

/*
 * В полноэкранном виде карточка всплывает поверх карты, и закрыть её нужно
 * чем-то видимым. В обычном она стоит своей колонкой и ничего не загораживает.
 */
it('кнопка закрытия карточки есть только в полноэкранном виде', () => {
  withFullscreenApi();
  const { container, onClear } = renderAtlas('hunan');

  expect(screen.queryByRole('button', { name: 'Закрыть карточку' })).toBeNull();

  enterFullscreen(container.querySelector('.atlas-shell') as Element);
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть карточку' }));

  /* Сам выбор держит `App`: карточка исчезнет, когда он его снимет. */
  expect(onClear).toHaveBeenCalled();
});

/*
 * Приглашение «выберите регион» закрывало бы ту самую карту, ради которой вид
 * и разворачивали: признак пустоты снимает панель со всплывшего слоя.
 */
it('пустая карточка помечена: в полноэкранном виде её не показывают', () => {
  const { container } = renderAtlas();

  expect(container.querySelector('.atlas-panel')).toHaveAttribute(
    'data-empty',
    'true',
  );
});
