/**
 * Строит `src/map/country-geometry.ts` из выжимки Natural Earth.
 *
 * Что делает по порядку: переводит градусы в координаты карты той же
 * проекцией, что и города с реками, обрезает по рамке карты, выбрасывает
 * обрезки, упрощает и записывает путями в том же виде, в каком записана сама
 * карта. Для каждой страны считает середину наибольшей вписанной окружности —
 * это и точка подписи, и честная мера того, во что можно попасть указателем.
 *
 * Обрезка по рамке — не украшение. Кадр карты кончается почти по границе
 * Китая, и без обрезки в файл уехали бы Кольский полуостров и юг Индии: они
 * этой карте не принадлежат и были бы в ней мусором.
 *
 * Запуск: npm run generate:countries
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { countries } from '../src/content/countries';
import {
  COUNTRY_GEOMETRY_TUNING,
  DISPUTED_NAMES_RU,
  countryInputsFingerprint,
} from './countries-fingerprint';
import {
  clipRingToFrame,
  ringArea,
  simplifyRing,
  toPathData,
  type Frame,
} from '../src/map/polyline';
import { projectLonLat } from '../src/map/projection';
import { largestInscribedCircle, type Point } from '../src/map/svg-path';
import {
  COUNTRY_FRAME_OUTSET,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_MIN_X,
  MAP_VIEWBOX_MIN_Y,
  MAP_VIEWBOX_WIDTH,
  MIN_TARGET_PX,
  REFERENCE_MAP_WIDTH,
  unitsToPixels,
} from '../src/map/target-size';

const OUTPUT_FILE = 'src/map/country-geometry.ts';

/*
 * Выжимка читается файлом, а не импортом JSON: импорт модулей JSON требует
 * согласия сборщика, загрузчика и линтера, и все три пришлось бы уговаривать
 * ради одного места. Тот же довод, что у физической геометрии.
 */
const sourceJson = readFileSync(
  new URL('data/countries-source.json', import.meta.url),
  'utf8',
);

type SourceRings = readonly (readonly (readonly number[])[])[];
type SourceCountry = { readonly id: string; readonly rings: SourceRings };
type SourceDisputed = SourceCountry & {
  readonly nameRu: string;
  readonly note: string;
};

const source = JSON.parse(sourceJson) as {
  readonly countries: readonly SourceCountry[];
  readonly context: readonly SourceCountry[];
  readonly disputed: readonly SourceDisputed[];
};

/*
 * Обрезка идёт по расширенному кадру: в играх по странам карта отъезжает, и
 * по обычному кадру у стран появились бы рубленые края прямо посреди
 * видимого. Множитель общий с экраном — он живёт в `target-size.ts`.
 */
const OUTSET_X = (MAP_VIEWBOX_WIDTH * (COUNTRY_FRAME_OUTSET - 1)) / 2;
const OUTSET_Y = (MAP_VIEWBOX_HEIGHT * (COUNTRY_FRAME_OUTSET - 1)) / 2;

const FRAME: Frame = {
  minX: MAP_VIEWBOX_MIN_X - OUTSET_X,
  minY: MAP_VIEWBOX_MIN_Y - OUTSET_Y,
  maxX: MAP_VIEWBOX_MIN_X + MAP_VIEWBOX_WIDTH + OUTSET_X,
  maxY: MAP_VIEWBOX_MIN_Y + MAP_VIEWBOX_HEIGHT + OUTSET_Y,
};

/*
 * Допуски и точность записи живут рядом с отпечатком: от них зависит, что
 * окажется в файле, поэтому в отпечаток они входят наравне с выжимкой.
 */
const { simplifyTolerance, minRingArea, pathPrecision } = COUNTRY_GEOMETRY_TUNING;

function toMapRings(rings: SourceRings): Point[][] {
  return rings
    .map((ring) =>
      clipRingToFrame(
        ring.map(([lon, lat]) => projectLonLat(lon, lat) as unknown as Point),
        FRAME,
      ),
    )
    .filter((ring) => ring.length >= 3 && Math.abs(ringArea(ring)) >= minRingArea)
    .map((ring) => simplifyRing(ring, simplifyTolerance))
    .filter((ring) => ring.length >= 3);
}

const shapes = source.countries.map((country) => {
  const rings = toMapRings(country.rings);
  if (rings.length === 0) {
    throw new Error(`После обрезки от страны ${country.id} ничего не осталось`);
  }

  const circle = largestInscribedCircle(rings);

  return {
    id: country.id,
    d: toPathData(rings, { closed: true, precision: pathPrecision }),
    /* Точки подписи нет: подписей на карте нет ни в одной игре по странам. */
    diameter: Number((circle.radius * 2).toFixed(1)),
  };
});

const missing = countries
  .map((country) => country.id)
  .filter((id) => !shapes.some((shape) => shape.id === id));
if (missing.length > 0) {
  throw new Error(`Нет геометрии у стран: ${missing.join(', ')}`);
}

/*
 * Фоновые страны — тот же контур без меры попадания: целью они не бывают, и
 * мерить, во что в них можно попасть, незачем.
 */
const contextShapes = source.context.map((country) => {
  const rings = toMapRings(country.rings);
  if (rings.length === 0) {
    throw new Error(`После обрезки от фоновой страны ${country.id} ничего не осталось`);
  }

  return {
    id: country.id,
    d: toPathData(rings, { closed: true, precision: pathPrecision }),
  };
});

const disputed = source.disputed
  .map((area) => ({
    id: area.id,
    nameRu: DISPUTED_NAMES_RU[area.id] ?? area.nameRu,
    note: area.note,
    rings: toMapRings(area.rings),
  }))
  /* Участок целиком за кадром — законное состояние: рисовать нечего. */
  .filter((area) => area.rings.length > 0)
  .map((area) => ({
    id: area.id,
    nameRu: area.nameRu,
    note: area.note,
    d: toPathData(area.rings, { closed: true, precision: pathPrecision }),
  }));

const fingerprint = countryInputsFingerprint(sourceJson);

/*
 * Строка в исходник идёт через одну воронку: имена и пояснения приходят из
 * набора, и апостроф в них написал бы сломанный модуль. Обратная косая тоже —
 * без неё экранирование подделало бы само себя.
 */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

const countryLines = shapes
  .map(
    (shape) =>
      `  {\n    id: ${quote(shape.id)},\n    diameter: ${shape.diameter},\n` +
      `    d: ${quote(shape.d)},\n  },`,
  )
  .join('\n');

const contextLines = contextShapes
  .map((shape) => `  {\n    id: ${quote(shape.id)},\n    d: ${quote(shape.d)},\n  },`)
  .join('\n');

const disputedLines = disputed
  .map(
    (area) =>
      `  {\n    id: ${quote(area.id)},\n    nameRu: ${quote(area.nameRu)},\n` +
      `    note: ${quote(area.note)},\n    d: ${quote(area.d)},\n  },`,
  )
  .join('\n');

writeFileSync(
  OUTPUT_FILE,
  `/**
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не править руками.
 * Источник: scripts/data/countries-source.json
 * Генератор: scripts/generate-country-geometry.ts
 */

/**
 * Отпечаток выжимки, из которой геометрия собрана. Сверяется в \`validate:map\`:
 * заменить выжимку и не перегенерировать значит оставить на карте прежние
 * очертания при зелёной сборке.
 */
export const COUNTRIES_INPUTS_FINGERPRINT = '${fingerprint}';

export type CountryShape = {
  readonly id: string;
  /**
   * Диаметр наибольшей вписанной окружности — мера того, во что можно попасть
   * указателем. Её печатает \`validate:map\`.
   */
  readonly diameter: number;
  readonly d: string;
};

/**
 * Фоновая страна: на карте есть, целью не бывает. Сухопутной границы с Китаем
 * у неё нет, но без неё карта искажала бы соседа — без Южной Кореи КНДР
 * выглядела всем полуостровом.
 */
export type ContextShape = {
  readonly id: string;
  readonly d: string;
};

export type DisputedShape = {
  readonly id: string;
  readonly nameRu: string;
  /** Слова источника: кто участком управляет и кто его заявляет. */
  readonly note: string;
  readonly d: string;
};

export const COUNTRY_SHAPES: readonly CountryShape[] = [
${countryLines}
];

export const CONTEXT_SHAPES: readonly ContextShape[] = [
${contextLines}
];

export const DISPUTED_SHAPES: readonly DisputedShape[] = [
${disputedLines}
];
`,
  'utf8',
);

/* Счёт по тому же кадру, на котором эти игры показывают карту. */
const small = shapes.filter(
  (shape) =>
    unitsToPixels(shape.diameter, REFERENCE_MAP_WIDTH, COUNTRY_FRAME_OUTSET) <
    MIN_TARGET_PX,
);

console.info(
  `Страны: ${shapes.length}, фоновых ${contextShapes.length}, ` +
    `спорных участков ${disputed.length}. ` +
    `Мельче ${MIN_TARGET_PX} px при ширине ${REFERENCE_MAP_WIDTH}: ` +
    `${small.length}${small.length > 0 ? ` (${small.map((shape) => shape.id).join(', ')})` : ''}`,
);
