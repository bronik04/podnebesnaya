import { useState } from 'react';
import { citiesUpTo } from '../../content/cities';
import { collectionCardSubtitle } from '../../content/collection-scope';
import {
  physicalFeaturesUpTo,
  type PhysicalSet,
} from '../../content/physical-features';
import {
  LANDMARK_SETS,
  landmarksUpTo,
  type LandmarkSet,
} from '../../content/landmark-sets';
import {
  CULTURE_SETS,
  cultureCollectionsUpTo,
  type CultureSet,
} from '../../content/culture-sets';
import {
  citiesWord,
  featuresWord,
  landmarksWord,
  photosWord,
  regionsWord,
} from '../../content/region-count';
import {
  COLLECTION_GROUPS,
  collections,
  type CollectionGroupId,
} from '../../content/collections';
import type { CitySet, Region } from '../../content/types';
import type { QuestionLanguage } from '../../domain/question-language';
import type { Attempt, ExerciseType } from '../../domain/round';
import { ChinaMap } from '../../map/ChinaMap';
import { SiteFooter } from '../../ui/SiteFooter';
import {
  MODE_CARDS,
  MODE_GROUPS,
  type CountryExerciseType,
  type ModeCard,
} from '../exercise/exercise-modes';
import { CollectionCard } from './CollectionCard';
import { ModeStartDialog } from './ModeStartDialog';
import type { Difficulty } from '../../domain/difficulty';
import { nextStep } from './next-step';

export type HomePageProps = {
  readonly regions: readonly Region[];
  readonly attempts: readonly Attempt[];
  /**
   * Уровень сложности, отмеченный в окне перед стартом: последний выбранный,
   * его держит `App` до перезагрузки (решение владельца от 2026-10-18).
   */
  readonly difficulty: Difficulty;
  /*
   * Запуски получают уровень последним аргументом: у игр без уровней он не
   * используется, а строка повтора передаёт запомненный.
   */
  readonly onStartRound: (
    request: ExerciseType,
    language: QuestionLanguage,
    regionIds: readonly string[] | null,
    level: Difficulty,
  ) => void;
  readonly onStartCountryRound: (
    exerciseType: CountryExerciseType,
    language: QuestionLanguage,
    level: Difficulty,
  ) => void;
  readonly onStartCultureRound: (
    language: QuestionLanguage,
    set: CultureSet,
  ) => void;
  readonly onStartHistoryRound: (
    language: QuestionLanguage,
    pool?: undefined,
    kind?: 'when' | 'who' | 'capital' | 'ruler' | 'order',
  ) => void;
  readonly onStartPhysicalRound: (
    exerciseType: 'find-on-map' | 'name-target',
    language: QuestionLanguage,
    set: PhysicalSet,
    level: Difficulty,
  ) => void;
  readonly onStartCityRound: (
    exerciseType: ExerciseType,
    language: QuestionLanguage,
    citySet: CitySet,
    level: Difficulty,
  ) => void;
  readonly onStartLandmarkRound: (
    exerciseType: ExerciseType,
    language: QuestionLanguage,
    set: LandmarkSet,
    level: Difficulty,
  ) => void;
  readonly onOpenAtlas: () => void;
  /** Нажатие по области карты в герое: атлас открывается на этом регионе. */
  readonly onOpenRegion: (regionId: string) => void;
  /** Главный шаг героя: раздел «Режимы» на этой же странице. */
  readonly onGoToModes: () => void;
  readonly onOpenCollections: () => void;
  readonly onOpenCollection: (collectionId: string) => void;
};

/** «Все 12» плюс три группы. Ничего не выбрано — показаны все коллекции. */
type CollectionFilter = CollectionGroupId | 'all';

const SHOWCASE_LIMIT = 4;

/**
 * Сколько ошибочных регионов строка повтора называет по имени. Остальные
 * считаются числом: длинный перечень превратил бы строку в абзац.
 */
const REPEAT_NAMED = 3;

/**
 * Главная. Отвечает на «что это такое» и «что делать дальше» одним экраном:
 * герой с картой и единственным призывом, затем игры, витрина коллекций и
 * происхождение содержания.
 *
 * Главный шаг ровно один и он единственный набран киноварью. Карточки режимов
 * и коллекций стоят на бумаге и запускают то же самое другим путём — для тех,
 * кто уже знает, чего хочет.
 */
/**
 * Наборы вложены: значимые включают столицы; хребты включают реки и формы,
 * озёра — всё. Ученик выбирает, докуда, а не
 * какой один. Числа считаются из каталогов, а не пишутся руками, — иначе они
 * разойдутся с ними при первом же новом объекте.
 */
const CITY_SETS: readonly (readonly [CitySet, string])[] = [
  ['capital', 'Только центры регионов'],
  ['notable', 'И значимые города'],
];

/** Порядок наборов задаётся здесь: у объекта `CULTURE_SETS` его нет. */
const CULTURE_SET_ORDER: readonly CultureSet[] = ['culture', 'nature', 'all'];

/** Порядок наборов достопримечательностей: у `LANDMARK_SETS` его нет. */
const LANDMARK_SET_ORDER: readonly LandmarkSet[] = [
  'monuments',
  'nature',
  'all',
];

const PHYSICAL_SETS: readonly (readonly [PhysicalSet, string])[] = [
  ['base', 'Реки, канал и формы'],
  ['ranges', 'И хребты'],
  ['all', 'И озёра, точки и моря'],
];

function setChoiceFor(card: ModeCard) {
  if (card.kind === 'city') {
    return {
      legend: 'Какие города',
      value: 'capital',
      options: CITY_SETS.map(([value, label]) => {
        const count = citiesUpTo(value).length;

        return { value, label, count, word: citiesWord(count) };
      }),
    };
  }

  if (card.kind === 'culture') {
    return {
      legend: 'Что показывать',
      value: 'culture',
      options: CULTURE_SET_ORDER.map((value) => {
        const count = cultureCollectionsUpTo(value).length;

        return {
          value,
          label: CULTURE_SETS[value],
          count,
          word: photosWord(count),
        };
      }),
    };
  }

  if (card.kind === 'landmark') {
    return {
      legend: 'Что спрашивать',
      value: 'monuments',
      options: LANDMARK_SET_ORDER.map((value) => {
        const count = landmarksUpTo(value).length;

        return {
          value,
          label: LANDMARK_SETS[value],
          count,
          word: landmarksWord(count),
        };
      }),
    };
  }

  if (card.kind === 'physical') {
    return {
      legend: 'Какие объекты',
      value: 'base',
      options: PHYSICAL_SETS.map(([value, label]) => {
        const count = physicalFeaturesUpTo(value).length;

        return { value, label, count, word: featuresWord(count) };
      }),
    };
  }

  return null;
}

export function HomePage({
  regions,
  attempts,
  difficulty,
  onStartRound,
  onStartCountryRound,
  onStartCityRound,
  onStartLandmarkRound,
  onStartCultureRound,
  onStartHistoryRound,
  onStartPhysicalRound,
  onOpenAtlas,
  onOpenRegion,
  onGoToModes,
  onOpenCollections,
  onOpenCollection,
}: HomePageProps) {
  const [filter, setFilter] = useState<CollectionFilter>('all');

  const step = nextStep(attempts, new Date());

  /*
   * Карточка не запускает раунд сразу: сначала спрашивается язык. Открытая
   * карточка живёт в состоянии целиком, а не одним признаком, — окну нужны и
   * название, и объём, и то, каким вызовом её запускать.
   */
  const [startingCard, setStartingCard] = useState<ModeCard | null>(null);

  function start(
    card: ModeCard,
    language: QuestionLanguage,
    set: string,
    level: Difficulty,
  ) {
    setStartingCard(null);
    if (card.kind === 'exercise') {
      onStartRound(card.exerciseType, language, null, level);
    } else if (card.kind === 'country') {
      onStartCountryRound(card.exerciseType, language, level);
    } else if (card.kind === 'city') {
      onStartCityRound(card.exerciseType, language, set as CitySet, level);
    } else if (card.kind === 'landmark') {
      onStartLandmarkRound(card.exerciseType, language, set as LandmarkSet, level);
    } else if (card.kind === 'physical') {
      onStartPhysicalRound(card.exerciseType, language, set as PhysicalSet, level);
    } else if (card.kind === 'history') {
      onStartHistoryRound(language, undefined, card.historyKind);
    } else if (card.kind === 'culture') {
      onStartCultureRound(language, set as CultureSet);
    }
  }

  const shown =
    filter === 'all'
      ? collections
      : collections.filter((collection) => collection.groupId === filter);

  const toRepeat =
    step.regionIds === null
      ? []
      : step.regionIds
          .map((id) => regions.find((region) => region.id === id))
          .filter((region): region is Region => region !== undefined);

  return (
    <main className="site-main site-landing">
      <section className="landing-hero">
        <div className="landing-hero-text">
          {/*
            Заголовок — вопрос самой игры, на настоящих именах: что здесь
            делают, видно раньше, чем прочитан абзац. Прежний «Китай на карте,
            а не в списке» говорил о подходе, а не о занятии.

            Цель перехода по названию в шапке. Фокус переводится на заголовок,
            а не на весь герой: кольцо вокруг полосы во весь кадр читалось бы
            как ошибка вёрстки, а вокруг заголовка — как индикатор фокуса.

            Вторая половина вопроса не разрывается: «а» в конце строки висела
            бы отдельно от своего вопроса.
          */}
          <h1 id="top" tabIndex={-1}>
            Где Сычуань,{' '}
            <span className="landing-hero-line">а где Цзянси?</span>
          </h1>
          {/*
            Длительность — в абзаце, а не надзаголовком капсом: это ответ на
            «сколько займёт», первый вопрос учителя перед уроком, и он стоит
            последней фразой, где его ищут.
          */}
          <p className="lead">
            Поднебесная — Китай по карте, иероглифам и истории: 34&nbsp;региона
            и их центры, реки и горы, памятники и династии. Раунд занимает
            5–15&nbsp;минут, а ошибки возвращаются в повтор.
          </p>
          <div className="landing-hero-actions">
            <button type="button" className="primary" onClick={onGoToModes}>
              Выбрать режим
            </button>
            {/*
              «Исследовать карту», а не «Открыть атлас»: слово называет
              занятие, а не раздел. Эта же кнопка — путь к карте без
              указателя, и потому её нельзя убирать вслед за подписью.
            */}
            <button type="button" className="text" onClick={onOpenAtlas}>
              Исследовать карту
            </button>
          </div>
        </div>
        <figure className="landing-hero-figure">
          <div className="landing-hero-map">
            {/*
              Карта в герое — дверь в атлас: наведение называет область,
              нажатие открывает её карточку.

              Дверь, а не вторая интерактивная карта: области не получают фокус
              и не выбираются здесь, поэтому второй равнозначный список на 34
              пункта на этой странице не нужен — с клавиатуры в атлас ведёт
              кнопка «Исследовать карту» слева.

              Зума у неё нет. Управление показывает `ChinaMap` только тому, кто
              передал `onZoomChange`, а разглядывают карту в атласе.
            */}
            <ChinaMap
              regions={regions}
              selectedRegionId={null}
              onSelect={() => {}}
              onClear={() => {}}
              interactive={false}
              usage="answer"
              onOpenRegion={onOpenRegion}
            />
            <figcaption className="caption">
              Нажмите на регион — откроется его карточка в атласе
            </figcaption>
          </div>
          {/*
            Вертикальная строка — подпись листа, как на свитке: полное имя
            страны. Скрыта от читалки экрана: заголовок рядом уже называет,
            о чём страница, и «чжунхуа жэньминь гунхэго» перед картой ничего не
            добавило бы.
          */}
          <p className="landing-hero-scroll" lang="zh-Hans" aria-hidden="true">
            中华人民共和国
          </p>
        </figure>
      </section>

      {/*
        `tabIndex={-1}` — чтобы «Режимы» в шапке не только прокручивали
        страницу, но и переводили сюда фокус: иначе Tab после нажатия
        продолжился бы от шапки, а читалка экрана не сказала бы, куда попали.
      */}
      <section className="landing-section landing-modes" id="modes" tabIndex={-1}>
        <div className="landing-section-head landing-section-head-split">
          <h2>Режимы</h2>
          <p>Семь тем, начинайте с любой.</p>
        </div>
        {/*
          Повтор ошибок отвечает вернувшемуся ученику, а новому сказать нечего —
          `regionIds` пуст, и строки просто нет. Форма и язык те же, в которых
          ошибались (`nextStep`).

          Имена перечислены, а не только посчитаны: «2 региона» не говорят,
          какие, и ученик не может решить, хочет ли он их сейчас.

          Стоит первой строкой раздела «Режимы», а не под героем: герой занимает
          весь первый экран, и «Выбрать режим» приводит вернувшегося ученика
          сразу к повтору.
        */}
        {step.regionIds === null ? null : (
          <section className="repeat-strip" aria-labelledby="repeat-title">
            <div className="repeat-strip-text">
              <span className="seal seal-ring" lang="zh-Hans" aria-hidden="true">
                复
              </span>
              <div>
                <h3 id="repeat-title" className="repeat-strip-title">
                  Повторить ошибки
                </h3>
                <p className="repeat-strip-list">
                  {step.regionIds.length} {regionsWord(step.regionIds.length)}:{' '}
                  {toRepeat.slice(0, REPEAT_NAMED).map((region, index) => (
                    <span key={region.id}>
                      {index === 0 ? null : ', '}
                      <span lang="zh-Hans">{region.nameZh}</span> {region.nameRu}
                    </span>
                  ))}
                  {toRepeat.length > REPEAT_NAMED
                    ? ` и ещё ${toRepeat.length - REPEAT_NAMED}`
                    : null}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="secondary"
              aria-describedby="repeat-title"
              onClick={() =>
                onStartRound(
                  step.exerciseType,
                  step.language,
                  step.regionIds,
                  difficulty,
                )
              }
            >
              Начать повтор
            </button>
          </section>
        )}

        {/*
          Игры разложены по темам, у каждой свой знак. Группы — те же
          справочники, из которых берутся цели: ученик выбирает сначала
          предмет, а потом форму вопроса.

          Игра — пилюля с одним названием (решение владельца, DECISIONS.md,
          2026-10-14). Что за игра и сколько она идёт, ученик читает в окне
          перед стартом: там он уже выбрал и спрашивает «как тут спрашивают»,
          а двадцать одна карточка с абзацем и объёмом требовала прочитать всё,
          чтобы выбрать.

          Название темы — заголовок третьего уровня внутри «Режимов»: порядок
          уровней на странице совпадает с устройством раздела.
        */}
        <div className="mode-chapters">
          {MODE_GROUPS.map((group) => (
            <section key={group.id} className="mode-chapter">
              <span
                className="mode-chapter-mark"
                lang="zh-Hans"
                aria-hidden="true"
              >
                {group.mark}
              </span>
              <div>
                <h3>{group.title}</h3>
                <p>{group.note}</p>
                <ul className="mode-pills">
                  {MODE_CARDS.filter((card) => card.groupId === group.id).map(
                    (card) => {
                      const isPlanned = card.kind === 'planned';

                      return (
                        <li key={card.id}>
                          {/*
                            Ненаписанный режим не прячется, а выключается и
                            говорит почему — словом в имени кнопки. Сейчас
                            таких нет; приём остаётся для следующего.
                          */}
                          <button
                            type="button"
                            className="mode-pill"
                            disabled={isPlanned}
                            onClick={() => setStartingCard(card)}
                          >
                            {card.title}
                            {isPlanned ? (
                              <span className="mode-pill-status">
                                {' '}
                                · готовится
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    },
                  )}
                </ul>
              </div>
            </section>
          ))}
        </div>
        {startingCard === null ? null : (
          <ModeStartDialog
            mark={startingCard.mark}
            group={
              MODE_GROUPS.find((group) => group.id === startingCard.groupId)
                ?.title ?? ''
            }
            title={startingCard.title}
            summary={startingCard.summary}
            volume={startingCard.volume}
            defaultLanguage={step.language}
            setChoice={setChoiceFor(startingCard)}
            levelChoice={
              startingCard.levels === undefined
                ? null
                : { value: difficulty, ...startingCard.levels }
            }
            onStart={(language, set, level) =>
              start(startingCard, language, set, level)
            }
            onClose={() => setStartingCard(null)}
          />
        )}
      </section>

      {/*
        Полоса не поднятая: секции чередуют две поверхности доски, а после
        снятия «Уровней и прогресса» две поднятые оказались бы подряд и слились
        бы в одну.
      */}
      <section className="landing-section">
        <div className="landing-section-head landing-section-head-split">
          <div>
            <h2>Коллекции</h2>
            <p>
              Места и явления к темам урока: фотографии, короткая справка и
              регион, к которому это относится. Отсюда же берутся вопросы
              культурного режима.
            </p>
          </div>
          <button type="button" className="text" onClick={onOpenCollections}>
            Все коллекции
          </button>
        </div>
        <div className="collection-filters">
          {/*
            Группа выбирается кнопками с `aria-pressed`, а не ссылками: список
            под ними меняется на месте, адрес страницы при этом не меняется.
          */}
          <button
            type="button"
            className="chip"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            Все {collections.length}
          </button>
          {COLLECTION_GROUPS.map((group) => {
            const count = collections.filter(
              (collection) => collection.groupId === group.id,
            ).length;

            return (
              <button
                key={group.id}
                type="button"
                className="chip"
                aria-pressed={filter === group.id}
                onClick={() => setFilter(group.id)}
              >
                {group.title} {count}
              </button>
            );
          })}
        </div>
        <ul className="collection-grid">
          {shown.slice(0, SHOWCASE_LIMIT).map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              subtitle={collectionCardSubtitle(collection, regions)}
              showsGroup
              onOpen={onOpenCollection}
            />
          ))}
        </ul>
      </section>

      <section className="landing-section landing-provenance">
        <div>
          <h2 className="landing-provenance-title">Содержание</h2>
          <ul className="rule-list">
            <li>
              34 региона провинциального уровня: провинции, автономные районы,
              города центрального подчинения и специальные административные
              районы.
            </li>
            <li>
              Названия — по школьной программе; рядом иероглифы и пиньинь с
              тонами.
            </li>
            <li>
              Спорные вопросы маркируются нейтрально и рассматриваются только по
              утверждённой программе.
            </li>
            <li>
              Контраст каждой пары цветов проверяется по WCAG 2.2 на каждой
              сборке, а не заявляется.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="landing-provenance-title">Источники</h2>
          <ul className="rule-list">
            <li>Административное деление КНР, 2022.</li>
            <li>China Internet Information Center, справочник регионов.</li>
            <li>
              Геометрия 33 регионов:{' '}
              <a href="https://www.npmjs.com/package/@svg-maps/china">
                @svg-maps/china
              </a>{' '}
              (Victor Cazanave, на основе MapSVG),{' '}
              <a href="https://creativecommons.org/licenses/by/4.0/">
                CC BY 4.0
              </a>
              .
            </li>
            <li>
              Контур Тайваня:{' '}
              <a href="https://github.com/antvis/china-geojson">china-geojson</a>{' '}
              (AntV).
            </li>
            <li>
              Линия Великого канала: ©{' '}
              <a href="https://www.openstreetmap.org/copyright">
                участники OpenStreetMap
              </a>
              ,{' '}
              <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>.
            </li>
          </ul>
        </div>
      </section>

      {/*
        Обещание про регистрацию и интернет переехало из героя в подвал, как на
        макете: это сведение для учителя, а не шаг обучения, и в герое оно
        спорило с единственным призывом.
      */}
      <SiteFooter
        left="Без регистрации. Прогресс хранится на этом компьютере, работает без интернета — в классе и дома."
        right="Поднебесная — Китай по карте, иероглифам и истории. Для школьников 12–18 лет и учителя"
      />
    </main>
  );
}
