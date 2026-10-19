import type { ReactNode } from 'react';
import { regions } from '../../content/regions';
import { regionsWord } from '../../content/region-count';
import { summariseFillRound, type FillRound } from '../../domain/fill-round';
import { ChinaMap } from '../../map/ChinaMap';
import { formatDuration } from './format-duration';
import { OutcomeSwatch } from './OutcomeSwatch';
import type { NamedTarget } from './RoundResultsPage';

export type FillMapResultsPageProps = {
  readonly round: FillRound;
  /** Справочник целей раунда: из него берутся имена в списке «Стоит повторить». */
  readonly targets: readonly NamedTarget[];
  /**
   * Карта исходов. У регионов — `FillOutcomesMap`; у прочих целей не задана:
   * исход по точке карта итогов пока не показывает, и итог идёт одной колонкой.
   */
  readonly roundMap?: ReactNode;
  /** Как склонять число целей. */
  readonly countWord?: (count: number) => string;
  /** Куда ведёт «В справочник» у ошибки; не задано — ссылок нет. */
  readonly referenceOf?: (targetId: string) => (() => void) | null;
  readonly isProgressSaved: boolean;
  readonly onRepeatMistakes: () => void;
  readonly onNewRound: () => void;
  readonly onExit: () => void;
};

/**
 * Итог — сама заполненная карта. Числовая разбивка рядом не украшает: три
 * цвета исхода не могут попарно давать 3:1 (см. tokens.css), и текст —
 * равнозначная подача того же результата без цвета.
 */
export function FillMapResultsPage({
  round,
  targets,
  roundMap,
  countWord = regionsWord,
  referenceOf,
  isProgressSaved,
  onRepeatMistakes,
  onNewRound,
  onExit,
}: FillMapResultsPageProps) {
  const summary = summariseFillRound(round);
  const reviewRegions = summary.idsToReview.flatMap(
    (targetId) => targets.find((target) => target.id === targetId) ?? [],
  );

  /*
   * Подпись кнопки считается из того же списка, что показан рядом. Прежде
   * набор приходил извне и был шире: экран говорил «пять», а кнопка запускала
   * все ошибки за две недели (решение владельца от 2026-08-25).
   */
  const repeatCount = reviewRegions.length;

  return (
    <main className="results-page">
      <section className="results-score" aria-labelledby="fill-results-score">
        <div className="results-score-head">
          <p className="eyebrow">Карта заполнена</p>
          <h1 id="fill-results-score" className="results-percent">
            {formatDuration(summary.durationMs)}
          </h1>
          <p className="results-count">
            {round.order.length} {countWord(round.order.length)}
          </p>
        </div>
        {/*
          Разбивка числом: три цвета исхода на карте не могут попарно давать
          3:1, и текст — равнозначная подача того же результата без цвета.
        */}
        <dl className="results-facts results-facts-three" data-testid="fill-breakdown">
          <div>
            <dt>С первого раза</dt>
            <dd>{summary.firstTry}</dd>
          </div>
          <div>
            <dt>Со второго</dt>
            <dd>{summary.secondTry}</dd>
          </div>
          <div>
            <dt>Не угадано</dt>
            <dd>{summary.failed}</dd>
          </div>
        </dl>
        {isProgressSaved ? (
          <p className="results-saved">Прогресс сохранён на этом компьютере.</p>
        ) : (
          <p className="status-note" role="status">
            Прогресс не сохранится: хранилище недоступно.
          </p>
        )}
      </section>
      <section className="results-body" aria-labelledby="fill-results-heading">
        {roundMap}
        <div className="results-review">
          <h2 id="fill-results-heading">Что получилось</h2>
          {reviewRegions.length === 0 ? (
            <p>Вся карта взята с первой попытки.</p>
          ) : (
            <>
              <h3 className="results-review-subhead">Стоит повторить</h3>
              {/*
                Исход назван словом: на карте «со второго раза» и «не угадано»
                различаются цветом и штриховкой, и без подписи этот разбор
                пропал бы для того, кто карту не видит.
              */}
              <ul className="review-list" aria-label="Стоит повторить">
                {reviewRegions.map((target) => {
                  const openReference = referenceOf?.(target.id) ?? null;

                  return (
                    <li key={target.id}>
                      <span className="review-list-name">{target.nameRu}</span>{' '}
                      <span lang="zh-Hans" className="review-list-han">
                        {target.nameZh}
                      </span>{' '}
                      <span className="review-list-note">
                        — {round.outcomes[target.id] === 'second-try'
                          ? 'со второго раза'
                          : 'не угадано'}
                      </span>
                      {/* Имя скрыто в подписи — как на общих итогах (WCAG 2.5.3). */}
                      {openReference === null ? null : (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="review-list-reference"
                            onClick={openReference}
                          >
                            В справочник{' '}
                            <span className="visually-hidden">— {target.nameRu}</span>
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="results-actions">
            {reviewRegions.length === 0 ? null : (
              <button type="button" className="primary" onClick={onRepeatMistakes}>
                Повторить ошибки: {repeatCount} {countWord(repeatCount)}
              </button>
            )}
            <div className="results-actions-pair">
              <button
                type="button"
                className={reviewRegions.length === 0 ? 'primary' : 'secondary'}
                onClick={onNewRound}
              >
                Заполнить заново
              </button>
              {/*
                «К режимам», а не «На главную»: кнопка ведёт на секцию, из
                которой раунд и запускали.
              */}
              <button type="button" className="secondary" onClick={onExit}>
                К режимам
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Заполненная карта регионов с легендой — карта итогов лёгкого «Найти регион».
 * Рисует весь справочник: пул повтора уже, но карта — всегда вся страна.
 */
export function FillOutcomesMap({ round }: { readonly round: FillRound }) {
  const summary = summariseFillRound(round);

  return (
    <figure className="results-map">
      <ChinaMap
        regions={regions}
        selectedRegionId={null}
        onSelect={() => {}}
        onClear={() => {}}
        variant="fill"
        outcomes={round.outcomes}
        interactive={false}
      />
      <figcaption>
        <ul className="results-legend" aria-label="Обозначения">
          <li>
            <OutcomeSwatch outcome="first-try" />
            с первого раза · {summary.firstTry}
          </li>
          <li>
            <OutcomeSwatch outcome="second-try" />
            со второго · {summary.secondTry}
          </li>
          <li>
            <OutcomeSwatch outcome="failed" />
            не угадано · {summary.failed}
          </li>
        </ul>
      </figcaption>
    </figure>
  );
}
