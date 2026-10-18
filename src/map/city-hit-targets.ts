import { MIN_TARGET_PX, REFERENCE_MAP_WIDTH, pixelsToUnits } from './target-size';

/**
 * Цель нажатия города отделена от его знака.
 *
 * Знак стоит на настоящем месте — это география, и двигать её нельзя. Цель
 * нажатия обязана быть не меньше 24 px (WCAG 2.2, 2.5.8), а при опорной ширине
 * карты это около 17 единиц viewBox: между Шанхаем и Сучжоу их всего четыре,
 * и цели неизбежно накрыли бы друг друга. Поэтому цель может отойти от знака.
 *
 * Тот же приём уже применён к Гонконгу и Макао: контур декоративен, а маркер
 * вынесен в акваторию (`generate-callouts.ts`).
 *
 * Города и достопримечательности с этого приёма ушли: там, где объекты стоят
 * ближе цели, они собираются в гроздь и раскрываются лупой (`cluster.ts`).
 * Разведение осталось за озёрами и крайними точками (`lake-marks.ts`,
 * `point-marks.ts`): их восемь на всю карту, они друг с другом не спорят, и
 * менять работающее ради единообразия незачем — что закреплено тестами в обоих
 * файлах.
 */

/** Диаметр цели в единицах viewBox при опорной ширине карты. */
export const TARGET_DIAMETER_UNITS = pixelsToUnits(MIN_TARGET_PX, REFERENCE_MAP_WIDTH);

export type Placeable = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
};

export type HitTarget = {
  readonly id: string;
  /** Знак: настоящее место города. */
  readonly x: number;
  readonly y: number;
  /** Цель нажатия: то же место или отодвинутое от соседей. */
  readonly hitX: number;
  readonly hitY: number;
  readonly radius: number;
};

/**
 * Кольца и направления, по которым цель ищет свободное место. Отходить дальше
 * трёх диаметров бессмысленно: цель, уехавшая от своего знака на полтора
 * сантиметра, перестаёт быть его целью — в такой тесноте работает гроздь,
 * приближающая карту, а не разведение целей.
 */
const RINGS = [1, 1.5, 2, 2.5, 3];
const DIRECTIONS = 12;

/**
 * Раздвигает цели так, чтобы они не накрывали друг друга. Порядок входа —
 * порядок важности: первый город остаётся на месте, отходят следующие.
 *
 * Отход — не расталкивание, а поиск свободного места по кольцам вокруг знака.
 * Расталкивание на этой задаче не сходится: три города в ряд гасят толчки друг
 * друга, и средний топчется между соседями. Перебор колец даёт то же «отойти
 * недалеко и наружу», но заканчивается всегда и одинаково при каждом запуске —
 * иначе карта переставляла бы цели между перерисовками.
 */
export function spreadHitTargets(
  points: readonly Placeable[],
  diameter: number = TARGET_DIAMETER_UNITS,
): readonly HitTarget[] {
  const placed: HitTarget[] = [];

  function isFree(x: number, y: number): boolean {
    return placed.every(
      (other) => Math.hypot(other.hitX - x, other.hitY - y) >= diameter,
    );
  }

  for (const point of points) {
    let hitX = point.x;
    let hitY = point.y;

    if (!isFree(hitX, hitY)) {
      search: for (const ring of RINGS) {
        for (let step = 0; step < DIRECTIONS; step += 1) {
          const angle = (step * 2 * Math.PI) / DIRECTIONS;
          const x = point.x + Math.sin(angle) * ring * diameter;
          const y = point.y - Math.cos(angle) * ring * diameter;

          if (isFree(x, y)) {
            hitX = x;
            hitY = y;
            break search;
          }
        }
      }
    }

    placed.push({
      id: point.id,
      x: point.x,
      y: point.y,
      hitX,
      hitY,
      radius: diameter / 2,
    });
  }

  return placed;
}

/** Пары целей, которые всё же остались ближе диаметра друг к другу. */
export function overlappingTargets(
  targets: readonly HitTarget[],
  diameter: number = TARGET_DIAMETER_UNITS,
): readonly (readonly [string, string])[] {
  const pairs: (readonly [string, string])[] = [];

  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      const distance = Math.hypot(
        targets[i].hitX - targets[j].hitX,
        targets[i].hitY - targets[j].hitY,
      );

      if (distance < diameter) {
        pairs.push([targets[i].id, targets[j].id]);
      }
    }
  }

  return pairs;
}
