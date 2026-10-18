import { shuffle } from './random';
import type { QuestionLanguage } from './question-language';

/**
 * Форма вопроса, а не его цель: найти по имени, назвать по месту, связать с
 * другим каталогом. Одинакова для регионов и городов, поэтому в названии нет
 * ни региона, ни столицы.
 */
export type ExerciseType = 'find-on-map' | 'name-target' | 'match-pair';

/**
 * Вид цели. Регионы, города, объекты физической географии, династии и
 * коллекции — разные наборы: «путает Ланьчжоу с Синином» не должно смешиваться ни с «не знает
 * Ганьсу», ни с «не знает Хуанхэ», поэтому вид входит в саму цель, а не
 * выводится из идентификатора. `beijing` существует и как регион, и как
 * город; `qin` — и как династия, и как хребет Циньлин по соседству.
 */
export type TargetKind =
  | 'region'
  | 'city'
  | 'physical'
  | 'history'
  | 'collection'
  | 'landmark'
  /*
   * Вид игры «Соседи региона», снятой решением владельца от 2026-10-18. Новых
   * целей этого вида не появляется, но в сохранённой истории попыток они
   * остаются, и тип обязан их описывать.
   */
  | 'neighbours'
  | 'country';

export type Target = {
  readonly kind: TargetKind;
  readonly id: string;
};

export function regionTarget(id: string): Target {
  return { kind: 'region', id };
}

/**
 * Цель игр по сопредельным государствам. Отдельный вид: «не знает, где
 * Казахстан» — не то же, что «не знает, где Синьцзян», и ошибки не должны
 * смешиваться в повторе.
 */
export function countryTarget(id: string): Target {
  return { kind: 'country', id };
}

export function cityTarget(id: string): Target {
  return { kind: 'city', id };
}

export function physicalTarget(id: string): Target {
  return { kind: 'physical', id };
}

export function historyTarget(id: string): Target {
  return { kind: 'history', id };
}

export function collectionTarget(id: string): Target {
  return { kind: 'collection', id };
}

export function landmarkTarget(id: string): Target {
  return { kind: 'landmark', id };
}

/** Ключ для группировки: `Map` не умеет сравнивать объекты по значению. */
export function targetKey(target: Target): string {
  return `${target.kind}:${target.id}`;
}

export function sameTarget(left: Target, right: Target): boolean {
  return left.kind === right.kind && left.id === right.id;
}

/**
 * SPEC.md описывает последовательность ready → answered → feedback → next.
 * Наблюдаемых состояний два: между регистрацией ответа и показом обратной
 * связи в MVP ничего не происходит (решение от 2026-08-03).
 */
export type QuestionStatus = 'ready' | 'feedback';

export type Question = {
  readonly id: string;
  readonly roundId: string;
  readonly target: Target;
  readonly exerciseType: ExerciseType;
  readonly language: QuestionLanguage;
};

export type Attempt = {
  readonly questionId: string;
  readonly roundId: string;
  readonly target: Target;
  readonly exerciseType: ExerciseType;
  readonly language: QuestionLanguage;
  readonly isCorrect: boolean;
  readonly durationMs: number;
  readonly answeredAt: string;
};

export type Round = {
  readonly questions: readonly Question[];
  readonly currentIndex: number;
  readonly status: QuestionStatus;
  readonly attempts: readonly Attempt[];
};

export type RoundOptions = {
  readonly roundId: string;
  /** Больше одного типа — смешанный раунд: типы чередуются (EXERCISES.md). */
  readonly exerciseTypes: readonly ExerciseType[];
  readonly language: QuestionLanguage;
  readonly random: () => number;
};

export type AnswerInput = {
  /**
   * Что выбрал ученик. Строка, а не цель: в играх по городам ответом бывает
   * регион, а не тот же вид, что у вопроса, и правило сравнения тогда
   * переезжает в саму игру.
   */
  readonly answeredId: string;
  /**
   * Чем считать верный ответ, когда он не того же вида, что цель. В игре
   * «город — регион» спрашивают город, а отвечают нажатием по области, и
   * сравнивать ответ с идентификатором города бессмысленно. Не задано —
   * сравнение с самой целью, как во всех остальных играх.
   */
  readonly expectedId?: string;
  readonly durationMs: number;
  readonly answeredAt: string;
};

/** Раунд по всем целям темы: каждая ровно один раз, порядок перемешан. */
export function createRound(
  targets: readonly Target[],
  options: RoundOptions,
): Round {
  if (targets.length === 0) {
    throw new Error('Раунд не создан: нет целей');
  }

  if (options.exerciseTypes.length === 0) {
    throw new Error('Раунд не создан: не заданы типы заданий');
  }

  const questions = shuffle(targets, options.random).map((target, index) => ({
    id: `${index + 1}-${target.id}`,
    roundId: options.roundId,
    target,
    exerciseType: options.exerciseTypes[index % options.exerciseTypes.length],
    language: options.language,
  }));

  return { questions, currentIndex: 0, status: 'ready', attempts: [] };
}

export function isRoundFinished(round: Round): boolean {
  return round.currentIndex >= round.questions.length;
}

export function currentQuestion(round: Round): Question {
  const question = round.questions[round.currentIndex];
  if (!question) {
    throw new Error('Раунд завершён: текущего вопроса нет');
  }

  return question;
}

export function answerQuestion(round: Round, input: AnswerInput): Round {
  if (round.status !== 'ready') {
    throw new Error('Повторный ответ на вопрос запрещён');
  }

  const question = currentQuestion(round);
  const attempt: Attempt = {
    questionId: question.id,
    roundId: question.roundId,
    target: question.target,
    exerciseType: question.exerciseType,
    language: question.language,
    isCorrect: input.answeredId === (input.expectedId ?? question.target.id),
    durationMs: input.durationMs,
    answeredAt: input.answeredAt,
  };

  return { ...round, status: 'feedback', attempts: [...round.attempts, attempt] };
}

export function goToNextQuestion(round: Round): Round {
  if (round.status !== 'feedback') {
    throw new Error('Переход к следующему вопросу возможен только после ответа');
  }

  return { ...round, currentIndex: round.currentIndex + 1, status: 'ready' };
}
