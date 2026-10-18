import { useState } from 'react';
import { partOfFeature, physicalFeatures } from '../content/physical-features';
import { regions } from '../content/regions';
import { lakeMarks } from './lake-marks';
import { pointMarks } from './point-marks';
import {
  LAKE_SHAPES,
  MARINE_SHAPES,
  POINT_MARKS,
  RELIEF_SHAPES,
  WATER_LINES,
} from './physical-geometry';
import { RELIEF_BANDS } from './relief-bands';
import {
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_MIN_X,
  MAP_VIEWBOX_MIN_Y,
  MAP_VIEWBOX_WIDTH,
} from './target-size';
import { RIVER_SHAPES } from './river-hit';

/**
 * Физическая карта: заливка по ступеням рельефа и шесть рек поверх.
 *
 * Рисуется порталом внутрь уже вставленной разметки карты — как слой городов,
 * и по той же причине: система координат и увеличение достаются ему от самой
 * карты, а не подгоняются вторым `svg` поверх.
 *
 * За границу Китая рисунок не выпускает маска из `<use>` на те же 34 контура
 * региона. Копировать их геометрию сюда не нужно и вредно: копия разошлась бы
 * с картой при первой же её правке.
 */
const NAME_OF = new Map(
  physicalFeatures.map((feature) => [
    feature.id,
    `${feature.nameRu}, ${feature.nameZh}`,
  ]),
);

const NAME_RU_OF = new Map(
  physicalFeatures.map((feature) => [feature.id, feature.nameRu]),
);

/** Подпись отходит от линии вверх, иначе буквы садятся на саму реку. */
const LABEL_OFFSET = 4;

/** Радиус знака озера: виден на целом виде, но не спорит с контуром. */
const LAKE_MARK_RADIUS = 2.5;

/** Полувысота треугольника крайней точки: чуть крупнее знака озера. */
/*
 * 4,6 единицы, а не прежние 3: треугольник в 3 занимал на атласной карте
 * меньше 4 px и терялся на рельефной заливке — Джомолунгму приходилось
 * искать. Знак вершины к тому же почти пуст внутри, и ему нужно больше поля,
 * чем залитому кружку города того же размера.
 */
const POINT_MARK_RADIUS = 4.6;

/**
 * Знак крайней точки: треугольник вверх у вершины, вниз у впадины. Род
 * читается формой, а не цветом: цвет на этой карте занят ступенью рельефа.
 */
function trianglePath(x: number, y: number, up: boolean): string {
  const tip = up ? -POINT_MARK_RADIUS : POINT_MARK_RADIUS;
  const base = up ? POINT_MARK_RADIUS * 0.7 : -POINT_MARK_RADIUS * 0.7;
  const half = POINT_MARK_RADIUS * 0.92;

  return `M ${x} ${y + tip} L ${x + half} ${y + base} L ${x - half} ${y + base} Z`;
}

/** Вид точки по её идентификатору: вершина или впадина. */
const POINT_KIND_OF = new Map(
  physicalFeatures.flatMap((feature) =>
    feature.kind === 'point' ? [[feature.id, feature.point] as const] : [],
  ),
);

/**
 * Точка подписи — середина самого длинного куска линии. У реки, разрезанной
 * рамкой карты, середина общего списка точек попала бы в разрыв.
 */
const LABEL_POINTS = new Map(
  RIVER_SHAPES.map((river) => {
    const longest = river.parts.reduce(
      (best, part) => (part.length > best.length ? part : best),
      river.parts[0] ?? [],
    );

    return [river.featureId, longest[Math.floor(longest.length / 2)] ?? [0, 0]];
  }),
);

/**
 * Где стоит подпись каждой из двенадцати целей. У реки это середина самого
 * длинного куска линии, поднятая над ней; у формы — точка, посчитанная
 * генератором как середина наибольшей вписанной окружности.
 */
const LABELLED: readonly { featureId: string; x: number; y: number }[] = [
  ...RIVER_SHAPES.map((river) => {
    const [x, y] = LABEL_POINTS.get(river.featureId) ?? [0, 0];

    return { featureId: river.featureId, x, y: y - LABEL_OFFSET };
  }),
  ...RELIEF_SHAPES.filter((shape) => shape.featureId !== undefined).map((shape) => ({
    featureId: shape.featureId!,
    x: shape.labelX ?? 0,
    y: shape.labelY ?? 0,
  })),
  /* Подпись озера ставится у знака, а не у середины контура: у Поянху они
     разойдутся — контур вытянут, а знак стоит там, куда целятся. */
  ...LAKE_SHAPES.map((shape) => ({
    featureId: shape.featureId,
    x: shape.markX,
    y: shape.markY - LABEL_OFFSET,
  })),
  /* У крайней точки подпись над знаком: контура, к середине которого её можно
     было бы привязать, у точки нет. */
  ...POINT_MARKS.map((mark) => ({
    featureId: mark.featureId,
    x: mark.x,
    y: mark.y - LABEL_OFFSET - POINT_MARK_RADIUS,
  })),
  /* У моря подпись стоит там, где её поставил генератор: в воде, вне суши и
     мимо чужих целей. */
  ...MARINE_SHAPES.map((shape) => ({
    featureId: shape.featureId,
    x: shape.labelX,
    y: shape.labelY,
  })),
];

/*
 * Суша прячется маской, а не обрезкой. `clipPath` строит область обрезки
 * геометрией и платит за каждую вершину: на 148 КБ контуров регионов первый
 * показ слоя стоил 6130 мс блокировки, и переключение вкладки атласа
 * выглядело поломкой. Маска растрирует те же контуры один раз, как обычную
 * заливку, — 1 мс, и ступень увеличения ей тоже ничего не стоит.
 *
 * Геометрия при этом не упрощается и не копируется: те же `<use>` на те же 34
 * области, SVG остаётся единственным источником.
 */
const MASK_ID = 'china-land-mask';

/** Литерал `{}` в параметрах создавал бы новый объект на каждой отрисовке. */
const NO_OUTCOMES: Readonly<Record<string, FeatureOutcome>> = {};

/** Чем кончился ответ по объекту. */
export type FeatureOutcome = 'correct' | 'incorrect';

export type PhysicalLayerProps = {
  readonly selectedFeatureId?: string | null;
  /**
   * Объект под указателем. Приходит снаружи, и это единственный источник для
   * указателя: узлы слоя его не принимают, а цель считает карта по правилу
   * «побеждает меньший» (`physical-hit.ts`). Иначе и быть не может — попасть
   * рукой в линию шириной в полторы единицы нельзя, и какая река под
   * курсором, решает расстояние, а не браузер.
   *
   * Свой источник у слоя остался один — фокус клавиатуры.
   */
  readonly hoveredFeatureId?: string | null;
  /**
   * Задан — объекты получают фокус и отвечают на клавиатуру. Не задан — слой
   * только показывает: в атласе шесть новых остановок `Tab` оправданы, а на
   * чужой поверхности — нет. Имя объекта при этом остаётся: реки — то главное,
   * что говорит эта карта, и читалке экрана они названы в обоих случаях.
   *
   * Указатель сюда не приходит: узлы слоя его не принимают, и нажатие
   * разрешает карта. Прежде узлы отвечали сами, и это ломало правило: узел
   * формы перехватывал нажатие раньше, чем считалось расстояние до реки, и
   * точка в полутора единицах от Янцзы доставалась Тибетскому нагорью.
   */
  readonly onSelect?: (featureId: string) => void;
  /** Ложь — подписи скрыты: в игре подпись объекта и есть ответ. */
  readonly showsLabels?: boolean;
  /**
   * Во сколько раз увеличена карта. Нужно одним целям нажатия озёр: порог
   * задан в пикселях экрана, и на увеличении те же 24 px занимают меньше
   * единиц карты. Правило и приём те же, что у слоя городов.
   */
  readonly zoom?: number;
  /**
   * Чем кончился ответ по объекту. Пусто до ответа: на физической карте
   * состояние не бывает цветом — он занят тремя ступенями, — и до ответа
   * помечать нечего.
   */
  readonly featureOutcomes?: Readonly<Record<string, FeatureOutcome>>;
};

export function PhysicalLayer({
  selectedFeatureId = null,
  hoveredFeatureId = null,
  onSelect,
  showsLabels = true,
  featureOutcomes = NO_OUTCOMES,
  zoom = 1,
}: PhysicalLayerProps) {
  /*
   * Узел в фокусе — по его собственным событиям. Указатель сюда не приходит
   * вовсе: узлы слоя его не принимают, и какой объект под курсором, решает
   * карта одним правилом (`physicalTargetAt`). Фокус остаётся за узлом:
   * клавиатура ходит по узлам, а не по координатам.
   *
   * Фокус идёт первым, а посчитанный картой объект вторым: при обходе с
   * клавиатуры указатель стоит там, где его оставили, и посчитанное им имя
   * закрывало бы имя объекта в фокусе.
   */
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const hovered = hoveredNodeId ?? hoveredFeatureId;

  return (
    <g
      className="physical-layer"
      data-interactive={onSelect !== undefined}
      data-labels={showsLabels}
    >
      <defs>
        {/*
          Рамка маски задана явно и в единицах карты. По умолчанию она
          считается от габарита закрашиваемой группы с запасом в 10 %, а
          габарит полос высот — вся рамка карты: группа обрезала бы сама себя.

          Белым — то, что видно: маска светимости показывает там, где ярко.
        */}
        <mask
          id={MASK_ID}
          maskUnits="userSpaceOnUse"
          x={MAP_VIEWBOX_MIN_X}
          y={MAP_VIEWBOX_MIN_Y}
          width={MAP_VIEWBOX_WIDTH}
          height={MAP_VIEWBOX_HEIGHT}
        >
          {regions.map((region) => (
            <use key={region.mapAreaId} href={`#${region.mapAreaId}`} fill="#fff" />
          ))}
        </mask>
      </defs>

      <g className="relief" mask={`url(#${MASK_ID})`}>
        {/*
          Полосы высот. Базовая заливка прямоугольником — нижняя полоса, поверх
          неё области «выше порога» снизу вверх. Правило заполнения `evenodd`
          задано стилями: вложенное кольцо — это котловина внутри нагорья, и
          дырку она даёт сама, без отдельной геометрии.
        */}
        <rect
          className="relief-band"
          data-band="0"
          aria-hidden="true"
          x={MAP_VIEWBOX_MIN_X}
          y={MAP_VIEWBOX_MIN_Y}
          width={MAP_VIEWBOX_WIDTH}
          height={MAP_VIEWBOX_HEIGHT}
        />
        {RELIEF_BANDS.map((band) => (
          <path
            key={band.threshold}
            className="relief-band"
            data-band={band.threshold}
            aria-hidden="true"
            d={band.d}
          />
        ))}
        {RELIEF_SHAPES.map((shape) => {
          /*
           * Спрашиваются шесть форм из тридцати восьми. Остальные тридцать две
           * заливают фон и молчат: имён у них на экране нет, иначе пришлось бы
           * сверять тридцать восемь имён вместо шести ради подложки.
           */
          const isTarget = shape.featureId !== undefined;
          const answers = isTarget && onSelect !== undefined;
          /*
           * Ореол выделенной формы — контур бумагой под её обводкой. Отдельным
           * путём, а не фильтром: фильтр обвёл бы и каждый штрих штриховки
           * внутри формы. Исход выделение снимает, и ореол вместе с ним.
           */
          const showsHalo =
            isTarget &&
            (shape.featureId === selectedFeatureId || shape.featureId === hovered) &&
            featureOutcomes[shape.featureId!] === undefined;

          return [
            showsHalo ? (
              <path
                key={`${shape.key}-halo`}
                className="relief-halo"
                d={shape.d}
                aria-hidden="true"
              />
            ) : null,
            <path
              key={shape.key}
              className="relief-shape"
              d={shape.d}
              data-feature-id={shape.featureId}
              data-selected={isTarget && shape.featureId === selectedFeatureId}
              data-hovered={isTarget && shape.featureId === hovered}
              data-outcome={
                isTarget ? featureOutcomes[shape.featureId!] : undefined
              }
              role={answers ? 'button' : undefined}
              aria-label={isTarget ? NAME_OF.get(shape.featureId!) : undefined}
              aria-hidden={isTarget ? undefined : 'true'}
              tabIndex={answers ? 0 : -1}
              onFocus={answers ? () => setHoveredNodeId(shape.featureId!) : undefined}
              onBlur={answers ? () => setHoveredNodeId(null) : undefined}
              onKeyDown={
                answers
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(shape.featureId!);
                      }
                    }
                  : undefined
              }
            />,
          ];
        })}
      </g>

      {/*
        Границы регионов поверх ступеней. Без них физическая карта перестаёт
        связывать новый материал со старым: ученик видит рельеф, но не видит,
        где он. Геометрия та же, что у маски, — `<use>` на те же контуры,
        второй копии путей на карте не появляется.
      */}
      <g className="region-outlines" mask={`url(#${MASK_ID})`} aria-hidden="true">
        {regions.map((region) => (
          <use key={region.mapAreaId} href={`#${region.mapAreaId}`} />
        ))}
      </g>

      {/*
        Копия контура под штриховку исхода. Заливка нарисованной формы
        заменяется целиком: поставить ей `fill: url(#id)` — и ступень исчезнет,
        а между штрихами покажется область региона под слоем. Поэтому форма с
        исходом рисуется дважды. Копий не больше двух за вопрос: правильный
        объект и, если ученик промахнулся, выбранный.
      */}
      <g className="relief-outcomes" mask={`url(#${MASK_ID})`}>
        {RELIEF_SHAPES.filter(
          (shape) =>
            shape.featureId !== undefined &&
            featureOutcomes[shape.featureId] !== undefined,
        ).map((shape) => (
          <path
            key={shape.key}
            className="relief-outcome"
            d={shape.d}
            data-outcome={featureOutcomes[shape.featureId!]}
            aria-hidden="true"
          />
        ))}
      </g>

      {/*
        Реки не прячутся маской. Амур идёт ровно по границе, и под маской от
        линии оставалась половина толщины под штрихом границы — реки на карте
        не было. По рамке карты реки уже обрезаны генератором
        `generate:physical`; за границу страны они выходят намеренно — река не
        кончается на государственной границе, и так физические карты и рисуют.
      */}
      <g className="rivers">
        {WATER_LINES.map((line) => {
          const label = NAME_OF.get(line.featureId) ?? line.featureId;
          /*
           * Участок реки берёт состояние своей реки: он нарисован поверх неё и
           * своим обычным штрихом вырезал бы из подсвеченной линии бледную
           * выемку — ровно там, о чём вопрос.
           */
          const whole = partOfFeature(line.featureId);
          const selected =
            line.featureId === selectedFeatureId || whole === selectedFeatureId;
          const hoveredLine = line.featureId === hovered || whole === hovered;
          const outcome =
            featureOutcomes[line.featureId] ??
            (whole === undefined ? undefined : featureOutcomes[whole]);

          return (
            <g key={line.featureId} className="river">
              <path
                className="river-line"
                d={line.d}
                data-feature-id={line.featureId}
                data-selected={selected}
                data-hovered={hoveredLine}
                data-outcome={outcome}
                role={onSelect ? 'button' : undefined}
                aria-label={label}
                tabIndex={onSelect ? 0 : -1}
                onFocus={onSelect ? () => setHoveredNodeId(line.featureId) : undefined}
                onBlur={onSelect ? () => setHoveredNodeId(null) : undefined}
                onKeyDown={
                  onSelect
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(line.featureId);
                        }
                      }
                    : undefined
                }
              />
            </g>
          );
        })}
      </g>

      {/*
        Озеро — четыре узла. Контур заливает воду, но целью быть не может:
        24 px на опорной ширине это около 120 км, а Цинхай даёт 13 px. Целится
        ученик в знак, а невидимый круг вокруг него и принимает нажатие; когда
        круг отошёл от знака, их связывает поводок — как у города.
      */}
      <g className="lakes" mask={`url(#${MASK_ID})`}>
        {lakeMarks(zoom).map((mark) => {
          const shape = LAKE_SHAPES.find((item) => item.featureId === mark.featureId)!;
          const label = NAME_OF.get(mark.featureId) ?? mark.featureId;
          const answers = onSelect !== undefined;

          /*
           * Состояние стоит на группе, а не на знаке: помечаются оба узла
           * озера — контур воды и знак, — а держать один признак в двух
           * местах значит однажды их развести.
           */
          return (
            <g
              key={mark.featureId}
              className="lake"
              data-selected={mark.featureId === selectedFeatureId}
              data-hovered={mark.featureId === hovered}
            >
              <path className="lake-shape" d={shape.d} aria-hidden="true" />
              <circle
                className="lake-halo"
                cx={mark.x}
                cy={mark.y}
                r={LAKE_MARK_RADIUS * 3}
                data-feature-id={mark.featureId}
                data-outcome={featureOutcomes[mark.featureId]}
                aria-hidden="true"
              />
              {mark.hitX !== mark.x || mark.hitY !== mark.y ? (
                <line
                  className="lake-leader"
                  x1={mark.x}
                  y1={mark.y}
                  x2={mark.hitX}
                  y2={mark.hitY}
                  aria-hidden="true"
                />
              ) : null}
              <circle
                className="lake-hit"
                cx={mark.hitX}
                cy={mark.hitY}
                r={mark.radius}
                data-feature-id={mark.featureId}
                role={answers ? 'button' : undefined}
                aria-label={label}
                tabIndex={answers ? 0 : -1}
                onFocus={answers ? () => setHoveredNodeId(mark.featureId) : undefined}
                onBlur={answers ? () => setHoveredNodeId(null) : undefined}
                onKeyDown={
                  answers
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(mark.featureId);
                        }
                      }
                    : undefined
                }
              />
              <circle
                className="lake-mark"
                cx={mark.x}
                cy={mark.y}
                r={LAKE_MARK_RADIUS}
                aria-hidden="true"
              />
            </g>
          );
        })}
      </g>

      {/*
        Моря, залив и пролив. Маски суши здесь нет и быть не может: маска
        прячет ступени за границей Китая, а море за границей и живёт.

        Постоянных границ между морями не рисуется — вода остаётся ровной, и на
        карте не появляется ни одной линии, которой нет в природе (решение
        владельца продукта, вариант В макета). Контур показывается при
        наведении, фокусе и выборе — тем же правилом, что подпись.
      */}
      <g className="seas">
        {MARINE_SHAPES.map((shape) => {
          const label = NAME_OF.get(shape.featureId) ?? shape.featureId;
          const answers = onSelect !== undefined;

          return (
            <path
              key={shape.featureId}
              className="sea-shape"
              d={shape.d}
              data-feature-id={shape.featureId}
              data-outcome={featureOutcomes[shape.featureId]}
              data-selected={shape.featureId === selectedFeatureId}
              data-hovered={shape.featureId === hovered}
              role={answers ? 'button' : undefined}
              aria-label={answers ? label : undefined}
              aria-hidden={answers ? undefined : 'true'}
              tabIndex={answers ? 0 : -1}
              onFocus={answers ? () => setHoveredNodeId(shape.featureId) : undefined}
              onBlur={answers ? () => setHoveredNodeId(null) : undefined}
              onKeyDown={
                answers
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(shape.featureId);
                      }
                    }
                  : undefined
              }
            />
          );
        })}
      </g>

      {/*
        Крайние точки. Контура у них нет вовсе, поэтому знак — единственное,
        чем они на карте показаны; цель нажатия строится вокруг него, как у
        озера. Род читается формой знака: треугольник вверх у вершины, вниз и
        залитый — у впадины.

        Маски суши здесь нет, и это не небрежность: Джомолунгма стоит ровно на
        границе с Непалом, генерализованный контур карты кладёт её вершину на
        треть единицы наружу — и маска срезала бы знак у той самой цели, ради
        которой род заведён. Подписи по той же причине рисуются без маски.
      */}
      <g className="points">
        {pointMarks(zoom).map((mark) => {
          const label = NAME_OF.get(mark.featureId) ?? mark.featureId;
          const answers = onSelect !== undefined;
          const up = POINT_KIND_OF.get(mark.featureId) === 'peak';

          return (
            <g
              key={mark.featureId}
              className="point-mark"
              data-selected={mark.featureId === selectedFeatureId}
              data-hovered={mark.featureId === hovered}
            >
              <circle
                className="point-hit"
                cx={mark.hitX}
                cy={mark.hitY}
                r={mark.radius}
                data-feature-id={mark.featureId}
                data-outcome={featureOutcomes[mark.featureId]}
                role={answers ? 'button' : undefined}
                aria-label={label}
                tabIndex={answers ? 0 : -1}
                onFocus={answers ? () => setHoveredNodeId(mark.featureId) : undefined}
                onBlur={answers ? () => setHoveredNodeId(null) : undefined}
                onKeyDown={
                  answers
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(mark.featureId);
                        }
                      }
                    : undefined
                }
              />
              <path
                className="point-mark-shape"
                d={trianglePath(mark.x, mark.y, up)}
                data-point={up ? 'peak' : 'depression'}
                aria-hidden="true"
              />
            </g>
          );
        })}
      </g>

      {/*
        Подписи объектов — последними и без маски по границе.
        Без маски: «Великая Китайская равнина» длиннее самой равнины, и
        граница съедала у неё хвост. Последними: буквы не должны уходить под
        линию реки.

        Видна подпись у одного объекта за раз — при наведении, фокусе и
        выборе, как у городов. Постоянные подписи здесь не держатся: Тарим
        течёт по Таримской впадине, Хуанхэ идёт через Лёссовое плато, и имена
        накладываются друг на друга.
      */}
      <g className="physical-labels">
        {LABELLED.map((label) => (
          <text
            key={label.featureId}
            className="physical-label"
            x={label.x}
            y={label.y}
            data-feature-id={label.featureId}
            data-selected={label.featureId === selectedFeatureId}
            data-hovered={label.featureId === hovered}
            textAnchor="middle"
            aria-hidden="true"
          >
            {NAME_RU_OF.get(label.featureId)}
          </text>
        ))}
      </g>
    </g>
  );
}
