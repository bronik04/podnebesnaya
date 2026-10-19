import { useEffect, useMemo, useRef, useState } from 'react';
import type { City } from '../content/types';
import { TARGET_DIAMETER_UNITS } from './city-hit-targets';
import { CITY_POINTS, type CityPoint } from './city-points';
import { clusterPlaceables, type MapCluster } from './cluster';
import { ClusterMark } from './ClusterMark';
import { clusterOutcome, withOutcome, type MarkOutcome } from './mark-outcome';
import { MAP_VIEWBOX_MIN_X, MAP_VIEWBOX_WIDTH } from './target-size';

export type CityLayerProps = {
  /** Какие города показывать. По умолчанию — все из каталога. */
  readonly points?: readonly CityPoint[];
  readonly selectedCityId?: string | null;
  /**
   * Задан — города отвечают на нажатие и получают фокус. Не задан — слой
   * только показывает: 57 новых остановок Tab в атласе, где город ничего не
   * делает, стоили бы дороже, чем дают. Названия городов региона при этом не
   * пропадают — они перечислены в его карточке.
   */
  readonly onSelect?: (cityId: string) => void;
  /**
   * Ложь — подписи скрыты совсем. В «назвать город» подсвеченная точка и есть
   * вопрос, и её подпись — готовый ответ: та же утечка, что у выносок Макао и
   * Гонконга на экране ответа.
   */
  readonly showsLabels?: boolean;
  /**
   * Во сколько раз увеличена карта. Цель нажатия обязана быть 24 px на экране,
   * а не в единицах карты: на увеличении те же 24 px занимают меньше единиц, и
   * города, которые пришлось собирать в гроздь на целом виде, расходятся сами.
   */
  readonly zoom?: number;
  /**
   * Нажатие по грозди просит карту приблизиться так, чтобы её города
   * разошлись. Даёт это сама карта — слой не знает ни ступеней увеличения, ни
   * середины вида. Не задано — гроздь не отвечает на нажатие.
   */
  readonly onZoomToCluster?: (cluster: MapCluster) => void;
  /**
   * Исход ответа по городам. Гроздь получает исход, только когда закрыты все
   * её члены: она приближает карту, а не отвечает, и за один ответ под ней
   * исхода не видно — ученик в этот миг смотрит на карту вблизи.
   */
  readonly outcomes?: Readonly<Record<string, MarkOutcome>>;
};

const NO_OUTCOMES: Readonly<Record<string, MarkOutcome>> = {};

/**
 * Радиус знака: город виден, но не спорит с границей региона.
 *
 * Мера берётся от той карты, где город разглядывают, а не от опорной ширины:
 * в атласе карта шириной 542 px при 806 единицах viewBox даёт 0.67 px на
 * единицу, и прежние 2.5 превращались в точку 3.4 px.
 */
const MARK_RADIUS = 3.2;

/** Столица крупнее прочих городов: это разный вес, а не разный цвет. */
const CAPITAL_MARK_RADIUS = 4.4;

/**
 * Подпись отходит от знака на его радиус и ещё немного — иначе буква садится
 * на кружок.
 */
const LABEL_OFFSET = MARK_RADIUS + 3;

/**
 * Насколько зона наведения выступает за знак в слое, который только
 * показывает. Прежде и там стояли цели нажатия в 24 px, и в дельте Чжуцзяна
 * невидимый круг верхнего города накрывал знаки соседей: наводишь на точку —
 * подписывается другой город.
 */
const HOVER_MARGIN = 1.6;

function markRadiusOf(city: City): number {
  return city.set === 'capital' ? CAPITAL_MARK_RADIUS : MARK_RADIUS;
}

/**
 * Слой городов поверх карты.
 *
 * Точка — три разные вещи, и разделены они намеренно (`MAP_SPEC.md`,
 * спек городов): знак стоит на настоящем месте, цель нажатия обязана быть не
 * меньше 24 px, подпись появляется только у одного города за раз. Из
 * последнего следует, что задачи взаимного расположения полусотни надписей не
 * возникает — остаётся не уехать за край.
 *
 * Подписи рисуются после всех знаков, а не внутри группы своего города: SVG
 * кладёт краску в порядке разметки, и подпись Лояна утопала под точками
 * соседей, нарисованных позже.
 *
 * Там, где города стоят ближе цели нажатия — дельты Янцзы и Чжуцзяна, — они
 * собираются в гроздь с числом. Нажатие по грозди по-настоящему приближает
 * карту, и точки расходятся сами (`cluster.ts`).
 *
 * Компонент рисуется порталом внутрь уже вставленной разметки карты, поэтому
 * система координат и увеличение у него общие с ней, а не подогнанные.
 */
export function CityLayer({
  points = CITY_POINTS,
  selectedCityId = null,
  onSelect,
  showsLabels = true,
  zoom = 1,
  onZoomToCluster,
  outcomes = NO_OUTCOMES,
}: CityLayerProps) {
  /*
   * Гроздь нужна там, где есть что разделять: цель нажатия или подсвеченный
   * ответ. Слой, который только показывает, — атлас — собирать знаки в число
   * не должен: приблизить карту оттуда гроздь не может, и половина городов
   * просто исчезла бы с карты.
   */
  const separates = onSelect !== undefined || selectedCityId !== null;

  const layout = useMemo(
    () => {
      const placeables = points.map((point) => ({
        id: point.city.id,
        x: point.x,
        y: point.y,
      }));

      return separates
        ? clusterPlaceables(placeables, TARGET_DIAMETER_UNITS / zoom)
        : { singles: placeables, clusters: [] };
    },
    [points, separates, zoom],
  );

  const pointById = useMemo(
    () => new Map(points.map((point) => [point.city.id, point])),
    [points],
  );

  /*
   * Город под рукой или в фокусе — его подпись рисуется поверх всего слоя.
   * Состояние, а не CSS `:hover`: подпись вынесена из группы города, и
   * таблице стилей не по чему связать её с наведением на знак.
   */
  const [activeCityId, setActiveCityId] = useState<string | null>(null);

  const askedCluster =
    layout.clusters.find((cluster) =>
      cluster.members.some((member) => member.id === selectedCityId),
    ) ?? null;

  /*
   * Гроздь со спрошенным городом приближается сама — но только там, где
   * подсвеченная точка и есть вопрос, то есть в «назвать город»: слой там не
   * отвечает на нажатие, и раскрыть гроздь руками нельзя. Там, где на карте
   * отвечают, та же подсветка означает уже данный ответ, и приближать к нему
   * карту незачем — ученик и так смотрит туда, куда нажал.
   *
   * Один раз на вопрос: если ученик после этого сам отдалил карту, снова
   * вырывать её из рук нельзя.
   */
  const asksSelected = onSelect === undefined;
  const autoZoomedFor = useRef<string | null>(null);

  useEffect(() => {
    if (selectedCityId === null || !asksSelected) {
      autoZoomedFor.current = null;
      return;
    }

    if (autoZoomedFor.current === selectedCityId) {
      return;
    }

    autoZoomedFor.current = selectedCityId;
    if (askedCluster !== null) {
      onZoomToCluster?.(askedCluster);
    }
  }, [asksSelected, askedCluster, onZoomToCluster, selectedCityId]);

  function cityMark(cityId: string, x: number, y: number) {
    const city = (pointById.get(cityId) as CityPoint).city;
    const outcome = outcomes[city.id];
    const label = withOutcome(`${city.nameRu}, ${city.nameZh}`, outcome);
    /*
     * Цель нажатия не меньше знака: на сильном увеличении 24 px экрана — это
     * меньше единиц карты, чем занимает сам кружок, и без нижней границы
     * нажатие по видимому краю знака проходило бы мимо города.
     */
    const hitRadius = onSelect
      ? Math.max(TARGET_DIAMETER_UNITS / zoom / 2, markRadiusOf(city) + HOVER_MARGIN)
      : markRadiusOf(city) + HOVER_MARGIN;

    return (
      <g
        key={city.id}
        className="city"
        data-city-id={city.id}
        data-city-set={city.set}
        data-selected={city.id === selectedCityId}
        data-outcome={outcome}
      >
        <circle
          className="city-mark"
          cx={x}
          cy={y}
          r={markRadiusOf(city)}
          aria-hidden="true"
        />
        {/*
          Кольцо рисуется всегда, но видно только у выбранной точки: без него
          спрошенный город терялся среди полусотни одинаковых знаков.
        */}
        <circle
          className="city-halo"
          cx={x}
          cy={y}
          r={MARK_RADIUS * 3.5}
          fill="none"
          stroke="none"
          aria-hidden="true"
        />
        <circle
          className="city-hit"
          cx={x}
          cy={y}
          r={hitRadius}
          data-city-id={city.id}
          role={onSelect ? 'button' : undefined}
          aria-label={onSelect ? label : undefined}
          aria-hidden={onSelect ? undefined : 'true'}
          tabIndex={onSelect ? 0 : -1}
          onPointerEnter={() => setActiveCityId(city.id)}
          onPointerLeave={() =>
            setActiveCityId((previous) => (previous === city.id ? null : previous))
          }
          onFocus={onSelect ? () => setActiveCityId(city.id) : undefined}
          onBlur={
            onSelect
              ? () =>
                  setActiveCityId((previous) =>
                    previous === city.id ? null : previous,
                  )
              : undefined
          }
          onClick={onSelect ? () => onSelect(city.id) : undefined}
          onKeyDown={
            onSelect
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(city.id);
                  }
                }
              : undefined
          }
        />
      </g>
    );
  }

  /*
   * Подпись видна у одного города за раз — под рукой, в фокусе или у
   * спрошенного. Рисуются подписи последними, поверх всех знаков слоя.
   */
  const labelledIds = showsLabels
    ? [...new Set([selectedCityId, activeCityId])].filter(
        (id): id is string => id !== null && pointById.has(id),
      )
    : [];

  return (
    <g className="city-layer" data-interactive={onSelect !== undefined}>
      {layout.singles.map((single) => cityMark(single.id, single.x, single.y))}
      {layout.clusters.map((cluster) => {
        const names = cluster.members
          .map((member) => (pointById.get(member.id) as CityPoint).city.nameRu)
          .join(', ');

        return (
          <ClusterMark
            key={cluster.id}
            cluster={cluster}
            hitRadius={TARGET_DIAMETER_UNITS / zoom / 2}
            selected={cluster === askedCluster}
            outcome={clusterOutcome(
              cluster.members.map((member) => outcomes[member.id]),
              true,
            )}
            label={
              onZoomToCluster
                ? `Города рядом: ${names} — приблизить карту`
                : undefined
            }
            mark={
              <circle
                className="city-mark"
                cx={cluster.x}
                cy={cluster.y}
                r={MARK_RADIUS}
                aria-hidden="true"
              />
            }
            onActivate={() => onZoomToCluster?.(cluster)}
          />
        );
      })}
      {labelledIds.map((cityId) => {
        const point = pointById.get(cityId) as CityPoint;
        /*
         * Сторона подписи выбирается по положению знака: у восточного
         * побережья, где городов больше всего, подпись справа ушла бы за край
         * viewBox.
         */
        const onEasternHalf =
          point.x > MAP_VIEWBOX_MIN_X + MAP_VIEWBOX_WIDTH * 0.75;

        return (
          <text
            key={cityId}
            className="city-label"
            x={point.x + (onEasternHalf ? -LABEL_OFFSET : LABEL_OFFSET)}
            y={point.y}
            textAnchor={onEasternHalf ? 'end' : 'start'}
            aria-hidden="true"
          >
            {point.city.nameRu}
          </text>
        );
      })}
    </g>
  );
}
