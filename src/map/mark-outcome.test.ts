import { expect, it } from 'vitest';
import { clusterOutcome, markOutcomeOf, withOutcome } from './mark-outcome';

it('переводит исход заполнения в исход знака', () => {
  expect(markOutcomeOf('first-try')).toBe('correct');
  expect(markOutcomeOf('second-try')).toBe('second-try');
  expect(markOutcomeOf('failed')).toBe('incorrect');
});

it('приписывает исход к имени цели', () => {
  expect(withOutcome('Ухань, 武汉', undefined)).toBe('Ухань, 武汉');
  expect(withOutcome('Ухань, 武汉', 'second-try')).toBe(
    'Ухань, 武汉 — верно со второй попытки',
  );
});

it('гроздь за один ответ: верный член делает гроздь верной', () => {
  expect(clusterOutcome(['correct', undefined, 'incorrect'], false)).toBe('correct');
  expect(clusterOutcome([undefined, 'incorrect'], false)).toBe('incorrect');
  expect(clusterOutcome([undefined, undefined], false)).toBeUndefined();
});

it('гроздь за раунд: исход есть, только когда закрыты все члены, — худший', () => {
  expect(clusterOutcome(['correct', undefined], true)).toBeUndefined();
  expect(clusterOutcome(['correct', 'second-try'], true)).toBe('second-try');
  expect(clusterOutcome(['second-try', 'incorrect', 'correct'], true)).toBe('incorrect');
  expect(clusterOutcome(['correct', 'correct'], true)).toBe('correct');
});
