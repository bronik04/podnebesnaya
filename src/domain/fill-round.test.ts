import { regions } from '../content/regions';
import {
  answerFillRound,
  createFillRound,
  currentTarget,
  isFillRoundFinished,
  summariseFillRound,
  type FillRound,
} from './fill-round';
import { createSeededRandom } from './random';

function newRound(): FillRound {
  return createFillRound(regions, {
    roundId: 'r1',
    language: 'ru',
    random: createSeededRandom(1),
  });
}

const INPUT = { durationMs: 1000, answeredAt: '2026-08-04T10:00:00.000Z' };

/** Отвечает верно на текущий регион. */
function answerCorrectly(round: FillRound) {
  return answerFillRound(round, {
    ...INPUT,
    answeredId: currentTarget(round).targetId,
  });
}

/** Отвечает заведомо неверно: берёт любой регион, кроме спрошенного. */
function answerWrongly(round: FillRound) {
  const target = currentTarget(round).targetId;
  const other = regions.find((region) => region.id !== target)!;

  return answerFillRound(round, { ...INPUT, answeredId: other.id });
}

it('спрашивает все 34 региона', () => {
  expect(newRound().order).toHaveLength(34);
});

it('закрашивает зелёным ответ с первой попытки', () => {
  const round = newRound();
  const target = currentTarget(round).targetId;
  const { round: next, move } = answerCorrectly(round);

  expect(move).toEqual({ kind: 'closed', outcome: 'first-try', wasFound: true });
  expect(next.outcomes[target]).toBe('first-try');
});

it('закрашивает жёлтым ответ со второй попытки', () => {
  const round = newRound();
  const target = currentTarget(round).targetId;
  const { round: afterMiss, move: miss } = answerWrongly(round);

  expect(miss).toEqual({ kind: 'retry', attemptsLeft: 2 });

  const { round: next, move } = answerCorrectly(afterMiss);

  expect(move).toEqual({ kind: 'closed', outcome: 'second-try', wasFound: true });
  expect(next.outcomes[target]).toBe('second-try');
});

it('закрашивает красным ответ с третьей попытки', () => {
  let round = newRound();
  const target = currentTarget(round).targetId;
  round = answerWrongly(round).round;
  round = answerWrongly(round).round;
  const { round: next, move } = answerCorrectly(round);

  expect(move).toEqual({ kind: 'closed', outcome: 'failed', wasFound: true });
  expect(next.outcomes[target]).toBe('failed');
});

it('закрашивает красным исчерпанные попытки и помечает, что регион не найден', () => {
  let round = newRound();
  const target = currentTarget(round).targetId;
  round = answerWrongly(round).round;
  round = answerWrongly(round).round;
  const { round: next, move } = answerWrongly(round);

  expect(move).toEqual({ kind: 'closed', outcome: 'failed', wasFound: false });
  expect(next.outcomes[target]).toBe('failed');
});

it('промах по чужому региону не закрывает его', () => {
  const round = newRound();
  const target = currentTarget(round).targetId;
  const other = regions.find((region) => region.id !== target)!;
  const { round: next } = answerFillRound(round, {
    ...INPUT,
    answeredId: other.id,
  });

  expect(next.outcomes[other.id]).toBeUndefined();
});

it('после закрытия региона спрашивает следующий', () => {
  const round = newRound();
  const first = currentTarget(round).targetId;
  const { round: next } = answerCorrectly(round);

  expect(currentTarget(next).targetId).not.toBe(first);
  expect(next.usedAttempts).toBe(0);
});

it('пишет ровно одну попытку на регион', () => {
  let round = newRound();
  round = answerWrongly(round).round;
  round = answerWrongly(round).round;
  round = answerCorrectly(round).round;

  expect(round.attempts).toHaveLength(1);
});

it('считает попытку верной только для ответа с первой', () => {
  const first = answerCorrectly(newRound()).round;

  expect(first.attempts[0].isCorrect).toBe(true);

  let second = newRound();
  second = answerWrongly(second).round;
  second = answerCorrectly(second).round;

  expect(second.attempts[0].isCorrect).toBe(false);
});

it('заканчивается ровно на 34 закрытых регионах', () => {
  let round = newRound();

  expect(isFillRoundFinished(round)).toBe(false);
  for (let i = 0; i < 34; i += 1) {
    round = answerCorrectly(round).round;
  }

  expect(isFillRoundFinished(round)).toBe(true);
  expect(Object.keys(round.outcomes)).toHaveLength(34);
});

it('запрещает отвечать на законченный раунд', () => {
  let round = newRound();
  for (let i = 0; i < 34; i += 1) {
    round = answerCorrectly(round).round;
  }

  expect(() =>
    answerFillRound(round, { ...INPUT, answeredId: 'sichuan' }),
  ).toThrow(/Раунд завершён/);
});

it('собирает итог по исходам', () => {
  let round = newRound();
  round = answerCorrectly(round).round;
  round = answerWrongly(round).round;
  round = answerCorrectly(round).round;
  for (let i = 0; i < 32; i += 1) {
    round = answerCorrectly(round).round;
  }

  const summary = summariseFillRound(round);

  expect(summary.total).toBe(34);
  expect(summary.firstTry).toBe(33);
  expect(summary.secondTry).toBe(1);
  expect(summary.failed).toBe(0);
  expect(summary.idsToReview).toHaveLength(1);
});

it('в итоге незаконченного раунда нет ещё не спрошенных регионов', () => {
  // Итог считается и по ходу раунда — например, для счётчика на экране.
  // Регион без исхода не «стоит повторить», его просто ещё не спрашивали.
  const round = answerCorrectly(newRound()).round;
  const summary = summariseFillRound(round);

  expect(summary.total).toBe(1);
  expect(summary.idsToReview).toEqual([]);
});

/*
 * Лёгкий уровень игр «Найти…» (решение владельца от 2026-10-18) — тот же ход
 * заполнения, но по странам, городам, объектам и местам: попытка пишется с
 * видом цели раунда, иначе ошибки разных игр смешались бы в одном повторе.
 */
it('пишет попытку с видом цели раунда', () => {
  const round = createFillRound([{ id: 'nepal' }], {
    roundId: 'r',
    language: 'ru',
    random: createSeededRandom(1),
    targetKind: 'country',
  });

  const { round: next } = answerFillRound(round, { ...INPUT, answeredId: 'nepal' });

  expect(next.attempts[0].target).toEqual({ kind: 'country', id: 'nepal' });
  expect(next.attempts[0].isCorrect).toBe(true);
});

it('без вида цели раунд — по регионам', () => {
  const round = createFillRound([{ id: 'hubei' }], {
    roundId: 'r',
    language: 'ru',
    random: createSeededRandom(1),
  });

  const { round: next } = answerFillRound(round, { ...INPUT, answeredId: 'hubei' });

  expect(next.attempts[0].target.kind).toBe('region');
});

it('idsToReview — всё, что не с первой попытки, в порядке опроса', () => {
  let round = createFillRound([{ id: 'a' }, { id: 'b' }], {
    roundId: 'r',
    language: 'ru',
    random: createSeededRandom(1),
    targetKind: 'city',
  });
  const first = currentTarget(round).targetId;
  const other = first === 'a' ? 'b' : 'a';

  round = answerFillRound(round, { ...INPUT, answeredId: other }).round;
  round = answerFillRound(round, { ...INPUT, answeredId: other }).round;
  round = answerFillRound(round, { ...INPUT, answeredId: first }).round;
  round = answerFillRound(round, { ...INPUT, answeredId: other }).round;

  expect(summariseFillRound(round).idsToReview).toEqual([first]);
});
