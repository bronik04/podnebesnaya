import type { RegionOutcome } from '../domain/fill-round';

/**
 * Исход ответа по цели вне карты регионов — стране, городу, объекту
 * физической карты, звезде. На сложном уровне их два: верный ответ и
 * ошибочный выбор ученика; на лёгком к ним добавляется «со второй попытки».
 * Считает его раунд, а не карта: карта не знает, что верно.
 */
export type MarkOutcome = 'correct' | 'second-try' | 'incorrect';

const FROM_REGION_OUTCOME: Readonly<Record<RegionOutcome, MarkOutcome>> = {
  'first-try': 'correct',
  'second-try': 'second-try',
  failed: 'incorrect',
};

/** Исход заполнения — в исход знака: так лёгкий уровень красит не регионы. */
export function markOutcomeOf(outcome: RegionOutcome): MarkOutcome {
  return FROM_REGION_OUTCOME[outcome];
}

/*
 * Слова без рода: «Монголия — верно», «Ухань — верно». И без «не найден»:
 * на сложном уровне `incorrect` стоит на выборе ученика, а не на искомой цели.
 */
const LABELS: Readonly<Record<MarkOutcome, string>> = {
  correct: 'верно',
  'second-try': 'верно со второй попытки',
  incorrect: 'ошибка',
};

/**
 * Имя цели с исходом. Исход обязан быть доступен не только цветом (AGENTS.md):
 * без слова программа чтения с экрана не отличит закрытую цель от открытой.
 */
export function withOutcome(label: string, outcome: MarkOutcome | undefined): string {
  return outcome === undefined ? label : `${label} — ${LABELS[outcome]}`;
}

const SEVERITY: readonly MarkOutcome[] = ['incorrect', 'second-try', 'correct'];

/**
 * Исход грозди — одной цели из нескольких членов.
 *
 * За один ответ (`accumulates` ложно, сложный уровень) исходов у членов не
 * больше двух: верный член делает гроздь верной — нажатие по ней и было
 * верным ответом, — иначе ошибочный член делает её ошибочной.
 *
 * За раунд (лёгкий уровень) исходы копятся, и гроздь получает исход, только
 * когда закрыты все её члены: пока хоть один открыт, гроздь ещё цель. Исход —
 * худший из членов.
 */
export function clusterOutcome(
  memberOutcomes: readonly (MarkOutcome | undefined)[],
  accumulates: boolean,
): MarkOutcome | undefined {
  if (!accumulates) {
    return memberOutcomes.includes('correct')
      ? 'correct'
      : memberOutcomes.includes('incorrect')
        ? 'incorrect'
        : undefined;
  }

  if (memberOutcomes.length === 0 || memberOutcomes.includes(undefined)) {
    return undefined;
  }

  return SEVERITY.find((outcome) => memberOutcomes.includes(outcome));
}
