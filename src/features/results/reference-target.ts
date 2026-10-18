import { cityById } from '../../content/cities';
import { landmarkById } from '../../content/landmarks';
import type { TargetKind } from '../../domain/round';

/**
 * Карточка справочника, на которую ведёт ссылка «В справочник» у ошибки на
 * итогах раунда (решение владельца от 2026-10-18).
 */
export type ReferenceTarget =
  | { readonly kind: 'region'; readonly regionId: string }
  | { readonly kind: 'feature'; readonly featureId: string };

/**
 * Регион открывает свою карточку в атласе, объект физической карты — свою на
 * физическом виде, город и достопримечательность — карточку своего региона.
 * У стран, династий и коллекций карточек нет — `null`, и ссылки нет.
 *
 * Чистая функция, а не ветка в `App`: сопоставление проверяется таблицей, без
 * прохождения раунда.
 */
export function referenceTargetOf(
  kind: TargetKind,
  targetId: string,
): ReferenceTarget | null {
  if (kind === 'physical') {
    return { kind: 'feature', featureId: targetId };
  }

  const regionId =
    kind === 'region'
      ? targetId
      : kind === 'city'
        ? cityById(targetId)?.regionId
        : kind === 'landmark'
          ? landmarkById(targetId)?.regionId
          : undefined;

  return regionId === undefined ? null : { kind: 'region', regionId };
}
