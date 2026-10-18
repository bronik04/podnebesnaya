import { useMemo, useState } from 'react';
import {
  dynasties as allDynasties,
  spanLabel,
  askedYearLabel,
  reignLabel,
} from '../../content/dynasties';
import type { Dynasty } from '../../content/types';
import { cityById } from '../../content/cities';
import {
  capitalOfDynasty,
  dynastyCapitals,
} from '../../content/dynasty-capitals';
import { buildDynastyChoices } from '../../domain/dynasty-choices';
import {
  buildCapitalChoices,
  buildRulerChoices,
} from '../../domain/dynasty-pair-choices';
import { rulerOfDynasty, rulers as allRulers } from '../../content/rulers';
import { pickYear } from '../../domain/dynasty-years';
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
  historyTarget,
  isRoundFinished,
  type Attempt,
  type Round,
} from '../../domain/round';
import { DynastyTimeline, type TimelineMark } from './DynastyTimeline';
import {
  HISTORY_CAPITAL_MODE,
  HISTORY_MODE,
  HISTORY_RULER_MODE,
  HISTORY_YEAR_MODE,
  roundTitle,
  HISTORY_CARD_IDS,
} from './exercise-modes';
import { RoundProgressTrail } from './RoundProgressTrail';
import { verdictOf } from './answer-states';
import { RoundStage } from './RoundStage';
import { StageChoices, type StageChoice } from './StageChoices';
import { useAutoAdvance } from './use-auto-advance';

/*
 * Часы раунда живут в модуле, а не в теле компонента: `performance.now`
 * нечист, и проверка чистоты React считает его вызов внутри компонента
 * вызовом во время отрисовки. Тот же приём в `CityRound` и `PhysicalRound`.
 */
function startClock(): number {
  return performance.now();
}

export type HistoryRoundProps = {
  /**
   * Что спрашивают: `when` — срок названной династии, `who` — династию
   * названного года. Раунд, цель, лента и отвлекающие у них общие, различаются
   * вопрос и подписи вариантов.
   */
  readonly kind?: 'when' | 'who' | 'capital' | 'ruler';
  /**
   * Пул раунда. По умолчанию вся лента; «Повторить ошибки» задаёт его
   * напрямую, и никакому набору он не соответствует.
   */
  readonly dynasties?: readonly Dynasty[];
  readonly language: QuestionLanguage;
  readonly roundId: string;
  readonly seed: number;
  readonly onFinish: (attempts: readonly Attempt[]) => void;
  readonly onExit: () => void;
};

/**
 * «История: династии и даты».
 *
 * Карты здесь нет — и это решение, а не упущение. Карта в тренажёре
 * административная и современная; границы Тан и Юань с нынешними провинциями
 * не совпадают, и вопрос о династии на этой карте учил бы соответствию,
 * которого нет. Там, где история всё же ложится на сегодняшнюю карту, о ней
 * уже спрашивают: Сиань и Лоян стоят в игре «город — регион», терракотовая
 * армия — в коллекциях со своим регионом.
 *
 * Вместо карты — лента: полоса времени, пропорциональная годам. На ней и
 * видно то, чего не даёт список, — что Чжоу правила восемь веков, а Цинь
 * четырнадцать лет.
 *
 * Вопрос один: названа династия, выбрать её срок. Отвлекающие — сроки соседних
 * по времени династий (`buildDynastyChoices`), поэтому вопрос решается знанием
 * даты, а не отсевом нелепого.
 */
export function HistoryRound({
  kind = 'when',
  dynasties = allDynasties,
  language,
  roundId,
  seed,
  onFinish,
  onExit,
}: HistoryRoundProps) {
  /*
   * В игре о столицах спрашиваются не все двенадцать: у Ся, Шан, Чжоу, Цинь и
   * Троецарствия столицы нет в каталоге городов, и вопрос о них собрать не из
   * чего.
   */
  const pool =
    kind === 'capital'
      ? dynasties.filter(
          (dynasty) => capitalOfDynasty(dynasty.id) !== undefined,
        )
      : kind === 'ruler'
        ? dynasties.filter(
            (dynasty) => rulerOfDynasty(dynasty.id) !== undefined,
          )
        : dynasties;

  const [round, setRound] = useState<Round>(() =>
    createRound(
      pool.map((dynasty) => historyTarget(dynasty.id)),
      {
        roundId,
        /*
         * `match-pair`: спрашивают одно (имя династии), отвечают другим
         * (сроком). Той же формы, что «регион — столица».
         */
        exerciseTypes: ['match-pair'],
        language,
        random: createSeededRandom(seed),
      },
    ),
  );
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [startedAt] = useState(startClock);
  const [askedAt, setAskedAt] = useState(startClock);
  const { schedule } = useAutoAdvance();

  const question = currentQuestion(round);

  /*
   * Варианты считаются один раз на весь раунд: пересчёт на каждый рендер
   * тасовал бы кнопки под рукой ученика. Тот же приём в остальных играх.
   *
   * Отвлекающие берутся из полной ленты, а не из пула: в повторе ошибок пул
   * бывает из двух династий, и четвёртому варианту неоткуда взяться.
   */
  const choicesByQuestion = useMemo(
    () => {
      const random = createSeededRandom(seed + 1);

      return round.questions.map((item) =>
        buildDynastyChoices(allDynasties, item.target.id, random),
      );
    },
    [round.questions, seed],
  );

  /*
   * Год на вопрос считается один раз на раунд, как и варианты: пересчёт на
   * каждый рендер менял бы вопрос под рукой ученика.
   */
  const yearByQuestion = useMemo(() => {
    if (kind !== 'who') {
      return [];
    }

    const random = createSeededRandom(seed + 2);

    return round.questions.map((item) =>
      pickYear(allDynasties, item.target.id, random),
    );
  }, [kind, round.questions, seed]);

  /*
   * Варианты игры о столицах: ответом служит город, а не династия, поэтому
   * идентификатор варианта — `cityId`, и он же передаётся в `expectedId`.
   */
  const capitalChoicesByQuestion = useMemo(() => {
    if (kind !== 'capital') {
      return [];
    }

    const random = createSeededRandom(seed + 3);

    return round.questions.map((item) =>
      buildCapitalChoices(
        dynastyCapitals,
        allDynasties,
        item.target.id,
        random,
      ),
    );
  }, [kind, round.questions, seed]);

  const rulerChoicesByQuestion = useMemo(() => {
    if (kind !== 'ruler') {
      return [];
    }

    const random = createSeededRandom(seed + 4);

    return round.questions.map((item) =>
      buildRulerChoices(allRulers, allDynasties, item.target.id, random),
    );
  }, [kind, round.questions, seed]);

  const target = allDynasties.find(
    (dynasty) => dynasty.id === question.target.id,
  ) as Dynasty;
  const capital = kind === 'capital' ? capitalOfDynasty(target.id) : undefined;
  const ruler = kind === 'ruler' ? rulerOfDynasty(target.id) : undefined;
  const mode =
    kind === 'who'
      ? HISTORY_YEAR_MODE
      : kind === 'capital'
        ? HISTORY_CAPITAL_MODE
        : kind === 'ruler'
          ? HISTORY_RULER_MODE
          : HISTORY_MODE;
  const askedYear = kind === 'who' ? yearByQuestion[round.currentIndex] : null;
  const lastAttempt = round.attempts[round.attempts.length - 1];
  const showsAnswer = round.status === 'feedback' && lastAttempt?.isCorrect === false;

  /*
   * Метки ленты. При верном ответе одна — верная полоса; при ошибке две:
   * верная и выбранная. Расстояние между ними и есть величина промаха, и
   * увидеть его на ленте важнее, чем прочитать «неверно». Прежде полоса
   * красилась киноварью при любом ответе, и верный ответ читался как ошибка.
   */
  const marks: readonly TimelineMark[] =
    /*
     * В игре о столицах на ленте нечего помечать исходом: ответом служит
     * город, а не время. Полоса лишь показывает, о какой династии речь.
     */
    kind === 'capital' || kind === 'ruler'
      ? [{ dynastyId: target.id, kind: 'asked' }]
      : round.status !== 'feedback' || answeredId === null
        ? []
        : answeredId === target.id
          ? [{ dynastyId: target.id, kind: 'correct' }]
          : [
              { dynastyId: target.id, kind: 'correct' },
              { dynastyId: answeredId, kind: 'wrong' },
            ];

  const answeredDynasty = allDynasties.find(
    (dynasty) => dynasty.id === answeredId,
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

  /**
   * Что считается верным ответом. В играх о времени это сама династия, в игре
   * о столицах — город: спрашивают одно, отвечают другим, и домен для этого
   * уже носит `expectedId` (заведён игрой «город — регион»).
   */
  const expectedId =
    kind === 'capital' ? capital?.cityId : kind === 'ruler' ? ruler?.id : undefined;

  function answer(answeredValueId: string) {
    if (round.status !== 'ready') {
      return;
    }

    setAnsweredId(answeredValueId);
    const answered = answerQuestion(round, {
      answeredId: answeredValueId,
      expectedId,
      durationMs: Math.round(startClock() - askedAt),
      answeredAt: new Date().toISOString(),
    });
    setRound(answered);

    const isCorrect = answered.attempts[answered.attempts.length - 1].isCorrect;
    schedule(isCorrect, () => goNext(answered));
  }

  /*
   * Исход показывается только у нажатой кнопки и у верной: подсвечивать все
   * четыре значило бы отвечать на вопрос вместо ученика.
   */
  function resultOf(choiceId: string): StageChoice['result'] {
    if (answeredId === null) {
      return undefined;
    }

    if (choiceId === (expectedId ?? target.id)) {
      return 'correct';
    }

    return choiceId === answeredId ? 'incorrect' : undefined;
  }

  const choices: readonly StageChoice[] =
    kind === 'capital'
      ? capitalChoicesByQuestion[round.currentIndex].map((choice) => ({
          id: choice.cityId,
          label: cityById(choice.cityId)?.nameRu ?? choice.historicNameRu,
          result: resultOf(choice.cityId),
        }))
      : kind === 'ruler'
        ? rulerChoicesByQuestion[round.currentIndex].map((choice) => ({
            id: choice.id,
            label: choice.nameRu,
            result: resultOf(choice.id),
          }))
        : choicesByQuestion[round.currentIndex].map((choice) => ({
          id: choice.id,
          label: kind === 'who' ? choice.nameRu : spanLabel(choice),
          result: resultOf(choice.id),
        }));

  /* Что стоит на плашке вопроса: имя династии, год или уточнение о столице. */
  const askedLabel =
    kind === 'capital' ? (capital?.qualifier ?? target.nameRu) : target.nameRu;

  const prompt = showsAnswer ? (
    <>
      <p className="eyebrow">
        {kind === 'who'
          ? 'Эту династию стоит повторить'
          : kind === 'capital'
            ? 'Эту столицу стоит повторить'
            : kind === 'ruler'
              ? 'Этого правителя стоит повторить'
              : 'Эту дату стоит повторить'}
      </p>
      <h1 className="stage-target" data-testid="exercise-target">
        {kind === 'capital' ? (
          <>
            {askedLabel} — {capital?.historicNameRu}
          </>
        ) : kind === 'ruler' ? (
          <>
            {target.nameRu} — {ruler?.nameRu}
          </>
        ) : (
          <>
            <span lang={langOf(language)}>{labelOf(target, language)}</span> —{' '}
            {spanLabel(target)}
          </>
        )}
      </h1>
    </>
  ) : (
    <>
      <p className="eyebrow">{mode.eyebrow}</p>
      {/*
        Язык вопроса тот же, что и в остальных играх: русское имя или одни
        иероглифы. Иероглифическая династия — та же задача на шаг труднее, и
        отнимать её у истории незачем.
      */}
      {/*
        В игре по годам вопрос — сам год, и языка у него нет: цифры одинаковы
        по-русски и по-китайски.
      */}
      {kind === 'who' ? (
        <h1 className="stage-target" data-testid="exercise-target">
          {askedYearLabel(askedYear as number)}
        </h1>
      ) : kind === 'capital' || kind === 'ruler' ? (
        /*
         * Уточнение вместо имени там, где столицу переносили: «столица Хань»
         * имеет два верных ответа, «столица Западной Хань» — один.
         */
        <h1 className="stage-target" data-testid="exercise-target">
          {askedLabel}
        </h1>
      ) : (
        <h1
          className="stage-target"
          data-testid="exercise-target"
          lang={langOf(language)}
        >
          {labelOf(target, language)}
        </h1>
      )}
    </>
  );

  return (
    <RoundStage
      title={roundTitle(HISTORY_CARD_IDS[kind])}
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
        <StageChoices
          choices={choices}
          disabled={round.status !== 'ready'}
          onChoose={answer}
        />
      }
      onExit={onExit}
    >
      <div className="history-stage">
        {/*
          Лента молчит, пока вопрос открыт: подписанная, она и была бы
          ответом. Имена и срок появляются вместе с разбором — тогда видно не
          только какая дата верна, но и куда она попадает во времени.
        */}
        <DynastyTimeline
          dynasties={allDynasties}
          marks={marks}
          showsNames={round.status === 'feedback'}
          /*
           * Лента отвечает, пока вопрос открыт. Кнопки вариантов остаются: два
           * пути к одному ответу.
           */
          onAnswer={
            kind === 'when' || kind === 'who'
              ? round.status === 'ready'
                ? answer
                : undefined
              : undefined
          }
          hint={
            round.status === 'feedback' ? (
              <p className="history-note">
                {/*
                  Разбор столицы называет оба имени: город в учебнике истории и
                  город на нынешней карте — один и тот же, и в этом весь урок.
                */}
                {/*
                  Разбор правителя. Годы есть не у всех: у Юя их не даёт
                  предание, у Чэн Тана датировка спорна — и тогда вместо срока
                  говорится словом, а не ставится прочерк.
                */}
                {kind === 'ruler' && ruler !== undefined ? (
                  <>
                    {ruler.nameRu} (
                    <span lang="zh-Hans">{ruler.nameZh}</span>),{' '}
                    {/*
                      Точка ставится только если её нет: срок до нашей эры уже
                      кончается точкой, и вторая давала «210 до н. э..».
                    */}
                    {(() => {
                      const reign =
                        ruler.from !== undefined && ruler.to !== undefined
                          ? `правил ${reignLabel(ruler.from, ruler.to)}`
                          : 'правил по преданию';

                      return reign.endsWith('.') ? reign : `${reign}.`;
                    })()}{' '}
                    {ruler.note}
                  </>
                ) : null}
                {kind === 'capital' && capital !== undefined ? (
                  <>
                    Столица {askedLabel} — {capital.historicNameRu} (
                    <span lang="zh-Hans">{capital.historicNameZh}</span>),
                    нынешний {cityById(capital.cityId)?.nameRu}.
                    {capital.note !== undefined ? ` ${capital.note}` : ''}
                  </>
                ) : null}
                {/*
                  Выбранную по ошибке называет строка разбора, а не подпись на
                  ленте: две выделенные подписи рядом налезают друг на друга, а
                  у Тан и Сун они рядом.
                */}
                {kind !== 'capital' &&
                kind !== 'ruler' &&
                answeredDynasty !== undefined &&
                answeredDynasty.id !== target.id ? (
                  <>
                    Вы показали {answeredDynasty.nameRu} —{' '}
                    {/*
                      Точка ставится только если её нет: срок до нашей эры уже
                      кончается точкой, и вторая давала «1046 до н. э..».
                    */}
                    {spanLabel(answeredDynasty)}
                    {spanLabel(answeredDynasty).endsWith('.') ? '' : '.'}{' '}
                  </>
                ) : null}
                {kind === 'capital' || kind === 'ruler' ? null : target.note}
              </p>
            ) : (
              <p className="history-hint">
                {kind === 'capital' || kind === 'ruler'
                  ? 'Полоса на ленте показывает, о какой династии речь.'
                  : 'Нажмите по ленте или выберите срок ниже: длина каждой полосы — настоящий срок династии.'}
              </p>
            )
          }
        />
      </div>
    </RoundStage>
  );
}
