import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { citiesUpTo } from './content/cities';
import { collectionById } from './content/collections';
import {
  physicalFeatures,
  physicalFeaturesUpTo,
  type PhysicalSet,
} from './content/physical-features';
import { regions } from './content/regions';
import type { Collection } from './content/collections';
import {
  cultureCollectionsUpTo,
  type CultureSet,
} from './content/culture-sets';
import { dynasties } from './content/dynasties';
import {
  citiesWord,
  countriesWord,
  dynastiesWord,
  featuresWord,
  landmarksWord,
  photosWord,
} from './content/region-count';
import type {
  City,
  CitySet,
  Dynasty,
  PhysicalFeature,
  Region,
} from './content/types';
import { addAttempts } from './domain/progress';
import {
  bestAccuracy,
  masteredTargets,
  summariseRound,
} from './domain/progress-rules';
import { summariseFillRound, type FillRound } from './domain/fill-round';
import { createProgressStore } from './domain/progress-storage';
import type { QuestionLanguage } from './domain/question-language';
import { outcomesByTarget } from './domain/round-outcomes';
import type { Attempt, ExerciseType } from './domain/round';
import { HomePage } from './features/home/HomePage';
import {
  AtlasPage,
  CityRound,
  CultureRound,
  HistoryRound,
  LandmarkRound,
  CollectionPage,
  CollectionsPage,
  ExerciseRound,
  FillMapResultsPage,
  FillMapRound,
  CountryRound,
  OrderRound,
  PhysicalRound,
  prefetchScreens,
  RoundResultsPage,
} from './screens';
import { hasUnaskedTargets } from './features/results/has-unasked';
import type { Landmark } from './content/landmarks';
import { landmarksUpTo, type LandmarkSet } from './content/landmark-sets';
import { countries, type Country } from './content/countries';
import type { CountryExerciseType } from './features/exercise/exercise-modes';
import { regionAnswerableLandmarks } from './domain/landmark-pool';
import { ChinaMap } from './map/ChinaMap';
import type { ReliefStyle } from './map/ReliefStyleToggle';
import type { MapZoom } from './map/MapControls';
import { LeaveRoundDialog } from './ui/LeaveRoundDialog';
import { SiteHeader, type SiteSection } from './ui/SiteHeader';
import { referenceTargetOf } from './features/results/reference-target';
import { DEFAULT_DIFFICULTY, type Difficulty } from './domain/difficulty';

type RoundRequest = ExerciseType;

type Screen =
  | 'home'
  | 'atlas'
  | 'collections'
  | 'collection'
  | 'exercise'
  | 'city-exercise'
  | 'physical-exercise'
  | 'landmark-exercise'
  | 'history-exercise'
  | 'culture-exercise'
  | 'results'
  | 'fill'
  | 'fill-results'
  | 'country-exercise'
  | 'order-exercise';

/**
 * Кадр приложения: закреплённая шапка и поверхность в одной колонке.
 *
 * Шапка живёт здесь, а не у каждого экрана: она стоит на всех поверхностях, и
 * список «где она есть» пришлось бы держать в согласии с пятью разбросанными
 * по функции возвратами. Прежде экраны ответа её не получали — кадр отдавался
 * карте целиком; решение владельца продукта это отменяет (DECISIONS.md,
 * 2026-08-05).
 *
 * `fillsFrame` — поверхность занимает ровно экран и не прокручивается: атлас,
 * раунд, заполнение карты. Кадру при этом нужна определённая высота, иначе
 * оболочка внутри берёт естественную и строка `1fr` под карту не разрешается
 * (см. `.app-frame` в styles.css). Итоги и прокручиваемые поверхности признака
 * не получают: список ошибок бывает длиннее кадра.
 *
 * `guardsLeave` — идёт раунд: переход по шапке сначала спрашивает (см.
 * `LeaveRoundDialog`). Признак ставится у каждого возврата раунда отдельно,
 * как и `fillsFrame`, а не выводится из списка экранов.
 */
function AppFrame({
  fillsFrame,
  guardsLeave = false,
  current,
  onNavigate,
  children,
}: {
  readonly fillsFrame: boolean;
  readonly guardsLeave?: boolean;
  readonly current: SiteSection | null;
  readonly onNavigate: (section: SiteSection) => void;
  readonly children: ReactNode;
}) {
  const [leavingTo, setLeavingTo] = useState<SiteSection | null>(null);

  /*
   * Кадр — один экземпляр на все экраны, и вопрос пережил бы раунд: ученик
   * нажал «Атлас» во время показа последнего ответа, раунд закончился сам, а
   * окно «ответы не сохранятся» осталось над итогами, где они уже сохранены.
   * Раунд кончился — вопрос снимается. Сброс на отрисовке, а не эффектом:
   * эффект успел бы показать окно над итогами на один кадр.
   */
  if (!guardsLeave && leavingTo !== null) {
    setLeavingTo(null);
  }

  return (
    <div className="app-frame" data-fills-frame={fillsFrame}>
      <SiteHeader
        current={current}
        onNavigate={guardsLeave ? setLeavingTo : onNavigate}
      />
      {leavingTo === null ? null : (
        <LeaveRoundDialog
          destination={SECTION_DESTINATIONS[leavingTo]}
          onLeave={() => {
            setLeavingTo(null);
            onNavigate(leavingTo);
          }}
          onStay={() => setLeavingTo(null)}
        />
      )}
      {/*
        Ожидание куска экрана. Оболочка и шапка уже нарисованы, поэтому
        подменяется только содержимое — страница не прыгает. Видно это редко:
        куски дотягиваются в простое сразу после первого экрана.
      */}
      <Suspense
        fallback={
          <p className="empty-note" role="status">
            Экран загружается.
          </p>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}

/**
 * Куда ведёт раздел, с предлогом, — для вопроса перед уходом из раунда:
 * «Прервать раунд и перейти в атлас?».
 */
const SECTION_DESTINATIONS: Readonly<Record<SiteSection, string>> = {
  home: 'на главную',
  modes: 'к режимам',
  atlas: 'в атлас',
  collections: 'в коллекции',
};

/**
 * Какой пункт шапки отмечен открытым. Главная отмечается на названии слева, а
 * не на «Режимах»: «Режимы» — её раздел, а не отдельная поверхность, и отметка
 * «вы здесь» на нём означала бы, что из главной уже никуда не уйти.
 */
const ACTIVE_SECTION: Partial<Record<Screen, SiteSection>> = {
  home: 'home',
  atlas: 'atlas',
  collections: 'collections',
  collection: 'collections',
};

function newRoundId(): string {
  return `round-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export default function App() {
  const store = useMemo(() => createProgressStore(), []);
  const [progress, setProgress] = useState(() => store.read());
  const [screen, setScreen] = useState<Screen>('home');
  /*
   * Вид рельефа — один на атлас и раунд: выбравший «тушью» в атласе не должен
   * выбирать его заново в игре. Живёт до перезагрузки: это удобство показа,
   * а не прогресс, и в хранилище прогресса ему не место.
   */
  const [reliefStyle, setReliefStyle] = useState<ReliefStyle>('color');
  const [roundPool, setRoundPool] = useState<readonly Region[]>(regions);
  const [cityPool, setCityPool] = useState<readonly City[]>([]);
  const [landmarkPool, setLandmarkPool] = useState<readonly Landmark[]>([]);
  /*
   * Двенадцать целей всегда; сужается пул только «Повторить ошибки». Набор
   * перед стартом не выбирается: реки и формы спрашиваются вперемешку одним
   * раундом.
   */
  const [physicalPool, setPhysicalPool] =
    useState<readonly PhysicalFeature[]>(physicalFeatures);
  /*
   * Пул династий. Как и у городов с физическими целями: «Повторить ошибки»
   * задаёт его напрямую, и выводить его из набора нельзя — набора у истории
   * нет.
   */
  const [historyPool, setHistoryPool] = useState<readonly Dynasty[]>(dynasties);
  /*
   * Что спрашивает раунд истории. Хранится здесь, а не в карточке: повтор
   * ошибок обязан идти в той же игре, где ошиблись, а он запускается с экрана
   * итогов, где карточки уже нет.
   */
  const [historyKind, setHistoryKind] = useState<
    'when' | 'who' | 'capital' | 'ruler' | 'order'
  >('when');
  /* Пул снимков. Как и у прочих: «Повторить ошибки» задаёт его напрямую. */
  const [culturePool, setCulturePool] = useState<readonly Collection[]>(() =>
    cultureCollectionsUpTo('culture'),
  );
  const [exerciseTypes, setExerciseTypes] = useState<readonly ExerciseType[]>([
    'find-on-map',
  ]);
  const [language, setLanguage] = useState<QuestionLanguage>('ru');
  const [roundId, setRoundId] = useState(newRoundId);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [lastAttempts, setLastAttempts] = useState<readonly Attempt[]>([]);
  const [fillRound, setFillRound] = useState<FillRound | null>(null);
  const [countryPool, setCountryPool] = useState<readonly Country[]>(countries);
  const [countryExerciseType, setCountryExerciseType] =
    useState<CountryExerciseType>('find-on-map');
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  /*
   * Объект физической карты, на котором открыть атлас, — ссылка «В справочник»
   * с итогов раунда по физической карте. Атлас берёт его только при открытии.
   */
  const [atlasFeatureId, setAtlasFeatureId] = useState<string | null>(null);
  /*
   * Уровень сложности игр «Найти…» (решение владельца от 2026-10-18): тот,
   * что выбран в окне последним, общий для всех игр, до перезагрузки — как вид
   * рельефа. Хранилище его не держит: модель данных не меняется.
   */
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [zoom, setZoom] = useState<MapZoom>(1);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  /*
   * Переход на раздел главной из шапки. Прокрутка живёт в эффекте, а не в
   * обработчике нажатия: раздела ещё нет в документе, пока React не отрисовал
   * главную. Фокус переводится вместе с прокруткой — иначе Tab после нажатия
   * продолжился бы от шапки, а читалка экрана промолчала бы о переходе.
   *
   * Сам якорь лежит в ссылке, а счётчик только будит эффект: нажатие на
   * «Режимы», когда главная уже открыта, обязано сработать второй раз, а
   * состояние с прежним значением эффект бы не перезапустило.
   */
  const [anchorRequests, setAnchorRequests] = useState(0);
  const pendingAnchor = useRef<string | null>(null);

  /*
   * Новая поверхность открывается сверху. Без этого переход со дна главной в
   * коллекцию попадал на середину её страницы, и человек видел не заголовок, а
   * обрывок абзаца.
   *
   * Эффект объявлен до якорного намеренно: когда переход как раз и ведёт на
   * раздел главной, прокрутка наверх обязана случиться раньше, а не отменить
   * его.
   */
  /*
   * Остальные экраны дотягиваются в простое сразу после первого. Без этого
   * деление на куски отняло бы обещание работать без сети после
   * первоначальной загрузки (`AGENTS.md`): атлас в классе с упавшим Wi-Fi не
   * открылся бы вовсе.
   */
  useEffect(prefetchScreens, []);

  useEffect(() => {
    if (pendingAnchor.current === null) {
      window.scrollTo(0, 0);
    }
  }, [screen, collectionId]);

  useEffect(() => {
    const anchorId = pendingAnchor.current;
    if (anchorId === null) {
      return;
    }

    pendingAnchor.current = null;
    const target = document.getElementById(anchorId);
    /*
     * Сначала фокус без прокрутки, потом прокрутка. `focus()` сам подтягивает
     * элемент в кадр по кратчайшему пути, а раздел выше кадра — и раздел
     * вставал нижним краем экрана вместо верхнего.
     */
    target?.focus({ preventScroll: true });

    /*
     * Заголовок главной — первое, что на странице есть, и подтягивать его «в
     * кадр» нельзя: он встал бы к верхней кромке, спрятав шапку над собой.
     * Наверх страницы — значит в ноль.
     */
    if (anchorId === 'top') {
      window.scrollTo(0, 0);
      return;
    }

    target?.scrollIntoView();
  }, [anchorRequests]);

  /*
   * Единственный вход в атлас. Объект физической карты задаётся только ссылкой
   * «В справочник» с итогов; все прочие входы его сбрасывают, иначе атлас,
   * открытый с главной, вставал бы на объект, оставшийся от прошлых итогов.
   */
  function openAtlas(regionId: string | null, featureId: string | null = null) {
    if (regionId !== null || featureId !== null) {
      setSelectedRegionId(regionId);
    }
    setAtlasFeatureId(featureId);
    setScreen('atlas');
  }

  function navigate(section: SiteSection) {
    if (section === 'atlas') {
      openAtlas(null);
      return;
    }

    if (section === 'collections') {
      setScreen('collections');
      return;
    }

    /*
     * Оба перехода ведут на главную, но в разные её места, поэтому якорь у них
     * разный. Запрос считается и тогда, когда главная уже открыта: нажатие по
     * названию с середины страницы обязано вернуть наверх, а смены экрана при
     * этом не происходит и эффект прокрутки сам бы не сработал.
     */
    setScreen('home');
    pendingAnchor.current = section === 'home' ? 'top' : 'modes';
    setAnchorRequests((count) => count + 1);
  }

  /**
   * На секцию «Режимы». Двумя путями сразу: выход из раунда и главная кнопка
   * героя. Выход ведёт туда, откуда режим запускали, — иначе после каждого
   * раунда пришлось бы прокручивать страницу заново; герою нужно то же место,
   * потому что выбирают режим именно там.
   *
   * Приём тот же, что у перехода из шапки: якорь в `pendingAnchor`, счётчик
   * будит эффект. Своей копии эффекта здесь нет и быть не должно — навигация в
   * приложении одна.
   */
  function goToModes() {
    setScreen('home');
    pendingAnchor.current = 'modes';
    setAnchorRequests((count) => count + 1);
  }

  function openCollection(id: string) {
    setCollectionId(id);
    setScreen('collection');
  }

  /**
   * `regionIds === null` — раунд по всем регионам темы. Набор считается здесь,
   * а не у вызывающего: подпись кнопки и её действие приходят из одного
   * правила (`nextStep`), и разделять их снова незачем.
   */
  function startRound(
    request: RoundRequest,
    nextLanguage: QuestionLanguage,
    regionIds: readonly string[] | null,
  ) {
    setRoundPool(
      regionIds === null
        ? regions
        : regions.filter((region) => regionIds.includes(region.id)),
    );
    setExerciseTypes([request]);
    setLanguage(nextLanguage);
    setRoundId(newRoundId());
    setSeed(Math.floor(Math.random() * 2 ** 31));
    setScreen('exercise');
  }

  /**
   * Города-муниципалитеты и САР не попадают в «город — регион»: спрашивать, в
   * каком регионе стоит Шанхай, значит спрашивать, в каком регионе стоит
   * Шанхай. Свойство выводится из каталога, а не ставится флагом.
   */
  function cityPoolFor(exerciseType: ExerciseType, citySet: CitySet): readonly City[] {
    const chosen = citiesUpTo(citySet);
    if (exerciseType !== 'match-pair') {
      return chosen;
    }

    const singleCityKinds = new Set(
      regions
        .filter((region) => region.kind === 'municipality' || region.kind === 'sar')
        .map((region) => region.id),
    );

    return chosen.filter((city) => !singleCityKinds.has(city.regionId));
  }

  function startCityRound(
    exerciseType: ExerciseType,
    nextLanguage: QuestionLanguage,
    citySet: CitySet,
  ) {
    setCityPool(cityPoolFor(exerciseType, citySet));
    setExerciseTypes([exerciseType]);
    setLanguage(nextLanguage);
    setRoundId(newRoundId());
    setSeed(Math.floor(Math.random() * 2 ** 31));
    setScreen('city-exercise');
  }

  function startLandmarkRound(
    exerciseType: ExerciseType,
    nextLanguage: QuestionLanguage,
    set: LandmarkSet,
  ) {
    /*
     * В «достопримечательность — регион» не попадают объекты, называющие свой
     * регион именем: «Исторический центр Макао» отвечает сам за себя. Тот же
     * приём, что у городов муниципалитетов и САР в `cityPoolFor`.
     */
    const pool =
      exerciseType === 'match-pair'
        ? regionAnswerableLandmarks(landmarksUpTo(set), regions)
        : landmarksUpTo(set);

    startLandmarkPool(exerciseType, nextLanguage, pool);
  }

  /** Запуск по готовому пулу: тем же путём работает «Повторить ошибки». */
  function startLandmarkPool(
    exerciseType: ExerciseType,
    nextLanguage: QuestionLanguage,
    pool: readonly Landmark[],
  ) {
    setLandmarkPool(pool);
    setExerciseTypes([exerciseType]);
    setLanguage(nextLanguage);
    setRoundId(newRoundId());
    setSeed(Math.floor(Math.random() * 2 ** 31));
    setScreen('landmark-exercise');
  }

  function startPhysicalRound(
    exerciseType: 'find-on-map' | 'name-target',
    nextLanguage: QuestionLanguage,
    set: PhysicalSet = 'all',
  ) {
    startPhysicalPool(exerciseType, nextLanguage, physicalFeaturesUpTo(set));
  }

  /**
   * Запуск по готовому пулу. Отдельно от выбора набора, потому что «Повторить
   * ошибки» задаёт пул напрямую и никакому набору не соответствует.
   */
  function startPhysicalPool(
    exerciseType: 'find-on-map' | 'name-target',
    nextLanguage: QuestionLanguage,
    features: readonly PhysicalFeature[],
  ) {
    setPhysicalPool(features);
    setExerciseTypes([exerciseType]);
    setLanguage(nextLanguage);
    setRoundId(newRoundId());
    setSeed(Math.floor(Math.random() * 2 ** 31));
    setScreen('physical-exercise');
  }

  /*
   * У истории нет ни набора, ни выбора языка: династию спрашивают по-русски с
   * иероглифами рядом, а сроков ровно двенадцать. Поэтому запуск проще
   * остальных — сид и идентификатор раунда, и всё.
   */
  function startHistoryRound(
    nextLanguage: QuestionLanguage = language,
    pool: readonly Dynasty[] = dynasties,
    kind: 'when' | 'who' | 'capital' | 'ruler' | 'order' = historyKind,
  ) {
    setHistoryPool(pool);
    setHistoryKind(kind);
    setLanguage(nextLanguage);
    setRoundId(newRoundId());
    setSeed(Math.floor(Math.random() * 2 ** 31));
    /* Расстановка — свой экран: там один экран и несколько решений. */
    setScreen(kind === 'order' ? 'order-exercise' : 'history-exercise');
  }

  function startCultureRound(
    nextLanguage: QuestionLanguage,
    set: CultureSet = 'culture',
  ) {
    startCulturePool(nextLanguage, cultureCollectionsUpTo(set));
  }

  function startCulturePool(
    nextLanguage: QuestionLanguage,
    pool: readonly Collection[],
  ) {
    setCulturePool(pool);
    setLanguage(nextLanguage);
    setRoundId(newRoundId());
    setSeed(Math.floor(Math.random() * 2 ** 31));
    setScreen('culture-exercise');
  }

  /**
   * Игры по странам: цели из своего справочника, поэтому запуск свой. Пул
   * нужен повтору ошибок — он спрашивает те же страны той же игрой.
   */
  function startCountryPool(
    exerciseType: CountryExerciseType,
    nextLanguage: QuestionLanguage,
    pool: readonly Country[],
  ) {
    setLanguage(nextLanguage);
    setCountryExerciseType(exerciseType);
    setCountryPool(pool);
    setRoundId(newRoundId());
    setSeed(Math.floor(Math.random() * 2 ** 31));
    setScreen('country-exercise');
  }

  function startCountryRound(
    exerciseType: CountryExerciseType,
    nextLanguage: QuestionLanguage,
  ) {
    startCountryPool(exerciseType, nextLanguage, countries);
  }

  function startFillRound(nextLanguage: QuestionLanguage) {
    setLanguage(nextLanguage);
    setRoundId(newRoundId());
    setSeed(Math.floor(Math.random() * 2 ** 31));
    setFillRound(null);
    setScreen('fill');
  }

  /**
   * Освоенность выводится из истории попыток. В прогрессе она всё же
   * сохраняется: этого требует DATA_MODEL.md, — но для показа всегда
   * вычисляется заново, чтобы отставшее поле не заперло ученика.
   *
   * Общая для всех режимов: раунд-заполнение пишет по одной попытке на
   * регион, поэтому правила применяются к нему без изменений.
   */
  function commitAttempts(attempts: readonly Attempt[]) {
    const withAttempts = addAttempts(progress, attempts);
    const updated = {
      ...withAttempts,
      masteredTargets: masteredTargets(withAttempts.attempts, new Date(), 'region'),
    };
    setProgress(updated);
    store.write(updated);

    return updated;
  }

  function finishFillRound(round: FillRound) {
    commitAttempts(round.attempts);
    setFillRound(round);
    setScreen('fill-results');
  }

  /**
   * Завершение раунда по целям, которые не регионы: города и объекты
   * физической географии. Вид берётся из самих попыток — раунд пишет цели
   * своего вида, и второй источник правды разошёлся бы с ними.
   */
  function finishTargetRound(attempts: readonly Attempt[]) {
    commitAttempts(attempts);
    setLastAttempts(attempts);
    setScreen('results');
  }

  function finishRound(attempts: readonly Attempt[]) {
    commitAttempts(attempts);
    setLastAttempts(attempts);
    setScreen('results');
  }

  if (screen === 'country-exercise') {
    return (
      <AppFrame fillsFrame guardsLeave current={null} onNavigate={navigate}>
        <CountryRound
          countries={countryPool}
          exerciseType={countryExerciseType}
          language={language}
          roundId={roundId}
          seed={seed}
          onFinish={finishRound}
          onExit={goToModes}
        />
      </AppFrame>
    );
  }

  if (screen === 'fill') {
    return (
      <AppFrame fillsFrame guardsLeave current={null} onNavigate={navigate}>
        <FillMapRound
          regions={regions}
          language={language}
          roundId={roundId}
          seed={seed}
          onFinish={finishFillRound}
          onExit={goToModes}
        />
      </AppFrame>
    );
  }

  if (screen === 'fill-results' && fillRound !== null) {
    return (
      <AppFrame fillsFrame={false} current={null} onNavigate={navigate}>
        <FillMapResultsPage
          round={fillRound}
          regions={regions}
          isProgressSaved={store.isAvailable}
          onRepeatMistakes={() =>
            startRound(
              'find-on-map',
              language,
              summariseFillRound(fillRound).idsToReview,
            )
          }
          onNewRound={() => startFillRound(language)}
          onExit={goToModes}
        />
      </AppFrame>
    );
  }

  if (screen === 'exercise') {
    return (
      <AppFrame fillsFrame guardsLeave current={null} onNavigate={navigate}>
        <ExerciseRound
          regions={roundPool}
          exerciseTypes={exerciseTypes}
          language={language}
          roundId={roundId}
          seed={seed}
          onFinish={finishRound}
          onExit={goToModes}
        />
      </AppFrame>
    );
  }

  if (screen === 'city-exercise') {
    return (
      <AppFrame fillsFrame guardsLeave current={null} onNavigate={navigate}>
        <CityRound
          cities={cityPool}
          exerciseType={exerciseTypes[0]}
          language={language}
          roundId={roundId}
          seed={seed}
          onFinish={finishTargetRound}
          onExit={goToModes}
        />
      </AppFrame>
    );
  }

  if (screen === 'landmark-exercise') {
    return (
      <AppFrame fillsFrame guardsLeave current={null} onNavigate={navigate}>
        <LandmarkRound
          landmarks={landmarkPool}
          exerciseType={exerciseTypes[0]}
          language={language}
          roundId={roundId}
          seed={seed}
          onFinish={finishTargetRound}
          onExit={goToModes}
        />
      </AppFrame>
    );
  }

  if (screen === 'physical-exercise') {
    return (
      <AppFrame fillsFrame guardsLeave current={null} onNavigate={navigate}>
        <PhysicalRound
          features={physicalPool}
          exerciseType={exerciseTypes[0] as 'find-on-map' | 'name-target'}
          language={language}
          roundId={roundId}
          seed={seed}
          onFinish={finishTargetRound}
          onExit={goToModes}
          reliefStyle={reliefStyle}
          onReliefStyleChange={setReliefStyle}
        />
      </AppFrame>
    );
  }

  if (screen === 'order-exercise') {
    return (
      <AppFrame fillsFrame guardsLeave current={null} onNavigate={navigate}>
        <OrderRound
          dynasties={historyPool}
          language={language}
          roundId={roundId}
          seed={seed}
          onFinish={finishTargetRound}
          onExit={goToModes}
        />
      </AppFrame>
    );
  }

  /*
   * Расстановка сюда не попадает: у неё свой экран выше. Условие названо
   * явно, а не приведением типа, — если состояние однажды разойдётся с
   * экраном, ученик окажется на главной, а не перед пустым кадром.
   */
  if (screen === 'history-exercise' && historyKind !== 'order') {
    return (
      <AppFrame fillsFrame guardsLeave current={null} onNavigate={navigate}>
        <HistoryRound
          kind={historyKind}
          dynasties={historyPool}
          language={language}
          roundId={roundId}
          seed={seed}
          onFinish={finishTargetRound}
          onExit={goToModes}
        />
      </AppFrame>
    );
  }

  if (screen === 'culture-exercise') {
    return (
      <AppFrame fillsFrame guardsLeave current={null} onNavigate={navigate}>
        <CultureRound
          collections={culturePool}
          language={language}
          roundId={roundId}
          seed={seed}
          onFinish={finishTargetRound}
          onExit={goToModes}
        />
      </AppFrame>
    );
  }

  if (screen === 'results') {
    const summary = summariseRound(lastAttempts);
    /*
     * Итог одинаков для регионов и городов; различает их только то, чем
     * называть цели и как склонять их число. Вид берётся из самих попыток, а
     * не из отдельного признака: раунд по городам пишет городские цели, и
     * второй источник правды разошёлся бы с ними.
     */
    const roundKind = lastAttempts[0]?.target.kind ?? 'region';
    const isCityRound = roundKind === 'city';
    const isPhysicalRound = roundKind === 'physical';
    const isHistoryRound = roundKind === 'history';
    const isCultureRound = roundKind === 'collection';
    const isLandmarkRound = roundKind === 'landmark';
    const isCountryRound = roundKind === 'country';
    /*
     * Набор повтора — ошибки этого раунда, те же, что показаны списком
     * (решение владельца от 2026-08-25). Отдельного источника у кнопки нет:
     * разойтись со списком ей теперь нечем.
     */
    const repeatIds = summary.targetsToReview.map((target) => target.id);
    /* Ссылка «В справочник» у ошибки: куда она ведёт, решает `referenceTargetOf`. */
    function referenceOf(targetId: string): (() => void) | null {
      const reference = referenceTargetOf(roundKind, targetId);
      if (reference === null) {
        return null;
      }

      return reference.kind === 'feature'
        ? () => openAtlas(null, reference.featureId)
        : () => openAtlas(reference.regionId, null);
    }
    const repeatCities = cityPool.filter((city) => repeatIds.includes(city.id));
    const repeatFeatures = physicalPool.filter((feature) =>
      repeatIds.includes(feature.id),
    );
    const repeatDynasties = historyPool.filter((dynasty) =>
      repeatIds.includes(dynasty.id),
    );
    const repeatCollections = culturePool.filter((collection) =>
      repeatIds.includes(collection.id),
    );
    const repeatLandmarks = landmarkPool.filter((one) =>
      repeatIds.includes(one.id),
    );
    const repeatCountries = countryPool.filter((one) =>
      repeatIds.includes(one.id),
    );

    /*
     * Карта итога есть у раундов по регионам. У раунда по городам исход по
     * точке карта пока не показывает, у физических целей это отдельная
     * работа; такой итог показывается одной колонкой — пустая рамка была бы
     * хуже отсутствующей.
     */
    const roundMap =
      isCityRound ||
      isPhysicalRound ||
      isHistoryRound ||
      isCultureRound ||
      isLandmarkRound ||
      isCountryRound
        ? undefined
        : (
        <ChinaMap
          regions={regions}
          selectedRegionId={null}
          onSelect={() => {}}
          onClear={() => {}}
          interactive={false}
          usage="answer"
          variant="fill"
          outcomes={outcomesByTarget(lastAttempts)}
        />
      );

    return (
      <AppFrame fillsFrame={false} current={null} onNavigate={navigate}>
        <RoundResultsPage
          summary={summary}
          referenceOf={referenceOf}
          targets={
            isCityRound
              ? cityPool
              : isPhysicalRound
                ? physicalPool
                : isHistoryRound
                  ? historyPool
                  : isCultureRound
                    ? culturePool
                    : isLandmarkRound
                      ? landmarkPool
                      : isCountryRound
                        ? countryPool
                        : regions
          }
          countWord={
            isCityRound
              ? citiesWord
              : isPhysicalRound
                ? featuresWord
                : isHistoryRound
                  ? dynastiesWord
                  : isCultureRound
                    ? photosWord
                    : isLandmarkRound
                      ? landmarksWord
                      : isCountryRound
                        ? countriesWord
                        : undefined
          }
          bestAccuracy={bestAccuracy(progress.attempts)}
          isProgressSaved={store.isAvailable}
          roundMap={roundMap}
          hasUnasked={hasUnaskedTargets(lastAttempts, regions)}
          onRepeatMistakes={() => {
            if (isCityRound) {
              setCityPool(repeatCities);
              setScreen('city-exercise');
              setRoundId(newRoundId());
              setSeed(Math.floor(Math.random() * 2 ** 31));
              return;
            }

            if (isLandmarkRound) {
              startLandmarkPool(exerciseTypes[0], language, repeatLandmarks);
              return;
            }

            if (isPhysicalRound) {
              startPhysicalPool(
                exerciseTypes[0] as 'find-on-map' | 'name-target',
                language,
                repeatFeatures,
              );
              return;
            }

            if (isHistoryRound) {
              startHistoryRound(language, repeatDynasties);
              return;
            }

            if (isCultureRound) {
              startCulturePool(language, repeatCollections);
              return;
            }

            if (isCountryRound) {
              startCountryPool(countryExerciseType, language, repeatCountries);
              return;
            }

            startRound(exerciseTypes[0], language, repeatIds);
          }}
          onNewRound={() => {
            if (isCityRound) {
              startCityRound(exerciseTypes[0], language, 'capital');
              return;
            }

            if (isPhysicalRound) {
              /* Тот же набор, что и был: он выводится из пула, а второй
                 источник правды разошёлся бы с ним. */
              startPhysicalPool(
                exerciseTypes[0] as 'find-on-map' | 'name-target',
                language,
                physicalPool,
              );
              return;
            }

            if (isLandmarkRound) {
              /* Тот же набор, что и был: он выводится из пула — так же, как у
                 физической карты, и по тому же доводу. */
              startLandmarkPool(exerciseTypes[0], language, landmarkPool);
              return;
            }

            if (isHistoryRound) {
              startHistoryRound();
              return;
            }

            if (isCultureRound) {
              startCulturePool(language, culturePool);
              return;
            }

            if (isCountryRound) {
              startCountryRound(countryExerciseType, language);
              return;
            }

            startRound(exerciseTypes[0], language, null);
          }}
          onExit={goToModes}
        />
      </AppFrame>
    );
  }

  /*
   * Дальше идут поверхности с шапкой. Она общая, поэтому стоит здесь, а не
   * повторяется внутри каждой страницы: иначе «Коллекции» отмечались бы
   * открытыми в двух местах и однажды разошлись бы.
   */
  /*
   * И атлас, и страница коллекции ведут в «найти на карте» по-русски: выбирать
   * язык там негде, а переключатель стоит на карточке игры.
   */
  const collection =
    collectionId === null ? null : (collectionById(collectionId) ?? null);
  /*
   * Неизвестная коллекция возвращает на главную. Отметка в шапке считается по
   * этому же значению, иначе «Коллекции» остались бы подчёркнутыми над
   * главной.
   */
  const activeScreen: Screen =
    screen === 'collection' && collection === null ? 'home' : screen;

  return (
    <AppFrame
      fillsFrame={activeScreen === 'atlas'}
      current={ACTIVE_SECTION[activeScreen] ?? null}
      onNavigate={navigate}
    >
      {activeScreen === 'atlas' ? (
        <AtlasPage
          regions={regions}
          selectedRegionId={selectedRegionId}
          onSelect={setSelectedRegionId}
          onClear={() => setSelectedRegionId(null)}
          zoom={zoom}
          onZoomChange={setZoom}
          onTrain={() => startRound('find-on-map', 'ru', null)}
          onOpenCollection={openCollection}
          reliefStyle={reliefStyle}
          onReliefStyleChange={setReliefStyle}
          initialFeatureId={atlasFeatureId}
        />
      ) : activeScreen === 'collections' ? (
        <CollectionsPage regions={regions} onOpenCollection={openCollection} />
      ) : activeScreen === 'collection' && collection !== null ? (
        <CollectionPage
          collection={collection}
          regions={regions}
          onOpenCollections={() => setScreen('collections')}
          onOpenCollection={openCollection}
          onTrainRegions={(regionIds) =>
            startRound('find-on-map', 'ru', regionIds)
          }
        />
      ) : (
        <HomePage
          regions={regions}
          attempts={progress.attempts}
          difficulty={difficulty}
          onStartRound={(request, nextLanguage, regionIds, level) => {
            setDifficulty(level);
            /*
             * Лёгкий «Найти регион» идёт ходом заполнения карты; пул и повтор
             * тем же уровнем — следующим шагом плана уровней сложности.
             */
            if (request === 'find-on-map' && level === 'easy' && regionIds === null) {
              startFillRound(nextLanguage);
              return;
            }
            startRound(request, nextLanguage, regionIds);
          }}
          onStartCountryRound={(exerciseType, nextLanguage, level) => {
            setDifficulty(level);
            startCountryRound(exerciseType, nextLanguage);
          }}
          onStartCityRound={(exerciseType, nextLanguage, citySet, level) => {
            setDifficulty(level);
            startCityRound(exerciseType, nextLanguage, citySet);
          }}
          onStartCultureRound={startCultureRound}
          onStartHistoryRound={startHistoryRound}
          onStartPhysicalRound={(exerciseType, nextLanguage, set, level) => {
            setDifficulty(level);
            startPhysicalRound(exerciseType, nextLanguage, set);
          }}
          onStartLandmarkRound={(exerciseType, nextLanguage, set, level) => {
            setDifficulty(level);
            startLandmarkRound(exerciseType, nextLanguage, set);
          }}
          onOpenAtlas={() => openAtlas(null)}
          /*
            Карта героя открывает атлас на нажатой области: выбор ставится до
            смены экрана, поэтому атлас рисуется уже с карточкой региона, а не
            моргает приглашением «выберите регион».
          */
          onOpenRegion={(regionId) => openAtlas(regionId)}
          onGoToModes={goToModes}
          onOpenCollections={() => setScreen('collections')}
          onOpenCollection={openCollection}
        />
      )}
    </AppFrame>
  );
}
