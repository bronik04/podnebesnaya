import type { ExerciseType } from '../../domain/round';

/**
 * Описание игры для экрана раунда. Числа сложности здесь нет: чем спрашивать,
 * выбирает ученик, а не игра.
 */
export type ExerciseMode = {
  readonly exerciseType: ExerciseType;
  readonly title: string;
  readonly eyebrow: string;
};

export const EXERCISE_MODES: Readonly<Record<ExerciseType, ExerciseMode>> = {
  'find-on-map': {
    exerciseType: 'find-on-map',
    title: 'Найти на карте',
    eyebrow: 'Найдите на карте',
  },
  'name-target': {
    exerciseType: 'name-target',
    title: 'Назвать регион',
    eyebrow: 'Какой регион подсвечен',
  },
  'match-pair': {
    exerciseType: 'match-pair',
    title: 'Регион — столица',
    eyebrow: 'Выберите административный центр',
  },
};

/**
 * Группы карточек. Не выдумка ради порядка: это ровно те справочники, из
 * которых берутся цели, и ученик выбирает сначала предмет, а потом форму
 * вопроса. Пока игр было четыре, сетка равных карточек работала; на
 * одиннадцати между «Заполнить карту» и «Найти город» не осталось никакой
 * видимой границы, хотя это разные предметы.
 *
 * История и культура стояли вместе, пока у каждой было по одной игре и общий
 * признак — карты в них нет. Историй стало пять, и общая полка перестала
 * что-либо объяснять: теперь это две группы (DECISIONS.md, 2026-08-28).
 */
export type ModeGroupId =
  | 'regions'
  | 'countries'
  | 'cities'
  | 'physical'
  | 'landmarks'
  | 'history'
  | 'culture';

export const MODE_GROUPS: readonly {
  readonly id: ModeGroupId;
  /**
   * Знак темы на главной: 省 провинция, 国 страна, 城 город, 山 гора, 景 вид,
   * 史 история, 文 культура. Знак, а не номер: темы идут в любом порядке, и
   * нумерация 一–七 обещала последовательность, которой нет.
   */
  readonly mark: string;
  readonly title: string;
  /** Чем группа отличается от соседней — одной строкой под названием. */
  readonly note: string;
}[] = [
  {
    id: 'regions',
    mark: '省',
    title: 'Регионы',
    note: '34 региона провинциального уровня',
  },
  {
    id: 'countries',
    mark: '国',
    title: 'Соседние государства',
    note: 'четырнадцать стран сухопутной границы',
  },
  {
    id: 'cities',
    mark: '城',
    title: 'Города',
    note: 'набор выбирается перед стартом',
  },
  {
    id: 'physical',
    mark: '山',
    title: 'Физическая карта',
    note: 'реки, формы рельефа и озёра',
  },
  {
    id: 'landmarks',
    mark: '景',
    title: 'Достопримечательности',
    note: 'набор выбирается перед стартом',
  },
  {
    id: 'history',
    mark: '史',
    title: 'История',
    note: 'двенадцать династий на ленте времени',
  },
  { id: 'culture', mark: '文', title: 'Культура', note: 'снимки коллекций' },
];

/**
 * Карточка режима на главной. Описывает игру для того, кто ещё не пробовал:
 * что спрашивают и сколько это займёт.
 *
 * Игры равноправны и открыты все сразу: это разные занятия, а не ступени
 * одной лестницы, и запирать одно за другим значило бы решать за ученика, что
 * ему сейчас интересно. Закрытой карточка бывает только пока режим не написан.
 *
 * Заполнение карты — не `ExerciseType`: это отдельный вид раунда со своим
 * экраном и своим счётом попыток. Поэтому карточка помечена видом, а не просто
 * типом задания, и главная запускает её другим вызовом.
 *
 * Иероглиф — метка, а не украшение: 地 земля, 名 имя, 都 столица, 填 заполнять,
 * 市 город, 认 узнавать, 属 принадлежать, 山 гора, 河 река, 史 история,
 * 文 культура. Он же отличает карточки друг от друга, когда цвета
 * на бумаге у них одинаковые.
 */
export type ModeCard = {
  readonly id: string;
  readonly mark: string;
  readonly title: string;
  /**
   * Чем эта игра отличается от соседней. На карточке её нет: одиннадцать
   * абзацев подряд — это одиннадцать абзацев, которые нужно прочитать, чтобы
   * выбрать. Её место — окно перед стартом, где ученик уже решил играть
   * именно в эту игру и спрашивает «а как тут спрашивают».
   */
  readonly summary: string;
  /** Что спрашивают и сколько: «34 региона, около 7 минут». */
  readonly volume: string;
  readonly groupId: ModeGroupId;
} & (
  | { readonly kind: 'exercise'; readonly exerciseType: ExerciseType }
  /** Игра по городам: цели берутся из справочника городов, а не регионов. */
  | { readonly kind: 'city'; readonly exerciseType: ExerciseType }
  /** Игра по физической географии: цели берутся из справочника объектов. */
  | { readonly kind: 'physical'; readonly exerciseType: 'find-on-map' | 'name-target' }
  /**
   * Игра по достопримечательностям: цели берутся из третьего справочника.
   * Формы вопроса те же три, что у городов, — у достопримечательности есть и
   * место на карте, и регион, с которым её связывают.
   */
  | { readonly kind: 'landmark'; readonly exerciseType: ExerciseType }
  /**
   * Игра по династиям: цели берутся из ленты, а карта в ней не участвует.
   * `historyKind` называет, что спрашивают: срок названной династии или
   * династию названного года.
   */
  | {
      readonly kind: 'history';
      readonly historyKind: 'when' | 'who' | 'capital' | 'ruler' | 'order';
    }
  /** Игра по снимкам коллекций: вопрос — сама фотография. */
  | { readonly kind: 'culture' }
  | { readonly kind: 'fill' }
  /**
   * Игра по сопредельным государствам: цели берутся из справочника стран, а
   * карта показывает слой за границей Китая.
   */
  | {
      readonly kind: 'country';
      readonly exerciseType: CountryExerciseType;
    }
  /** Режим объявлен, но ещё не написан: карточка не запускается. */
  | { readonly kind: 'planned' }
);

/**
 * Города спрашиваются теми же тремя формами, что и регионы, поэтому у игр те
 * же `exerciseType`. Различают их вид карточки и экран: `CityRound`.
 */
export const CITY_MODES: Readonly<Record<ExerciseType, ExerciseMode>> = {
  'find-on-map': {
    exerciseType: 'find-on-map',
    title: 'Найти город',
    eyebrow: 'Найдите город на карте',
  },
  'name-target': {
    exerciseType: 'name-target',
    title: 'Назвать город',
    eyebrow: 'Какой город подсвечен',
  },
  'match-pair': {
    exerciseType: 'match-pair',
    title: 'Город — регион',
    eyebrow: 'В каком регионе этот город',
  },
};

/** Две формы вопроса по странам. Одна на всех: карточка, главная, экран. */
export type CountryExerciseType = 'find-on-map' | 'name-target';

/**
 * Две игры по сопредельным государствам. `match-pair` здесь нет: связать
 * страну со вторым каталогом нечем — «в каком регионе Казахстан» вопрос без
 * ответа.
 */
export const COUNTRY_MODES: Readonly<
  Record<CountryExerciseType, ExerciseMode>
> = {
  'find-on-map': {
    exerciseType: 'find-on-map',
    title: 'Найти страну',
    eyebrow: 'Найдите страну на карте',
  },
  'name-target': {
    exerciseType: 'name-target',
    title: 'Назвать страну',
    eyebrow: 'Какая страна подсвечена',
  },
};

/**
 * Две игры по физической географии. `match-pair` здесь нет и не будет: у реки
 * нет второго каталога, с которым её связывают.
 */
export const PHYSICAL_MODES: Readonly<
  Record<'find-on-map' | 'name-target', ExerciseMode>
> = {
  'find-on-map': {
    exerciseType: 'find-on-map',
    title: 'Найти на физической карте',
    eyebrow: 'Найдите объект на карте',
  },
  'name-target': {
    exerciseType: 'name-target',
    title: 'Назвать объект',
    eyebrow: 'Какой объект подсвечен',
  },
};

/**
 * Три игры по достопримечательностям. Формы те же, что у городов, и потому те
 * же `exerciseType`; различают их вид карточки и экран `LandmarkRound`.
 */
export const LANDMARK_MODES: Readonly<Record<ExerciseType, ExerciseMode>> = {
  'find-on-map': {
    exerciseType: 'find-on-map',
    title: 'Найти достопримечательность',
    eyebrow: 'Найдите на карте',
  },
  'name-target': {
    exerciseType: 'name-target',
    title: 'Назвать достопримечательность',
    eyebrow: 'Что здесь отмечено',
  },
  'match-pair': {
    exerciseType: 'match-pair',
    title: 'Достопримечательность — регион',
    eyebrow: 'В каком регионе она стоит',
  },
};

/**
 * «История» — одна игра, а не три: у династии нет ни места на карте, ни
 * второго каталога, с которым её связывают. Спрашивают имя, отвечают сроком.
 */
export const HISTORY_MODE: ExerciseMode = {
  exerciseType: 'match-pair',
  title: 'История: династии и даты',
  eyebrow: 'Когда правила эта династия',
};

/**
 * «Кто правил в этом году» — зеркальная к «Династиям и датам»: там названа
 * династия и спрашивают срок, здесь назван год и спрашивают династию. Цель,
 * лента и отвлекающие у них общие, поэтому это признак раунда, а не второй
 * экран.
 */
export const HISTORY_YEAR_MODE: ExerciseMode = {
  exerciseType: 'match-pair',
  title: 'История: кто правил в этом году',
  eyebrow: 'Кто правил в этом году',
};

/**
 * «Династия — столица». Единственный мост между историей и картой, который не
 * врёт о границах: город стоит там же, где стоял, а границы империй с
 * нынешними провинциями не совпадают — потому карты в истории и нет
 * (решение 2026-08-27).
 */
export const HISTORY_CAPITAL_MODE: ExerciseMode = {
  exerciseType: 'match-pair',
  title: 'История: династия — столица',
  eyebrow: 'Где была столица',
};

/**
 * «Династия — правитель». По одному правителю на династию: не «самый великий»,
 * а тот, кем династия узнаётся в школьном курсе.
 */
export const HISTORY_RULER_MODE: ExerciseMode = {
  exerciseType: 'match-pair',
  title: 'История: династия — правитель',
  eyebrow: 'Кто её прославил',
};

/**
 * «Культура» — одна игра: показан снимок, выбрать название. Формы `find-on-map`
 * у неё нет и быть не может — снимок не место на карте.
 */
export const CULTURE_MODE: ExerciseMode = {
  exerciseType: 'name-target',
  title: 'Культура: узнать по фотографии',
  eyebrow: 'Узнайте по фотографии',
};

/*
 * Названия карточек короче названий самих игр: предмет называет группа, и
 * повторять его в каждой карточке — значит писать «Физическая карта · Найти
 * на физической карте». На экране раунда названия остаются полными
 * (`PHYSICAL_MODES`, `HISTORY_MODE`, `CULTURE_MODE`): там группы рядом нет.
 */
export const MODE_CARDS: readonly ModeCard[] = [
  {
    id: 'find-on-map',
    kind: 'exercise',
    exerciseType: 'find-on-map',
    mark: '地',
    title: 'Найти на карте',
    summary:
      'Вопрос называет регион — ответ нажимается прямо на карте.',
    volume: '34 региона, около 7 минут',
    groupId: 'regions',
  },
  {
    id: 'name-target',
    kind: 'exercise',
    exerciseType: 'name-target',
    mark: '名',
    title: 'Назвать регион',
    summary:
      'Одна область подсвечена, четыре названия на выбор. Подписи выносок скрыты, чтобы карта не выдавала ответ.',
    volume: '34 региона, около 6 минут',
    groupId: 'regions',
  },
  {
    id: 'match-pair',
    kind: 'exercise',
    exerciseType: 'match-pair',
    mark: '都',
    title: 'Регион — столица',
    summary:
      'Подобрать административный центр к региону: русское название, иероглифы и пиньинь рядом.',
    volume: '34 пары, около 6 минут',
    groupId: 'regions',
  },
  {
    id: 'fill-map',
    kind: 'fill',
    mark: '填',
    title: 'Заполнить карту',
    summary:
      'Вся карта подряд, без вариантов ответа. Секундомер и разбор по числу попыток на регион.',
    volume: '34 региона, около 9 минут',
    groupId: 'regions',
  },
  {
    id: 'find-country',
    kind: 'country',
    exerciseType: 'find-on-map',
    mark: '国',
    title: 'Найти страну',
    summary:
      'Названа страна — нажать её на карте. Карта здесь отъезжает шире обычного, иначе соседи остаются полосками по краю. Бутан на ней мелкий, в него целятся точнее.',
    volume: '14 стран, около 5 минут',
    groupId: 'countries',
  },
  {
    id: 'name-country',
    kind: 'country',
    exerciseType: 'name-target',
    mark: '界',
    title: 'Назвать страну',
    summary:
      'Подсвечена страна — выбрать имя из четырёх. Подписи на карте скрыты: подпись подсвеченной страны и есть ответ.',
    volume: '14 стран, около 4 минут',
    groupId: 'countries',
  },
  {
    id: 'find-city',
    kind: 'city',
    exerciseType: 'find-on-map',
    mark: '市',
    title: 'Найти город',
    summary:
      'Вопрос называет город — ответ нажимается по точке на карте.',
    volume: 'Набор выбирается перед стартом, около 10 минут',
    groupId: 'cities',
  },
  {
    id: 'name-city',
    kind: 'city',
    exerciseType: 'name-target',
    mark: '认',
    title: 'Назвать город',
    summary:
      'Одна точка подсвечена, четыре имени на выбор. Отвлекающие берутся из соседей, а не с другого конца страны.',
    volume: 'Набор выбирается перед стартом, около 9 минут',
    groupId: 'cities',
  },
  {
    id: 'city-region',
    kind: 'city',
    exerciseType: 'match-pair',
    mark: '属',
    title: 'Город — регион',
    summary:
      'Назван город — нажать регион, в котором он стоит. Точки на карте скрыты, иначе они и есть ответ.',
    volume: 'Без городов центрального подчинения, около 9 минут',
    groupId: 'cities',
  },
  {
    id: 'find-physical',
    kind: 'physical',
    exerciseType: 'find-on-map',
    mark: '山',
    title: 'Найти объект',
    summary:
      'Вопрос называет реку, канал или форму рельефа — ответ нажимается на карте. Линии и формы вперемешку: рельеф и течение рек связаны.',
    volume: 'Набор выбирается перед стартом, около 5 минут',
    groupId: 'physical',
  },
  {
    id: 'name-physical',
    kind: 'physical',
    exerciseType: 'name-target',
    mark: '河',
    title: 'Назвать объект',
    summary:
      'Один объект подсвечен, четыре имени на выбор. Реку и канал отвлекают линиями, форму — формами, иначе ответ читался бы по виду подсветки.',
    volume: 'Набор выбирается перед стартом, около 4 минут',
    groupId: 'physical',
  },
  {
    id: 'find-landmark',
    kind: 'landmark',
    exerciseType: 'find-on-map',
    mark: '胜',
    title: 'Найти место',
    summary:
      'Вопрос называет объект — ответ нажимается по звезде на карте. Карта чистая: ни городов, ни рек, иначе они спорят со звёздами.',
    volume: 'Набор выбирается перед стартом, около 8 минут',
    groupId: 'landmarks',
  },
  {
    id: 'name-landmark',
    kind: 'landmark',
    exerciseType: 'name-target',
    mark: '塔',
    title: 'Назвать место',
    summary:
      'Одна звезда подсвечена, четыре названия на выбор. Отвлекают объекты того же рода: памятник памятниками, гора горами.',
    volume: 'Набор выбирается перед стартом, около 7 минут',
    groupId: 'landmarks',
  },
  {
    id: 'landmark-region',
    kind: 'landmark',
    exerciseType: 'match-pair',
    mark: '迹',
    title: 'Место — регион',
    summary:
      'Назван объект — нажать регион, где он стоит. Звёзды на карте скрыты, иначе они и есть ответ.',
    volume: 'Набор выбирается перед стартом, около 7 минут',
    groupId: 'landmarks',
  },
  {
    id: 'history',
    kind: 'history',
    historyKind: 'when',
    mark: '史',
    title: 'Династии и даты',
    summary:
      'Названа династия — выбрать её срок из четырёх. Отвлекают сроки соседних по времени династий, а под вопросом идёт лента: длина каждой полосы — её настоящий век.',
    volume: '12 династий, около 4 минут',
    groupId: 'history',
  },
  {
    id: 'history-year',
    kind: 'history',
    historyKind: 'who',
    mark: '年',
    title: 'Кто правил в этом году',
    summary:
      'Назван год — выбрать династию из четырёх или нажать её полосу на ленте. Годы, которые лента знает надвое, не спрашиваются: в 1275 году Сун и Юань существовали разом.',
    volume: '12 династий, около 4 минут',
    groupId: 'history',
  },
  {
    id: 'history-capital',
    kind: 'history',
    historyKind: 'capital',
    mark: '京',
    title: 'Династия — столица',
    summary:
      'Названа династия — выбрать город, откуда она правила. Разбор называет и старое имя, и нынешнее: Чанъань — это Сиань. Где столицу переносили, вопрос называет время: «столица Западной Хань».',
    volume: '7 династий, около 3 минут',
    groupId: 'history',
  },
  {
    id: 'history-ruler',
    kind: 'history',
    historyKind: 'ruler',
    mark: '帝',
    title: 'Династия — правитель',
    summary:
      'Названа династия — выбрать правителя, которым она известна. У Ся и Шан правитель легендарный, и разбор говорит об этом прямо. Троецарствие не спрашивается: у эпохи трёх государств единственного правителя нет.',
    volume: '11 династий, около 4 минут',
    groupId: 'history',
  },
  {
    id: 'history-order',
    kind: 'history',
    historyKind: 'order',
    mark: '序',
    title: 'Расставить по порядку',
    summary:
      'Четыре имени за круг: выбрать династию и нажать её место на ленте времени. Три круга закрывают все двенадцать. На имя три попытки; после третьей оно встанет само.',
    volume: '12 династий, около 6 минут',
    groupId: 'history',
  },
  {
    id: 'culture',
    kind: 'culture',
    mark: '文',
    title: 'Узнать по фотографии',
    summary:
      'Показан снимок — выбрать, что на нём, из четырёх названий. Отвлекают названия того же рода: памятник памятниками, достопримечательность достопримечательностями, гора горами, иначе ответ читался бы по виду кадра.',
    volume: 'Набор выбирается перед стартом, от 8 минут',
    groupId: 'culture',
  },
];

/** Номера групп на странице коллекций. */
export const CHAPTER_NUMERALS = ['一', '二', '三', '四', '五', '六', '七'] as const;

/**
 * Имя игры над ходом раунда: «Регионы · Найти на карте». Собирается из
 * карточки и её группы, а не пишется в раунде заново: переименованная группа
 * иначе осталась бы старой в шапке раунда.
 */
export function roundTitle(cardId: string): string {
  const card = MODE_CARDS.find((item) => item.id === cardId);
  const group = MODE_GROUPS.find((item) => item.id === card?.groupId);

  return card === undefined || group === undefined
    ? ''
    : `${group.title} · ${card.title}`;
}

/** Карточки игр по городам и достопримечательностям — по форме вопроса. */
export const CITY_CARD_IDS: Readonly<Record<ExerciseType, string>> = {
  'find-on-map': 'find-city',
  'name-target': 'name-city',
  'match-pair': 'city-region',
};

export const LANDMARK_CARD_IDS: Readonly<Record<ExerciseType, string>> = {
  'find-on-map': 'find-landmark',
  'name-target': 'name-landmark',
  'match-pair': 'landmark-region',
};

/** Карточки игр по истории — по тому, что спрашивают. */
export const HISTORY_CARD_IDS = {
  when: 'history',
  who: 'history-year',
  capital: 'history-capital',
  ruler: 'history-ruler',
  order: 'history-order',
} as const;
