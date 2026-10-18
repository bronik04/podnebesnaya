# Уровни сложности в играх «Найти…» — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Лёгкий и сложный уровень в пяти играх «Найти…», выбор уровня в окне перед стартом; «Найти на карте» и «Заполнить карту» сливаются в «Найти регион».

**Architecture:** Сложный уровень — нынешние раунды `ExerciseRound`, `CountryRound`, `CityRound`, `PhysicalRound`, `LandmarkRound` без изменений. Лёгкий уровень всех пяти игр — нынешний ход «Заполнить карту» (`src/domain/fill-round.ts` + `FillMapRound`), обобщённый с регионов на любой вид цели: экран один, вид цели задаёт, какой слой карты рисуется и как засчитывается нажатие. Итоги лёгкого уровня — обобщённый `FillMapResultsPage`.

**Tech Stack:** React 19 + TypeScript, Vite, vitest + Testing Library, eslint.

**Spec:** `docs/superpowers/specs/2026-10-18-difficulty-levels-design.md`

## Global Constraints

- Интерфейс и тексты — по-русски; китайские названия в Unicode.
- Домен не вызывает `Math.random`: генератор приходит снаружи (`createSeededRandom`).
- Компоненты не трогают localStorage; уровень запоминается в состоянии `App` до перезагрузки.
- `src/design/tokens.css` — единственный источник цветов, размеров, длительностей; компоненты не пишут значения напрямую.
- Во время раунда сетевых запросов нет.
- Попытки: лёгкий — `MAX_ATTEMPTS_PER_REGION` (3), сложный — одна (как сейчас).
- Лёгкий уровень не останавливается на ошибке («Дальше» нет); сложный — останавливается (как сейчас).
- Физическая карта на обоих уровнях показывает все объекты; города и места на лёгком — только набор.
- По умолчанию уровень — лёгкий.
- Уровень в попытке не хранится; модель данных и хранилище не меняются.
- Каждая задача: `npm run lint`, `npm test`, `npm run build` зелёные; запись в CHANGELOG.md; существенное — в DECISIONS.md.

## Review Focus

1. Повторное нажатие закрытой цели на лёгком уровне — ничего не происходит, попытка не списывается (сейчас это держит правило карты для регионов; для стран, городов, объектов и мест — обработчик раунда). Тест — в задаче 5.
2. «Повторить ошибки» с одной ошибкой в «Найти город» на лёгком: спрашивается один город, а на карте весь набор раунда, не одна точка. Тест — в задаче 6.
3. Один идентификатор у региона и города (`beijing`): исход города не красит область региона и наоборот — исходы передаются слою отдельными свойствами. Тест — в задаче 4.
4. Гроздь звёзд, где спрошенный объект внутри: нажатие по грозди засчитывается, как сейчас в `LandmarkRound`; «Три ущелья» при вопросе о Янцзы засчитываются, как сейчас в `PhysicalRound`. Тесты — в задачах 7 и 8.
5. Входы в раунд мимо окна (строка «Повторить ошибки» на главной, «Тренировать» в атласе и на странице коллекции) уходят на запомненный уровень. Тест — в задаче 3.

---

### Task 1: Движок заполнения для любого вида цели

**Files:**
- Modify: `src/domain/fill-round.ts`
- Modify: `src/domain/fill-round.test.ts`
- Modify: `src/features/exercise/FillMapRound.tsx`, `src/features/results/FillMapResultsPage.tsx`, `src/App.tsx` (переименования полей)
- Modify: тесты этих файлов

**Interfaces:**
- Produces:
  - `type FillQuestion = { id; roundId; targetId: string; language }` (было `regionId`)
  - `type FillRound = { …; readonly targetKind: TargetKind; … }`
  - `type FillRoundOptions = { roundId; language; random; targetKind?: TargetKind }` — по умолчанию `'region'`
  - `createFillRound(targets: readonly { readonly id: string }[], options: FillRoundOptions): FillRound`
  - `type FillAnswerInput = { answeredId: string; durationMs; answeredAt }` (было `answeredRegionId`)
  - `type FillSummary = { total; firstTry; secondTry; failed; durationMs; idsToReview: readonly string[] }` (было `regionIdsToReview`)
  - Попытка лёгкого уровня: `target: { kind: round.targetKind, id }`, `exerciseType: 'find-on-map'`.
  - `RegionOutcome` и `MAX_ATTEMPTS_PER_REGION` — без изменений имён.

- [ ] **Step 1: Тесты движка на чужой вид цели** — в `fill-round.test.ts`:
  - `it('пишет попытку с видом цели раунда')`: `createFillRound([{ id: 'nepal' }], { roundId: 'r', language: 'ru', random: createSeededRandom(1), targetKind: 'country' })`, ответ `answeredId: 'nepal'` → `round.attempts[0].target` равен `{ kind: 'country', id: 'nepal' }`, `isCorrect: true`.
  - `it('без вида цели раунд — по регионам')`: тот же вызов без `targetKind` → `target.kind === 'region'`.
  - `it('idsToReview — всё, что не с первой попытки, в порядке опроса')`: два промаха и верный по первой цели, верный по второй → `idsToReview` равен `[первая]`.
- [ ] **Step 2: Запустить** `npx vitest run src/domain/fill-round.test.ts` — падает на неизвестных полях.
- [ ] **Step 3: Переписать движок** под интерфейсы выше; остальные тесты файла перевести на новые имена полей.
- [ ] **Step 4: Перевести потребителей** — `FillMapRound`, `FillMapResultsPage`, `App.tsx` (повтор из итогов заполнения), их тесты — на `targetId`, `answeredId`, `idsToReview`.
- [ ] **Step 5: Проверки** — `npx tsc -b`, `npm test`: всё зелёное, поведение не изменилось.
- [ ] **Step 6: Commit** — `refactor: движок заполнения карты для любого вида цели`.

---

### Task 2: Уровень в окне перед стартом и одна карточка «Найти регион»

**Files:**
- Create: `src/domain/difficulty.ts`
- Modify: `src/features/home/ModeStartDialog.tsx`, `src/features/home/HomePage.tsx`, `src/features/exercise/exercise-modes.ts`, `src/App.tsx`
- Modify: `src/features/home/HomePage.test.tsx`, `src/features/exercise/exercise-modes.test.ts`, `src/App.test.tsx`; create `src/features/home/ModeStartDialog.test.tsx`, если его нет
- Modify: `src/styles.css` (группа радиокнопок по образцу `.mode-dialog-set`)
- Modify: DECISIONS.md, CHANGELOG.md

**Interfaces:**
- Produces:
  - `export type Difficulty = 'easy' | 'hard';` и `export const DEFAULT_DIFFICULTY: Difficulty = 'easy';` в `src/domain/difficulty.ts`.
  - `ModeStartDialogProps.levelChoice?: { readonly value: Difficulty } | null` — задано → группа «Сложность».
  - `ModeStartDialogProps.onStart: (language: QuestionLanguage, set: string, level: Difficulty) => void`.
  - `ModeCard.levels?: { readonly easyVolume: string; readonly hardVolume: string }` — есть у пяти карточек «Найти…».
  - `HomePageProps.difficulty: Difficulty` (что предвыбрать) и колбэки старта получают последним аргументом `level: Difficulty`.
  - В `App`: `const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY)`; каждый старт из окна сначала `setDifficulty(level)`.
- Тексты (точно):
  - легенда «Сложность»;
  - «Лёгкий» с пояснением «найденное остаётся на карте, три попытки»;
  - «Сложный» с пояснением «карта каждый раз чистая, одна попытка».

- [ ] **Step 1: Тесты окна** — `it('у игры с уровнями — выбор сложности, лёгкий отмечен')`, `it('выбранный уровень уходит в onStart')` (щёлкнуть «Сложный», «Начать» → `onStart('ru', '', 'hard')`), `it('без levelChoice группы сложности нет')`.
- [ ] **Step 2: Тесты карточек** — в `exercise-modes.test.ts`: карточки с `id` `fill-map` нет; карточка `find-on-map` называется «Найти регион»; `levels` заданы ровно у `find-on-map`, `find-country`, `find-city`, `find-physical` и `find-landmark`.
- [ ] **Step 3: Запустить** эти тесты — падают.
- [ ] **Step 4: Реализовать** `difficulty.ts`, группу в окне (радиокнопки, `name="mode-dialog-level"`), `levels` и переименование в `exercise-modes.ts`, удалить карточку и вид `'fill'` из `ModeCard`. Объём в окне — `easyVolume` или `hardVolume` по выбранному уровню; у «Найти регион» — «34 региона, около 9 минут» и «34 региона, около 7 минут», у остальных обе строки равны нынешнему `volume`.
- [ ] **Step 5: Провести уровень** через `HomePage.start` в колбэки `App`. В этой задаче `App` пока только запоминает уровень и запускает нынешние раунды (сложный путь); лёгкий путь включают задачи 3 и 5–8.
- [ ] **Step 6: Проверки и тесты главной/App** — тесты, искавшие «Заполнить карту» или «Найти на карте», перевести на «Найти регион» и выбор уровня.
- [ ] **Step 7: Записи** — DECISIONS.md: «2026-10-18 · Уровни сложности в играх «Найти…»; «Найти на карте» и «Заполнить карту» слиты в «Найти регион»» со ссылкой на спецификацию и списком решений исполнителя из неё; CHANGELOG.md (Changed).
- [ ] **Step 8: Commit** — `feat: выбор уровня сложности перед стартом, одна карточка «Найти регион»`.

---

### Task 3: «Найти регион» на лёгком уровне — заполнение с пулом и повтор на том же уровне

**Files:**
- Modify: `src/features/exercise/FillMapRound.tsx`, `src/features/results/FillMapResultsPage.tsx`, `src/App.tsx`
- Test: `src/features/exercise/FillMapRound.test.tsx`, `src/features/results/FillMapResultsPage.test.tsx`, `src/App.test.tsx`
- Modify: EXERCISES.md («Найди на карте», «Заполни карту» → один раздел «Найти регион» с двумя уровнями), CHANGELOG.md

**Interfaces:**
- Consumes: Task 1 (движок), Task 2 (`Difficulty`, `difficulty` в `App`).
- Produces:
  - `FillMapRoundProps.regions` — пул раунда (может быть уже 34); карта по-прежнему рисует все регионы справочника.
  - `FillMapResultsPageProps`: `targets: readonly NamedTarget[]` (вместо `regions`), `countWord?: (count: number) => string`, `referenceOf?: (targetId: string) => (() => void) | null`, `roundMap?: ReactNode` (у регионов — карта исходов, у прочих не задана).
  - В `App`: `function startFindRegions(language: QuestionLanguage, regionIds: readonly string[] | null)` — по `difficulty` запускает заполнение (пул) или `startRound('find-on-map', …)`. Им пользуются карточка, «Новый раунд», «Повторить ошибки», строка повтора на главной, «Тренировать» в атласе и на странице коллекции.

- [ ] **Step 1: Тест повтора на том же уровне** — в `App.test.tsx`: `it('итог лёгкого «Найти регион» повторяет ошибки тем же уровнем')` — пройти заполнение с промахами (как в нынешнем тесте итогов заполнения), «Повторить ошибки» → на экране `data-testid="fill-target"` и счёт «Закрашено 0 из N», где N — число ошибок.
- [ ] **Step 2: Тест входа мимо окна** — `it('«Тренировать» в атласе запускает запомненный уровень')`: старт «Найти регион» на «Сложном», выйти, атлас → «Тренировать» → экран `ExerciseRound` (вопрос с `data-testid="exercise-target"`), а не заполнение.
- [ ] **Step 3: Тест итогов** — в `FillMapResultsPage.test.tsx`: у ошибки есть «В справочник — {имя}», если `referenceOf` её даёт; без `roundMap` карты на итогах нет.
- [ ] **Step 4: Запустить** — падают.
- [ ] **Step 5: Реализовать** `startFindRegions`, пул в заполнении, обобщённые итоги (`referenceOf` — через `referenceTargetOf('region', id)`), заголовок итогов для регионов прежний.
- [ ] **Step 6: Проверки**, браузер: «Найти регион» → «Лёгкий» — закрашивание и три попытки; «Сложный» — нынешний раунд с остановкой на ошибке.
- [ ] **Step 7: Commit** — `feat: «Найти регион» на лёгком уровне — заполнение карты, повтор тем же уровнем`.

---

### Task 4: Три исхода у стран, городов, объектов и звёзд

**Files:**
- Create: `src/map/mark-outcome.ts`
- Modify: `src/map/CountryLayer.tsx`, `src/map/CityLayer.tsx`, `src/map/PhysicalLayer.tsx`, `src/map/LandmarkLayer.tsx`, `src/map/ClusterMark.tsx`, `src/map/ChinaMap.tsx`, `src/styles.css`
- Test: тесты этих слоёв, `src/map/ChinaMap.test.tsx`

**Interfaces:**
- Produces:
  - `export type MarkOutcome = 'correct' | 'second-try' | 'incorrect';` и `export function markOutcomeOf(outcome: RegionOutcome): MarkOutcome` (`first-try` → `correct`, `second-try` → `second-try`, `failed` → `incorrect`) в `src/map/mark-outcome.ts`.
  - `FeatureOutcome` и `LandmarkOutcome` становятся псевдонимами `MarkOutcome`.
  - Новые свойства `ChinaMap`: `countryOutcomes?: Readonly<Record<string, MarkOutcome>>`, `cityOutcomes?: Readonly<Record<string, MarkOutcome>>`, `cityIds?: readonly string[]` (какие города рисовать; не задано — как сейчас), `landmarkIds?: readonly string[]` (то же для звёзд).
  - Слои ставят `data-outcome` со значением `MarkOutcome` на узел цели и называют исход в доступном имени: «— найден», «— найден со второй попытки», «— не найден».
- Вид `second-try` (два канала, как у остальных исходов): у стран — заливка `url('#map-hatch-second-try')`, как у регионов; у реки и формы рельефа — нефрит с пунктиром `4 2`; у точек и звёзд — нефритовый знак с пунктирным кольцом. Толщины — `var(--map-border-width-strong)`.

- [ ] **Step 1: Тест `markOutcomeOf`** — три пары значений выше.
- [ ] **Step 2: Тесты слоёв** — для каждого слоя: `data-outcome="second-try"` на цели и слово в доступном имени; `CityLayer` с `cityIds={['wuhan']}` рисует один город; `ChinaMap` с `cityOutcomes={{ beijing: 'correct' }}` и регионами не ставит `data-outcome` области `beijing`.
- [ ] **Step 3: Запустить** — падают.
- [ ] **Step 4: Реализовать** типы, свойства, стили. Гроздь берёт исход членов по правилу: есть `incorrect` → `incorrect`, иначе `second-try`, иначе `correct` — только когда все члены грозди закрыты; иначе исхода нет.
- [ ] **Step 5: Проверки**, `scripts/validate-tokens.test.ts` зелёный.
- [ ] **Step 6: Commit** — `feat: три исхода у стран, городов, объектов и звёзд`.

---

### Task 5: «Найти страну» на лёгком уровне

**Files:**
- Modify: `src/features/exercise/FillMapRound.tsx`, `src/App.tsx`
- Test: `src/features/exercise/FillMapRound.test.tsx`, `src/App.test.tsx`
- Modify: EXERCISES.md (игры по странам), CHANGELOG.md

**Interfaces:**
- Consumes: Tasks 1, 3 (итоги), 4 (`countryOutcomes`, `markOutcomeOf`).
- Produces:
  - `FillMapRoundProps`: `kind: FillKind`, где `export type FillKind = 'region' | 'country' | 'city' | 'physical' | 'landmark'` (в `FillMapRound.tsx`); `targets: readonly NamedTarget[]` вместо `regions`; `mapIds?: readonly string[]` (для городов и мест — набор раунда).
  - Внутри: `function resolveAnswer(kind: FillKind, pickedIds: readonly string[], targetId: string): string` — какой ответ записать по нажатию (страна — сама; гроздь звёзд — спрошенный, если он внутри, иначе первый член; часть реки — целое, если спрошено целое).
  - В `App`: `startFindCountries(language, pool)` по `difficulty`.
- Подписи: вопрос «Найдите страну на карте», счёт «Закрашено k из n», статус промаха «Не эта страна. Осталось попыток: N.»

- [ ] **Step 1: Тесты** — `it('лёгкий уровень по странам закрашивает найденную страну')`; `it('нажатие по закрытой стране не тратит попытку')` (Review Focus 1); `it('итог лёгкого уровня по странам — без карты, со списком ошибок')`.
- [ ] **Step 2: Запустить** — падают.
- [ ] **Step 3: Реализовать** вид `country`: `ChinaMap` с `showsCountries`, `countryOutcomes` из `round.outcomes` через `markOutcomeOf`, промах — `countryOutcomes[picked] = 'incorrect'` на `MISS_FLASH_MS`, показ ненайденной — исход `incorrect` на `REVEAL_MS`. Закрытые цели обработчик пропускает до движка.
- [ ] **Step 4: Проверки**, браузер: Бутан и закрашивание видны.
- [ ] **Step 5: Commit** — `feat: «Найти страну» на лёгком уровне`.

---

### Task 6: «Найти город» на лёгком уровне — только набор на карте

**Files:** как в Task 5; EXERCISES.md (игры по городам).

**Interfaces:**
- Consumes: Task 5 (`FillKind`, `resolveAnswer`, `mapIds`), Task 4 (`cityOutcomes`, `cityIds`).
- Produces: в `App` хранится набор раунда `citySet: CitySet`; `startFindCities(language, set, pool)` по `difficulty`; «Новый раунд» и повтор берут сохранённый набор (сейчас «Новый раунд» всегда `'capital'`).

- [ ] **Step 1: Тесты** — `it('на лёгком уровне на карте только города набора')` (столицы → столько точек `[data-city-id]`, сколько `citiesUpTo('capital')`); `it('повтор одной ошибки рисует весь набор раунда')` (Review Focus 2); `it('«Новый раунд» по городам берёт тот же набор')` в `App.test.tsx`.
- [ ] **Step 2: Запустить** — падают.
- [ ] **Step 3: Реализовать** вид `city`: `showsCities`, `cityIds={mapIds}`, `cityOutcomes`; гроздь городов приближает карту, как сейчас.
- [ ] **Step 4: Проверки**, браузер.
- [ ] **Step 5: Commit** — `feat: «Найти город» на лёгком уровне, на карте только набор`.

---

### Task 7: «Найти объект» на лёгком уровне — вся физическая карта

**Files:** как в Task 5; EXERCISES.md (физическая карта).

**Interfaces:**
- Consumes: Task 5, Task 4 (`featureOutcomes` с `MarkOutcome`).
- Produces: `startFindPhysical(language, set, pool)` по `difficulty`; набор хранится, как у городов.

- [ ] **Step 1: Тесты** — `it('лёгкий уровень по физической карте помечает найденный объект')`; `it('«Три ущелья» на вопрос о Янцзы засчитываются')` (Review Focus 4); `it('на лёгком уровне нарисованы все объекты, а не набор')`.
- [ ] **Step 2: Запустить** — падают.
- [ ] **Step 3: Реализовать** вид `physical`: `variant="physical"`, вид рельефа из `App`, `featureOutcomes`; `resolveAnswer` — через `partOfFeature`.
- [ ] **Step 4: Проверки**, браузер.
- [ ] **Step 5: Commit** — `feat: «Найти объект» на лёгком уровне`.

---

### Task 8: «Найти место» на лёгком уровне — только звёзды набора

**Files:** как в Task 5; EXERCISES.md (достопримечательности); UI_UX.md, SPEC.md, MVP.md и ACCEPTANCE_CRITERIA.md там, где описаны режимы «Найти…» и «Заполнить карту».

**Interfaces:**
- Consumes: Task 5, Task 4 (`landmarkOutcomes`, `landmarkIds`).
- Produces: `startFindLandmarks(language, set, pool)` по `difficulty`; набор хранится.

- [ ] **Step 1: Тесты** — `it('на лёгком уровне на карте только звёзды набора')`; `it('нажатие по грозди со спрошенным засчитывается')` (Review Focus 4).
- [ ] **Step 2: Запустить** — падают.
- [ ] **Step 3: Реализовать** вид `landmark`: `showsLandmarks`, `landmarkIds={mapIds}`, `landmarkOutcomes`; `resolveAnswer` — как `handleLandmarkSelect` в `LandmarkRound`.
- [ ] **Step 4: Документы** — обновить все описания «Заполнить карту» и «Найти на карте» (`grep -rn "Заполнить карту\|Заполни карту\|Найти на карте"` по *.md вне `docs/superpowers` и CHANGELOG/DECISIONS), CHANGELOG.md.
- [ ] **Step 5: Проверки**, браузер: все пять игр на обоих уровнях.
- [ ] **Step 6: Commit** — `feat: «Найти место» на лёгком уровне, документы`.
