/**
 * Правила выбираемости региона на карте: какая область ещё принимает ответ,
 * а какая уже закрыта или ждёт конца паузы показа.
 */
import type { RegionOutcome } from '../domain/fill-round';

export type AnswerState = 'correct' | 'incorrect' | 'disabled';

export type RegionSelectionRules = {
  readonly interactive: boolean;
  readonly paused: boolean;
  readonly answerStates: Readonly<Record<string, AnswerState>>;
  readonly outcomes: Readonly<Record<string, RegionOutcome>>;
};

/**
 * Регион своё отыграл: он либо уже отвечен (второй ответ на вопрос запрещён,
 * SPEC.md), либо закрашен в игровом режиме. Повторное нажатие не должно
 * стоить попытки на текущем вопросе.
 */
export function isRegionClosed(
  rules: RegionSelectionRules,
  regionId: string,
): boolean {
  return (
    rules.answerStates[regionId] !== undefined ||
    rules.outcomes[regionId] !== undefined
  );
}

/**
 * Пауза входит сюда, но не в `isRegionClosed`. Разница нужна кнопкам списка:
 * выключать их на паузе через `disabled` значило бы сбросить фокус
 * клавиатуры, поэтому кнопка остаётся включённой и просто не отвечает.
 */
export function isRegionSelectable(
  rules: RegionSelectionRules,
  regionId: string,
): boolean {
  return rules.interactive && !rules.paused && !isRegionClosed(rules, regionId);
}
