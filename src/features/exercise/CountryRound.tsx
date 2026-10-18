import { useMemo, useState } from 'react';
import { countries as allCountries } from '../../content/countries';
import type { Country } from '../../content/countries';
import { regions } from '../../content/regions';
import { buildCountryChoices } from '../../domain/country-choices';
import {
  labelOf,
  langOf,
  type QuestionLanguage,
} from '../../domain/question-language';
import { createSeededRandom } from '../../domain/random';
import {
  answerQuestion,
  countryTarget,
  createRound,
  currentQuestion,
  goToNextQuestion,
  isRoundFinished,
  type Attempt,
  type Round,
} from '../../domain/round';
import { ChinaMap } from '../../map/ChinaMap';
import { COUNTRY_FRAME_OUTSET } from '../../map/target-size';
import { answerStatesFor, verdictOf } from './answer-states';
import {
  COUNTRY_MODES,
  type CountryExerciseType,
  roundTitle,
} from './exercise-modes';
import { RoundProgressTrail } from './RoundProgressTrail';
import { RoundStage } from './RoundStage';
import { StageChoices, type StageChoice } from './StageChoices';
import { useAutoAdvance } from './use-auto-advance';

/*
 * Часы раунда живут в модуле, а не в теле компонента: `performance.now` нечист,
 * и проверка чистоты React считает его вызов внутри компонента вызовом во время
 * отрисовки. Тот же приём в `CityRound`.
 */
function startClock(): number {
  return performance.now();
}

function elapsedSince(start: number): number {
  return Math.round(startClock() - start);
}

export type { CountryExerciseType };

export type CountryRoundProps = {
  readonly countries?: readonly Country[];
  readonly exerciseType: CountryExerciseType;
  readonly language: QuestionLanguage;
  readonly roundId: string;
  readonly seed: number;
  readonly onFinish: (attempts: readonly Attempt[]) => void;
  readonly onExit: () => void;
};

/**
 * Две игры по сопредельным государствам одним экраном.
 *
 * | Игра | Вопрос | Ответ |
 * | --- | --- | --- |
 * | `find-on-map` | имя страны | нажатие по её контуру |
 * | `name-target` | подсвеченная страна | одно из четырёх имён |
 *
 * Третьей игры, как у городов, здесь нет: связать страну со вторым каталогом
 * нечем — «в каком регионе Казахстан» вопрос без ответа.
 *
 * Подписей стран на карте нет ни в одной из двух игр (решение владельца от
 * 2026-08-31): имя страны и есть ответ в обеих.
 */
export function CountryRound({
  countries = allCountries,
  exerciseType,
  language,
  roundId,
  seed,
  onFinish,
  onExit,
}: CountryRoundProps) {
  const [round, setRound] = useState<Round>(() =>
    createRound(
      countries.map((country) => countryTarget(country.id)),
      {
        roundId,
        exerciseTypes: [exerciseType],
        language,
        random: createSeededRandom(seed),
      },
    ),
  );
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [askedAt, setAskedAt] = useState(startClock);
  const [startedAt] = useState(startClock);
  const { schedule } = useAutoAdvance();

  const choicesByQuestion = useMemo(() => {
    const random = createSeededRandom(seed + 1);

    /*
     * Отвлекающие берутся из всего справочника, а не из пула раунда: в повторе
     * ошибок пул бывает из одной страны, и вариант остался бы один — сам ответ.
     * Спрашиваются при этом только страны пула.
     */
    return round.questions.map((question) =>
      buildCountryChoices(allCountries, question.target.id, random),
    );
  }, [round.questions, seed]);

  const question = currentQuestion(round);
  const targetCountry = countries.find(
    (country) => country.id === question.target.id,
  )!;
  const mode = COUNTRY_MODES[exerciseType];
  const lastAttempt = round.attempts[round.attempts.length - 1];
  const showsChoices = exerciseType === 'name-target';
  const showsAnswer =
    round.status === 'feedback' && lastAttempt?.isCorrect === false;

  /*
   * После ответа карта называет исход: верная страна залита, ошибочная
   * заштрихована, остальные закрыты — то же правило, что у регионов и городов
   * (`answer-states.ts`). Справочник передаётся целиком, а не пулом раунда: в
   * повторе ошибок пул бывает из одной страны, а нарисованы на карте все
   * четырнадцать.
   */
  const countryStates = useMemo(
    () => answerStatesFor(allCountries, targetCountry.id, answeredId),
    [answeredId, targetCountry.id],
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
      durationMs: elapsedSince(askedAt),
      answeredAt: new Date().toISOString(),
    });
    setRound(answered);

    const isCorrect = answered.attempts[answered.attempts.length - 1].isCorrect;
    schedule(isCorrect, () => goNext(answered));
  }

  function handleCountrySelect(countryId: string) {
    if (!showsChoices) {
      answer(countryId);
    }
  }

  const stageChoices: readonly StageChoice[] = showsChoices
    ? choicesByQuestion[round.currentIndex].map((choice) => ({
        id: choice.id,
        label: labelOf(choice, question.language),
        lang: langOf(question.language),
        result:
          answeredId === null
            ? undefined
            : choice.id === targetCountry.id
              ? 'correct'
              : choice.id === answeredId
                ? 'incorrect'
                : undefined,
      }))
    : [];

  const prompt = showsAnswer ? (
    <>
      <p className="eyebrow">Эту страну стоит повторить</p>
      <h1 className="stage-target" data-testid="exercise-target">
        Это {targetCountry.nameRu}{' '}
        <span lang="zh-Hans">{targetCountry.nameZh}</span>
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
          ? 'Страна на карте'
          : labelOf(targetCountry, question.language)}
      </h1>
    </>
  );

  return (
    <RoundStage
      title={roundTitle(exerciseType === 'find-on-map' ? 'find-country' : 'name-country')}
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
        Регионы передаются настоящие, хотя выбирать их нельзя: карта берёт
        отсюда имена областей для читалки экрана, и с пустым списком Китай
        заговорил бы по-английски именами из разметки SVG.
      */}
      <ChinaMap
        regions={regions}
        selectedRegionId={null}
        onSelect={() => {}}
        onClear={() => {}}
        usage="answer"
        /*
         * Китай остаётся в политических цветах, хотя вопрос про то, что
         * вокруг него. Проверено в браузере на обоих вариантах: серый Китай
         * сливается с нейтральным тоном стран, и граница между своим и чужим
         * пропадает — ровно та, о которой игра и спрашивает. Подсказки в цвете
         * нет: спрашивают не про области.
         */
        variant="reference"
        interactive={false}
        showsCountries
        /*
         * Подписей стран на карте нет ни в одной из двух игр (решение
         * владельца от 2026-08-31): подпись и есть ответ, и с ней вопрос
         * «найдите Афганистан» решается чтением. Имя называет разбор после
         * ответа, а до ответа его называет только список.
         *
         * В «назвать страну» контуры вдобавок не отвечают: ответ выбирается
         * кнопкой. Признак снимает с них роль и фокус — иначе читалка экрана
         * объявляла бы четырнадцать кнопок, а обход Tab вёл через
         * четырнадцать остановок, ни одна из которых ничего не делает.
         */
        countriesAnswer={!showsChoices}
        /*
         * Выносок Макао и Гонконга здесь нет: регион в играх по странам не
         * выбирается, и на карте остались бы два пустых кружка с поводками в
         * море — да ещё с ролью кнопки и именем области из разметки SVG, то
         * есть две кнопки, которые ничего не делают. То же правило и по тому
         * же доводу, что в «найти город» и «назвать город».
         */
        showsCallouts={false}
        frameOutset={COUNTRY_FRAME_OUTSET}
        selectedCountryId={showsChoices ? targetCountry.id : answeredId}
        onSelectCountry={handleCountrySelect}
        countryStates={countryStates}
      />
    </RoundStage>
  );
}
