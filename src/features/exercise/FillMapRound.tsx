import { useEffect, useRef, useState } from 'react';
import type { Region } from '../../content/types';
import {
  answerFillRound,
  createFillRound,
  currentTarget,
  isFillRoundFinished,
  MAX_ATTEMPTS_PER_REGION,
  type FillRound,
  type Move,
} from '../../domain/fill-round';
import { createSeededRandom } from '../../domain/random';
import { labelOf, langOf, type QuestionLanguage } from '../../domain/question-language';
import { ChinaMap, type MapHighlight } from '../../map/ChinaMap';
import { roundTitle } from './exercise-modes';
import { RoundStage } from './RoundStage';

/**
 * Пауза, на которой карта показывает регион, который так и не нашли.
 * Значение выбрано по умолчанию, не измерено: если на проверке с учениками
 * окажется мало, менять здесь.
 */
export const REVEAL_MS = 1500;

/** Сколько горит вспышка промаха до того, как погаснуть. */
export const MISS_FLASH_MS = 600;

export type FillMapRoundProps = {
  readonly regions: readonly Region[];
  readonly language: QuestionLanguage;
  readonly roundId: string;
  readonly seed: number;
  readonly onFinish: (round: FillRound) => void;
  readonly onExit: () => void;
};

export function FillMapRound({
  regions,
  language,
  roundId,
  seed,
  onFinish,
  onExit,
}: FillMapRoundProps) {
  const [round, setRound] = useState<FillRound>(() =>
    createFillRound(regions, {
      roundId,
      language,
      random: createSeededRandom(seed),
    }),
  );
  const [move, setMove] = useState<Move | null>(null);
  const [revealedRegionId, setRevealedRegionId] = useState<string | null>(null);
  const [missedRegionId, setMissedRegionId] = useState<string | null>(null);
  /*
   * Раунд закончился, но показ ещё идёт: экран итогов не должен подменить
   * карту прямо во время показа.
   *
   * При нынешних правилах ветка защитная: закрытый регион нажать нельзя, и на
   * последнем вопросе кликабелен только он сам, поэтому последний регион
   * всегда берётся с первой попытки и показом не заканчивается. Ветка нужна,
   * чтобы правило «последний вопрос нельзя провалить» не оказалось молчаливым
   * условием работы кода: снимут запрет на повторное нажатие — показ
   * последнего региона всё равно доиграет.
   */
  const [finishedRound, setFinishedRound] = useState<FillRound | null>(null);
  /*
   * Отметка старта берётся ленивым инициализатором состояния, а не
   * `useRef(performance.now())`: вызов нечистой функции прямо в теле рендера
   * даёт нестабильное значение при каждой перерисовке.
   */
  const [startedAt] = useState(() => performance.now());
  /** Начало текущего региона. `null` — регион ещё не начинали, считаем от старта. */
  const regionStartedAt = useRef<number | null>(null);

  /*
   * `onFinish` объявлена в теле родителя, поэтому её идентичность меняется на
   * каждый его рендер. В зависимостях эффекта это перезаводило бы таймер
   * показа при каждой перерисовке App — и при частых перерисовках он не
   * сработал бы никогда. Ссылка держит всегда свежий обработчик, не входя в
   * зависимости.
   */
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  // Пауза показа: пока она идёт, карта не принимает нажатия. Если раунд на
  // этом и закончился, итог отдаётся наверх только после паузы.
  useEffect(() => {
    if (revealedRegionId === null) {
      return;
    }

    const timer = setTimeout(() => {
      setRevealedRegionId(null);
      // Показ кончился: строка «Регион показан на карте» перестала быть
      // правдой, а следующий вопрос уже задан.
      setMove(null);
      if (finishedRound !== null) {
        onFinishRef.current(finishedRound);
      }
    }, REVEAL_MS);

    return () => clearTimeout(timer);
  }, [finishedRound, revealedRegionId]);

  // Вспышка промаха: загорается и гаснет сама.
  useEffect(() => {
    if (missedRegionId === null) {
      return;
    }

    const timer = setTimeout(() => setMissedRegionId(null), MISS_FLASH_MS);

    return () => clearTimeout(timer);
  }, [missedRegionId]);

  const isRevealing = revealedRegionId !== null;
  const finished = isFillRoundFinished(round);
  const question = finished ? null : currentTarget(round);
  const targetRegion =
    question === null
      ? null
      : regions.find((region) => region.id === question.regionId)!;
  const attemptsLeft = MAX_ATTEMPTS_PER_REGION - round.usedAttempts;
  const closed = Object.keys(round.outcomes).length;

  // Показ важнее вспышки: если идёт он, промах уже не показывается.
  const mapHighlight: MapHighlight | null =
    revealedRegionId !== null
      ? { regionId: revealedRegionId, kind: 'reveal' }
      : missedRegionId !== null
        ? { regionId: missedRegionId, kind: 'miss' }
        : null;

  function handleSelect(regionId: string) {
    if (isRevealing || finished) {
      return;
    }

    const target = currentTarget(round).regionId;
    const result = answerFillRound(round, {
      answeredRegionId: regionId,
      durationMs: Math.round(
        performance.now() - (regionStartedAt.current ?? startedAt),
      ),
      answeredAt: new Date().toISOString(),
    });

    setRound(result.round);
    setMove(result.move);

    if (result.move.kind === 'retry') {
      setMissedRegionId(regionId);
      return;
    }

    setMissedRegionId(null);
    regionStartedAt.current = performance.now();

    const isFinished = isFillRoundFinished(result.round);

    // Регион так и не нашли: сначала показать, где он, потом идти дальше.
    if (!result.move.wasFound) {
      setRevealedRegionId(target);
      setFinishedRound(isFinished ? result.round : null);
      return;
    }

    if (isFinished) {
      onFinish(result.round);
    }
  }

  function statusText(): string {
    if (move === null) {
      return 'Найдите регион на карте.';
    }

    if (move.kind === 'retry') {
      return `Не этот регион. Осталось попыток: ${move.attemptsLeft}.`;
    }

    if (!move.wasFound) {
      return 'Попытки кончились. Регион показан на карте.';
    }

    return move.outcome === 'first-try'
      ? 'Верно.'
      : 'Верно, но не с первой попытки.';
  }

  const prompt = (
    <>
      <p className="eyebrow">Найдите на карте</p>
      <h1
        className="stage-target"
        data-testid="fill-target"
        lang={question === null ? undefined : langOf(question.language)}
      >
        {targetRegion === null
          ? 'Карта заполнена'
          : labelOf(targetRegion, question!.language)}
      </h1>
    </>
  );

  return (
    <RoundStage
      title={roundTitle('fill-map')}
      prompt={prompt}
      // Показ неугаданного региона идёт на карте (`mapHighlight`); плашка уже
      // задаёт следующий вопрос, и метить её кромкой ответа было бы неверно.
      promptState="question"
      startedAt={startedAt}
      progress={
        <>
          <p className="exercise-progress" data-testid="fill-progress">
            Закрашено {closed} из {round.order.length}
          </p>
          <p className="attempt-dots">
            <span aria-hidden="true">
              {'●'.repeat(attemptsLeft)}
              {'○'.repeat(round.usedAttempts)}
            </span>
            <span className="visually-hidden">
              Попытка {round.usedAttempts + 1} из {MAX_ATTEMPTS_PER_REGION}
            </span>
          </p>
          <p className="fill-status" role="status" aria-live="polite">
            {statusText()}
          </p>
        </>
      }
      onExit={onExit}
    >
      <ChinaMap
        regions={regions}
        selectedRegionId={null}
        onSelect={handleSelect}
        onClear={() => {}}
        variant="fill"
        usage="answer"
        outcomes={round.outcomes}
        highlight={mapHighlight}
        interactive={!finished}
        paused={isRevealing}
      />
    </RoundStage>
  );
}
