import { lazy } from 'react';
import { loadCountryLayer } from './map/load-country-layer';
import { loadPhysicalMap } from './map/load-physical-map';

/**
 * Экраны, кроме главной, приезжают отдельными кусками сборки.
 *
 * Главная остаётся в первом куске: с неё начинают, и ждать её нечего. Всё
 * остальное — атлас, коллекции, раунды, итоги — грузится по требованию, и
 * вместе с ними уезжает то, что нужно только им: реестр источников, полосы
 * рельефа, геометрия физической карты.
 *
 * Дотягивание обязательно. `MVP.md` и `AGENTS.md` обещают, что после
 * первоначальной загрузки приложение работает без сети, а простое деление это
 * обещание ломает: атлас, открытый в классе с упавшим Wi-Fi, не открылся бы
 * вовсе. Поэтому сразу после первого экрана, в простое, приложение тихо тянет
 * оставшиеся куски. Обещание сдвигается на секунду и остаётся правдой; во
 * время раунда сеть по-прежнему не нужна — кусок раунда приезжает до первого
 * вопроса, а обычно задолго до него.
 *
 * Список загрузчиков один на оба дела — на `lazy` и на дотягивание. Второй
 * список разошёлся бы с первым при первом же новом экране, и разошёлся бы
 * молча: забытый в нём экран продолжал бы работать, теряя только обещание.
 */
const loaders = {
  atlas: () => import('./features/atlas/AtlasPage'),
  collections: () => import('./features/collections/CollectionsPage'),
  collection: () => import('./features/collections/CollectionPage'),
  exercise: () => import('./features/exercise/ExerciseRound'),
  city: () => import('./features/exercise/CityRound'),
  physical: () => import('./features/exercise/PhysicalRound'),
  landmark: () => import('./features/exercise/LandmarkRound'),
  history: () => import('./features/exercise/HistoryRound'),
  culture: () => import('./features/exercise/CultureRound'),
  fill: () => import('./features/exercise/FillMapRound'),
  country: () => import('./features/exercise/CountryRound'),
  /*
   * Слой стран тянется заранее: без него игра в классе без сети не откроется.
   * Тянется своим загрузчиком, а не вторым `import()` того же модуля: только
   * он запоминает загруженное, и без него карта каждый раз рисовала бы первый
   * кадр без стран. Тот же довод, что у физической карты ниже.
   */
  countryLayer: loadCountryLayer,
  order: () => import('./features/exercise/OrderRound'),
  results: () => import('./features/results/RoundResultsPage'),
  fillResults: () => import('./features/results/FillMapResultsPage'),
  physicalMap: loadPhysicalMap,
} as const;

export const AtlasPage = lazy(() =>
  loaders.atlas().then((module) => ({ default: module.AtlasPage })),
);
export const CollectionsPage = lazy(() =>
  loaders.collections().then((module) => ({ default: module.CollectionsPage })),
);
export const CollectionPage = lazy(() =>
  loaders.collection().then((module) => ({ default: module.CollectionPage })),
);
export const ExerciseRound = lazy(() =>
  loaders.exercise().then((module) => ({ default: module.ExerciseRound })),
);
export const CityRound = lazy(() =>
  loaders.city().then((module) => ({ default: module.CityRound })),
);
export const PhysicalRound = lazy(() =>
  loaders.physical().then((module) => ({ default: module.PhysicalRound })),
);
export const LandmarkRound = lazy(() =>
  loaders.landmark().then((module) => ({ default: module.LandmarkRound })),
);
export const HistoryRound = lazy(() =>
  loaders.history().then((module) => ({ default: module.HistoryRound })),
);
export const CultureRound = lazy(() =>
  loaders.culture().then((module) => ({ default: module.CultureRound })),
);
export const FillMapRound = lazy(() =>
  loaders.fill().then((module) => ({ default: module.FillMapRound })),
);
export const CountryRound = lazy(() =>
  loaders.country().then((module) => ({ default: module.CountryRound })),
);
export const OrderRound = lazy(() =>
  loaders.order().then((module) => ({ default: module.OrderRound })),
);
export const RoundResultsPage = lazy(() =>
  loaders.results().then((module) => ({ default: module.RoundResultsPage })),
);
export const FillMapResultsPage = lazy(() =>
  loaders
    .fillResults()
    .then((module) => ({ default: module.FillMapResultsPage })),
);
/* Та же часть, что итоги заполнения: карта исходов приходит с ними одним куском. */
export const FillOutcomesMap = lazy(() =>
  loaders
    .fillResults()
    .then((module) => ({ default: module.FillOutcomesMap })),
);

/**
 * Дотянуть остальные куски, когда браузеру нечем заняться.
 *
 * `requestIdleCallback` есть не везде (Safari получил его только в 2022-м), и
 * запасной путь — таймер: важно не попасть точно в простой, а не соперничать
 * с отрисовкой первого экрана.
 */
export function prefetchScreens(): void {
  const pull = () => {
    for (const load of Object.values(loaders)) {
      void load();
    }
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(pull, { timeout: 3000 });

    return;
  }

  window.setTimeout(pull, 1000);
}
