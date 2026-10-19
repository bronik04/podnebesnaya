import { useEffect, useMemo, useRef, useState } from 'react';
import { partOfFeature, physicalFeatures } from '../../content/physical-features';
import { regions as allRegions } from '../../content/regions';
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
import type { MapZoom } from '../../map/MapControls';
import { ReliefStyleToggle, type ReliefStyle } from '../../map/ReliefStyleToggle';
import { markOutcomeOf, type MarkOutcome } from '../../map/mark-outcome';
import { COUNTRY_FRAME_OUTSET } from '../../map/target-size';
import type { NamedTarget } from '../results/RoundResultsPage';
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

/**
 * Вид целей лёгкого уровня. Ход у всех один — заполнение карты; различаются
 * слой карты и слова. Виды добавляются по шагам плана уровней сложности.
 */
export type FillKind = 'region' | 'country' | 'city' | 'physical' | 'landmark';

type KindWords = {
  readonly title: string;
  readonly ask: string;
  readonly miss: string;
  readonly revealed: string;
};

const WORDS: Readonly<Record<FillKind, KindWords>> = {
  region: {
    title: 'find-on-map',
    ask: 'Найдите регион на карте.',
    miss: 'Не этот регион.',
    revealed: 'Попытки кончились. Регион показан на карте.',
  },
  country: {
    title: 'find-country',
    ask: 'Найдите страну на карте.',
    miss: 'Не эта страна.',
    revealed: 'Попытки кончились. Страна показана на карте.',
  },
  city: {
    title: 'find-city',
    ask: 'Найдите город на карте.',
    miss: 'Не этот город.',
    revealed: 'Попытки кончились. Город показан на карте.',
  },
  physical: {
    title: 'find-physical',
    ask: 'Найдите объект на карте.',
    miss: 'Не этот объект.',
    revealed: 'Попытки кончились. Объект показан на карте.',
  },
  landmark: {
    title: 'find-landmark',
    ask: 'Найдите место на карте.',
    miss: 'Не это место.',
    revealed: 'Попытки кончились. Место показано на карте.',
  },
};

/**
 * Какой ответ записать по нажатию; `null` — нажатие ничего не значит.
 *
 * Обычно ответ — сама цель под пальцем. Участок реки засчитывается целой
 * реке, когда спрошена она (ущелья лежат на Янцзы), а участок, о котором
 * раунд не спрашивает, вообще отвечает за свою реку: он и нарисован ею.
 * Гроздь звёзд — одна цель: в ней спрошенный — засчитывается он, иначе
 * промах пишется первой открытой целью раунда в ней. Если открытых целей в
 * грозди нет, а закрытые есть, гроздь окрашена исходом и ответа не
 * принимает — как одиночная закрытая цель (те же правила, что в
 * `LandmarkRound` и `PhysicalRound`).
 */
function resolveAnswer(
  kind: FillKind,
  pickedIds: readonly string[],
  targetId: string,
  isClosed: (id: string) => boolean,
  isTarget: (id: string) => boolean,
): string | null {
  if (pickedIds.includes(targetId)) {
    return targetId;
  }

  const whole = kind === 'physical' ? partOfFeature(pickedIds[0]) : undefined;
  if (whole !== undefined && (whole === targetId || !isTarget(pickedIds[0]))) {
    return isClosed(whole) ? null : whole;
  }

  const open = pickedIds.find((id) => isTarget(id) && !isClosed(id));
  if (open !== undefined) {
    return open;
  }

  return pickedIds.some(isClosed) ? null : pickedIds[0];
}

export type FillMapRoundProps = {
  readonly kind: FillKind;
  /**
   * Пул раунда: весь справочник или ошибки, взятые на повтор. Карта рисует
   * справочник целиком — пул отвечает за то, что спрашивают, а не за то,
   * что видно.
   */
  readonly targets: readonly NamedTarget[];
  /**
   * Какие цели рисовать на карте, если не весь справочник. У городов и мест —
   * набор раунда: на лёгком уровне карта показывает только его, и в повторе одной
   * ошибки тоже весь набор, а не одну точку — иначе она и есть ответ.
   */
  readonly mapIds?: readonly string[];
  /** Вид рельефа физической карты: держит `App`, общий с атласом. */
  readonly reliefStyle?: ReliefStyle;
  readonly onReliefStyleChange?: (style: ReliefStyle) => void;
  readonly language: QuestionLanguage;
  readonly roundId: string;
  readonly seed: number;
  readonly onFinish: (round: FillRound) => void;
  readonly onExit: () => void;
};

export function FillMapRound({
  kind,
  targets,
  mapIds,
  reliefStyle = 'color',
  onReliefStyleChange,
  language,
  roundId,
  seed,
  onFinish,
  onExit,
}: FillMapRoundProps) {
  const [round, setRound] = useState<FillRound>(() =>
    createFillRound(targets, {
      targetKind: kind,
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
  /* Своё приближение ученика — у городов, где грозди раскрываются заходом. */
  const [zoom, setZoom] = useState<MapZoom>(1);
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
  const words = WORDS[kind];
  const targetRegion =
    question === null
      ? null
      : targets.find((target) => target.id === question.targetId)!;
  const attemptsLeft = MAX_ATTEMPTS_PER_REGION - round.usedAttempts;
  const closed = Object.keys(round.outcomes).length;

  // Показ важнее вспышки: если идёт он, промах уже не показывается.
  const mapHighlight: MapHighlight | null =
    revealedRegionId !== null
      ? { regionId: revealedRegionId, kind: 'reveal' }
      : missedRegionId !== null
        ? { regionId: missedRegionId, kind: 'miss' }
        : null;

  /*
   * Исходы стран и городов — исходы раунда в языке знаков, поверх них вспышка промаха.
   * Ненайденная цель после третьей попытки уже закрыта исходом «ошибка» и
   * на время показа ещё и выбрана — так её видно сразу.
   */
  const markOutcomes = useMemo(() => {
    const marks: Record<string, MarkOutcome> = {};
    for (const [id, outcome] of Object.entries(round.outcomes)) {
      marks[id] = markOutcomeOf(outcome);
    }
    /*
     * Участок реки, о котором раунд не спрашивает, рисуется как его река:
     * иначе на найденной Янцзы «Три ущелья» оставались бы бледной выемкой.
     * Спрашиваемый участок своё получит сам — слой больше не наследует.
     */
    if (kind === 'physical') {
      for (const part of physicalFeatures) {
        const whole = partOfFeature(part.id);
        if (
          whole !== undefined &&
          marks[whole] !== undefined &&
          marks[part.id] === undefined &&
          !targets.some((target) => target.id === part.id)
        ) {
          marks[part.id] = marks[whole];
        }
      }
    }
    if (missedRegionId !== null && revealedRegionId === null) {
      marks[missedRegionId] = 'incorrect';
    }

    return marks;
  }, [kind, missedRegionId, revealedRegionId, round.outcomes, targets]);

  /* Ещё не закрытые цели — по ним гроздь знает, остались ли в ней открытые. */
  const pendingIds = useMemo(
    () =>
      targets
        .map((target) => target.id)
        .filter((id) => round.outcomes[id] === undefined),
    [round.outcomes, targets],
  );

  function handleSelect(pickedId: string) {
    handlePick([pickedId]);
  }

  function handlePick(pickedIds: readonly string[]) {
    const regionId = finished
      ? pickedIds[0]
      : resolveAnswer(
          kind,
          pickedIds,
          currentTarget(round).targetId,
          (id) => round.outcomes[id] !== undefined,
          (id) => targets.some((target) => target.id === id),
        );
    /*
     * Закрытая цель ответа не принимает: повторное нажатие не должно стоить
     * попытки. У регионов это держит ещё и правило карты, у прочих — только
     * этот обработчик.
     */
    if (
      isRevealing ||
      finished ||
      regionId === null ||
      round.outcomes[regionId] !== undefined
    ) {
      return;
    }

    const target = currentTarget(round).targetId;
    const result = answerFillRound(round, {
      answeredId: regionId,
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
      return words.ask;
    }

    if (move.kind === 'retry') {
      return `${words.miss} Осталось попыток: ${move.attemptsLeft}.`;
    }

    if (!move.wasFound) {
      return words.revealed;
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
      title={roundTitle(words.title)}
      tools={
        kind === 'physical' && onReliefStyleChange !== undefined ? (
          <ReliefStyleToggle
            name="round-relief"
            value={reliefStyle}
            onChange={onReliefStyleChange}
          />
        ) : undefined
      }
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
      {kind === 'region' ? (
        <ChinaMap
          regions={allRegions}
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
      ) : kind === 'country' ? (
        /* Карта та же, что в сложной «Найти страну» (`CountryRound`). */
        <ChinaMap
          regions={allRegions}
          selectedRegionId={null}
          onSelect={() => {}}
          onClear={() => {}}
          usage="answer"
          variant="reference"
          interactive={false}
          showsCountries
          showsCallouts={false}
          frameOutset={COUNTRY_FRAME_OUTSET}
          selectedCountryId={revealedRegionId}
          onSelectCountry={handleSelect}
          countryOutcomes={markOutcomes}
        />
      ) : kind === 'physical' ? (
        /*
         * Карта та же, что в сложной «Найти объект» (`PhysicalRound`), и на
         * обоих уровнях вся: реки и горы — сама карта, без них теряются
         * ориентиры (решение владельца от 2026-10-18).
         */
        <div className="relief-scope" data-relief={reliefStyle}>
          <ChinaMap
            regions={allRegions}
            selectedRegionId={null}
            onSelect={() => {}}
            onClear={() => {}}
            interactive={false}
            zoom={zoom}
            onZoomChange={setZoom}
            usage="answer"
            variant="physical"
            selectedFeatureId={revealedRegionId}
            onSelectFeature={handleSelect}
            showsPhysicalLabels={false}
            featureOutcomes={markOutcomes}
            featureOutcomesAccumulate
          />
        </div>
      ) : kind === 'landmark' ? (
        /* Карта та же, что в сложной «Найти место» (`LandmarkRound`), но с набором. */
        <ChinaMap
          regions={allRegions}
          selectedRegionId={null}
          onSelect={() => {}}
          onClear={() => {}}
          usage="answer"
          interactive={false}
          zoom={zoom}
          onZoomChange={setZoom}
          showsLandmarks
          landmarkIds={mapIds}
          selectedLandmarkId={revealedRegionId}
          showsLandmarkLabels={false}
          landmarkOutcomes={markOutcomes}
          landmarkOutcomesAccumulate
          pendingTargetIds={pendingIds}
          onSelectLandmark={handlePick}
          showsCallouts={false}
        />
      ) : (
        /* Карта та же, что в сложной «Найти город» (`CityRound`), но с набором. */
        <ChinaMap
          regions={allRegions}
          selectedRegionId={null}
          onSelect={() => {}}
          onClear={() => {}}
          usage="answer"
          interactive={false}
          zoom={zoom}
          onZoomChange={setZoom}
          questionKey={`${roundId}:${round.currentIndex}`}
          showsCities
          cityIds={mapIds}
          showsCityLabels={false}
          selectedCityId={revealedRegionId}
          onSelectCity={handleSelect}
          cityOutcomes={markOutcomes}
          pendingTargetIds={pendingIds}
          showsCallouts={false}
        />
      )}
    </RoundStage>
  );
}
