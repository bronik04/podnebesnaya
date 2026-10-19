import { expect, it } from 'vitest';
import type { QuestionLanguage } from '../../domain/question-language';
import type { Attempt, ExerciseType } from '../../domain/round';
import { nextStep } from './next-step';

const NOW = new Date('2026-08-04T12:00:00.000Z');

function attempt(
  regionId: string,
  roundId: string,
  isCorrect: boolean,
  exerciseType: ExerciseType = 'find-on-map',
  language: QuestionLanguage = 'ru',
  answeredAt: string = NOW.toISOString(),
): Attempt {
  return {
    questionId: `${roundId}-${regionId}`,
    roundId,
    target: { kind: 'region', id: regionId },
    exerciseType,
    language,
    isCorrect,
    durationMs: 1000,
    answeredAt,
  };
}

it('без истории предлагает начать с поиска на карте по всем регионам', () => {
  const step = nextStep([], NOW);

  expect(step.label).toBe('Начать: найти регион');
  expect(step.exerciseType).toBe('find-on-map');
  expect(step.language).toBe('ru');
  expect(step.regionIds).toBeNull();
});

it('при свежих ошибках предлагает повторить именно их', () => {
  const attempts = [
    attempt('hunan', 'r1', false),
    attempt('hubei', 'r1', false),
    attempt('sichuan', 'r1', true),
  ];

  const step = nextStep(attempts, NOW);

  expect(step.label).toBe('Повторить 2 региона');
  expect(step.regionIds).toEqual(['hunan', 'hubei']);
});

it('без ошибок продолжает игрой последнего раунда', () => {
  const attempts = [
    attempt('hunan', 'r1', true, 'find-on-map'),
    attempt('hubei', 'r2', true, 'match-pair'),
  ];

  const step = nextStep(attempts, NOW);

  expect(step.label).toBe('Продолжить: регион — столица');
  expect(step.exerciseType).toBe('match-pair');
  expect(step.regionIds).toBeNull();
});

it('ошибки старше окна повтора не тянут назад', () => {
  const old = new Date('2026-06-01T12:00:00.000Z').toISOString();
  const attempts = [
    attempt('hunan', 'r1', false, 'find-on-map', 'ru', old),
    attempt('hubei', 'r2', true, 'find-on-map'),
  ];

  expect(nextStep(attempts, NOW).label).toMatch(/^Продолжить/);
});

it('подпись и набор регионов считаются вместе, а не порознь', () => {
  const attempts = [attempt('hunan', 'r1', false)];
  const step = nextStep(attempts, NOW);

  expect(step.label).toBe('Повторить 1 регион');
  expect(step.regionIds).toHaveLength(1);
});

it('берёт язык последней попытки', () => {
  const attempts = [
    attempt('sichuan', 'r1', true, 'find-on-map'),
    attempt('gansu', 'r1', true, 'find-on-map', 'zh'),
  ];

  expect(nextStep(attempts, NOW).language).toBe('zh');
});

it('при пустой истории спрашивает по-русски', () => {
  expect(nextStep([], NOW).language).toBe('ru');
});

/*
 * Главный шаг — раунд по регионам. Чужой раунд не должен его подменять: у
 * династий форма `match-pair`, и, взяв её как «последнюю игру», кабинет
 * предложил бы «Регион — столица», которую ученик не выбирал.
 */
it('не берёт режим и язык из раунда по другим целям', () => {
  const region = attempt('hunan', 'r1', true, 'find-on-map', 'ru');
  const dynasty: Attempt = {
    ...attempt('tang', 'r2', true, 'match-pair', 'zh'),
    target: { kind: 'history', id: 'tang' },
  };

  const step = nextStep([region, dynasty], NOW);

  expect(step.exerciseType).toBe('find-on-map');
  expect(step.language).toBe('ru');
});
