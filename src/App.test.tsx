import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { CORRECT_PAUSE_MS, WRONG_PAUSE_MS } from './features/exercise/round-pace';
import { MISS_FLASH_MS } from './features/exercise/FillMapRound';
import { afterEach, beforeEach } from 'vitest';
import App from './App';
import { cityById } from './content/cities';
import { countries } from './content/countries';
import { regions } from './content/regions';
import type { Region } from './content/types';

/**
 * Хранилище подменяется картой в памяти: приложение читает прогресс при
 * монтировании, поэтому засеять его можно только до `render`.
 *
 * Хранилище пустое и своё у каждого теста, а подмена снимается после него.
 * Без этого пройденный раунд утекал бы в следующие тесты файла: приложение
 * пишет прогресс, а «повторить ошибки» его читает.
 */
const realStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

function installMemoryStorage(seed: Record<string, string>): void {
  const data = new Map(Object.entries(seed));
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key: string) => data.get(key) ?? null,
      key: (index: number) => [...data.keys()][index] ?? null,
      removeItem: (key: string) => void data.delete(key),
      setItem: (key: string, value: string) => void data.set(key, value),
    },
  });
}

afterEach(() => {
  if (realStorage !== undefined) {
    Object.defineProperty(window, 'localStorage', realStorage);
  }
});

beforeEach(() => {
  installMemoryStorage({});
});

/**
 * Экраны, кроме главной, приезжают отдельными кусками сборки, поэтому
 * появляются не в том же такте, что нажатие. Ожидание здесь не украшение: без
 * него тест проверял бы заглушку Suspense, а не экран. Ученик этого ожидания
 * не видит — куски дотянуты заранее, в простое после первого экрана.
 */
async function settle(): Promise<void> {
  /*
   * Запас времени против умолчания `waitFor`: куски экранов растут вместе с
   * содержанием, и на полном прогоне, где файлы идут parallel, секунд им не
   * хватает. В одиночку файл проходит и с умолчанием — то есть ждём мы не
   * экрана, а свободного процессора.
   *
   * Поднято дважды: до трёх секунд, когда выросли коллекции, и до восьми
   * 2026-08-28, когда к ним добавились 37 достопримечательностей со снимками.
   */
  await waitFor(
    () => {
      expect(screen.queryByText('Экран загружается.')).toBeNull();
    },
    { timeout: 8000 },
  );
}

/*
 * Раунд начинается карточкой режима и окном перед стартом: в герое кнопки
 * запуска больше нет — главный шаг ведёт к выбору, а не запускает игру сам.
 */
function startFindOnMap(): void {
  fireEvent.click(screen.getByRole('button', { name: /Найти на карте/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
}

it('открывается главной, а не сразу раундом', () => {
  render(<App />);

  expect(
    screen.getByRole('heading', { name: 'Где Сычуань, а где Цзянси?' }),
  ).toBeInTheDocument();
});

it('на главной ровно одна главная кнопка', () => {
  render(<App />);

  const primary = screen
    .getAllByRole('button')
    .filter((button) => button.classList.contains('primary'));

  expect(primary).toHaveLength(1);
});

it('ведёт с главной в атлас и обратно', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /Исследовать карту/ }));
  await settle();
  expect(screen.getByTestId('atlas-region-card')).toBeInTheDocument();

  /*
   * Обратно — через марку в шапке: собственной кнопки выхода у атласа нет, и
   * этот путь единственный, каким ученик возвращается на главную.
   */
  fireEvent.click(screen.getByRole('button', { name: /Поднебесная/ }));
  expect(
    screen.getByRole('heading', { name: 'Где Сычуань, а где Цзянси?' }),
  ).toBeInTheDocument();
});

it('шапка ведёт в атлас и в коллекции', async () => {
  render(<App />);

  const nav = screen.getByRole('navigation', { name: 'Разделы сайта' });

  fireEvent.click(screen.getByRole('button', { name: 'Атлас' }));
  await settle();
  expect(screen.getByTestId('atlas-region-card')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Коллекции' }));
  await settle();
  expect(
    screen.getByRole('heading', {
      name: 'Места и явления, к которым привязаны вопросы',
    }),
  ).toBeInTheDocument();
  expect(nav).toBeInTheDocument();
});

/*
 * Шапка закреплена и стоит везде, включая экраны ответа: решение владельца
 * продукта отменяет прежнее «на экранах ответа шапки нет».
 */
it('шапка стоит и на экране ответа', async () => {
  render(<App />);

  expect(
    screen.getByRole('navigation', { name: 'Разделы сайта' }),
  ).toBeInTheDocument();

  startFindOnMap();
  await settle();

  expect(screen.getByText(/Вопрос 1 из 34/)).toBeInTheDocument();
  expect(
    screen.getByRole('navigation', { name: 'Разделы сайта' }),
  ).toBeInTheDocument();
});

it('ведёт с главной на страницу коллекции и обратно в раздел', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /Великая стена/ }));
  await settle();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Великая стена',
  );

  fireEvent.click(
    screen.getByRole('button', { name: 'Коллекции', current: false }),
  );
  await settle();
  expect(
    screen.getByRole('heading', {
      name: 'Места и явления, к которым привязаны вопросы',
    }),
  ).toBeInTheDocument();
});

it('коллекция запускает раунд ровно по своим регионам', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /Великая стена/ }));
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Спросить эти регионы' }));
  await settle();

  expect(screen.getByText(/Вопрос 1 из 9/)).toBeInTheDocument();
});

it('атлас держит выбор региона в состоянии приложения', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /Исследовать карту/ }));
  await settle();
  /*
   * Выбирают на самой карте: списка-дублёра в атласе нет, а область несёт
   * `role="button"` и имя «регион, 汉字».
   */
  fireEvent.click(screen.getByRole('button', { name: 'Сычуань, 四川省' }));

  expect(screen.getByTestId('atlas-region-card')).toHaveTextContent('Сычуань');
});

/*
 * Выход из режима ведёт туда, откуда режим начинался, — на секцию «Режимы», а
 * не на верх главной: иначе после каждого раунда приходится прокручивать
 * страницу заново.
 */
it('карточка режима запускает раунд и возвращает на секцию «Режимы»', async () => {
  render(<App />);

  startFindOnMap();
  await settle();
  expect(screen.getByText(/Вопрос 1 из 34/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Прервать раунд' }));

  expect(screen.getByRole('heading', { name: 'Режимы' })).toBeInTheDocument();
  expect(document.activeElement).toHaveAttribute('id', 'modes');
});

/*
 * Переход по шапке посреди раунда стирал сыгранное без единого слова: ответы
 * сохраняются только в конце. Теперь шапка спрашивает, а по умолчанию —
 * остаться.
 */
it('шапка посреди раунда спрашивает, прежде чем уйти', async () => {
  render(<App />);

  startFindOnMap();
  await settle();

  const nav = screen.getByRole('navigation', { name: 'Разделы сайта' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Атлас' }));

  const dialog = screen.getByRole('dialog', {
    name: 'Прервать раунд и перейти в атлас?',
  });
  const stay = within(dialog).getByRole('button', { name: 'Продолжить раунд' });
  expect(document.activeElement).toBe(stay);

  fireEvent.click(stay);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText(/Вопрос 1 из 34/)).toBeInTheDocument();

  fireEvent.click(within(nav).getByRole('button', { name: 'Атлас' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Перейти' }),
  );
  await settle();
  expect(screen.getByTestId('atlas-region-card')).toBeInTheDocument();
});

it('вне раунда шапка переходит сразу', async () => {
  render(<App />);

  const nav = screen.getByRole('navigation', { name: 'Разделы сайта' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Атлас' }));
  await settle();

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByTestId('atlas-region-card')).toBeInTheDocument();
});

/**
 * Полный раунд проверяется в режиме «регион — столица»: на вопрос
 * отрисовываются четыре кнопки вместо карты с 34 областями и списка-дублёра.
 * Проверяемое поведение от режима не зависит, а раунд идёт в разы быстрее.
 *
 */
/** Название административного центра региона: оно живёт в справочнике городов. */
function capitalOf(region: Region): string {
  return cityById(region.capitalCityId)!.nameRu;
}

function answerCapital(correct: boolean): void {
  const asked = screen.getByTestId('exercise-target').textContent;
  /*
   * Регион ищется по обоим названиям: тест не должен зависеть от того, на
   * каком языке идёт раунд.
   */
  const target = regions.find(
    (region) => region.nameRu === asked || region.nameZh === asked,
  )!;
  /*
   * Подпись ищется текстовым запросом внутри кнопки, а не строением разметки:
   * цифра-подсказка (`kbd`) под запрос не подпадает, и тест не зависит от
   * того, каким узлом кнопка рисует подпись. `getByRole` с именем здесь не
   * годится по скорости: вычисление доступных имён всех кнопок на каждом из
   * 34 вопросов не укладывалось в лимит теста под нагрузкой полного набора.
   */
  const match = screen
    .getAllByTestId('choice-option')
    .find(
      (option) =>
        (within(option).queryByText(capitalOf(target)) !== null) === correct,
    )!;
  fireEvent.click(match);
}

/*
 * Кнопки «Далее» больше нет: и верный ответ, и ошибка переводят раунд к
 * следующему вопросу сами, по таймеру (спек RoundStage, 2026-08-17) — верный
 * через 500 мс, ошибка через 2000 мс, пока плашка показывает верный ответ.
 * Поэтому весь раунд проходится на поддельных часах.
 */
function finishRound(correct: boolean): void {
  vi.useFakeTimers();
  try {
    for (let index = 0; index < 34; index += 1) {
      answerCapital(correct);
      act(() => {
        vi.advanceTimersByTime(correct ? CORRECT_PAUSE_MS : WRONG_PAUSE_MS);
      });
    }
  } finally {
    vi.useRealTimers();
  }
}

async function startCapitalRound(): Promise<void> {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Регион — столица/ }));
  // Карточка спрашивает язык окном, и раунд начинается из него.
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
  await settle();
}

it('показывает итог после раунда и возвращает на секцию «Режимы»', async () => {
  await startCapitalRound();
  finishRound(true);
  await settle();

  expect(screen.getByText('100%')).toBeInTheDocument();
  expect(screen.getByText('34 из 34')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'К режимам' }));

  expect(document.activeElement).toHaveAttribute('id', 'modes');
});

it('повторяет все ошибки, а не только показанные пять, и говорит об этом', async () => {
  await startCapitalRound();
  finishRound(false);
  await settle();

  expect(screen.getByText('0%')).toBeInTheDocument();

  // Подпись кнопки — то же число, что и длина раунда: экран показывает пять
  // тем, а повтор берёт все 34 ошибки.
  fireEvent.click(
    screen.getByRole('button', { name: 'Повторить ошибки: 34 региона' }),
  );
  await settle();

  expect(screen.getByText(/Вопрос 1 из 34/)).toBeInTheDocument();
}, 20_000);

it('проходит раунд «регион — столица»', async () => {
  await startCapitalRound();

  expect(screen.getByText(/Вопрос 1 из 34/)).toBeInTheDocument();
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

/*
 * Игры равноправны: запирать одну за другой значило бы решать за ученика, что
 * ему сейчас интересно. Закрытой карточка бывает только пока режим не написан.
 */
it('все написанные игры открыты сразу, без всякой истории', () => {
  render(<App />);

  for (const name of [
    /Найти на карте/,
    /Назвать регион/,
    /Регион — столица/,
    /Заполнить карту/,
    /Династии и даты/,
    /Узнать по фотографии/,
  ]) {
    expect(screen.getByRole('button', { name })).toBeEnabled();
  }
});

it('запускает раунд по физической географии с главной', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /Найти объект/ }));
  // Точное имя, а не «начинается с»: в герое стоит «Начать: найти на карте».
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
  await settle();

  // Без выбора берётся первый набор — реки, их участки, канал и формы.
  expect(screen.getByText(/Вопрос 1 из 21/)).toBeInTheDocument();
});

it('набор перед стартом задаёт длину физического раунда', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /Найти объект/ }));
  fireEvent.click(screen.getByRole('radio', { name: /И озёра/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
  await settle();

  expect(screen.getByText(/Вопрос 1 из 41/)).toBeInTheDocument();
});

/** В заполнении по-русски спрошенный регион назван в плашке `fill-target`. */
function askedFillRegion(): Region {
  const name = screen.getByTestId('fill-target').textContent;

  return regions.find((region) => region.nameRu === name)!;
}

function clickFillRegion(region: Region): void {
  // У закрытого региона к имени приписан исход, поэтому имя ищется по началу.
  fireEvent.click(
    screen.getByRole('button', {
      name: new RegExp(`^${region.nameRu}, ${region.nameZh}`),
    }),
  );
}

/*
 * История идёт своим экраном и своими целями, но заканчивается общим итогом.
 * Проверяется именно стык: числа и склонение на итогах берутся из вида цели,
 * и «12 регионов» вместо «12 династий» было бы видно только здесь.
 */
it('раунд по истории доходит до итога и считает династии', async () => {
  render(<App />);

  fireEvent.click(
    screen.getByRole('button', { name: /Династии и даты/ }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
  await settle();

  expect(screen.getByText(/Вопрос 1 из 12/)).toBeInTheDocument();

  vi.useFakeTimers();
  try {
    for (let index = 0; index < 12; index += 1) {
      fireEvent.click(screen.getAllByTestId('choice-option')[0]);
      act(() => {
        vi.advanceTimersByTime(CORRECT_PAUSE_MS + WRONG_PAUSE_MS);
      });
    }
  } finally {
    vi.useRealTimers();
  }
  await settle();

  expect(screen.getByText(/из 12/)).toBeInTheDocument();
  expect(document.body.textContent).toContain('династи');
  expect(document.body.textContent).not.toContain('12 регионов');
}, 20_000);

it('итог заполнения ведёт в раунд по ошибочным регионам', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Заполнить карту/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
  await settle();

  vi.useFakeTimers();
  try {
    // Первый регион берётся со второй попытки: одна ошибка уходит в историю.
    const first = askedFillRegion();
    const wrong = regions.find((region) => region.id !== first.id)!;
    clickFillRegion(wrong);
    act(() => {
      vi.advanceTimersByTime(MISS_FLASH_MS);
    });
    clickFillRegion(first);

    for (let index = 1; index < 34; index += 1) {
      clickFillRegion(askedFillRegion());
    }
  } finally {
    vi.useRealTimers();
  }
  await settle();

  fireEvent.click(
    screen.getByRole('button', { name: 'Повторить ошибки: 1 регион' }),
  );
  await settle();

  expect(screen.getByText(/Вопрос 1 из 1/)).toBeInTheDocument();
}, 20_000);

it('итог игры про страны считает страны, а не регионы', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Найти страну/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
  await settle();

  /* Слой стран подгружается отдельно: ответы ждут, пока он встанет. */
  const countryName = new RegExp(
    `^(${countries.map((country) => country.nameRu).join('|')}), `,
  );
  await screen.findAllByRole('button', { name: countryName });

  vi.useFakeTimers();
  try {
    /* Четырнадцать ответов подряд, какие попались: важен итог, а не счёт. */
    for (let index = 0; index < 14; index += 1) {
      const buttons = screen.getAllByRole('button', { name: countryName });
      fireEvent.click(buttons[index % buttons.length]);
      act(() => {
        vi.advanceTimersByTime(WRONG_PAUSE_MS);
      });
    }
  } finally {
    vi.useRealTimers();
  }
  await settle();

  expect(screen.getByText(/Итог раунда/)).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Повторить ошибки: \d+ стран/ }),
  ).toBeInTheDocument();
}, 20_000);

/*
 * «Новый раунд» повторяет ту же игру. У достопримечательностей ветки не было,
 * и управление доходило до общего запуска раундов по регионам: ученик нажимал
 * «ещё раз» после игры про памятники и получал вопрос о провинциях.
 */
it('новый раунд после достопримечательностей — снова достопримечательности', async () => {
  render(<App />);
  fireEvent.click(
    screen.getByRole('button', { name: /Назвать место/ }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
  await settle();

  vi.useFakeTimers();
  try {
    /* Ответы какие попались: важен экран итога, а не счёт. */
    for (let index = 0; index < 25; index += 1) {
      const choices = screen.queryAllByTestId('choice-option');
      if (choices.length === 0) {
        break;
      }

      fireEvent.click(choices[0]);
      act(() => {
        vi.advanceTimersByTime(WRONG_PAUSE_MS);
      });
    }
  } finally {
    vi.useRealTimers();
  }
  await settle();

  fireEvent.click(screen.getByRole('button', { name: 'Новый раунд' }));
  await settle();

  expect(screen.getByText('Что здесь отмечено')).toBeInTheDocument();
}, 30_000);
