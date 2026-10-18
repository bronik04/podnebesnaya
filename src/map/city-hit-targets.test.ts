import { CITY_POINTS } from './city-points';
import {
  overlappingTargets,
  spreadHitTargets,
  TARGET_DIAMETER_UNITS,
} from './city-hit-targets';

it('оставляет одиночную цель на месте знака', () => {
  const [target] = spreadHitTargets([{ id: 'lhasa', x: 100, y: 100 }]);

  expect([target.hitX, target.hitY]).toEqual([100, 100]);
});

it('не двигает знак, когда двигает цель', () => {
  const targets = spreadHitTargets([
    { id: 'shanghai', x: 100, y: 100 },
    { id: 'suzhou', x: 104, y: 100 },
  ]);

  expect(targets.map((target) => [target.x, target.y])).toEqual([
    [100, 100],
    [104, 100],
  ]);
  expect(Math.hypot(targets[1].hitX - 104, targets[1].hitY - 100)).toBeGreaterThan(0);
  expect(overlappingTargets(targets)).toEqual([]);
});

it('разводит близкие цели на диаметр', () => {
  const targets = spreadHitTargets([
    { id: 'shanghai', x: 100, y: 100 },
    { id: 'suzhou', x: 104, y: 100 },
    { id: 'wuxi', x: 108, y: 100 },
  ]);

  expect(overlappingTargets(targets)).toEqual([]);
});

/*
 * Точки, совпавшие ровно, не должны раскидываться случайно: карта, которая
 * переставляет цели между перерисовками, хуже карты с одной неудобной целью.
 */
it('разводит совпавшие точки одинаково при каждом запуске', () => {
  const same = [
    { id: 'first', x: 50, y: 50 },
    { id: 'second', x: 50, y: 50 },
  ];

  expect(spreadHitTargets(same)).toEqual(spreadHitTargets(same));
  expect(overlappingTargets(spreadHitTargets(same))).toEqual([]);
});

it('держит цель не меньше минимума WCAG', () => {
  const [target] = spreadHitTargets([{ id: 'lhasa', x: 100, y: 100 }]);

  expect(target.radius * 2).toBeCloseTo(TARGET_DIAMETER_UNITS);
});

/*
 * На настоящем каталоге проверяется не «ни одного наложения» — дельта
 * Жемчужной реки его не допускает, — а что их мало и они названы. Всё
 * остальное решает гроздь, приближающая карту (`cluster.ts`).
 */
it('разводит почти все города настоящего каталога', () => {
  const targets = spreadHitTargets(
    CITY_POINTS.map((point) => ({ id: point.city.id, x: point.x, y: point.y })),
  );
  const left = overlappingTargets(targets);

  expect(left.length, left.map((pair) => pair.join('—')).join(', ')).toBeLessThanOrEqual(2);
});

/*
 * Увеличение — тоже способ развести цели: те же 24 px на экране занимают
 * меньше единиц карты, и города, которых на целом виде пришлось отодвигать,
 * встают на свои места.
 */
it('на увеличении отодвигает меньше целей', () => {
  const points = CITY_POINTS.map((point) => ({
    id: point.city.id,
    x: point.x,
    y: point.y,
  }));
  const displaced = (diameter: number) =>
    spreadHitTargets(points, diameter).filter(
      (target) => Math.hypot(target.hitX - target.x, target.hitY - target.y) > 0.01,
    ).length;

  expect(displaced(TARGET_DIAMETER_UNITS / 1.5)).toBeLessThan(
    displaced(TARGET_DIAMETER_UNITS),
  );
});
