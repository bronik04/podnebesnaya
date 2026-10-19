import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import mapMarkup from '../../public/maps/china-provinces.svg?raw';
import type { Region } from '../content/types';
import type { RegionOutcome } from '../domain/fill-round';
import { CityLayer } from './CityLayer';
import { LandmarkLayer, type LandmarkOutcome } from './LandmarkLayer';
import type { FeatureOutcome } from './PhysicalLayer';
import { cityPointsOfRegions } from './city-points';
import { LANDMARK_POINTS } from './landmark-points';
import type { MarkOutcome } from './mark-outcome';
import type { MapCluster } from './cluster';
import {
  clampView,
  keyboardStep,
  panView,
  pointAtClient,
  unitsPerPixel,
  viewBoxOf,
  WHOLE_MAP,
} from './map-view';
import {
  loadCountryLayer,
  loadedCountryLayer,
  type CountryMap,
} from './load-country-layer';
import { MapControls, ZOOM_LEVELS, type MapZoom } from './MapControls';
import { MapDefs } from './MapDefs';
import { MEMBERSHIP_LABELS } from './membership';
import { OUTCOME_LABELS } from './outcome-labels';
import {
  PROGRESS_STATE_LABELS,
  type RegionProgressState,
} from './region-progress';
import { isRegionSelectable, type AnswerState } from './region-selection';
import {
  loadedPhysicalMap,
  loadPhysicalMap,
  type PhysicalMap,
} from './load-physical-map';

export type { AnswerState } from './region-selection';

export type MapHighlight = {
  readonly regionId: string;
  readonly kind: 'miss' | 'reveal';
};

type ChinaMapProps = {
  readonly regions: readonly Region[];
  readonly selectedRegionId: string | null;
  readonly onSelect: (regionId: string) => void;
  readonly onClear: () => void;
  readonly zoom?: MapZoom;
  readonly onZoomChange?: (zoom: MapZoom) => void;
  /**
   * Какой вопрос идёт сейчас. Приближение к грозди живёт ровно один вопрос:
   * со сменой ключа карта возвращается к той ступени и середине, которые
   * ученик выбрал сам, — иначе следующий вопрос о другом конце страны
   * начинался бы с пятикратного увеличения дельты Чжуцзяна.
   *
   * Ключ, а не сам вопрос: карте всё равно, что спрашивают, ей важно лишь,
   * что спрашивают уже другое.
   */
  readonly questionKey?: string;
  readonly answerStates?: Readonly<Record<string, AnswerState>>;
  /** Ложь — карта только показывает: области не выбираются и не получают фокус. */
  readonly interactive?: boolean;
  /**
   * `reference` — справочная карта: цвет означает тип региона.
   * `fill` — игровая: все регионы серые, цвет появляется только как исход.
   * `progress` — карта освоенности в кабинете: цвет означает, что ученик уже
   * успел с этим регионом.
   * `membership` — карта коллекции: цвет означает, входит ли регион в неё.
   * `physical` — физическая: заливка означает ступень рельефа, поверх неё реки.
   */
  readonly variant?:
    | 'reference'
    | 'fill'
    | 'progress'
    | 'membership'
    | 'physical';
  readonly progressStates?: Readonly<Record<string, RegionProgressState>>;
  /**
   * Регионы коллекции для `variant="membership"`. Пустой список — законное
   * состояние: у коллекции «Праздник весны» привязки к регионам нет.
   */
  readonly memberRegionIds?: readonly string[];
  /**
   * `browse` — карта для разглядывания на экране темы: заголовок, подсказка,
   * строка выбора и список внутри секции. `answer` — карта как поверхность
   * ответа: ничего из этого, только карта.
   *
   * Отдельно от `variant` намеренно: `variant` — про цвет, `usage` — про
   * роль. Один параметр этих двух вопросов не выражает.
   */
  readonly usage?: 'browse' | 'answer';
  readonly outcomes?: Readonly<Record<string, RegionOutcome>>;
  /**
   * Что показать поверх заливки. `miss` — вспышка на промахе, `reveal` —
   * показ региона, который так и не нашли. Виды разные, потому что живут
   * разное время и означают разное.
   */
  readonly highlight?: MapHighlight | null;
  /**
   * Истина — карта временно не принимает ответ (идёт показ региона). Область
   * и список при этом остаются на месте: снимать их значило бы отправить
   * фокус клавиатуры на body и заставить проходить табом заново.
   */
  readonly paused?: boolean;
  /**
   * Показывать ли города. В играх по регионам слой скрыт: точка в середине
   * Сычуани там подсказка, а не цель.
   */
  readonly showsCities?: boolean;
  readonly selectedCityId?: string | null;
  readonly onSelectCity?: (cityId: string) => void;
  readonly showsCityLabels?: boolean;
  /**
   * Какие города рисовать. Не задано — все города показанных регионов. Лёгкий
   * уровень «Найти город» рисует только набор раунда.
   */
  readonly cityIds?: readonly string[];
  /**
   * Исходы по городам. Отдельное свойство, а не общее с регионами: у Пекина,
   * Шанхая, Тяньцзиня и Чунцина город и регион носят один идентификатор, и
   * исход города не должен красить область.
   */
  readonly cityOutcomes?: Readonly<Record<string, MarkOutcome>>;
  /**
   * Показывать ли достопримечательности. По умолчанию — нет: в атласе 38
   * новых остановок Tab, где звезда ничего не делает, стоили бы дороже, чем
   * дают, — тот же довод, что и у городов.
   */
  readonly showsLandmarks?: boolean;
  readonly selectedLandmarkId?: string | null;
  /**
   * Список, а не один идентификатор: скучившиеся звёзды — одна цель, и
   * нажатие по ней отдаёт всех её членов. Кто из них спрошен, решает раунд.
   */
  readonly onSelectLandmark?: (landmarkIds: readonly string[]) => void;
  readonly showsLandmarkLabels?: boolean;
  /** Исход ответа по звёздам: верная — нефритом, ошибочная — киноварью. */
  readonly landmarkOutcomes?: Readonly<Record<string, LandmarkOutcome>>;
  /** Исходы звёзд копятся за раунд — лёгкий уровень (см. `clusterOutcome`). */
  readonly landmarkOutcomesAccumulate?: boolean;
  /** Какие звёзды рисовать. Не задано — все; лёгкий уровень — набор раунда. */
  readonly landmarkIds?: readonly string[];
  /**
   * Слой сопредельных государств. Включается только в играх по странам: на всех
   * прочих поверхностях за границей Китая пусто, и так и должно остаться.
   */
  readonly showsCountries?: boolean;
  readonly selectedCountryId?: string | null;
  readonly onSelectCountry?: (countryId: string) => void;
  /** Отвечают ли нажатием по стране: в «назвать страну» — нет. */
  readonly countriesAnswer?: boolean;
  /**
   * Во сколько раз шире обычного показывать карту. Нужен играм по странам:
   * кадр обрезан по Китаю, и соседи в нём остаются полосками.
   */
  readonly frameOutset?: number;
  readonly countryStates?: Readonly<Record<string, AnswerState>>;
  /** Исходы закрытых стран за раунд — лёгкий уровень. */
  readonly countryOutcomes?: Readonly<Record<string, MarkOutcome>>;
  /**
   * Показывать ли выноски Макао и Гонконга. В раундах, где отвечают точкой
   * или звездой, регионы не выбираются, и два пустых кружка в море с
   * поводками только спорят с гроздью городов дельты. На физической карте
   * выноски скрыты всегда: там маркер типа региона ничего не означает.
   */
  readonly showsCallouts?: boolean;
  /**
   * Показывать ли подписи выносок. Не задано — правило утечки: подписи
   * скрываются на любой поверхности ответа, кроме витрины. Атлас задаёт
   * истину явно: он поверхность справочная, и «Макао» с «Гонконгом» там не
   * ответ, а содержание.
   */
  readonly showsCalloutLabels?: boolean;
  /** Выбранный объект физической географии — река или форма рельефа. */
  readonly selectedFeatureId?: string | null;
  readonly onSelectFeature?: (featureId: string) => void;
  readonly showsPhysicalLabels?: boolean;
  /** Исход ответа по объектам физической карты: помечается штриховкой и штрихом. */
  readonly featureOutcomes?: Readonly<Record<string, FeatureOutcome>>;
  /**
   * Врезка на листе карты: легенда, шкала — то, что объясняет саму карту.
   *
   * Приходит готовой, а не собирается здесь: что означает заливка, знает
   * поверхность, карта только даёт место. Место это — лист, а не полоса под
   * ним: карта внутри своей колонки центрирована по пропорции, и шкала под
   * ней получалась вдвое шире самой карты. По той же причине в углу листа
   * стоит и управление масштабом.
   */
  readonly mapInset?: ReactNode;
  /**
   * Нажатие по области ведёт на другую поверхность, а не выбирает регион
   * здесь. Витрина в герое: карта — дверь в атлас.
   *
   * Отдельно от `onSelect` намеренно. Выбор — состояние этой карты, переход —
   * уход с неё, и путать их нельзя: витрина не подсвечивает выбранное, не
   * объявляет «Выбрано» строкой.
   *
   * Области при этом не получают фокус (`interactive={false}`): тридцать
   * четыре остановки табуляции на первом экране стоят между шапкой и всем
   * остальным. С клавиатуры в атлас ведёт соседняя кнопка — она же и есть
   * текстовая замена карте.
   */
  readonly onOpenRegion?: (regionId: string) => void;
};

/**
 * Литерал `{}` прямо в параметрах создавал бы новый объект на каждый рендер,
 * и эффект перезапускался бы вхолостую: `answerStates` входит в его зависимости.
 */
const NO_ANSWER_STATES: Readonly<Record<string, AnswerState>> = {};
const NO_OUTCOMES: Readonly<Record<string, RegionOutcome>> = {};
const NO_PROGRESS_STATES: Readonly<Record<string, RegionProgressState>> = {};
const NO_MEMBERS: readonly string[] = [];
const NO_FEATURE_OUTCOMES: Readonly<Record<string, FeatureOutcome>> = {};

/**
 * Насколько рука должна уехать, чтобы это считалось перетаскиванием, а не
 * нажатием. Без порога дрожь руки на нажатии отменяла бы выбор региона.
 */
const DRAG_THRESHOLD_PX = 4;

/** Куда двигать вид по стрелкам: карта уезжает противоходом. */
const PAN_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/*
 * Разметка карты объявлена один раз на модуль, а не литералом в разметке.
 * Новый объект на каждом рендере React считает новым содержимым и
 * переустанавливает `innerHTML`: узлы создаются заново, а вместе с ними
 * пропадает всё, что расставил эффект, — русские имена областей, состояния
 * ответа и признак выбора. Эффект после этого не перезапускается, потому что
 * его зависимости не менялись, и карта остаётся с английскими подписями из
 * исходного файла.
 */
const MAP_HTML = { __html: mapMarkup };

/** Где случилось нажатие. Всё, что нужно от события указателя. */
type PointerPoint = { readonly clientX: number; readonly clientY: number };

/**
 * Нажатие принимает и сам контур, и увеличенная цель для мелких областей.
 * Цели помечены отдельным атрибутом: доступное имя, фокус и состояния должны
 * остаться на контуре, иначе регион удвоится в обходе по Tab и в дереве
 * доступности (см. scripts/generate-hit-targets.ts).
 */
function getRegionId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const hit = target.closest<SVGElement>('[data-hit-region-id]');
  if (hit?.dataset.hitRegionId) {
    return hit.dataset.hitRegionId;
  }

  return target.closest<SVGElement>('[data-region-id]')?.dataset.regionId ?? null;
}

export function ChinaMap({
  regions,
  selectedRegionId,
  onSelect,
  onClear,
  zoom = 1,
  onZoomChange,
  questionKey,
  answerStates = NO_ANSWER_STATES,
  showsCountries = false,
  selectedCountryId = null,
  onSelectCountry,
  countriesAnswer = true,
  frameOutset,
  countryStates = NO_ANSWER_STATES,
  countryOutcomes,
  interactive = true,
  variant = 'reference',
  usage = 'browse',
  outcomes = NO_OUTCOMES,
  progressStates = NO_PROGRESS_STATES,
  memberRegionIds = NO_MEMBERS,
  highlight = null,
  paused = false,
  showsCities = false,
  selectedCityId = null,
  onSelectCity,
  showsCityLabels = true,
  cityIds,
  cityOutcomes,
  showsLandmarks = false,
  selectedLandmarkId = null,
  onSelectLandmark,
  showsLandmarkLabels = true,
  landmarkOutcomes,
  landmarkOutcomesAccumulate = false,
  landmarkIds,
  showsCallouts = true,
  showsCalloutLabels,
  selectedFeatureId = null,
  onSelectFeature,
  showsPhysicalLabels = true,
  featureOutcomes = NO_FEATURE_OUTCOMES,
  mapInset,
  onOpenRegion,
}: ChinaMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const cityPoints = useMemo(() => {
    const points = cityPointsOfRegions(regions.map((region) => region.id));

    return cityIds === undefined
      ? points
      : points.filter((point) => cityIds.includes(point.city.id));
  }, [regions, cityIds]);
  const landmarkPoints = useMemo(
    () =>
      landmarkIds === undefined
        ? LANDMARK_POINTS
        : LANDMARK_POINTS.filter((point) => landmarkIds.includes(point.landmark.id)),
    [landmarkIds],
  );
  /*
   * Разметка карты вставляется строкой, поэтому слой городов рисуется в неё
   * порталом: система координат и увеличение достаются ему от самой карты, а
   * не подгоняются вторым `svg` поверх. Узел находится после первой отрисовки,
   * отсюда состояние.
   */
  const [citySvg, setCitySvg] = useState<SVGSVGElement | null>(null);
  /*
   * Область под рукой на витрине. Только для подписи: подсветку рисует
   * `:hover` в таблице стилей, и состояние ей не нужно.
   */
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  /*
   * Середина вида. Увеличение приходит снаружи — им управляет экран, — а
   * сдвиг живёт здесь: он не меняет ни ответа, ни состояния раунда, и
   * поднимать его в `App` значило бы протаскивать через пять экранов то, что
   * нужно одной карте.
   *
   * Хранится только середина, а сам вид считается на отрисовке: держать в
   * состоянии ещё и увеличение значило бы синхронизировать его эффектом с
   * приходящим свойством — лишний круг перерисовки на каждое нажатие «плюса».
   * Уменьшение до единицы возвращает карту целиком само: `clampView`
   * приводит середину на место.
   */
  const [center, setCenter] = useState({
    x: WHOLE_MAP.centerX,
    y: WHOLE_MAP.centerY,
  });
  /*
   * Заход в гроздь: временное приближение, живущее ровно один вопрос.
   *
   * Собственный вид ученика — `zoom` и `center` — при этом не трогается, и
   * возврат к нему не требует ни отдельного действия, ни памяти о прежней
   * ступени: со сменой `questionKey` заход просто перестаёт быть нынешним, и
   * карта снова считается по своему виду. Поэтому проверка «нынешний ли» —
   * вычисление на отрисовке, а не эффект: эффект родителя запускается после
   * эффектов слоя, и приближение к новой грозди успело бы уехать вместе со
   * старым заходом.
   */
  const [trip, setTrip] = useState<{
    readonly key: string | undefined;
    readonly zoom: MapZoom;
    readonly centerX: number;
    readonly centerY: number;
  } | null>(null);
  const activeTrip = trip !== null && trip.key === questionKey ? trip : null;
  const view = clampView(
    activeTrip === null
      ? { zoom, centerX: center.x, centerY: center.y, outset: frameOutset }
      : {
          zoom: activeTrip.zoom,
          centerX: activeTrip.centerX,
          centerY: activeTrip.centerY,
          outset: frameOutset,
        },
  );
  /*
   * Тянут ли карту прямо сейчас. В ссылке, а не в состоянии: значение читается
   * и пишется в обработчиках указателя между кадрами, и перерисовка на каждое
   * движение мыши тащила бы за собой все 34 области.
   */
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  /*
   * Река под указателем. Держится здесь, а не в CSS `:hover`: наводятся не на
   * саму линию, а на полосу вокруг неё, и браузер о такой цели не знает.
   */
  const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
  /*
   * Слой стран приезжает отдельным куском: он нужен двум играм из
   * восемнадцати, а его геометрия весит 27 КБ. Статический импорт клал их на
   * первый экран каждому, кто просто открыл главную.
   */
  const [countryMap, setCountryMap] = useState<CountryMap | null>(
    loadedCountryLayer,
  );
  /*
   * Физический слой приезжает отдельным куском сборки: на первом экране он не
   * нужен, а весит больше всего после самой карты. Начальное значение — то,
   * что уже загружено: приложение тянет кусок в простое после первого экрана,
   * и обычно он здесь ещё до того, как кто-то откроет физическую карту.
   * Иначе слой появится кадром позже, а до тех пор карта просто политическая.
   */
  const [physicalMap, setPhysicalMap] = useState<PhysicalMap | null>(
    loadedPhysicalMap,
  );
  const selectedRegion = regions.find((region) => region.id === selectedRegionId);

  /*
   * Витрина ли это. Признаком, а не самим колбэком: колбэк приходит
   * встроенной стрелкой и меняет ссылку на каждый рендер, а эффект ниже
   * обходит все области карты — он не должен просыпаться от того, что
   * перерисовалась страница вокруг.
   */
  const opensRegion = onOpenRegion !== undefined;

  /* Область под рукой — только у витрины: у остальных карт её и не бывает. */
  const hoveredRegion =
    hoveredRegionId === null
      ? undefined
      : regions.find((region) => region.mapAreaId === hoveredRegionId);

  useEffect(() => {
    setCitySvg(mapRef.current?.querySelector<SVGSVGElement>('svg') ?? null);
  }, []);

  /*
   * Отказ виден и здесь, и по тому же доводу, что у физического слоя: слой
   * стран показывается только в двух играх, а в них он и есть вопрос. Без
   * него «назвать страну» просит назвать то, чего на карте нет, — кнопки при
   * этом остаются нажимаемыми, и попытки уходят в прогресс. Повторить
   * попытку эффект не может: его зависимости после отказа не меняются.
   */
  const [countryFailed, setCountryFailed] = useState(false);

  useEffect(() => {
    if (!showsCountries || countryMap !== null) {
      return;
    }

    let alive = true;
    void loadCountryLayer().then(
      (module) => {
        if (alive) {
          setCountryMap(module);
        }
      },
      () => {
        if (alive) {
          setCountryFailed(true);
        }
      },
    );

    return () => {
      alive = false;
    };
  }, [countryMap, showsCountries]);

  /*
   * Отказ виден. Кусок приезжает по сети, и в классе с упавшим Wi-Fi он может
   * не приехать вовсе; молча оставленная политическая карта на вкладке
   * «Физическая» выглядит поломкой без объяснения, а на вопрос «найдите реку»
   * отвечать было бы нечем.
   */
  const [physicalFailed, setPhysicalFailed] = useState(false);

  useEffect(() => {
    if (variant !== 'physical' || physicalMap !== null) {
      return;
    }

    let alive = true;
    void loadPhysicalMap().then(
      (module) => {
        if (alive) {
          setPhysicalMap(module);
        }
      },
      () => {
        if (alive) {
          setPhysicalFailed(true);
        }
      },
    );

    return () => {
      alive = false;
    };
  }, [variant, physicalMap]);

  /*
   * Вид применяется к самой разметке, а не к состоянию React: карта вставлена
   * строкой, и `viewBox` у неё — внешняя система, которую эффект и обязан
   * приводить в согласие с состоянием.
   */
  const viewBox = viewBoxOf(view);

  useEffect(() => {
    mapRef.current?.querySelector<SVGSVGElement>('svg')?.setAttribute('viewBox', viewBox);
  }, [viewBox]);

  useEffect(() => {
    /*
     * Выноски скрываются целиком — с кружком и поводком — там, где регионы не
     * цель: в раундах по точкам и звёздам (`showsCallouts={false}`) и на
     * физической карте, где маркер типа региона ничего не означает. Скрытый
     * кружок не берёт ни нажатие, ни фокус: display снимает и то и другое.
     */
    const hidesWholeCallouts = !showsCallouts || variant === 'physical';
    mapRef.current
      ?.querySelectorAll<SVGElement>('.map-callout')
      .forEach((callout) => {
        callout.style.setProperty('display', hidesWholeCallouts ? 'none' : '');
      });

    /*
     * Там, где на карте отвечают, подписи выносок скрываются: иначе карта
     * печатает «Макао» и «Гонконг» рядом с маркерами и выдаёт два ответа из
     * 34. Выносные линии остаются — они показывают, к каким территориям
     * относятся маркеры, не называя их.
     *
     * Условие по `usage`, а не по `variant`: утечка одинакова и в игре, и в
     * «найти на карте». Прежняя проверка
     * по `variant === 'fill'` закрывала только игру.
     *
     * Витрина из условия исключена: она тоже идёт с `usage="answer"` — ни
     * заголовка, ни списка ей не нужно, — но вопроса на ней нет, а выдать
     * можно только ответ. Прятать там подписи значило бы оставить на первом
     * экране два безымянных кружка в море. По той же причине атлас говорит
     * `showsCalloutLabels` явно: он тоже поверхность без хрома, но справочная,
     * и подпись выноски там содержание, а не утечка.
     *
     * Скрытие живёт здесь, а не в таблице стилей, намеренно: утечка ответа —
     * не оформление, и проверять её нужно там, где стили не подключены.
     */
    const hidesCalloutLabels =
      showsCalloutLabels === undefined
        ? usage === 'answer' && !opensRegion
        : !showsCalloutLabels;
    mapRef.current
      ?.querySelectorAll<SVGElement>('.map-callout text')
      .forEach((label) => {
        label.style.setProperty('display', hidesCalloutLabels ? 'none' : '');
      });

    /*
     * Цель нажатия мелкой области несёт исход своей области: вокруг неё
     * рисуется кольцо верного ответа. Сама цель прозрачна и скрыта от
     * читалки — слово «верно» по-прежнему говорит контур.
     */
    mapRef.current
      ?.querySelectorAll<SVGElement>('[data-hit-region-id]')
      .forEach((hit) => {
        const answerState = answerStates[hit.dataset.hitRegionId ?? ''];
        if (answerState) {
          hit.dataset.answerState = answerState;
        } else {
          delete hit.dataset.answerState;
        }
      });

    const areas = mapRef.current?.querySelectorAll<SVGElement>('[data-region-id]');
    const labelsByMapAreaId = new Map(
      regions.map((region) => [
        region.mapAreaId,
        `${region.nameRu}, ${region.nameZh}`,
      ]),
    );

    areas?.forEach((area) => {
      const regionId = area.dataset.regionId ?? '';
      area.dataset.selected = String(regionId === selectedRegionId);
      area.setAttribute('tabindex', interactive ? '0' : '-1');
      /*
       * Витрина — дверь целиком, а не тридцать четыре кнопки. Роль снимается,
       * иначе читалка экрана объявляет управление, до которого нет пути с
       * клавиатуры: фокус областям там не даётся, а в атлас ведёт соседняя
       * кнопка. Возвращается роль так же явно — карта живёт в одном узле, и
       * снятое однажды само не вернулось бы.
       */
      if (opensRegion) {
        area.removeAttribute('role');
      } else {
        area.setAttribute('role', 'button');
      }

      const answerState = answerStates[regionId];
      if (answerState) {
        area.dataset.answerState = answerState;
      } else {
        delete area.dataset.answerState;
      }

      const outcome = outcomes[regionId];
      if (outcome) {
        area.dataset.outcome = outcome;
      } else {
        delete area.dataset.outcome;
      }

      /*
       * Состояние освоенности ставится всем областям сразу: «не тронут» — тоже
       * состояние, и без него регион остался бы без заливки и без слова.
       */
      const progressState =
        variant === 'progress' ? (progressStates[regionId] ?? 'untouched') : undefined;
      if (progressState) {
        area.dataset.progressState = progressState;
      } else {
        delete area.dataset.progressState;
      }

      /*
       * Как и освоенность, принадлежность ставится всем областям: «не входит»
       * — тоже ответ на вопрос страницы, и регион без неё остался бы без
       * заливки и без слова.
       */
      const membership =
        variant === 'membership'
          ? memberRegionIds.includes(regionId)
            ? 'member'
            : 'outside'
          : undefined;
      if (membership) {
        area.dataset.membership = membership;
      } else {
        delete area.dataset.membership;
      }

      const label = labelsByMapAreaId.get(regionId);
      if (label) {
        const suffix = outcome
          ? OUTCOME_LABELS[outcome]
          : progressState
            ? PROGRESS_STATE_LABELS[progressState]
            : membership
              ? MEMBERSHIP_LABELS[membership]
              : null;
        area.setAttribute('aria-label', suffix ? `${label} — ${suffix}` : label);
      }

      if (answerState || outcome || paused) {
        area.setAttribute('aria-disabled', 'true');
      } else {
        area.removeAttribute('aria-disabled');
      }

      if (highlight !== null && area.dataset.regionId === highlight.regionId) {
        area.dataset.highlight = highlight.kind;
      } else {
        delete area.dataset.highlight;
      }
    });
  }, [
    answerStates,
    highlight,
    interactive,
    memberRegionIds,
    opensRegion,
    outcomes,
    paused,
    progressStates,
    regions,
    selectedRegionId,
    showsCalloutLabels,
    showsCallouts,
    usage,
    variant,
  ]);

  /** Сдвигать нечего, пока карта показана целиком. */
  const canPan = view.zoom > 1;

  /**
   * Приблизить карту так, чтобы города грозди разошлись: середина вида — в
   * гроздь, увеличение — ближайшая ступень, на которой ближайшая пара отходит
   * на диаметр цели. Ступени и середина — знание карты, поэтому считается
   * здесь, а слой лишь просит.
   *
   * Это заход, а не смена вида: собственная ступень ученика остаётся прежней и
   * вернётся сама со следующим вопросом.
   *
   * `validate:map` следит, чтобы самой тесной паре каталога хватало последней
   * ступени, — запасной ветки «не разошлись» не существует по построению.
   */
  function zoomToCluster(cluster: MapCluster) {
    const needed = cluster.scale * view.zoom;
    const level =
      ZOOM_LEVELS.find((one) => one >= needed - 1e-9) ??
      ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

    setTrip({
      key: questionKey,
      zoom: level,
      centerX: cluster.x,
      centerY: cluster.y,
    });
  }

  /**
   * Ступень, по которой работают кнопки масштаба: та, что видна, а не та, что
   * пришла свойством. Во время захода в гроздь это разные вещи.
   */
  const shownZoom: MapZoom = activeTrip?.zoom ?? zoom;

  /**
   * Ученик взял вид в свои руки: то, что он видит сейчас, становится его
   * собственным видом, а заход в гроздь на этом кончается. Иначе «плюс» посреди
   * захода отсчитывал бы от целой карты и швырял бы ученика обратно.
   */
  function changeZoom(next: MapZoom) {
    if (activeTrip !== null) {
      setCenter({ x: view.centerX, y: view.centerY });
      setTrip(null);
    }

    onZoomChange?.(next);
  }

  /**
   * Сдвинуть вид на столько-то единиц карты. Во время захода едет он, а не
   * собственный вид ученика: тот обязан дождаться его целым.
   */
  function panBy(dx: number, dy: number) {
    if (activeTrip !== null) {
      setTrip((previous) => {
        if (previous === null) {
          return previous;
        }

        const moved = panView(
          {
            zoom: previous.zoom,
            centerX: previous.centerX,
            centerY: previous.centerY,
            outset: frameOutset,
          },
          dx,
          dy,
        );

        return { ...previous, centerX: moved.centerX, centerY: moved.centerY };
      });

      return;
    }

    /*
     * Считается от предыдущего значения, а не от вида этой отрисовки: между
     * кадрами приходит несколько событий указателя, и все они читали бы одну и
     * ту же середину — быстрый рывок терял бы почти весь путь.
     */
    setCenter((previous) => {
      const moved = panView(
        { zoom, centerX: previous.x, centerY: previous.y, outset: frameOutset },
        dx,
        dy,
      );

      return { x: moved.centerX, y: moved.centerY };
    });
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canPan || event.button !== 0) {
      return;
    }

    /*
     * Указатель здесь намеренно не захватывается, и карта пока не едет.
     * Захват на нажатии сбивает прицел: `click` после него уходит не в точку
     * города и не в область, а в саму карту — общего предка нажатия и
     * отпускания. Ровно так же вредит и сдвиг на первый же пиксель: узел под
     * курсором успевает уехать, отпускание приходится на соседний, и клика по
     * городу не случается вовсе. Поэтому и то и другое начинается только
     * после порога.
     */
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
  }

  function continueDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const from = drag.current;
    if (from === null) {
      return;
    }

    if (
      !from.moved &&
      Math.abs(event.clientX - from.x) <= DRAG_THRESHOLD_PX &&
      Math.abs(event.clientY - from.y) <= DRAG_THRESHOLD_PX
    ) {
      // Дрожь руки на нажатии — не перетаскивание: карта стоит.
      return;
    }

    if (!from.moved) {
      /*
       * Тянуть можно и за пределами карты: захват доводит движение до конца,
       * даже если рука ушла на соседний блок и вернулась.
       */
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const scale = unitsPerPixel(view, {
      width: event.currentTarget.clientWidth,
      height: event.currentTarget.clientHeight,
    });
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;

    drag.current = { x: event.clientX, y: event.clientY, moved: true };

    /* Тянут за карту, поэтому вид едет навстречу движению руки. */
    panBy(-dx * scale, -dy * scale);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const selectionRules = { interactive, paused, answerStates, outcomes };

  /**
   * Какой объект физической географии под точкой экрана.
   *
   * Считает одно правило — `physicalTargetAt`, «побеждает меньший объект»:
   * озеро, река, форма, регион. Узлы слоя указателя не принимают, поэтому
   * другого источника нет и разойтись с этим ответом нечему.
   *
   * У реки узла-цели нет и быть не может: линия шириной в полторы единицы на
   * экране уже 1 px, и попасть в неё рукой нельзя, а лента в 24 px вокруг
   * каждой невыполнима — Янцзы и Ланьцанцзян сближаются до 4 единиц (решение
   * от 2026-08-05). Точку разрешает расстояние, и пороги считаются от
   * текущего увеличения: на увеличении те же 24 px занимают меньше единиц.
   */
  function featureAtClient(clientX: number, clientY: number): string | null {
    const svg = mapRef.current?.querySelector<SVGSVGElement>('svg');
    if (svg === null || svg === undefined) {
      return null;
    }

    const [x, y] = pointAtClient(view, svg.getBoundingClientRect(), clientX, clientY);

    /* Кусок ещё не приехал — под точкой пока ничего нет, и это правда. */
    return physicalMap?.physicalTargetAt(x, y, view.zoom) ?? null;
  }

  const resolvesFeatures = variant === 'physical' && onSelectFeature !== undefined;

  function selectTarget(target: EventTarget | null, point?: PointerPoint) {
    /*
     * Нажатие после перетаскивания не выбирает регион: рука остановилась над
     * областью, но выбирать её не собиралась. Признак снимается здесь, а не
     * при отпускании указателя, — иначе он пропадёт раньше, чем придёт click.
     */
    const dragged = drag.current?.moved === true;
    drag.current = null;
    if (dragged) {
      return;
    }

    /*
     * Объект физической географии идёт перед областью: он нарисован поверх и
     * меньше её, и рука, целившая в него, метила не в подложку. Точки без
     * объекта поблизости достаются области, как и на любом другом виде.
     *
     * Разрешает всё это карта, а не узлы слоя: узлы указателя не принимают
     * (`physical-hit.ts`), и второго источника, с которым можно разойтись,
     * не остаётся.
     */
    if (resolvesFeatures && point !== undefined) {
      const featureId = featureAtClient(point.clientX, point.clientY);
      if (featureId !== null) {
        onSelectFeature?.(featureId);
        return;
      }
    }

    const regionId = getRegionId(target);
    if (regionId === null) {
      return;
    }

    /*
     * Переход идёт перед правилами выбираемости: витрина неинтерактивна, и
     * `isRegionSelectable` отказал бы каждой области. Дверь при этом остаётся
     * дверью — состояния выбора у витрины нет вовсе.
     */
    if (onOpenRegion !== undefined) {
      onOpenRegion(regionId);
      return;
    }

    if (isRegionSelectable(selectionRules, regionId)) {
      onSelect(regionId);
    }
  }

  const showsBrowseChrome = usage === 'browse';
  /*
   * Строка выбора нужна там, где выбор ещё не ответ. На экране раунда нажатие
   * и есть ответ, о нём объявляет карточка обратной связи, а второй aria-live
   * заставил бы читать результат дважды. В «назвать регион» карта не
   * интерактивна, и статичное объяснение подсветки остаётся.
   */
  /*
   * `progress` исключён вместе с `fill`: на карте освоенности ничего не
   * выбирают и не подсвечивают, и строка «На карте подсвечена одна область»
   * там просто врала бы.
   */
  /*
   * Вторая ветка требует выбранного региона, а не просто неинтерактивной
   * карты: «На карте подсвечена одна область» — про подсветку в «назвать
   * регион», где `selectedRegionId` и есть спрошенный регион. На витрине
   * главной, где карта тоже только показывает, но не подсвечивает ничего, эта
   * строка утверждала бы то, чего на экране нет.
   */
  const showsSelectionStatus =
    variant === 'reference' &&
    (interactive ? showsBrowseChrome : selectedRegionId !== null);

  return (
    <section
      className="map-section"
      data-usage={usage}
      aria-labelledby={showsBrowseChrome ? 'map-heading' : undefined}
      aria-label={showsBrowseChrome ? undefined : 'Карта регионов'}
    >
      {showsBrowseChrome ? (
        <div className="section-heading">
          <h2 id="map-heading">
            {interactive ? 'Интерактивная карта' : 'Карта регионов'}
          </h2>
          {interactive ? <p>Выберите регион на схеме или в списке.</p> : null}
        </div>
      ) : null}
      <MapDefs />
      {/*
        Рамка держит карту и зум в одной системе координат: зум лежит на
        бумаге, в углу самой карты, а не отдельной полосой перед ней. Раньше
        три кнопки стояли до карты и весили больше неё.
      */}
      <div className="china-map-frame">
        <div
          className="china-map"
          data-map-variant={variant}
          data-can-pan={canPan}
          data-feature-hover={hoveredFeatureId !== null}
          ref={mapRef}
          onClick={(event) => selectTarget(event.target, event)}
          onPointerDown={beginDrag}
          onPointerMove={(event) => {
            continueDrag(event);

            if (resolvesFeatures && drag.current === null) {
              const featureId = featureAtClient(event.clientX, event.clientY);
              setHoveredFeatureId((previous) =>
                previous === featureId ? previous : featureId,
              );
            }

            /*
             * Витрина называет то, что под рукой: без имени нажатие по
             * области — прыжок неизвестно куда. Состояние меняется только на
             * смене области, иначе setState шёл бы на каждое движение руки.
             */
            if (onOpenRegion !== undefined) {
              const regionId = getRegionId(event.target);
              setHoveredRegionId((previous) =>
                previous === regionId ? previous : regionId,
              );
            }
          }}
          onPointerLeave={() => {
            setHoveredFeatureId(null);
            setHoveredRegionId(null);
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onClear();
              return;
            }

            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              selectTarget(event.target);
              return;
            }

            /*
             * Стрелки двигают карту, когда её увеличили. На целом виде они
             * остаются прокруткой страницы: перехватывать их там значило бы
             * отнять привычное поведение, ничего не дав взамен.
             */
            const step = PAN_KEYS[event.key];
            if (step !== undefined && canPan) {
              event.preventDefault();
              const units = keyboardStep(view);
              panBy(step[0] * units, step[1] * units);
            }
          }}
          dangerouslySetInnerHTML={MAP_HTML}
        />
        {showsCities && citySvg !== null
          ? createPortal(
              <CityLayer
                points={cityPoints}
                outcomes={cityOutcomes}
                selectedCityId={selectedCityId}
                onSelect={onSelectCity}
                showsLabels={showsCityLabels}
                zoom={view.zoom}
                onZoomToCluster={onZoomChange ? zoomToCluster : undefined}
              />,
              citySvg,
            )
          : null}
        {showsCountries &&
        citySvg !== null &&
        countryMap !== null &&
        onSelectCountry !== undefined
          ? createPortal(
              <countryMap.CountryLayer
                selectedCountryId={selectedCountryId}
                onSelect={onSelectCountry}
                answers={countriesAnswer}
                answerStates={countryStates}
                outcomes={countryOutcomes}
              />,
              citySvg,
            )
          : null}
        {showsLandmarks && citySvg !== null
          ? createPortal(
              <LandmarkLayer
                selectedLandmarkId={selectedLandmarkId}
                onSelect={onSelectLandmark}
                showsLabels={showsLandmarkLabels}
                outcomes={landmarkOutcomes}
                outcomesAccumulate={landmarkOutcomesAccumulate}
                points={landmarkPoints}
                zoom={view.zoom}
              />,
              citySvg,
            )
          : null}
        {/*
          Слой физической карты идёт тем же порталом и по той же причине, что
          слой городов: система координат и увеличение достаются ему от самой
          карты. Области под ним уже нарисованы и дают нейтральный тон тем
          27.8 % суши, которых нет ни в одной названной форме.
        */}
        {variant === 'physical' && citySvg !== null && physicalMap !== null
          ? createPortal(
              <physicalMap.PhysicalLayer
                selectedFeatureId={selectedFeatureId}
                hoveredFeatureId={hoveredFeatureId}
                onSelect={onSelectFeature}
                showsLabels={showsPhysicalLabels}
                featureOutcomes={featureOutcomes}
                zoom={view.zoom}
              />,
              citySvg,
            )
          : null}
        {/*
          Сообщение об отказе — на самой карте, а не в углу страницы: смотрят
          на карту, и там же должно стоять объяснение, почему на ней ничего
          нет.
        */}
        {/*
          Признак неудачи не сбрасывается при новой попытке: сброс — это
          setState прямо в эффекте. Сообщение гаснет само, когда кусок всё же
          приезжает, потому что условие спрашивает и о нём.
        */}
        {variant === 'physical' && physicalFailed && physicalMap === null ? (
          <p className="map-failure" role="status">
            Физическая карта не загрузилась: нет связи. Она появится, когда
            связь вернётся, — обновите страницу.
          </p>
        ) : null}
        {showsCountries && countryFailed && countryMap === null ? (
          <p className="map-failure" role="status">
            Соседние государства не загрузились: нет связи. Они появятся, когда
            связь вернётся, — обновите страницу.
          </p>
        ) : null}
        {/* Зум идёт после карты в разметке: сначала предмет, потом управление им. */}
        {/*
          Управление показывается тому, кто его попросил, — и только ему.
          Прежде условие спрашивало ещё и про `interactive`: витрине в герое
          доставался колбэк, и три бумажные кнопки по 44 px оказывались самым
          тяжёлым предметом правой половины первого экрана. Колбэк оттуда убран,
          а `interactive` в условии мешал: в «найти город» карту не выбирают
          областями, но увеличивать и двигать её нужно как раз там.
        */}
        {onZoomChange ? (
          <MapControls zoom={shownZoom} onZoomChange={changeZoom} />
        ) : null}
        {/*
          Врезка — последней: она объясняет то, что уже нарисовано, и лежит
          поверх листа, как и управление масштабом.
        */}
        {mapInset}
        {/*
          Подпись под рукой. Скрыта от читалки экрана намеренно: навести
          указатель клавиатурой нельзя, а путь без указателя — соседняя
          кнопка, которая называет то же самое словом.
        */}
        {hoveredRegion === undefined ? null : (
          <p className="map-open-hint" aria-hidden="true">
            {hoveredRegion.nameRu}{' '}
            <span lang="zh-Hans">{hoveredRegion.nameZh}</span> · открыть в
            атласе
          </p>
        )}
      </div>
      {/*
        В упражнении «назови регион» карта только показывает. Назвать
        подсвеченную область или перечислить регионы здесь — значит выдать
        ответ, поэтому оба блока заменяются нейтральной подписью.
      */}
      {/*
        В игровом режиме карта о выборе не рассказывает: результат хода
        объявляет экран раунда. Второй `aria-live` на экране означал бы, что
        после каждого ответа программа чтения читает ещё и «Регион ещё не
        выбран» — выбор там всегда пуст.
      */}
      {showsSelectionStatus ? (
        interactive ? (
          <p className="map-selection" role="status" aria-live="polite">
            {selectedRegion
              ? `Выбрано: ${selectedRegion.nameRu} (${selectedRegion.nameZh})`
              : 'Регион ещё не выбран.'}
          </p>
        ) : (
          <p className="map-selection">На карте подсвечена одна область.</p>
        )
      ) : null}
    </section>
  );
}
