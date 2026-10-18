import { useRef, type ReactNode } from 'react';
import { RoundStopwatch } from './RoundStopwatch';
import { useFullscreen } from '../../ui/use-fullscreen';

export type RoundStageProps = {
  /**
   * Имя игры над ходом раунда: «Регионы · Найти на карте». Не передано —
   * строки нет.
   */
  readonly title?: string;
  /** Содержимое плашки: вопрос или показ верного ответа после ошибки. */
  readonly prompt: ReactNode;
  readonly promptState: 'question' | 'answer';
  /**
   * Исход только что данного ответа — печать 对 или 错 со словом под
   * вопросом. `null` или не передано — ответа ещё нет, печати нет.
   */
  readonly verdict?: 'correct' | 'incorrect' | null;
  /** Отметка `performance.now()` старта раунда — секундомеру строки. */
  readonly startedAt: number;
  /** Счёт и след раунда в служебной строке. */
  readonly progress: ReactNode;
  /** Полоса вариантов под картой; не передана — полосы нет, карта выше. */
  readonly choices?: ReactNode;
  /**
   * Настройки показа карты — переключатель вида рельефа. Стоят в строке
   * действий, а не на карте: любой угол листа в раунде занят целями
   * (северо-восточный — Амуром и Хинганом).
   */
  readonly tools?: ReactNode;
  readonly onExit: () => void;
  /** Карта. */
  readonly children: ReactNode;
};

/**
 * Компоновка игрового экрана — одна на все виды раундов. С редизайна «Тушь и
 * киноварь» (DECISIONS.md, 2026-10-14) на широком экране это колонка вопроса
 * слева — имя игры, ход, вопрос, печать исхода, варианты, время и действия —
 * и карта справа. На узком экране всё идёт одной колонкой, вопрос — строкой
 * над картой, а не плашкой поверх неё: плашка накрывала шапку раунда.
 * Порядок DOM — шапка, вопрос, карта, варианты, строка; раскладку решает
 * только CSS.
 *
 * Блок вопроса — aria-live: смена вопроса и показ верного ответа объявляются
 * читалке. Раньше это делал перевод фокуса на заголовок разбора — самого
 * разбора больше нет.
 *
 * Полноэкранная кнопка разворачивает корень оболочки: шапка сайта остаётся
 * вне полного экрана, решение 2026-08-05 о шапке не отменяется.
 */
/**
 * Печать исхода. Иероглиф — знак, слово рядом — смысл: печать скрыта от
 * читалки, а слово входит в живую область вопроса и объявляется.
 */
const VERDICTS = {
  correct: { seal: '对', word: 'Верно' },
  incorrect: { seal: '错', word: 'Неверно' },
} as const;

export function RoundStage({
  title,
  prompt,
  promptState,
  verdict = null,
  startedAt,
  progress,
  choices,
  tools,
  onExit,
  children,
}: RoundStageProps) {
  const stageRef = useRef<HTMLElement>(null);
  const fullscreen = useFullscreen(stageRef);

  return (
    <main className="round-stage" ref={stageRef}>
      {/*
        Шапка раунда: имя игры и ход. На широком экране стоит наверху колонки
        вопроса, на узком — строкой над картой.
      */}
      <div className="stage-head">
        {title === undefined ? null : <p className="stage-title">{title}</p>}
        {progress}
      </div>
      <div className="stage-prompt" data-state={promptState} aria-live="polite">
        {prompt}
        {verdict === null ? null : (
          <p className="stage-verdict" data-verdict={verdict}>
            <span
              className="seal seal-solid"
              data-tone={verdict === 'correct' ? 'correct' : undefined}
              lang="zh-Hans"
              aria-hidden="true"
            >
              {VERDICTS[verdict].seal}
            </span>
            {VERDICTS[verdict].word}
          </p>
        )}
      </div>
      <div className="stage-map">{children}</div>
      {choices !== undefined ? (
        <div className="stage-choices-band">{choices}</div>
      ) : null}
      <footer className="stage-strip">
        <RoundStopwatch startedAt={startedAt} />
        {tools === undefined ? null : <div className="stage-strip-tools">{tools}</div>}
        <div className="stage-strip-actions">
          {fullscreen.isAvailable ? (
            <button
              type="button"
              className="stage-strip-button"
              onClick={fullscreen.toggle}
            >
              {fullscreen.isFullscreen ? 'Свернуть' : 'Во весь экран'}
            </button>
          ) : null}
          {/*
            Выход — последним и тише остальных: переходом, а не рамкой.
            Набранный так же, как «Во весь экран», он весил столько же, хотя
            стирает раунд, а не меняет показ.
          */}
          <button
            type="button"
            className="stage-strip-button stage-strip-exit"
            onClick={onExit}
          >
            Прервать раунд
          </button>
        </div>
      </footer>
    </main>
  );
}
