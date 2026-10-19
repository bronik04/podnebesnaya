import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { citiesUpTo } from '../../content/cities';
import { collections, collectionsInGroup } from '../../content/collections';
import { MODE_CARDS, MODE_GROUPS } from '../exercise/exercise-modes';
import { regions } from '../../content/regions';
import type { Attempt } from '../../domain/round';
import { HomePage } from './HomePage';

/**
 * История нужна только тем проверкам, где от неё зависит подпись главного
 * шага: карточки игр от неё не зависят — все открыты сразу.
 */
function renderHome(
  attempts: readonly Attempt[] = [],
  difficulty: 'easy' | 'hard' = 'easy',
) {
  const handlers = {
    onStartRound: vi.fn(),
    onStartCountryRound: vi.fn(),
    onStartCityRound: vi.fn(),
    onStartLandmarkRound: vi.fn(),
    onStartCultureRound: vi.fn(),
    onStartHistoryRound: vi.fn(),
    onStartPhysicalRound: vi.fn(),
    onOpenAtlas: vi.fn(),
    onOpenRegion: vi.fn(),
    onGoToModes: vi.fn(),
    onOpenCollections: vi.fn(),
    onOpenCollection: vi.fn(),
  };

  const { container } = render(
    <HomePage
      regions={regions}
      attempts={attempts}
      difficulty={difficulty}
      {...handlers}
    />,
  );

  return { ...handlers, container };
}

/** Свежая ошибка по региону: из неё считается строка повтора. */
function mistake(regionId: string): Attempt {
  return {
    questionId: `r1-${regionId}`,
    roundId: 'r1',
    target: { kind: 'region', id: regionId },
    exerciseType: 'find-on-map',
    language: 'ru',
    isCorrect: false,
    durationMs: 1000,
    answeredAt: new Date().toISOString(),
  };
}

it('на экране ровно одна главная кнопка', () => {
  renderHome();

  const primary = screen
    .getAllByRole('button')
    .filter((button) => button.classList.contains('primary'));

  expect(primary).toHaveLength(1);
});

/*
 * Главный шаг ведёт к выбору, а не запускает раунд сам. Прежде здесь стоял
 * вычисленный шаг — «Начать: найти регион» или «Повторить 2 региона»: он
 * решал за ученика, во что играть, и на первом экране объявлял объём
 * тренажёра числом ошибок.
 */
it('главная кнопка ведёт в раздел режимов, а не запускает раунд сама', () => {
  const { onGoToModes, onStartRound } = renderHome();

  fireEvent.click(screen.getByRole('button', { name: 'Выбрать режим' }));

  expect(onGoToModes).toHaveBeenCalled();
  expect(onStartRound).not.toHaveBeenCalled();
});

/*
 * Повтор ошибок не пропал вместе с кнопкой героя: он стоит первой строкой
 * раздела «Режимы», куда герой и ведёт.
 */
it('строка повтора называет ошибочные регионы и запускает те же цели', () => {
  const { onStartRound } = renderHome([mistake('hunan'), mistake('hubei')]);

  const strip = screen.getByRole('region', { name: 'Повторить ошибки' });
  expect(strip).toHaveTextContent('2 региона: 湖南省 Хунань, 湖北省 Хубэй');

  fireEvent.click(within(strip).getByRole('button', { name: 'Начать повтор' }));

  expect(onStartRound).toHaveBeenCalledWith(
    'find-on-map',
    'ru',
    ['hunan', 'hubei'],
    'easy',
  );
});

/*
 * Герой занимает весь первый экран, поэтому строка повтора живёт в «Режимах»:
 * «Выбрать режим» приводит вернувшегося ученика прямо к ней.
 */
it('строка повтора стоит в разделе «Режимы», а не под героем', () => {
  renderHome([mistake('hunan')]);

  const strip = screen.getByRole('region', { name: 'Повторить ошибки' });

  expect(strip.closest('#modes')).not.toBeNull();
});

/*
 * Темы идут в любом порядке, и номера 一–七 обещали последовательность. У
 * каждой темы теперь знак её предмета.
 */
it('темы режимов помечены знаком предмета, а не номером', () => {
  const { container } = renderHome();

  const marks = [
    ...container.querySelectorAll('.mode-chapter-mark'),
  ].map((mark) => mark.textContent);

  expect(marks).toEqual(['省', '国', '城', '山', '景', '史', '文']);
});

/* Длинный перечень превратил бы строку в абзац: по имени — первые три. */
it('строка повтора называет по имени не больше трёх регионов', () => {
  renderHome(['hunan', 'hubei', 'henan', 'hebei', 'shanxi'].map(mistake));

  const strip = screen.getByRole('region', { name: 'Повторить ошибки' });

  expect(strip).toHaveTextContent('5 регионов:');
  expect(strip).toHaveTextContent('и ещё 2');
  expect(strip).not.toHaveTextContent('Хэбэй');
});

it('без ошибок строки повтора нет вовсе', () => {
  renderHome();

  expect(screen.queryByRole('region', { name: 'Повторить ошибки' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Начать повтор' })).toBeNull();
});

it('карточка открытого режима запускает свой раунд', () => {
  const { onStartRound } = renderHome();

  fireEvent.click(screen.getByRole('button', { name: /Назвать регион/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartRound).toHaveBeenCalledWith('name-target', 'ru', null, 'easy');
});

/*
 * Игры равноправны и открыты все сразу: это разные занятия, а не ступени одной
 * лестницы. Заслуживать доступ не нужно и истории для этого не требуется.
 */
it('карточка игры запускается без всякой истории', () => {
  const { onStartRound } = renderHome();

  const card = screen.getByRole('button', { name: /Регион — столица/ });

  expect(card).toBeEnabled();
  fireEvent.click(card);
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartRound).toHaveBeenCalledWith('match-pair', 'ru', null, 'easy');
});

/*
 * Ненаписанных режимов не осталось: «Культура» была последней. Проверяется то,
 * что теперь верно, — ни одна карточка не выключена и ни одна не помечена
 * готовящейся. Приём для пометки остаётся в коде: следующий объявленный режим
 * снова им воспользуется, и `ModeCard` держит вид `planned` ради этого.
 */
it('все объявленные режимы написаны и запускаются', () => {
  renderHome();

  const cards = screen
    .getAllByRole('button')
    .filter((button) => button.classList.contains('mode-pill'));

  expect(cards).toHaveLength(MODE_CARDS.length);
  for (const card of cards) {
    expect(card, card.textContent ?? '').toBeEnabled();
  }
  expect(screen.queryByText(/готовится/)).not.toBeInTheDocument();
});

/*
 * «Найти на карте» и «Заполнить карту» слиты в «Найти регион» (решение
 * владельца от 2026-10-18): уровень выбирается в окне и уходит в запуск.
 */
it('«Найти регион» запускается с выбранным уровнем', () => {
  const { onStartRound } = renderHome();

  openCard(/Найти регион/);
  fireEvent.click(screen.getByRole('radio', { name: /Сложный/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartRound).toHaveBeenCalledWith('find-on-map', 'ru', null, 'hard');
});

it('у игры без уровней группы «Сложность» в окне нет', () => {
  renderHome();

  openCard(/Назвать регион/);

  expect(screen.queryByRole('group', { name: 'Сложность' })).toBeNull();
});

/*
 * Игра без уровней не трогает запомненный уровень: иначе после «Назвать
 * регион» атлас и строка повтора молча уходили бы на лёгкий.
 */
it('игра без уровней передаёт запомненный уровень, а не лёгкий', () => {
  const { onStartRound } = renderHome([], 'hard');

  openCard(/Назвать регион/);
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartRound).toHaveBeenCalledWith('name-target', 'ru', null, 'hard');
});

it('ведёт в атлас', () => {
  const { onOpenAtlas } = renderHome();

  fireEvent.click(screen.getByRole('button', { name: /Исследовать карту/ }));

  expect(onOpenAtlas).toHaveBeenCalled();
});

/*
 * Карта героя — дверь в атлас, а не вторая интерактивная карта: области не
 * получают фокус и не выбираются здесь. Тридцать четыре остановки табуляции
 * стояли бы между шапкой и всем остальным на странице.
 */
it('нажатие по области карты открывает атлас на ней', () => {
  const { container, onOpenRegion } = renderHome();

  const area = container.querySelector('[data-region-id="hunan"]');
  fireEvent.click(area as Element);

  expect(onOpenRegion).toHaveBeenCalledWith('hunan');
  expect(area).toHaveAttribute('tabindex', '-1');
});

it('ведёт в раздел коллекций', () => {
  const { onOpenCollections } = renderHome();

  fireEvent.click(screen.getByRole('button', { name: /Все коллекции/ }));

  expect(onOpenCollections).toHaveBeenCalled();
});

/*
 * Три, а не четыре: терракотовая армия переехала в справочник
 * достопримечательностей и вместе с ним в группу «География» — она объект на
 * карте, а не явление (2026-08-28).
 */
it('витрина коллекций фильтруется по группе', () => {
  const { onOpenCollection } = renderHome();

  fireEvent.click(screen.getByRole('button', { name: 'Культура и история 3' }));

  expect(
    screen.getByRole('button', { name: /Праздник весны/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Великая стена/ }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Праздник весны/ }));
  expect(onOpenCollection).toHaveBeenCalledWith('spring-festival');
});

/* Счёт в подписи чипа берётся из каталога, а не пишется в тесте руками. */
it('выбранная группа помечена не только цветом', () => {
  renderHome();

  const inGroup = collectionsInGroup('geography').length;
  const chip = screen.getByRole('button', { name: `География ${inGroup}` });
  fireEvent.click(chip);

  expect(chip).toHaveAttribute('aria-pressed', 'true');
});

it('витрина показывает четыре коллекции из всего каталога', () => {
  renderHome();

  const cards = screen
    .getAllByRole('listitem')
    .filter((item) => item.classList.contains('collection-card'));

  expect(collections.length).toBeGreaterThan(4);
  expect(cards).toHaveLength(4);
});

it('раздел режимов принимает фокус: шапка ведёт на него по якорю', () => {
  const { container } = render(
    <HomePage
      regions={regions}
      attempts={[]}
      difficulty="easy"
      onStartRound={vi.fn()}
      onStartCountryRound={vi.fn()}
      onStartCityRound={vi.fn()}
      onStartLandmarkRound={vi.fn()}
      onStartCultureRound={vi.fn()}
      onStartHistoryRound={vi.fn()}
      onStartPhysicalRound={vi.fn()}
      onOpenAtlas={vi.fn()}
      onOpenRegion={vi.fn()}
      onGoToModes={vi.fn()}
      onOpenCollections={vi.fn()}
      onOpenCollection={vi.fn()}
    />,
  );

  const modes = container.querySelector('#modes');

  expect(modes).not.toBeNull();
  expect(modes).toHaveAttribute('tabindex', '-1');
  expect(within(modes as HTMLElement).getByRole('heading', { level: 2 })).toHaveTextContent(
    'Режимы',
  );
});

function openCard(title: string | RegExp): void {
  fireEvent.click(screen.getByRole('button', { name: title }));
}

/*
 * Одиннадцать равных карточек подряд требовали прочитать одиннадцать абзацев,
 * чтобы выбрать. Группы — те же справочники, из которых берутся цели.
 */
it('игры разложены по семи предметам, и каждая попала ровно в одну группу', () => {
  renderHome();

  /*
   * Семь полок. «История и культура» стояли вместе, пока у каждой было по
   * одной игре; у истории их стало пять, и полки разделились. Шестую дали
   * достопримечательности (2026-08-28): это третий справочник целей, а не
   * ещё один взгляд на города. Седьмую — сопредельные государства
   * (2026-08-30): свой справочник и свой слой на карте.
   */
  expect(MODE_GROUPS).toHaveLength(7);
  expect(
    screen.getByRole('heading', { level: 3, name: 'История' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 3, name: 'Культура' }),
  ).toBeInTheDocument();

  for (const group of MODE_GROUPS) {
    expect(
      screen.getByRole('heading', { level: 3, name: group.title }),
    ).toBeInTheDocument();
  }

  const chapters = document.querySelectorAll('.mode-chapter');
  const pills = [...chapters].flatMap((chapter) => [
    ...chapter.querySelectorAll('.mode-pill'),
  ]);

  expect(chapters).toHaveLength(MODE_GROUPS.length);
  expect(pills).toHaveLength(MODE_CARDS.length);
});

/*
 * Описание игры ушло с карточки в окно старта: там ученик уже выбрал игру и
 * спрашивает, как в ней спрашивают, а не сравнивает одиннадцать абзацев.
 */
it('описание игры стоит в окне перед стартом, а не на карточке', () => {
  renderHome();

  const summary = MODE_CARDS[0].summary;
  expect(screen.queryByText(summary)).toBeNull();

  openCard(/Найти регион/);

  expect(within(screen.getByRole('dialog')).getByText(summary)).toBeInTheDocument();
});

it('спрашивает язык перед стартом, а не запускает раунд сразу', () => {
  const { onStartRound } = renderHome();

  openCard(/Найти регион/);

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(onStartRound).not.toHaveBeenCalled();
});

it('запускает игру на выбранном языке', () => {
  const { onStartRound } = renderHome();

  openCard(/Найти регион/);
  fireEvent.click(screen.getByRole('radio', { name: '中文' }));
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartRound).toHaveBeenCalledWith('find-on-map', 'zh', null, 'easy');
});

/*
 * Наборов городов два, а не три: приграничные с Россией сняты решением
 * владельца продукта (DECISIONS.md, 2026-08-28). Числа в подписях считаются
 * из каталога, поэтому проверка не повторяет их руками.
 */
it('окно городской игры предлагает два набора, оба из каталога', () => {
  const { onStartCityRound } = renderHome();

  openCard(/Найти город/);

  const choice = within(screen.getByRole('group', { name: 'Какие города' }));
  const options = choice.getAllByRole('radio');

  expect(options).toHaveLength(2);
  expect(
    choice.getByRole('radio', {
      name: `Только центры регионов — ${citiesUpTo('capital').length} города`,
    }),
  ).toBeInTheDocument();

  const all = citiesUpTo('notable').length;
  fireEvent.click(
    choice.getByRole('radio', { name: `И значимые города — ${all} город` }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartCityRound).toHaveBeenCalledWith('find-on-map', 'ru', 'notable', 'easy');
});

/*
 * Две игры по истории различает не экран, а признак: карточка обязана донести
 * его до запуска, иначе год спрашивался бы сроком.
 */
it('карточка года запускает игру «кто правил»', () => {
  const { onStartHistoryRound } = renderHome();

  openCard(/Кто правил в этом году/);
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartHistoryRound).toHaveBeenCalledWith('ru', undefined, 'who');
});

it('карточка столиц запускает игру о столицах', () => {
  const { onStartHistoryRound } = renderHome();

  openCard(/Династия — столица/);
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartHistoryRound).toHaveBeenCalledWith('ru', undefined, 'capital');
});

it('карточка правителей запускает игру о правителях', () => {
  const { onStartHistoryRound } = renderHome();

  openCard(/Династия — правитель/);
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartHistoryRound).toHaveBeenCalledWith('ru', undefined, 'ruler');
});

it('карточка порядка запускает расстановку', () => {
  const { onStartHistoryRound } = renderHome();

  openCard(/Расставить по порядку/);
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartHistoryRound).toHaveBeenCalledWith('ru', undefined, 'order');
});

it('«Отмена» закрывает окно и ничего не запускает', () => {
  const { onStartRound } = renderHome();

  openCard(/Найти регион/);
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onStartRound).not.toHaveBeenCalled();
});

it('умолчание в окне берётся из языка последней попытки', () => {
  renderHome([
    {
      questionId: '1-gansu',
      roundId: 'r1',
      target: { kind: 'region', id: 'gansu' },
      exerciseType: 'find-on-map',
      language: 'zh',
      isCorrect: true,
      durationMs: 1000,
      answeredAt: new Date().toISOString(),
    },
  ]);

  openCard(/Найти регион/);

  expect(screen.getByRole<HTMLInputElement>('radio', { name: '中文' }).checked).toBe(
    true,
  );
});

it('окно называет игру, в которую попадёшь', () => {
  renderHome();

  openCard(/Найти регион/);

  expect(screen.getByRole('heading', { name: 'Найти регион' })).toBeInTheDocument();
});

it('показывает обе игры по физической географии', () => {
  renderHome();

  expect(
    screen.getByRole('button', { name: /Найти объект/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Назвать объект/ })).toBeInTheDocument();
});

it('запускает игру про страны с главной', () => {
  const { onStartCountryRound } = renderHome();
  fireEvent.click(screen.getByRole('button', { name: /Найти страну/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStartCountryRound).toHaveBeenCalledWith('find-on-map', 'ru', 'easy');
});

/*
 * Линию Великого канала ученик видит и в раундах, а не только в атласе, где
 * под картой стоит `MapAttribution`. ODbL требует, чтобы указание авторства
 * доходило до того, кто видит карту, — главная с её «Источниками» и есть
 * общая для всех раундов точка входа.
 */
it('в источниках названо авторство OpenStreetMap и лицензия ODbL', () => {
  renderHome();

  expect(
    screen.getByRole('link', { name: 'участники OpenStreetMap' }),
  ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  expect(screen.getByRole('link', { name: 'ODbL' })).toHaveAttribute(
    'href',
    'https://opendatacommons.org/licenses/odbl/1-0/',
  );
});
