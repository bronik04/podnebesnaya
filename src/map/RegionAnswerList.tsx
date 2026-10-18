import type { Region } from '../content/types';
import type { RegionOutcome } from '../domain/fill-round';
import { OUTCOME_LABELS } from './outcome-labels';
import {
  isRegionClosed,
  isRegionSelectable,
  type AnswerState,
} from './region-selection';

const NO_ANSWER_STATES: Readonly<Record<string, AnswerState>> = {};
const NO_OUTCOMES: Readonly<Record<string, RegionOutcome>> = {};

export type RegionAnswerListProps = {
  readonly regions: readonly Region[];
  readonly selectedRegionId: string | null;
  readonly onSelect: (regionId: string) => void;
  readonly answerStates?: Readonly<Record<string, AnswerState>>;
  readonly outcomes?: Readonly<Record<string, RegionOutcome>>;
  readonly interactive?: boolean;
  readonly paused?: boolean;
};

/**
 * Список регионов рядом с картой для разглядывания (`usage="browse"`):
 * текстовая альтернатива той же карты. В раундах его нет: панель «Ответить из
 * списка» снята решением владельца от 2026-10-18 — там, где цель уже отмечена
 * на карте, ответ и так выбирается из вариантов, а где её ищут, список
 * подсказывал бы ответ. Карта раунда проходится с клавиатуры, и у каждой цели
 * есть имя для читалки экрана.
 */
export function RegionAnswerList({
  regions,
  selectedRegionId,
  onSelect,
  answerStates = NO_ANSWER_STATES,
  outcomes = NO_OUTCOMES,
  interactive = true,
  paused = false,
}: RegionAnswerListProps) {
  const rules = { interactive, paused, answerStates, outcomes };

  return (
    <ul className="map-alternative" aria-label="Список регионов карты">
      {regions.map((region) => {
        const outcome = outcomes[region.id];

        return (
          <li key={region.id}>
            <button
              type="button"
              aria-pressed={region.id === selectedRegionId}
              aria-disabled={paused ? true : undefined}
              data-outcome={outcome}
              disabled={isRegionClosed(rules, region.id)}
              onClick={() => {
                if (isRegionSelectable(rules, region.id)) {
                  onSelect(region.id);
                }
              }}
            >
              {region.nameRu} <span lang="zh-Hans">({region.nameZh})</span>
              {outcome ? ` — ${OUTCOME_LABELS[outcome]}` : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
