import type { Region } from '../../content/types';
import { regionsWord } from '../../content/region-count';
import { summariseFillRound, type FillRound } from '../../domain/fill-round';
import { ChinaMap } from '../../map/ChinaMap';
import { formatDuration } from './format-duration';
import { OutcomeSwatch } from './OutcomeSwatch';

export type FillMapResultsPageProps = {
  readonly round: FillRound;
  readonly regions: readonly Region[];
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
  regions,
  isProgressSaved,
  onRepeatMistakes,
  onNewRound,
  onExit,
}: FillMapResultsPageProps) {
  const summary = summariseFillRound(round);
  const reviewRegions = summary.idsToReview.flatMap(
    (regionId) => regions.find((region) => region.id === regionId) ?? [],
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
            {round.order.length} {regionsWord(round.order.length)}
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
                {reviewRegions.map((region) => (
                  <li key={region.id}>
                    <span className="review-list-name">{region.nameRu}</span>{' '}
                    <span lang="zh-Hans" className="review-list-han">
                      {region.nameZh}
                    </span>{' '}
                    <span className="review-list-note">
                      — {round.outcomes[region.id] === 'second-try'
                        ? 'со второго раза'
                        : 'не угадано'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="results-actions">
            {reviewRegions.length === 0 ? null : (
              <button type="button" className="primary" onClick={onRepeatMistakes}>
                Повторить ошибки: {repeatCount} {regionsWord(repeatCount)}
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
