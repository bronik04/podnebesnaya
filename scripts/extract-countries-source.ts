/**
 * Выжимка из Natural Earth для слоя сопредельных государств.
 *
 * Полные наборы весят мегабайты и в репозиторий не кладутся, а без них
 * генератор геометрии невоспроизводим. Скрипт берёт только четырнадцать стран
 * сухопутной границы и относящиеся к ней спорные участки, обрезает координаты
 * до пяти знаков и пишет выжимку, которую и коммитят.
 *
 * Нужна сеть. В сборку не входит: во время сборки и во время раунда проект
 * сетевых запросов не делает.
 *
 * Запуск: npm run extract:countries
 */
import { writeFileSync } from 'node:fs';
import { countries } from '../src/content/countries';

/*
 * Версия закреплена тегом, а не веткой `master`: `docs/sources` называет
 * Natural Earth 5.1.2, и выжимка обязана приходить из того же издания. С
 * подвижной ветки повторный запуск однажды принёс бы другие контуры, а
 * отпечаток сказал бы только то, что файлы согласованы между собой.
 *
 * Уже лежащие выжимки взяты с `master` до этого закрепления; повторное
 * извлечение под тегом может дать небольшие расхождения — это отдельная
 * работа, а не побочный итог правки адреса.
 */
const NATURAL_EARTH_VERSION = 'v5.1.2';
const BASE =
  `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_VERSION}/geojson`;
const OUT = new URL('data/countries-source.json', import.meta.url);
const PRECISION = 5;

type Position = readonly number[];
type Geometry = { readonly type: string; readonly coordinates: unknown };
type Feature = {
  readonly properties: Record<string, unknown>;
  readonly geometry: Geometry | null;
};

/**
 * Имя страны в наборе → наш идентификатор. Отбор по `ADMIN`, а не по имени на
 * каком-либо языке: `ADMIN` — ключ набора, а имена в нём переводные и меняются
 * от версии к версии.
 */
const ADMIN_TO_ID: Readonly<Record<string, string>> = {
  Russia: 'russia',
  Mongolia: 'mongolia',
  'North Korea': 'north-korea',
  Kazakhstan: 'kazakhstan',
  Kyrgyzstan: 'kyrgyzstan',
  Tajikistan: 'tajikistan',
  Afghanistan: 'afghanistan',
  Pakistan: 'pakistan',
  India: 'india',
  Nepal: 'nepal',
  Bhutan: 'bhutan',
  Myanmar: 'myanmar',
  Laos: 'laos',
  Vietnam: 'vietnam',
};

/**
 * Фоновые страны: на карте есть, но целью не бывают. Сухопутной границы с
 * Китаем у них нет, а без них карта врёт — без Южной Кореи КНДР выглядела всем
 * полуостровом (решение владельца от 2026-10-18). Прочие страны без границы
 * владелец брать не стал.
 */
const CONTEXT_ADMIN_TO_ID: Readonly<Record<string, string>> = {
  'South Korea': 'south-korea',
};

/**
 * Спорные участки перечислены поимённо, а не отобраны по упоминанию Китая:
 * тем же признаком набор помечает Парасельские острова, Спратли и Сенкаку, а
 * игра о сухопутной границе.
 */
const DISPUTED_TO_ID: Readonly<Record<string, string>> = {
  'Aksai Chin': 'aksai-chin',
  'Arunachal Pradesh': 'arunachal-pradesh',
  'Shaksam Valley': 'shaksam-valley',
  Demchok: 'demchok',
  'Samdu Valleys': 'samdu-valleys',
  'Tirpani Valleys': 'tirpani-valleys',
  'Bara Hotii Valleys': 'bara-hotii-valleys',
  'Bhutan (northwest valleys)': 'bhutan-northwest-valleys',
  'Bhutan (Chumbi salient)': 'bhutan-chumbi-salient',
  'Siachen Glacier': 'siachen-glacier',
};

async function load(name: string): Promise<readonly Feature[]> {
  const response = await fetch(`${BASE}/${name}.geojson`);
  if (!response.ok) {
    throw new Error(`${name}: ${response.status} ${response.statusText}`);
  }

  const collection = (await response.json()) as { features: readonly Feature[] };
  console.info(`${name}: объектов ${collection.features.length}`);

  return collection.features;
}

function polygonRings(geometry: Geometry): Position[][] {
  const coordinates = geometry.coordinates as Position[][] | Position[][][];

  return geometry.type === 'Polygon'
    ? (coordinates as Position[][])
    : (coordinates as Position[][][]).flat();
}

const round = (position: Position): [number, number] => [
  Number(position[0].toFixed(PRECISION)),
  Number(position[1].toFixed(PRECISION)),
];

const countryFeatures = await load('ne_50m_admin_0_countries');
const extracted = countryFeatures
  .filter(
    (feature) =>
      feature.geometry !== null &&
      Object.hasOwn(ADMIN_TO_ID, feature.properties.ADMIN as string),
  )
  .map((feature) => ({
    id: ADMIN_TO_ID[feature.properties.ADMIN as string],
    nameRu: (feature.properties.NAME_RU as string) ?? '',
    nameZh: (feature.properties.NAME_ZH as string) ?? '',
    rings: polygonRings(feature.geometry as Geometry).map((ring) =>
      ring.map(round),
    ),
  }));

/*
 * Молчаливая потеря соседа — худшее, что здесь может случиться: слой соберётся,
 * сборка пройдёт, а страны на карте не будет, и вопрос о ней окажется без
 * верного ответа.
 */
const missingCountries = countries
  .map((country) => country.id)
  .filter((id) => !extracted.some((one) => one.id === id));
if (missingCountries.length > 0) {
  throw new Error(`Не найдены страны: ${missingCountries.join(', ')}`);
}

const context = countryFeatures
  .filter(
    (feature) =>
      feature.geometry !== null &&
      Object.hasOwn(CONTEXT_ADMIN_TO_ID, feature.properties.ADMIN as string),
  )
  .map((feature) => ({
    id: CONTEXT_ADMIN_TO_ID[feature.properties.ADMIN as string],
    rings: polygonRings(feature.geometry as Geometry).map((ring) =>
      ring.map(round),
    ),
  }));

const missingContext = Object.values(CONTEXT_ADMIN_TO_ID).filter(
  (id) => !context.some((one) => one.id === id),
);
if (missingContext.length > 0) {
  throw new Error(`Не найдены фоновые страны: ${missingContext.join(', ')}`);
}

const disputedFeatures = await load('ne_10m_admin_0_disputed_areas');
const disputed = disputedFeatures
  .filter(
    (feature) =>
      feature.geometry !== null &&
      Object.hasOwn(DISPUTED_TO_ID, feature.properties.BRK_NAME as string),
  )
  .map((feature) => ({
    id: DISPUTED_TO_ID[feature.properties.BRK_NAME as string],
    nameRu: (feature.properties.NAME_RU as string) ?? '',
    /* Подпись на карте берётся отсюда: источник сам говорит, кто чем владеет. */
    note: (feature.properties.NOTE_BRK as string) ?? '',
    rings: polygonRings(feature.geometry as Geometry).map((ring) =>
      ring.map(round),
    ),
  }));

const missingDisputed = Object.values(DISPUTED_TO_ID).filter(
  (id) => !disputed.some((one) => one.id === id),
);
if (missingDisputed.length > 0) {
  throw new Error(`Не найдены спорные участки: ${missingDisputed.join(', ')}`);
}

/*
 * Запись компактная, как у остальных выжимок: те же данные с отступами весят
 * втрое больше (1,1 МБ против 324 КБ) и дают шестьдесят четыре тысячи строк,
 * читать которые всё равно некому, — а `validate:map` хеширует их на каждой
 * сборке.
 */
writeFileSync(
  OUT,
  `${JSON.stringify({ countries: extracted, context, disputed })}\n`,
  'utf8',
);

console.info(
  `Выжимка: стран ${extracted.length}, фоновых ${context.length}, ` +
    `спорных участков ${disputed.length}`,
);
