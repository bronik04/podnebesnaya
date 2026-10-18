import type { RegionOutcome } from '../domain/fill-round';

/**
 * Исход обязан быть доступен не только цветом: с программой чтения с экрана
 * ученик иначе не отличит закрашенный регион от ещё не спрошенного
 * (AGENTS.md: карта должна иметь текстовые альтернативы и не полагаться
 * только на цвет).
 */
export const OUTCOME_LABELS: Readonly<Record<RegionOutcome, string>> = {
  'first-try': 'взят с первой попытки',
  'second-try': 'взят со второй попытки',
  failed: 'не угадан',
};
