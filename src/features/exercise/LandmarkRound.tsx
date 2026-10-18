import { useMemo, useState } from 'react';
import { landmarks as allLandmarks, type Landmark } from '../../content/landmarks';
import { regions } from '../../content/regions';
import { buildLandmarkChoices } from '../../domain/landmark-choices';
import {
  labelOf,
  langOf,
  type QuestionLanguage,
} from '../../domain/question-language';
import { createSeededRandom } from '../../domain/random';
import {
  answerQuestion,
  createRound,
  currentQuestion,
  goToNextQuestion,
  isRoundFinished,
  landmarkTarget,
  type Attempt,
  type ExerciseType,
  type Round,
} from '../../domain/round';
import { ChinaMap } from '../../map/ChinaMap';
import { colocatedLandmarkIds } from '../../map/landmark-points';
import type { MapZoom } from '../../map/MapControls';
import { answerStatesFor, verdictOf } from './answer-states';
import {
  LANDMARK_MODES,
  roundTitle,
  LANDMARK_CARD_IDS,
} from './exercise-modes';
import { RoundProgressTrail } from './RoundProgressTrail';
import { RoundStage } from './RoundStage';
import { StageChoices, type StageChoice } from './StageChoices';
import { useAutoAdvance } from './use-auto-advance';

/* Часы раунда живут в модуле, а не в теле компонента: см. `CityRound`. */
function startClock(): number {
  return performance.now();
}

function elapsedSince(start: number): number {
  return Math.round(startClock() - start);
}

export type LandmarkRoundProps = {
  /**
   * Пул раунда: какие объекты спрашиваются. Набор выбирается перед стартом, а
   * на «Повторить ошибки» пул сужается до ошибочных, — справочником он не
   * является: отвлекающие и равнозначный список берут `allLandmarks`.
   */
  readonly landmarks: readonly Landmark[];
  readonly exerciseType: ExerciseType;
  readonly language: QuestionLanguage;
  readonly roundId: string;
  readonly seed: number;
  readonly onFinish: (attempts: readonly Attempt[]) => void;
  readonly onExit: () => void;
};

/**
 * Три игры по достопримечательностям одним экраном.
 *
 * Устроен как `CityRound` и отдельно от него по той же причине, по какой тот
 * отделён от `ExerciseRound`: у достопримечательности свой каталог, свои
 * отвлекающие и своя карта. Карта здесь чистая — ни городов, ни физического
 * слоя: решение владельца продукта от 2026-08-28. Река или точка города рядом
 * со звездой не помогают её найти, а спорят с ней.
 *
 * | Игра | Вопрос | Ответ |
 * | --- | --- | --- |
 * | `find-on-map` | имя объекта | нажатие по звезде |
 * | `name-target` | подсвеченная звезда | одно из четырёх имён |
 * | `match-pair` | имя объекта | нажатие по области региона |
 */
export function LandmarkRound({
  landmarks,
  exerciseType,
  language,
  roundId,
  seed,
  onFinish,
  onExit,
}: LandmarkRoundProps) {
  const [round, setRound] = useState<Round>(() =>
    createRound(
      landmarks.map((one) => landmarkTarget(one.id)),
      {
        roundId,
        exerciseTypes: [exerciseType],
        language,
        random: createSeededRandom(seed),
      },
    ),
  );
  const [zoom, setZoom] = useState<MapZoom>(1);
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [askedAt, setAskedAt] = useState(startClock);
  const [startedAt] = useState(startClock);
  const { schedule } = useAutoAdvance();

  const choicesByQuestion = useMemo(() => {
    const random = createSeededRandom(seed + 1);

    /*
     * Соседи по грозди исключаются из отвлекающих: на карте гроздь — одна
     * звезда, и «Запретный город» рядом с «Храмом Неба» в вариантах оставил
     * бы вопрос «что здесь отмечено» без единственного верного ответа.
     */
    return round.questions.map((question) =>
      /*
       * Отвлекающие берутся из всего справочника, а не из пула раунда: в
       * повторе ошибок пул бывает из одного объекта, и вариант остался бы
       * один — сам ответ. Спрашиваются при этом только объекты пула.
       */
      buildLandmarkChoices(
        allLandmarks,
        question.target.id,
        random,
        colocatedLandmarkIds(question.target.id),
      ),
    );
  }, [round.questions, seed]);

  const question = currentQuestion(round);
  const target = landmarks.find((one) => one.id === question.target.id)!;
  const mode = LANDMARK_MODES[exerciseType];
  const lastAttempt = round.attempts[round.attempts.length - 1];

  const answersWithRegion = exerciseType === 'match-pair';
  const showsChoices = exerciseType === 'name-target';
  const regionOfTarget = regions.find(
    (region) => region.id === target.regionId,
  )!;

  const answerStates = useMemo(
    () =>
      answersWithRegion && answeredId !== null
        ? answerStatesFor(regions, target.regionId, answeredId)
        : {},
    [answersWithRegion, answeredId, target.regionId],
  );

  function goNext(from: Round) {
    const next = goToNextQuestion(from);
    if (isRoundFinished(next)) {
      onFinish(next.attempts);
      return;
    }

    setRound(next);
    setAnsweredId(null);
    setAskedAt(startClock());
  }

  function answer(id: string) {
    if (round.status !== 'ready') {
      return;
    }

    setAnsweredId(id);
    const answered = answerQuestion(round, {
      answeredId: id,
      expectedId: answersWithRegion ? target.regionId : undefined,
      durationMs: elapsedSince(askedAt),
      answeredAt: new Date().toISOString(),
    });
    setRound(answered);

    const isCorrect = answered.attempts[answered.attempts.length - 1].isCorrect;
    schedule(isCorrect, () => goNext(answered));
  }

  function handleRegionSelect(regionId: string) {
    if (answersWithRegion) {
      answer(regionId);
    }
  }

  /*
   * Со звезды приходит список: скучившиеся объекты — одна цель, и попадание в
   * неё, когда спрошенный внутри, — верный ответ (решение владельца от
   * 2026-08-30: важно «что это в Пекине», а не в какой части Пекина). Промах
   * записывается первым членом грозди — любым, он всё равно не спрошенный.
   */
  function handleLandmarkSelect(landmarkIds: readonly string[]) {
    answer(landmarkIds.includes(target.id) ? target.id : landmarkIds[0]);
  }

  const showsAnswer =
    round.status === 'feedback' && lastAttempt?.isCorrect === false;

  const stageChoices: readonly StageChoice[] = showsChoices
    ? choicesByQuestion[round.currentIndex].map((choice) => ({
        id: choice.id,
        label: labelOf(choice, question.language),
        lang: langOf(question.language),
        result:
          answeredId === null
            ? undefined
            : choice.id === target.id
              ? 'correct'
              : choice.id === answeredId
                ? 'incorrect'
                : undefined,
      }))
    : [];

  const prompt = showsAnswer ? (
    <>
      <p className="eyebrow">Это стоит повторить</p>
      <h1 className="stage-target" data-testid="exercise-target">
        {answersWithRegion ? (
          <>
            {target.nameRu} <span lang="zh-Hans">{target.nameZh}</span> —{' '}
            {regionOfTarget.nameRu}{' '}
            <span lang="zh-Hans">{regionOfTarget.nameZh}</span>
          </>
        ) : (
          <>
            Это {target.nameRu} <span lang="zh-Hans">{target.nameZh}</span>
          </>
        )}
      </h1>
    </>
  ) : (
    <>
      <p className="eyebrow">{mode.eyebrow}</p>
      <h1
        className="stage-target"
        data-testid="exercise-target"
        lang={showsChoices ? undefined : langOf(question.language)}
      >
        {showsChoices
          ? 'Отмеченный объект'
          : labelOf(target, question.language)}
      </h1>
    </>
  );

  return (
    <RoundStage
      title={roundTitle(LANDMARK_CARD_IDS[exerciseType])}
      prompt={prompt}
      promptState={showsAnswer ? 'answer' : 'question'}
      verdict={verdictOf(round)}
      startedAt={startedAt}
      progress={
        <>
          <p className="exercise-progress">
            Вопрос {round.currentIndex + 1} из {round.questions.length}
          </p>
          <RoundProgressTrail
            total={round.questions.length}
            attempts={round.attempts}
          />
        </>
      }
      choices={
        showsChoices ? (
          <StageChoices
            choices={stageChoices}
            disabled={round.status !== 'ready'}
            onChoose={answer}
          />
        ) : undefined
      }
      onExit={onExit}
    >
      {/*
        В «достопримечательность — регион» звёзды скрыты вовсе: подсвеченная
        звезда в области — готовый ответ. В остальных двух играх звёзды есть,
        но без подписей: в «назвать» подпись назвала бы объект, в «найти» —
        выдала бы его наведением курсора.
      */}
      <ChinaMap
        regions={regions}
        selectedRegionId={answersWithRegion ? answeredId : null}
        onSelect={handleRegionSelect}
        onClear={() => {}}
        answerStates={answerStates}
        interactive={answersWithRegion}
        zoom={zoom}
        onZoomChange={setZoom}
        usage="answer"
        showsLandmarks={!answersWithRegion}
        selectedLandmarkId={showsChoices ? target.id : answeredId}
        showsLandmarkLabels={false}
        onSelectLandmark={
          exerciseType === 'find-on-map' ? handleLandmarkSelect : undefined
        }
        /*
         * Выноски Макао и Гонконга видны только там, где отвечают регионом: в
         * «найти» и «назвать» регион не выбирается, и пустые кружки в море
         * лишь спорили бы со звёздами дельты.
         */
        showsCallouts={answersWithRegion}
      />
    </RoundStage>
  );
}
