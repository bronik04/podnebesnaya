import { expect, it } from 'vitest';
import {
  CITY_CARD_IDS,
  HISTORY_CARD_IDS,
  LANDMARK_CARD_IDS,
  MODE_CARDS,
  roundTitle,
} from './exercise-modes';

/*
 * У физической карты набор выбирается перед стартом — от двадцати одной цели
 * до сорока одной, — и карточка не должна обещать одно число. Прежнее «12
 * объектов» пережило два пополнения справочника и вдвое занижало первый же
 * раунд.
 */
it('карточки физической карты не обещают числа объектов', () => {
  const physical = MODE_CARDS.filter((card) => card.kind === 'physical');

  expect(physical.length).toBeGreaterThan(0);
  for (const card of physical) {
    expect(card.volume).toMatch(/^Набор выбирается перед стартом/);
  }
});

/* Канал спрашивается наравне с реками, и описание игры обязано это сказать. */
it('описания игр физической карты называют канал', () => {
  for (const card of MODE_CARDS.filter((one) => one.kind === 'physical')) {
    expect(card.summary).toMatch(/канал/);
  }
});

/* Имя игры в шапке раунда берётся из карточки и её темы, а не пишется заново. */
it('имя игры над ходом раунда — тема и карточка', () => {
  expect(roundTitle('find-on-map')).toBe('Регионы · Найти регион');
  expect(roundTitle('history-order')).toBe('История · Расставить по порядку');
  expect(roundTitle('нет-такой')).toBe('');
});

it('у каждой формы вопроса городов, мест и истории есть своя карточка', () => {
  const ids = MODE_CARDS.map((card) => card.id);

  for (const id of [
    ...Object.values(CITY_CARD_IDS),
    ...Object.values(LANDMARK_CARD_IDS),
    ...Object.values(HISTORY_CARD_IDS),
  ]) {
    expect(ids).toContain(id);
  }
});

/*
 * «Найти на карте» и «Заполнить карту» — одна игра на разной сложности
 * (решение владельца от 2026-10-18): карточка одна, уровень — в окне.
 */
it('карточки «Заполнить карту» нет, а «Найти на карте» называется «Найти регион»', () => {
  expect(MODE_CARDS.some((card) => card.id === 'fill-map')).toBe(false);
  expect(MODE_CARDS.find((card) => card.id === 'find-on-map')?.title).toBe('Найти регион');
});

it('уровни есть ровно у пяти игр «Найти…»', () => {
  expect(
    MODE_CARDS.filter((card) => card.levels !== undefined).map((card) => card.id),
  ).toEqual(['find-on-map', 'find-country', 'find-city', 'find-physical', 'find-landmark']);
});
