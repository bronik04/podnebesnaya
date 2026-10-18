import { useMemo, useState } from 'react';
import { cityById } from '../../content/cities';
import { regions as allRegions } from '../../content/regions';
import type { Region } from '../../content/types';
import { buildChoices } from '../../domain/choices';
import { createSeededRandom } from '../../domain/random';
import { labelOf, langOf, type QuestionLanguage } from '../../domain/question-language';
import {
  answerQuestion,
  createRound,
  currentQuestion,
  goToNextQuestion,
  isRoundFinished,
  regionTarget,
  type Attempt,
  type ExerciseType,
  type Round,
} from '../../domain/round';
import { ChinaMap } from '../../map/ChinaMap';
import { answerStatesFor, verdictOf } from './answer-states';
import {
  EXERCISE_MODES,
  roundTitle,
} from './exercise-modes';
import { RoundProgressTrail } from './RoundProgressTrail';
import { RoundStage } from './RoundStage';
import { StageChoices, type StageChoice } from './StageChoices';
import { useAutoAdvance } from './use-auto-advance';

export type ExerciseRoundProps = {
  /**
   * Пул раунда: какие регионы спрашиваются. На «Повторить ошибки» он сужается
   * до ошибочных, поэтому справочником он не является — отвлекающие,
   * равнозначный список и сама карта берут `allRegions`.
   */
  readonly regions: readonly Region[];
  readonly exerciseTypes: readonly ExerciseType[];
  readonly language: QuestionLanguage;
  readonly roundId: string;
  readonly seed: number;
  readonly onFinish: (attempts: readonly Attempt[]) => void;
  readonly onExit: () => void;
};

function resultOf(
  choiceId: string,
  targetId: string,
  answeredRegionId: string | null,
): 'correct' | 'incorrect' | undefined {
  if (answeredRegionId === null) {
    return undefined;
  }

  if (choiceId === targetId) {
    return 'correct';
  }

  return choiceId === answeredRegionId ? 'incorrect' : undefined;
}

/**
 * Один контейнер на все задания: типы могут чередоваться внутри раунда,
 * поэтому вид вопроса решается на каждом вопросе, а не на экране.
 *
 * Паузы-разбора больше нет (спек RoundStage): после ошибки плашка вопроса
 * называет верный ответ, карта штрихует оба региона, и раунд идёт дальше сам.
 */
export function ExerciseRound({
  regions,
  exerciseTypes,
  language,
  roundId,
  seed,
  onFinish,
  onExit,
}: ExerciseRoundProps) {
  const [round, setRound] = useState<Round>(() =>
    createRound(
      regions.map((region) => regionTarget(region.id)),
      {
        roundId,
        exerciseTypes,
        language,
        random: createSeededRandom(seed),
      },
    ),
  );
  const [answeredRegionId, setAnsweredRegionId] = useState<string | null>(null);
  const [askedAt, setAskedAt] = useState(() => performance.now());
  const [startedAt] = useState(() => performance.now());
  const { schedule } = useAutoAdvance();

  // Варианты считаются один раз на раунд: иначе перерисовка тасовала бы их
  // прямо под курсором.
  /*
   * Отвлекающие берутся из всего справочника, а не из пула раунда: в повторе
   * ошибок пул бывает из одного региона, и вариант остался бы один — сам
   * ответ. Спрашиваются при этом только регионы пула.
   */
  const choicesByQuestion = useMemo(() => {
    const random = createSeededRandom(seed + 1);

    return round.questions.map((question) =>
      buildChoices(allRegions, question.target.id, random),
    );
  }, [round.questions, seed]);

  const question = currentQuestion(round);
  const targetRegion = regions.find((region) => region.id === question.target.id)!;
  const mode = EXERCISE_MODES[question.exerciseType];
  const isMapAnswer = question.exerciseType === 'find-on-map';
  const lastAttempt = round.attempts[round.attempts.length - 1];
  const showsAnswer = round.status === 'feedback' && lastAttempt?.isCorrect === false;

  /*
   * Состояния ответа считаются по всему справочнику: нарисованы на карте все
   * тридцать четыре области, и после ответа закрыться должны все. С пулом
   * повтора остальные оставались бы на вид открытыми, хотя движок их уже не
   * принимает.
   */
  const answerStates = useMemo(
    () =>
      isMapAnswer
        ? answerStatesFor(allRegions, question.target.id, answeredRegionId)
        : {},
    [isMapAnswer, question.target.id, answeredRegionId],
  );

  function goNext(from: Round) {
    const next = goToNextQuestion(from);
    if (isRoundFinished(next)) {
      onFinish(next.attempts);
      return;
    }

    setRound(next);
    setAnsweredRegionId(null);
    setAskedAt(performance.now());
  }

  function answer(regionId: string) {
    if (round.status !== 'ready') {
      return;
    }

    setAnsweredRegionId(regionId);
    const answered = answerQuestion(round, {
      answeredId: regionId,
      durationMs: Math.round(performance.now() - askedAt),
      answeredAt: new Date().toISOString(),
    });
    setRound(answered);

    const isCorrect = answered.attempts[answered.attempts.length - 1].isCorrect;
    schedule(isCorrect, () => goNext(answered));
  }

  const stageChoices: readonly StageChoice[] = isMapAnswer
    ? []
    : choicesByQuestion[round.currentIndex].map((choice) => ({
        id: choice.id,
        label:
          question.exerciseType === 'match-pair'
            ? (cityById(choice.capitalCityId)?.nameRu ?? '')
            : labelOf(choice, question.language),
        lang:
          question.exerciseType === 'match-pair'
            ? undefined
            : langOf(question.language),
        result: resultOf(choice.id, question.target.id, answeredRegionId),
      }));

  /*
   * Плашка всегда называет верный ответ, а не цель вопроса: в «регион —
   * столица» цель — регион, она уже названа в самом вопросе, а ответ,
   * который проверяют, — столица.
   */
  const capital = cityById(targetRegion.capitalCityId)!;
  const answerLabel =
    question.exerciseType === 'match-pair' ? (
      <>
        Это {capital.nameRu} <span lang="zh-Hans">{capital.nameZh}</span>
      </>
    ) : (
      <>
        Это {targetRegion.nameRu} <span lang="zh-Hans">{targetRegion.nameZh}</span>
      </>
    );

  /*
   * Подводка над плашкой тоже называет то, что проверяли: в «регион —
   * столица» строкой ниже стоит имя столицы, а не региона — «этот регион
   * стоит повторить» над именем города читалось бы как опечатка.
   */
  const answerEyebrow =
    question.exerciseType === 'match-pair'
      ? 'Эту пару стоит повторить'
      : 'Этот регион стоит повторить';

  const prompt = showsAnswer ? (
    <>
      <p className="eyebrow">{answerEyebrow}</p>
      <h1 className="stage-target" data-testid="exercise-target">
        {answerLabel}
      </h1>
    </>
  ) : (
    <>
      <p className="eyebrow">{mode.eyebrow}</p>
      <h1
        className="stage-target"
        data-testid="exercise-target"
        lang={
          question.exerciseType === 'name-target'
            ? undefined
            : langOf(question.language)
        }
      >
        {question.exerciseType === 'name-target'
          ? 'Регион на карте'
          : labelOf(targetRegion, question.language)}
      </h1>
    </>
  );

  return (
    <RoundStage
      title={roundTitle(question.exerciseType)}
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
        isMapAnswer ? undefined : (
          <StageChoices
            choices={stageChoices}
            disabled={round.status !== 'ready'}
            onChoose={answer}
          />
        )
      }
      onExit={onExit}
    >
      {/*
        Карта теперь на всех трёх заданиях. В «регион — столица» она была бы
        лишней колонкой при старом макете; в едином кадре она показывает
        спрошенный регион — столицу подсветка не выдаёт.
      */}
      {/*
        Карте отдаётся справочник, а не пул: она рисует все области всегда, и
        с пулом повтора остальные остались бы без русского имени — читалка
        экрана называла бы их английскими именами из разметки SVG.
      */}
      <ChinaMap
        regions={allRegions}
        selectedRegionId={isMapAnswer ? answeredRegionId : question.target.id}
        onSelect={isMapAnswer ? answer : () => {}}
        onClear={() => {}}
        answerStates={answerStates}
        interactive={isMapAnswer && round.status === 'ready'}
        usage="answer"
      />
    </RoundStage>
  );
}
