import { useMemo, useState } from 'react';
import {
  partOfFeature,
  physicalFeatures,
} from '../../content/physical-features';
import { regions } from '../../content/regions';
import type { PhysicalFeature } from '../../content/types';
import { buildPhysicalChoices } from '../../domain/physical-choices';
import { labelOf, langOf, type QuestionLanguage } from '../../domain/question-language';
import { createSeededRandom } from '../../domain/random';
import {
  answerQuestion,
  createRound,
  currentQuestion,
  goToNextQuestion,
  isRoundFinished,
  physicalTarget,
  type Attempt,
  type Round,
} from '../../domain/round';
import { ChinaMap } from '../../map/ChinaMap';
import { ReliefStyleToggle, type ReliefStyle } from '../../map/ReliefStyleToggle';
import type { MapZoom } from '../../map/MapControls';
import type { FeatureOutcome } from '../../map/PhysicalLayer';
import {
  PHYSICAL_MODES,
  roundTitle,
} from './exercise-modes';
import { RoundProgressTrail } from './RoundProgressTrail';
import { verdictOf } from './answer-states';
import { RoundStage } from './RoundStage';
import { StageChoices, type StageChoice } from './StageChoices';
import { useAutoAdvance } from './use-auto-advance';

/*
 * Часы раунда живут в модуле, а не в теле компонента. `performance.now`
 * нечист, и проверка чистоты React считает его вызов внутри компонента
 * вызовом во время отрисовки, хотя оба вызова происходят в обработчиках
 * событий. Тот же приём в `CityRound`.
 */
function startClock(): number {
  return performance.now();
}

function elapsedSince(start: number): number {
  return Math.round(startClock() - start);
}

export type PhysicalRoundProps = {
  readonly features: readonly PhysicalFeature[];
  readonly exerciseType: 'find-on-map' | 'name-target';
  readonly language: QuestionLanguage;
  readonly roundId: string;
  readonly seed: number;
  readonly onFinish: (attempts: readonly Attempt[]) => void;
  readonly onExit: () => void;
  /** Вид рельефа: держит `App`, чтобы выбор пережил смену экрана. */
  readonly reliefStyle?: ReliefStyle;
  readonly onReliefStyleChange?: (value: ReliefStyle) => void;
};

/**
 * Две игры по физической географии одним экраном.
 *
 * Отдельно от `CityRound` и `ExerciseRound` по той же причине, по которой они
 * отдельны друг от друга: другой ответ (река разрешается расстоянием, форма —
 * контуром), другие отвлекающие (того же вида, а не того же типа единицы) и
 * свои состояния карты, где цвет занят ступенями.
 *
 * | Игра | Вопрос | Ответ |
 * | --- | --- | --- |
 * | `find-on-map` | имя объекта | нажатие по реке или форме |
 * | `name-target` | подсвеченный объект | одно из четырёх имён |
 *
 * Раунд один на двенадцать целей, реки и формы вперемешку: разделять их на
 * два раунда по шесть значило бы разорвать ту самую связь между рельефом и
 * течением рек, ради которой режим и делается.
 */
export function PhysicalRound({
  reliefStyle = 'color',
  onReliefStyleChange,
  features,
  exerciseType,
  language,
  roundId,
  seed,
  onFinish,
  onExit,
}: PhysicalRoundProps) {
  const [round, setRound] = useState<Round>(() =>
    createRound(
      features.map((feature) => physicalTarget(feature.id)),
      {
        roundId,
        exerciseTypes: [exerciseType],
        language,
        random: createSeededRandom(seed),
      },
    ),
  );
  /*
   * Увеличение с панорамированием: на участке параллельных рек — Цзиньша,
   * Ланьцан и Ну идут рядом полтысячи километров — показать Янцзы, не рискуя
   * попасть в Ланьцанцзян, можно только увеличив карту.
   */
  const [zoom, setZoom] = useState<MapZoom>(1);
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [askedAt, setAskedAt] = useState(startClock);
  const [startedAt] = useState(startClock);
  const { schedule } = useAutoAdvance();

  /*
   * Отвлекающие берутся из полного справочника, а не из пула раунда. Пул
   * сужается на «Повторить ошибки», и своими же отвлекающими вопрос остался бы
   * без вариантов: две ошибки — река и форма — дают на вопросе про реку пустой
   * список отвлекающих того же вида, то есть одну кнопку, всегда правильную.
   * Спрашиваются цели пула, а выбирают из всех двенадцати.
   */
  const choicesByQuestion = useMemo(() => {
    const random = createSeededRandom(seed + 1);

    return round.questions.map((question) =>
      buildPhysicalChoices(physicalFeatures, question.target.id, random),
    );
  }, [round.questions, seed]);

  const question = currentQuestion(round);
  const targetFeature = features.find((feature) => feature.id === question.target.id)!;
  const mode = PHYSICAL_MODES[exerciseType];
  const lastAttempt = round.attempts[round.attempts.length - 1];
  const showsChoices = exerciseType === 'name-target';

  /*
   * Исход показывается на самой карте: после ответа видно и то, что выбрал
   * ученик, и то, где был правильный объект. До ответа помечать нечего.
   */
  const featureOutcomes = useMemo(() => {
    if (answeredId === null) {
      return {};
    }

    const outcomes: Record<string, FeatureOutcome> = {
      [targetFeature.id]: 'correct',
    };
    if (answeredId !== targetFeature.id) {
      outcomes[answeredId] = 'incorrect';
    }

    return outcomes;
  }, [answeredId, targetFeature.id]);

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
      durationMs: elapsedSince(askedAt),
      answeredAt: new Date().toISOString(),
    });
    setRound(answered);

    const isCorrect = answered.attempts[answered.attempts.length - 1].isCorrect;
    schedule(isCorrect, () => goNext(answered));
  }

  /*
   * Обработчики объявлены именами, а не стрелками прямо в разметке: стрелка в
   * свойстве JSX создаётся на рендере, и проверка чистоты считает вызов из неё
   * вызовом во время отрисовки. Тот же приём в `CityRound`.
   */
  /**
   * Ответ нажатием по карте. Попадание в часть засчитывается целому: ущелья
   * лежат на Янцзы, и при вопросе о реке нажатие по ним — верный ответ.
   * Обратное неверно: когда спрошены ущелья, годится только сам отрезок.
   */
  function handleFeatureSelect(featureId: string) {
    if (showsChoices) {
      return;
    }

    const whole = partOfFeature(featureId);
    answer(whole === question.target.id ? whole : featureId);
  }

  const showsAnswer = round.status === 'feedback' && lastAttempt?.isCorrect === false;

  const stageChoices: readonly StageChoice[] = showsChoices
    ? choicesByQuestion[round.currentIndex].map((choice) => ({
        id: choice.id,
        label: labelOf(choice, question.language),
        lang: langOf(question.language),
        result:
          answeredId === null
            ? undefined
            : choice.id === targetFeature.id
              ? 'correct'
              : choice.id === answeredId
                ? 'incorrect'
                : undefined,
      }))
    : [];

  const prompt = showsAnswer ? (
    <>
      <p className="eyebrow">Этот объект стоит повторить</p>
      <h1 className="stage-target" data-testid="exercise-target">
        Это {targetFeature.nameRu}{' '}
        <span lang="zh-Hans">{targetFeature.nameZh}</span>
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
          ? 'Объект на карте'
          : labelOf(targetFeature, question.language)}
      </h1>
    </>
  );

  return (
    <RoundStage
      tools={
        onReliefStyleChange === undefined ? undefined : (
          <ReliefStyleToggle
            name="round-relief"
            value={reliefStyle}
            onChange={onReliefStyleChange}
          />
        )
      }
      title={roundTitle(exerciseType === 'find-on-map' ? 'find-physical' : 'name-physical')}
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
        Подписи скрыты в обеих играх: в «назвать объект» подпись
        подсвеченной реки и есть ответ, в «найти» она выдала бы объект
        наведением курсора. Та же утечка, что у выносок Макао и Гонконга.
        Области при этом не отвечают: ответ здесь — объект, а не регион.
      */}
      <div className="relief-scope" data-relief={reliefStyle}>
      <ChinaMap
        regions={regions}
        selectedRegionId={null}
        onSelect={() => {}}
        onClear={() => {}}
        interactive={false}
        zoom={zoom}
        onZoomChange={setZoom}
        usage="answer"
        variant="physical"
        selectedFeatureId={showsChoices ? targetFeature.id : answeredId}
        onSelectFeature={showsChoices ? undefined : handleFeatureSelect}
        showsPhysicalLabels={false}
        featureOutcomes={featureOutcomes}
      />
      </div>
    </RoundStage>
  );
}
