import { useMemo, useState } from 'react';
import { cities as allCities } from '../../content/cities';
import { regions } from '../../content/regions';
import type { City } from '../../content/types';
import { buildCityChoices } from '../../domain/city-choices';
import { labelOf, langOf, type QuestionLanguage } from '../../domain/question-language';
import { createSeededRandom } from '../../domain/random';
import {
  answerQuestion,
  cityTarget,
  createRound,
  currentQuestion,
  goToNextQuestion,
  isRoundFinished,
  type Attempt,
  type ExerciseType,
  type Round,
} from '../../domain/round';
import { ChinaMap } from '../../map/ChinaMap';
import type { MapZoom } from '../../map/MapControls';
import { answerStatesFor, verdictOf } from './answer-states';
import {
  CITY_MODES,
  roundTitle,
  CITY_CARD_IDS,
} from './exercise-modes';
import { RoundProgressTrail } from './RoundProgressTrail';
import { RoundStage } from './RoundStage';
import { StageChoices, type StageChoice } from './StageChoices';
import { useAutoAdvance } from './use-auto-advance';

/*
 * Часы раунда живут в модуле, а не в теле компонента. `performance.now`
 * нечист, и проверка чистоты React считает его вызов внутри компонента
 * вызовом во время отрисовки, хотя оба вызова происходят в обработчиках
 * событий. Вынести их сюда честнее, чем отключать правило: время раунда
 * действительно не относится к отрисовке.
 */
function startClock(): number {
  return performance.now();
}

function elapsedSince(start: number): number {
  return Math.round(startClock() - start);
}

export type CityRoundProps = {
  /**
   * Пул раунда: какие города спрашиваются. Набор выбирается перед стартом, а
   * на «Повторить ошибки» пул сужается до ошибочных, — справочником он не
   * является: отвлекающие и точки на карте берут `allCities`.
   */
  readonly cities: readonly City[];
  readonly exerciseType: ExerciseType;
  readonly language: QuestionLanguage;
  readonly roundId: string;
  readonly seed: number;
  readonly onFinish: (attempts: readonly Attempt[]) => void;
  readonly onExit: () => void;
};

/**
 * Три игры по городам одним экраном.
 *
 * Отдельно от `ExerciseRound`, а не общим экраном с ним: у городов другой
 * ответ (точка вместо области), другие отвлекающие (ближайшие, а не того же
 * типа) и третья игра, где спрашивают город, а отвечают регионом. Свести их в
 * один компонент значило бы получить ветвление в каждой строке разметки.
 *
 * | Игра | Вопрос | Ответ |
 * | --- | --- | --- |
 * | `find-on-map` | имя города | нажатие по точке |
 * | `name-target` | подсвеченная точка | одно из четырёх имён |
 * | `match-pair` | имя города | нажатие по области региона |
 *
 * Паузы-разбора больше нет (спек RoundStage): после ошибки плашка вопроса
 * называет верный город, и раунд идёт дальше сам.
 */
export function CityRound({
  cities,
  exerciseType,
  language,
  roundId,
  seed,
  onFinish,
  onExit,
}: CityRoundProps) {
  const [round, setRound] = useState<Round>(() =>
    createRound(
      cities.map((city) => cityTarget(city.id)),
      {
        roundId,
        exerciseTypes: [exerciseType],
        language,
        random: createSeededRandom(seed),
      },
    ),
  );
  /*
   * Увеличение с панорамированием даётся именно здесь: самая плотная часть
   * городов — восточное побережье, и на целом виде соседние точки там сливаются
   * (спек городов, «Где геометрия не спасает»). В играх по регионам области
   * крупные, и зум им не нужен.
   */
  const [zoom, setZoom] = useState<MapZoom>(1);
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [askedAt, setAskedAt] = useState(startClock);
  const [startedAt] = useState(startClock);
  const { schedule } = useAutoAdvance();

  /*
   * Отвлекающие берутся из всего справочника, а не из пула раунда: в повторе
   * ошибок пул бывает из одного города, и вариант остался бы один — сам
   * ответ. Спрашиваются при этом только города пула.
   */
  const choicesByQuestion = useMemo(() => {
    const random = createSeededRandom(seed + 1);

    return round.questions.map((question) =>
      buildCityChoices(allCities, question.target.id, random),
    );
  }, [round.questions, seed]);

  const question = currentQuestion(round);
  const targetCity = cities.find((city) => city.id === question.target.id)!;
  const mode = CITY_MODES[exerciseType];
  const lastAttempt = round.attempts[round.attempts.length - 1];

  /** Чем отвечают: точкой города, именем из вариантов или областью региона. */
  const answersWithRegion = exerciseType === 'match-pair';
  const showsChoices = exerciseType === 'name-target';
  const regionOfTarget = regions.find((region) => region.id === targetCity.regionId)!;

  /*
   * После ошибки в «город — регион» карта штрихует верную область и метит
   * ошибочную — то же правило, что в ExerciseRound (answer-states.ts).
   */
  const answerStates = useMemo(
    () =>
      answersWithRegion && answeredId !== null
        ? answerStatesFor(regions, targetCity.regionId, answeredId)
        : {},
    [answersWithRegion, answeredId, targetCity.regionId],
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
      expectedId: answersWithRegion ? targetCity.regionId : undefined,
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
   * вызовом во время отрисовки — `performance.now` внутри становится ошибкой
   * линтера. Тот же приём в `ExerciseRound`.
   */
  function handleRegionSelect(regionId: string) {
    if (answersWithRegion) {
      answer(regionId);
    }
  }

  function handleCitySelect(cityId: string) {
    answer(cityId);
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
            : choice.id === targetCity.id
              ? 'correct'
              : choice.id === answeredId
                ? 'incorrect'
                : undefined,
      }))
    : [];

  const prompt = showsAnswer ? (
    <>
      <p className="eyebrow">Этот город стоит повторить</p>
      <h1 className="stage-target" data-testid="exercise-target">
        {answersWithRegion ? (
          <>
            Это {targetCity.nameRu} <span lang="zh-Hans">{targetCity.nameZh}</span> —{' '}
            {regionOfTarget.nameRu} <span lang="zh-Hans">{regionOfTarget.nameZh}</span>
          </>
        ) : (
          <>
            Это {targetCity.nameRu} <span lang="zh-Hans">{targetCity.nameZh}</span>
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
        {showsChoices ? 'Город на карте' : labelOf(targetCity, question.language)}
      </h1>
    </>
  );

  return (
    <RoundStage
      title={roundTitle(CITY_CARD_IDS[exerciseType])}
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
        В «город — регион» точки скрыты вовсе: подсвеченный кружок в
        середине области — готовый ответ. В остальных двух играх точки
        есть, но без подписей: в «назвать город» подпись назвала бы
        спрошенный город, в «найти город» — выдала бы его наведением
        курсора. Та же утечка, что у выносок Макао и Гонконга.
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
        /*
         * Приближение к грозди живёт один вопрос: со сменой вопроса карта
         * возвращается к той ступени, которую ученик выбрал сам. Иначе
         * следующий вопрос о Урумчи начинался бы с пятикратно увеличенной
         * дельты Чжуцзяна.
         */
        questionKey={`${roundId}:${round.currentIndex}`}
        usage="answer"
        showsCities={!answersWithRegion}
        selectedCityId={showsChoices ? targetCity.id : answeredId}
        showsCityLabels={false}
        onSelectCity={exerciseType === 'find-on-map' ? handleCitySelect : undefined}
        /*
         * Выноски Макао и Гонконга видны только там, где отвечают регионом:
         * в «найти город» и «назвать город» регион не выбирается, и пустые
         * кружки в море лишь спорили бы с гроздью городов дельты.
         */
        showsCallouts={answersWithRegion}
      />
    </RoundStage>
  );
}
