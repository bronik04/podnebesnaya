import { shuffle } from './random';
import type { QuestionLanguage } from './question-language';
import type { Attempt, TargetKind } from './round';

/**
 * Раунд-заполнение карты: каждый регион остаётся в игре, пока не закрыт, и
 * закрашивается тем цветом, который заслужил.
 *
 * Отдельный модуль, а не расширение `round.ts`: там действует инвариант
 * «повторный ответ на вопрос запрещён», и снимать его ради этого режима
 * значило бы ослабить три работающих.
 */

export const MAX_ATTEMPTS_PER_REGION = 3;

export type RegionOutcome = 'first-try' | 'second-try' | 'failed';

export type FillQuestion = {
  readonly id: string;
  readonly roundId: string;
  readonly targetId: string;
  readonly language: QuestionLanguage;
};

export type FillRound = {
  readonly roundId: string;
  /** Вид целей раунда: им помечается каждая попытка. */
  readonly targetKind: TargetKind;
  readonly language: QuestionLanguage;
  readonly order: readonly FillQuestion[];
  readonly currentIndex: number;
  /** Потрачено попыток на текущий регион: 0, 1 или 2. */
  readonly usedAttempts: number;
  readonly outcomes: Readonly<Record<string, RegionOutcome>>;
  readonly attempts: readonly Attempt[];
};

/**
 * «Угадал» и «каким цветом закрасить» — разные вещи: верный ответ с третьей
 * попытки закрывает регион красным. Поэтому исход хода несёт и то и другое.
 */
export type Move =
  | { readonly kind: 'retry'; readonly attemptsLeft: 1 | 2 }
  | {
      readonly kind: 'closed';
      readonly outcome: RegionOutcome;
      /** Ложь — попытки кончились, регион так и не нашли. */
      readonly wasFound: boolean;
    };

export type FillAnswerInput = {
  readonly answeredId: string;
  /** Время на регион целиком, со всеми попытками. */
  readonly durationMs: number;
  readonly answeredAt: string;
};

export type FillRoundOptions = {
  readonly roundId: string;
  readonly language: QuestionLanguage;
  readonly random: () => number;
  /**
   * Вид целей: регионы, страны, города, объекты, места. Не задан — регионы,
   * как в прежней «Заполнить карту».
   */
  readonly targetKind?: TargetKind;
};

export type FillSummary = {
  readonly total: number;
  readonly firstTry: number;
  readonly secondTry: number;
  readonly failed: number;
  readonly durationMs: number;
  readonly idsToReview: readonly string[];
};

export function createFillRound(
  targets: readonly { readonly id: string }[],
  options: FillRoundOptions,
): FillRound {
  if (targets.length === 0) {
    throw new Error('Раунд не создан: нет целей');
  }

  const order = shuffle(targets, options.random).map((target, index) => ({
    id: `${index + 1}-${target.id}`,
    roundId: options.roundId,
    targetId: target.id,
    language: options.language,
  }));

  return {
    roundId: options.roundId,
    targetKind: options.targetKind ?? 'region',
    language: options.language,
    order,
    currentIndex: 0,
    usedAttempts: 0,
    outcomes: {},
    attempts: [],
  };
}

export function isFillRoundFinished(round: FillRound): boolean {
  return round.currentIndex >= round.order.length;
}

export function currentTarget(round: FillRound): FillQuestion {
  const question = round.order[round.currentIndex];
  if (!question) {
    throw new Error('Раунд завершён: текущего вопроса нет');
  }

  return question;
}

function outcomeFor(usedAttempts: number): RegionOutcome {
  if (usedAttempts === 0) {
    return 'first-try';
  }

  return usedAttempts === 1 ? 'second-try' : 'failed';
}

export function answerFillRound(
  round: FillRound,
  input: FillAnswerInput,
): { readonly round: FillRound; readonly move: Move } {
  if (isFillRoundFinished(round)) {
    throw new Error('Раунд завершён: отвечать не на что');
  }

  const question = currentTarget(round);
  const isCorrect = input.answeredId === question.targetId;
  const isLastAttempt = round.usedAttempts >= MAX_ATTEMPTS_PER_REGION - 1;

  // Промах, пока попытки есть: регион остаётся открытым, попытка списывается
  // со спрошенного региона, а нажатый не трогается — его ещё спросят.
  if (!isCorrect && !isLastAttempt) {
    const attemptsLeft = (MAX_ATTEMPTS_PER_REGION -
      round.usedAttempts -
      1) as 1 | 2;

    return {
      round: { ...round, usedAttempts: round.usedAttempts + 1 },
      move: { kind: 'retry', attemptsLeft },
    };
  }

  const outcome = isCorrect ? outcomeFor(round.usedAttempts) : 'failed';
  const attempt: Attempt = {
    questionId: question.id,
    roundId: question.roundId,
    target: { kind: round.targetKind, id: question.targetId },
    exerciseType: 'find-on-map',
    language: question.language,
    // «Освоил» значит «берёт с первой». Ответ со второй попадает в повтор.
    isCorrect: outcome === 'first-try',
    durationMs: input.durationMs,
    answeredAt: input.answeredAt,
  };

  return {
    round: {
      ...round,
      currentIndex: round.currentIndex + 1,
      usedAttempts: 0,
      outcomes: { ...round.outcomes, [question.targetId]: outcome },
      attempts: [...round.attempts, attempt],
    },
    move: { kind: 'closed', outcome, wasFound: isCorrect },
  };
}

export function summariseFillRound(round: FillRound): FillSummary {
  const values = Object.values(round.outcomes);

  return {
    total: values.length,
    firstTry: values.filter((outcome) => outcome === 'first-try').length,
    secondTry: values.filter((outcome) => outcome === 'second-try').length,
    failed: values.filter((outcome) => outcome === 'failed').length,
    durationMs: round.attempts.reduce(
      (sum, attempt) => sum + attempt.durationMs,
      0,
    ),
    /*
     * Порядок повтора — порядок опроса. Регион без исхода ещё не спрашивали,
     * поэтому он не «стоит повторить»: итог считается и по ходу раунда.
     *
     * Длина списка ограничена той же константой, что и в `summariseRound`:
     * иначе два экрана итогов в одном приложении вели бы себя по-разному, а
     * на слабом раунде список вытолкнул бы кнопки далеко за экран.
     */
    idsToReview: round.order
      .map((question) => question.targetId)
      .filter((targetId) => {
        const outcome = round.outcomes[targetId];

        return outcome !== undefined && outcome !== 'first-try';
      }),
  };
}
