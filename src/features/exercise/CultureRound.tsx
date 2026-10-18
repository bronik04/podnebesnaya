import { useMemo, useState } from 'react';
import type { Collection } from '../../content/collections';
import { photosWord } from '../../content/region-count';
import { sameKindAs } from '../../content/culture-sets';
import { buildCultureChoices } from '../../domain/culture-choices';
import {
  labelOf,
  langOf,
  type QuestionLanguage,
} from '../../domain/question-language';
import { createSeededRandom } from '../../domain/random';
import {
  answerQuestion,
  collectionTarget,
  createRound,
  currentQuestion,
  goToNextQuestion,
  isRoundFinished,
  type Attempt,
  type Round,
} from '../../domain/round';
import { CollectionImage } from '../../ui/CollectionImage';
import {
  CULTURE_MODE,
  roundTitle,
} from './exercise-modes';
import { RoundProgressTrail } from './RoundProgressTrail';
import { verdictOf } from './answer-states';
import { RoundStage } from './RoundStage';
import { StageChoices, type StageChoice } from './StageChoices';
import { useAutoAdvance } from './use-auto-advance';
import { usePhotoPreload } from './use-photo-preload';

/*
 * Часы раунда живут в модуле, а не в теле компонента: `performance.now`
 * нечист, и проверка чистоты React считает его вызов внутри компонента
 * вызовом во время отрисовки. Тот же приём в остальных играх.
 */
function startClock(): number {
  return performance.now();
}

export type CultureRoundProps = {
  readonly collections: readonly Collection[];
  readonly language: QuestionLanguage;
  readonly roundId: string;
  readonly seed: number;
  readonly onFinish: (attempts: readonly Attempt[]) => void;
  readonly onExit: () => void;
};

/**
 * «Культура: узнать по фотографии».
 *
 * Единственная игра, где вопрос — не слово и не место на карте, а сам снимок.
 * Поэтому и кадр устроен иначе: карты нет, её место занимает фотография во всю
 * ширину, а четыре названия стоят полосой под ней, как в остальных играх.
 *
 * Подпись под кадром снята намеренно — она называет то, что спрашивают. Автор
 * и лицензия названы на странице коллекции, куда ведёт итог раунда; лицензия
 * такой способ признаёт.
 */
export function CultureRound({
  collections,
  language,
  roundId,
  seed,
  onFinish,
  onExit,
}: CultureRoundProps) {
  const [round, setRound] = useState<Round>(() =>
    createRound(
      collections.map((collection) => collectionTarget(collection.id)),
      {
        roundId,
        exerciseTypes: ['name-target'],
        language,
        random: createSeededRandom(seed),
      },
    ),
  );
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [mountedAt] = useState(startClock);
  /* Пока `null` — вопрос ещё не сменялся: считаем от начала раунда. */
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const { schedule, waiting, proceed } = useAutoAdvance();

  /*
   * Снимки загружаются до первого вопроса: во время раунда сети быть не
   * должно, а снимок здесь и есть вопрос. Список считается один раз — иначе
   * эффект перезапускался бы на каждый рендер.
   */
  const photoIds = useMemo(
    () =>
      collections
        .map((collection) => collection.photos[0]?.id)
        .filter((id): id is string => id !== undefined),
    [collections],
  );
  const { ready: photosReady, readyAt } = usePhotoPreload(photoIds);

  /*
   * Часы идут с первого вопроса, а не с появления экрана: пока показано
   * «Готовим снимки», ученик ждёт, а не думает, и на медленной сети это
   * ожидание доходит до предела прогрева в двадцать секунд. Прежде они
   * попадали и в длительность первого ответа, и в общее время раунда.
   *
   * Момент берётся у самого прогрева, а не ставится эффектом: состояние,
   * которое пишет эффект сразу после отрисовки, — это лишний проход рендера
   * (и запрет линтера), а здесь достаточно вычислить.
   */
  const roundStartedAt = readyAt ?? mountedAt;
  const questionStartedAt = askedAt ?? roundStartedAt;

  const question = currentQuestion(round);
  const byId = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection])),
    [collections],
  );
  const target = byId.get(question.target.id)!;

  /*
   * Варианты считаются один раз на весь раунд: пересчёт на каждый рендер
   * тасовал бы кнопки под рукой ученика.
   */
  const choicesByQuestion = useMemo(() => {
    const random = createSeededRandom(seed + 1);

    return round.questions.map((item) => {
      const asked = byId.get(item.target.id)!;

      return buildCultureChoices(asked, sameKindAs(asked), collections, random);
    });
  }, [round.questions, byId, collections, seed]);

  const lastAttempt = round.attempts[round.attempts.length - 1];
  const showsAnswer =
    round.status === 'feedback' && lastAttempt?.isCorrect === false;

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

  function answer(collectionId: string) {
    if (round.status !== 'ready') {
      return;
    }

    setAnsweredId(collectionId);
    const answered = answerQuestion(round, {
      answeredId: collectionId,
      durationMs: Math.round(startClock() - questionStartedAt),
      answeredAt: new Date().toISOString(),
    });
    setRound(answered);

    const isCorrect = answered.attempts[answered.attempts.length - 1].isCorrect;
    schedule(isCorrect, () => goNext(answered));
  }

  /* Исход виден у нажатой кнопки и у верной: подсвечивать все четыре — значит ответить за ученика. */
  function resultOf(choiceId: string): StageChoice['result'] {
    if (answeredId === null) {
      return undefined;
    }

    if (choiceId === target.id) {
      return 'correct';
    }

    return choiceId === answeredId ? 'incorrect' : undefined;
  }

  const choices: readonly StageChoice[] = choicesByQuestion[
    round.currentIndex
  ].map((choice) => ({
    id: choice.id,
    label: labelOf(choice, language),
    lang: langOf(language),
    result: resultOf(choice.id),
  }));

  const prompt = !photosReady ? (
    <>
      <p className="eyebrow">{CULTURE_MODE.eyebrow}</p>
      <h1 className="stage-target" data-testid="exercise-target">
        Готовим снимки
      </h1>
    </>
  ) : showsAnswer ? (
    <>
      <p className="eyebrow">Это стоит повторить</p>
      <h1 className="stage-target" data-testid="exercise-target">
        <span lang={langOf(language)}>{labelOf(target, language)}</span>
        {/*
          Где это увидят — вторая половина обещания карточки. Названием
          региона, а не картой: карта здесь не показана, и указывать на
          невидимое нечем.
        */}
        {target.scopeLabel === undefined ? null : (
          <span className="stage-hint"> · {target.scopeLabel}</span>
        )}
      </h1>
    </>
  ) : (
    <>
      <p className="eyebrow">{CULTURE_MODE.eyebrow}</p>
      <h1 className="stage-target" data-testid="exercise-target">
        Что на снимке
      </h1>
    </>
  );

  return (
    <RoundStage
      onContinue={waiting ? proceed : null}
      title={roundTitle('culture')}
      prompt={prompt}
      promptState={showsAnswer ? 'answer' : 'question'}
      verdict={verdictOf(round)}
      startedAt={roundStartedAt}
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
        <StageChoices
          choices={choices}
          disabled={!photosReady || round.status !== 'ready'}
          onChoose={answer}
        />
      }
      onExit={onExit}
    >
      <div className="culture-stage">
        {/*
          Ожидание идёт внутри той же оболочки, а не отдельным экраном: у
          оболочки есть «Прервать раунд», и без неё ученик, передумавший ждать,
          остался бы запертым.
        */}
        {photosReady ? null : (
          <p className="culture-note" role="status">
            {photoIds.length} {photosWord(photoIds.length)} загружаются. Раунд
            начнётся, когда они будут готовы, — дальше сеть не понадобится.
          </p>
        )}
        {/*
          Снимок без подписи об авторе: подпись называет место и тем отвечает
          на вопрос. Автор назван на странице коллекции, куда ведёт итог.

          Ключ по вопросу заставляет React заменить узел, а не переиспользовать
          его: без него браузер оставлял бы прежний кадр видимым, пока грузится
          следующий, и ученик отвечал бы на предыдущий вопрос.
        */}
        {photosReady ? (
          <CollectionImage
            key={question.id}
            photo={target.photos[0]}
            height="stage"
            sizes="100vw"
            credited={false}
          />
        ) : null}
        {photosReady && round.status === 'feedback' ? (
          <p className="culture-note">{target.lead}</p>
        ) : null}
      </div>
    </RoundStage>
  );
}
