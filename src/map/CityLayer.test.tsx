import { fireEvent, render, screen } from '@testing-library/react';
import { regions } from '../content/regions';
import { ChinaMap } from './ChinaMap';
import { cityPointsOfRegions } from './city-points';
import type { MapZoom } from './MapControls';
import { MAP_VIEWBOX_WIDTH } from './target-size';

const sichuan = regions.filter((region) => region.id === 'sichuan');

function mapElement(props: Partial<Parameters<typeof ChinaMap>[0]> = {}) {
  return (
    <ChinaMap
      regions={regions}
      selectedRegionId={null}
      onSelect={() => {}}
      onClear={() => {}}
      showsCities
      {...props}
    />
  );
}

function renderMap(props: Partial<Parameters<typeof ChinaMap>[0]> = {}) {
  return render(mapElement(props));
}

it('рисует города внутри самой карты, а не поверх неё вторым рисунком', () => {
  const { container } = renderMap();

  const layer = container.querySelector('.china-map svg .city-layer');

  expect(layer).not.toBeNull();
  expect(container.querySelectorAll('.china-map svg')).toHaveLength(1);
});

it('не показывает города, пока их не попросили', () => {
  const { container } = renderMap({ showsCities: false });

  expect(container.querySelector('.city-layer')).toBeNull();
});

it('ставит знак каждого города региона', () => {
  const { container } = renderMap({ regions: sichuan });

  expect(container.querySelectorAll('.city-mark')).toHaveLength(
    cityPointsOfRegions(['sichuan']).length,
  );
});

/*
 * Слой только показывает — 57 остановок Tab в атласе, где город ничего не
 * делает, стоили бы дороже, чем дают. Названия городов региона при этом
 * остаются доступны: их перечисляет его карточка.
 */
it('без обработчика не пускает города в обход клавиатурой', () => {
  const { container } = renderMap({ regions: sichuan });

  for (const hit of container.querySelectorAll('.city-hit')) {
    expect(hit.getAttribute('tabindex')).toBe('-1');
    expect(hit.getAttribute('aria-hidden')).toBe('true');
  }
});

/*
 * В слое-витрине зона наведения — чуть больше знака, а не 24 px: невидимый
 * круг верхнего города накрывал знаки соседей в дельте Чжуцзяна, и наведение
 * на точку подписывало другой город.
 */
it('в слое без нажатия зона наведения не больше знака с полем', () => {
  const { container } = renderMap();

  for (const hit of container.querySelectorAll('.city-hit')) {
    expect(Number(hit.getAttribute('r'))).toBeLessThanOrEqual(4.4 + 1.6);
  }
});

it('с обработчиком отвечает на нажатие и называет город', () => {
  const select = vi.fn();
  renderMap({ regions: sichuan, onSelectCity: select });

  fireEvent.click(screen.getByRole('button', { name: 'Чэнду, 成都' }));

  expect(select).toHaveBeenCalledWith('chengdu');
});

it('отмечает выбранный город признаком, а не только цветом', () => {
  const { container } = renderMap({ regions: sichuan, selectedCityId: 'chengdu' });

  expect(
    container.querySelector('.city[data-city-id="chengdu"]')?.getAttribute('data-selected'),
  ).toBe('true');
});

/*
 * Знак виден на той карте, где его разглядывают. В атласе карта шириной
 * 542 px при 806 единицах viewBox — 0.67 px на единицу, и знак радиусом 2.5
 * давал точку в 3.4 px.
 *
 * Цель нажатия от этого не меняется: она считается от `TARGET_DIAMETER_UNITS`
 * и к размеру знака не привязана.
 */
it('рисует знак города заметным на уменьшенной карте', () => {
  const { container } = renderMap();

  const mark = container.querySelector('.city-mark');

  expect(Number(mark?.getAttribute('r'))).toBeGreaterThanOrEqual(3.2);
});

/*
 * Подпись рисуется последним узлом слоя, поверх всех знаков: SVG кладёт
 * краску в порядке разметки, и подпись Лояна утопала под точками соседей,
 * нарисованных позже.
 */
it('показывает подпись города под фокусом поверх всех знаков', () => {
  const select = vi.fn();
  const { container } = renderMap({ regions: sichuan, onSelectCity: select });

  const hit = container.querySelector('.city-hit[data-city-id="chengdu"]');
  fireEvent.focus(hit as Element);

  const layer = container.querySelector('.city-layer') as Element;
  const label = layer.lastElementChild;

  expect(label?.classList.contains('city-label')).toBe(true);
  expect(label?.textContent).toBe('Чэнду');
});

/*
 * Дельта Янцзы — самая тесная часть каталога: между Сучжоу и Уси меньше шести
 * единиц карты при цели в семнадцать. Прежде цели разъезжались по кольцам и
 * связывались поводками; теперь города собираются в гроздь.
 */
it('собирает тесные города в гроздь вместо поводков', () => {
  const { container } = renderMap({ onSelectCity: () => {}, onZoomChange: () => {} });

  expect(container.querySelector('.city-leader')).toBeNull();
  expect(container.querySelectorAll('.map-cluster').length).toBeGreaterThan(0);
});

/*
 * Слой, который только показывает, — атлас — гроздей не собирает: раскрыть их
 * там нечем, и дюжина городов дельты Янцзы и Жемчужной просто исчезла бы за
 * числом. Гроздь существует, чтобы разводить цели; там, где целей нет,
 * разводить нечего.
 */
it('в слое без нажатия показывает каждый город на своём месте', () => {
  const { container } = renderMap();

  expect(container.querySelector('.map-cluster')).toBeNull();
  expect(container.querySelectorAll('.city-mark')).toHaveLength(
    cityPointsOfRegions(regions.map((region) => region.id)).length,
  );
});

/** Сколько единиц карты видно по ширине: во столько раз она и приближена. */
function viewBoxWidth(container: HTMLElement): number {
  const viewBox =
    container.querySelector('.china-map svg')?.getAttribute('viewBox') ?? '';

  return Number(viewBox.split(' ')[2]);
}

/*
 * Нажатие по грозди по-настоящему приближает карту — до ступени, на которой
 * её города расходятся в отдельные цели (решение владельца от 2026-08-30
 * вместо лупы-врезки).
 */
it('нажатие по грозди приближает карту, и города расходятся', () => {
  const select = vi.fn();
  const { container } = renderMap({
    onSelectCity: select,
    zoom: 1,
    onZoomChange: () => {},
  });

  fireEvent.click(
    screen.getByRole('button', { name: /Города рядом: Ханчжоу.*приблизить/ }),
  );

  expect(viewBoxWidth(container)).toBeCloseTo(MAP_VIEWBOX_WIDTH / 3, 3);

  fireEvent.click(screen.getByRole('button', { name: 'Шанхай, 上海' }));

  expect(select).toHaveBeenCalledWith('shanghai');
});

/*
 * Приближение к грозди — заход на один вопрос, а не смена вида: собственная
 * ступень ученика приходит свойством, и трогать её карта не смеет. Иначе
 * возвращать было бы некуда.
 */
it('не меняет собственную ступень ученика', () => {
  const zoomChange = vi.fn();
  renderMap({ onSelectCity: () => {}, zoom: 1, onZoomChange: zoomChange });

  fireEvent.click(
    screen.getByRole('button', { name: /Города рядом: Ханчжоу.*приблизить/ }),
  );

  expect(zoomChange).not.toHaveBeenCalled();
});

/*
 * Со сменой вопроса карта возвращается на ту ступень, на которой была: иначе
 * вопрос об Урумчи начинался бы с пятикратно увеличенной дельты Чжуцзяна.
 */
it('со сменой вопроса возвращается к виду ученика', () => {
  const props = { onSelectCity: () => {}, zoom: 1 as MapZoom, onZoomChange: () => {} };
  const { container, rerender } = renderMap({ ...props, questionKey: 'q1' });

  fireEvent.click(
    screen.getByRole('button', { name: /Города рядом: Ханчжоу.*приблизить/ }),
  );
  expect(viewBoxWidth(container)).toBeCloseTo(MAP_VIEWBOX_WIDTH / 3, 3);

  rerender(mapElement({ ...props, questionKey: 'q2' }));

  expect(viewBoxWidth(container)).toBeCloseTo(MAP_VIEWBOX_WIDTH, 3);
});

/*
 * В «назвать город» слой не отвечает на нажатие, и приблизить гроздь руками
 * нельзя. Карта приближается к спрошенному городу сама — иначе вопроса на
 * карте просто нет.
 */
it('сама приближает карту к грозди со спрошенным городом', () => {
  const { container } = renderMap({
    selectedCityId: 'suzhou',
    zoom: 1,
    onZoomChange: () => {},
  });

  expect(viewBoxWidth(container)).toBeCloseTo(MAP_VIEWBOX_WIDTH / 3, 3);
});

/*
 * Там же, где подсветка означает уже данный ответ, карта не дёргается: ученик
 * смотрит туда, куда нажал, и приближать его к собственному ответу незачем.
 */
it('не приближает карту к городу, которым ответили', () => {
  const { container } = renderMap({
    selectedCityId: 'suzhou',
    onSelectCity: () => {},
    zoom: 1,
    onZoomChange: () => {},
  });

  expect(viewBoxWidth(container)).toBeCloseTo(MAP_VIEWBOX_WIDTH, 3);
});

/* Там, где приближать нечем, спрошенный город виден на самой грозди. */
it('помечает гроздь со спрошенным городом', () => {
  const { container } = renderMap({ selectedCityId: 'suzhou' });

  expect(
    container.querySelector('.map-cluster[data-selected="true"]'),
  ).not.toBeNull();
});

it('рисует только города из `cityIds`', () => {
  const { container } = renderMap({ cityIds: ['wuhan'] });

  expect(
    [...container.querySelectorAll('.city')].map((city) =>
      city.getAttribute('data-city-id'),
    ),
  ).toEqual(['wuhan']);
});

it('ставит городу исход и называет его', () => {
  const { container } = renderMap({
    cityIds: ['wuhan'],
    onSelectCity: () => {},
    cityOutcomes: { wuhan: 'second-try' },
  });

  expect(container.querySelector('.city[data-city-id="wuhan"]')).toHaveAttribute(
    'data-outcome',
    'second-try',
  );
  expect(
    screen.getByRole('button', { name: /^Ухань, 武汉 — верно со второй попытки$/ }),
  ).toBeInTheDocument();
});

/* У Пекина-региона и Пекина-города один идентификатор: исходы не смешиваются. */
it('исход города не красит область с тем же идентификатором', () => {
  const { container } = renderMap({ cityOutcomes: { beijing: 'correct' } });

  expect(
    container.querySelector('[data-region-id="beijing"]')?.getAttribute('data-outcome'),
  ).toBeNull();
  expect(container.querySelector('.city[data-city-id="beijing"]')).toHaveAttribute(
    'data-outcome',
    'correct',
  );
});
