import type { ReactNode } from 'react';
import { regionsWord } from '../../content/region-count';
import type { RoundSummary } from '../../domain/progress-rules';
import { formatDuration } from './format-duration';
import { OutcomeSwatch } from './OutcomeSwatch';

/**
 * Всё, что экрану итогов нужно от цели: назвать её. Регион и город подходят
 * оба — экран одинаков для игр по тем и другим, а различает их слово в
 * подписи кнопки (`countWord`).
 */
export type NamedTarget = {
  readonly id: string;
  readonly nameRu: string;
  readonly nameZh: string;
};

export type RoundResultsPageProps = {
  readonly summary: RoundSummary;
  readonly targets: readonly NamedTarget[];
  readonly bestAccuracy: number;
  readonly isProgressSaved: boolean;
  /**
   * Карта раунда. Приходит готовой, а не собирается здесь: какая карта
   * подходит раунду — по регионам, по городам или по физическим объектам, —
   * знает `App`, единственное место навигации. Не задана — итог показывается
   * одной колонкой, и это законное состояние, а не недоделка: у раунда по
   * городам исход по точке карта пока не показывает.
   */
  readonly roundMap?: ReactNode;
  /** Есть ли на карте итога регионы, о которых не спрашивали. */
  readonly hasUnasked?: boolean;
  /** Как склонять число в подписи «Повторить ошибки». */
  readonly countWord?: (count: number) => string;
  /**
   * Куда ведёт ссылка «В справочник» у ошибки: переход на её карточку в атласе
   * или `null`, если карточки нет (у стран, династий, коллекций). Решает
   * `App`, единственное место навигации; не задано — ссылок нет вовсе.
   */
  readonly referenceOf?: (targetId: string) => (() => void) | null;
  readonly onRepeatMistakes: () => void;
  readonly onNewRound: () => void;
  readonly onExit: () => void;
};

/** Процент без знака: знак набирается отдельно, мельче числа. */
function percentOf(value: number): number {
  return Math.round(value * 100);
}

export function RoundResultsPage({
  summary,
  targets,
  bestAccuracy,
  isProgressSaved,
  roundMap,
  hasUnasked = false,
  countWord = regionsWord,
  referenceOf,
  onRepeatMistakes,
  onNewRound,
  onExit,
}: RoundResultsPageProps) {
  const reviewTargets = summary.targetsToReview.flatMap(
    (target) => targets.find((named) => named.id === target.id) ?? [],
  );
  /*
   * Подпись кнопки считается из того же списка, что показан рядом. Прежде
   * набор приходил извне и был шире: экран говорил «пять», а кнопка запускала
   * все ошибки за две недели, и расхождение приходилось объяснять отдельным
   * предложением (решение владельца от 2026-08-25).
   */
  const repeatCount = reviewTargets.length;

  /*
   * Раскладка макета Ink-Results: слева счёт — число крупно, время и рекорд
   * строкой из двух клеток, под ними сохранение прогресса; справа карта с
   * обозначениями и список «Стоит повторить» с кнопками. На узком экране
   * части идут друг под другом тем же порядком, что в разметке.
   */
  return (
    <main className="results-page">
      <section className="results-score" aria-labelledby="results-score">
        <div className="results-score-head">
          <p className="eyebrow">Итог раунда</p>
          <h1 id="results-score" className="results-percent">
            {percentOf(summary.accuracy)}
            <span className="results-percent-sign">%</span>
          </h1>
          <p className="results-count">
            {summary.correct} из {summary.total}
          </p>
        </div>
        <dl className="results-facts">
          <div>
            <dt>Время</dt>
            <dd>{formatDuration(summary.durationMs)}</dd>
          </div>
          <div>
            <dt>Личный рекорд</dt>
            <dd>{percentOf(bestAccuracy)}%</dd>
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
      <section className="results-body" aria-labelledby="results-heading">
        {roundMap === undefined ? null : (
          <figure className="results-map">
            {roundMap}
            {/*
              Обозначения словами и числом: три заливки карты различаются и
              цветом, и узором, но что значит каждая — должно быть написано.
            */}
            <figcaption>
              <ul className="results-legend" aria-label="Обозначения">
                <li>
                  <OutcomeSwatch outcome="first-try" />
                  верно · {summary.correct}
                </li>
                <li>
                  <OutcomeSwatch outcome="failed" />
                  ошибка · {summary.total - summary.correct}
                </li>
                {/*
                  «Не спрашивали» бывает только у суженного раунда — повтора
                  ошибок или регионов коллекции. После полного раунда такой
                  заливки на карте нет, и строка обозначала бы пустоту.
                */}
                {hasUnasked ? (
                  <li>
                    <OutcomeSwatch />
                    не спрашивали
                  </li>
                ) : null}
              </ul>
            </figcaption>
          </figure>
        )}
        <div className="results-review">
          <h2 id="results-heading">
            {reviewTargets.length === 0 ? 'Ошибок нет' : 'Стоит повторить'}
          </h2>
          {reviewTargets.length === 0 ? null : (
            <ol className="review-list">
              {reviewTargets.map((target) => {
                const openReference = referenceOf?.(target.id) ?? null;

                return (
                  <li key={target.id}>
                    <span className="review-list-name">{target.nameRu}</span>{' '}
                    <span lang="zh-Hans" className="review-list-han">
                      {target.nameZh}
                    </span>
                    {/*
                      Видимая подпись одинакова у всех строк, поэтому имя цели
                      добавлено скрыто: читалка экрана иначе прочла бы список
                      одинаковых «В справочник». Видимая часть стоит в имени
                      первой (WCAG 2.5.3).
                    */}
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
            </ol>
          )}
          <div className="results-actions">
            {reviewTargets.length === 0 ? null : (
              <button type="button" className="primary" onClick={onRepeatMistakes}>
                Повторить ошибки: {repeatCount} {countWord(repeatCount)}
              </button>
            )}
            <div className="results-actions-pair">
              <button type="button" className="secondary" onClick={onNewRound}>
                Новый раунд
              </button>
              {/*
                «К режимам», а не «На главную»: кнопка ведёт на секцию, из
                которой раунд и запускали, и подпись обязана называть то
                место, куда ведёт.
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
