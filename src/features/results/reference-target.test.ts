import { expect, it } from 'vitest';
import { referenceTargetOf } from './reference-target';

it('регион ведёт на свою карточку', () => {
  expect(referenceTargetOf('region', 'hubei')).toEqual({
    kind: 'region',
    regionId: 'hubei',
  });
});

it('объект физической карты ведёт на свою карточку', () => {
  expect(referenceTargetOf('physical', 'yellow-river')).toEqual({
    kind: 'feature',
    featureId: 'yellow-river',
  });
});

it('город ведёт на карточку своего региона', () => {
  expect(referenceTargetOf('city', 'wuhan')).toEqual({
    kind: 'region',
    regionId: 'hubei',
  });
});

it('достопримечательность ведёт на карточку своего региона', () => {
  expect(referenceTargetOf('landmark', 'potala')).toEqual({
    kind: 'region',
    regionId: 'tibet',
  });
});

it('у стран, династий и коллекций ссылки нет', () => {
  expect(referenceTargetOf('country', 'nepal')).toBeNull();
  expect(referenceTargetOf('history', 'tang')).toBeNull();
  expect(referenceTargetOf('collection', 'tea')).toBeNull();
});

it('неизвестный город ссылки не даёт', () => {
  expect(referenceTargetOf('city', 'atlantis')).toBeNull();
});
