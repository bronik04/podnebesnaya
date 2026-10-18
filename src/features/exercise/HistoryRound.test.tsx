import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { dynasties, spanLabel } from '../../content/dynasties';
import { createSeededRandom } from '../../domain/random';
import { buildDynastyChoices } from '../../domain/dynasty-choices';
import { cityById } from '../../content/cities';
import { capitalOfDynasty } from '../../content/dynasty-capitals';
import { rulerOfDynasty, rulers } from '../../content/rulers';
import { answerableYears } from '../../domain/dynasty-years';
import { HistoryRound } from './HistoryRound';
import { passFeedback } from '../../test/round-pace';

function renderRound(seed = 5) {
  const onFinish = vi.fn();
  const onExit = vi.fn();

  render(
    <HistoryRound
      language="ru"
      roundId="round-1"
      seed={seed}
      onFinish={onFinish}
      onExit={onExit}
    />,
  );

  return { onFinish, onExit };
}

function renderYearRound(seed = 5) {
  const onFinish = vi.fn();
  const onExit = vi.fn();

  render(
    <HistoryRound
      kind="who"
      language="ru"
      roundId="round-1"
      seed={seed}
      onFinish={onFinish}
      onExit={onExit}
    />,
  );

  return { onFinish, onExit };
}

function renderCapitalRound(seed = 5) {
  const onFinish = vi.fn();
  const onExit = vi.fn();

  render(
    <HistoryRound
      kind="capital"
      language="ru"
      roundId="round-1"
      seed={seed}
      onFinish={onFinish}
      onExit={onExit}
    />,
  );

  return { onFinish, onExit };
}

function renderRulerRound(seed = 5) {
  const onFinish = vi.fn();
  const onExit = vi.fn();

  render(
    <HistoryRound
      kind="ruler"
      language="ru"
      roundId="round-1"
      seed={seed}
      onFinish={onFinish}
      onExit={onExit}
    />,
  );

  return { onFinish, onExit };
}

/** Династия, о столице которой спрашивают: вопрос называет уточнение. */
function askedCapitalDynasty() {
  const asked = screen.getByTestId('exercise-target').textContent ?? '';

  return dynasties.find((dynasty) => {
    const capital = capitalOfDynasty(dynasty.id);

    return (
      capital !== undefined &&
      asked.includes(capital.qualifier ?? dynasty.nameRu)
    );
  })!;
}

/**
 * Кнопка варианта с этим сроком. Поиск по всему экрану не годится: после
 * ответа тот же срок стоит и в плашке, и подписью на ленте.
 */
function choiceWith(label: string): HTMLElement {
  const option = screen
    .getAllByTestId('choice-option')
    .find((item) => item.textContent?.includes(label));

  if (option === undefined) {
    throw new Error(`Среди вариантов нет срока ${label}`);
  }

  return option;
}

/** Династия, которую раунд спросил первой: порядок задаёт сид. */
function askedName(): string {
  return screen.getByTestId('exercise-target').textContent ?? '';
}

function askedDynasty() {
  const name = askedName();

  return dynasties.find((dynasty) => name.includes(dynasty.nameRu))!;
}

it('спрашивает династию и предлагает четыре срока', () => {
  renderRound();

  expect(askedDynasty()).toBeDefined();
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

it('верный ответ засчитывается', () => {
  renderRound();

  const target = askedDynasty();
  fireEvent.click(choiceWith(spanLabel(target)));

  expect(choiceWith(spanLabel(target))).toHaveAttribute(
    'data-result',
    'correct',
  );
});

/*
 * После ошибки плашка называет верный срок, а лента подписывается: разбор
 * обязан показать не только какая дата верна, но и куда она попадает во
 * времени.
 */
it('после ошибки показывает верный срок и подписывает ленту', () => {
  renderRound();

  const target = askedDynasty();
  const wrong = buildDynastyChoices(
    dynasties,
    target.id,
    createSeededRandom(3),
  ).find((choice) => choice.id !== target.id)!;

  const wrongOption =
    screen
      .getAllByTestId('choice-option')
      .find((option) => option.textContent?.includes(spanLabel(wrong))) ??
    screen
      .getAllByTestId('choice-option')
      .find((option) => !option.textContent?.includes(spanLabel(target)))!;
  fireEvent.click(wrongOption);

  expect(screen.getByText(/Эту дату стоит повторить/)).toBeInTheDocument();
  expect(screen.getByTestId('exercise-target')).toHaveTextContent(
    spanLabel(target),
  );
  expect(document.querySelector('.history-note')).not.toBeNull();
});

/**
 * Полоса-цель на ленте. Ищется внутри ленты, а не по всему экрану: кнопка
 * варианта носит ровно то же имя — это и есть два пути к одному ответу.
 */
function ribbonButton(label: string): HTMLElement {
  const timeline = document.querySelector('.dynasty-timeline') as HTMLElement;

  return within(timeline).getByRole('button', { name: label });
}

/**
 * Полоса династии на ленте.
 */
function spanOf(dynastyId: string): HTMLElement {
  const span = document.querySelector(`[data-dynasty-id='${dynastyId}']`);
  if (span === null) {
    throw new Error(`На ленте нет полосы ${dynastyId}`);
  }

  return span as HTMLElement;
}

/*
 * Прежде лента красила спрошенную полосу киноварью при любом ответе, и верный
 * ответ читался как ошибка. Теперь метка несёт исход.
 */
it('верный ответ помечает полосу верной, а не ошибочной', () => {
  renderRound();

  const target = askedDynasty();
  fireEvent.click(choiceWith(spanLabel(target)));

  expect(spanOf(target.id).dataset.mark).toBe('correct');
});

/*
 * При ошибке помечены обе полосы: расстояние между ними и есть величина
 * промаха, и увидеть её важнее, чем прочитать «неверно».
 */
it('ошибка помечает и выбранную полосу, и верную', () => {
  renderRound();

  const target = askedDynasty();
  const wrongOption = screen
    .getAllByTestId('choice-option')
    .find((option) => !option.textContent?.includes(spanLabel(target)))!;
  fireEvent.click(wrongOption);

  /*
   * Поиск внутри ленты, а не по всему экрану: тем же признаком помечены следы
   * раунда — там `correct`, `wrong` и `ahead` значат то же самое.
   */
  const marks = [
    ...document.querySelectorAll('.dynasty-timeline [data-mark]'),
  ].map((node) => (node as HTMLElement).dataset.mark);

  expect(marks).toContain('correct');
  expect(marks).toContain('wrong');
});

/* Лента молчит, пока вопрос открыт: подписанная, она и есть ответ. */
it('не подписывает ленту до ответа', () => {
  renderRound();

  expect(document.querySelectorAll('.timeline-span text')).toHaveLength(0);
  expect(document.querySelector('.history-hint')).not.toBeNull();
});

/*
 * Лента стала вторым способом ответить, поэтому от читалки её больше не
 * прячут. Но полоса называется сроком, а не именем династии: имя и есть ответ,
 * и назвать его значило бы отдать ответ тому, кто ленты не видит.
 */
it('полосы ленты названы сроком, а не именем династии', () => {
  renderRound();

  const target = askedDynasty();
  const timeline = document.querySelector('.dynasty-timeline') as HTMLElement;

  expect(timeline).not.toHaveAttribute('aria-hidden');
  expect(ribbonButton(spanLabel(target))).toBeInTheDocument();
  for (const dynasty of dynasties) {
    expect(
      within(timeline).queryByRole('button', { name: dynasty.nameRu }),
    ).toBeNull();
  }
});

it('на вопрос можно ответить нажатием по ленте', () => {
  renderRound();

  const target = askedDynasty();
  fireEvent.click(ribbonButton(spanLabel(target)));

  expect(spanOf(target.id).dataset.mark).toBe('correct');
});

/*
 * Найдено проверкой в браузере: курсор остаётся на полосе и после ответа, и
 * строка под лентой продолжала показывать «нажмите, чтобы ответить» вместо
 * разбора.
 */
it('после ответа строка под лентой показывает разбор, а не подсказку', () => {
  renderRound();

  const target = askedDynasty();
  const band = ribbonButton(spanLabel(target));
  fireEvent.pointerEnter(band);
  fireEvent.click(band);

  expect(screen.queryByText(/нажмите, чтобы ответить/)).toBeNull();
  expect(document.querySelector('.history-note')).not.toBeNull();
});

/*
 * Найдено проверкой в браузере: срок до нашей эры уже кончается точкой, и
 * приписанная вторая давала «ок. 1600–1046 до н. э..».
 */
it('в разборе не двоится точка после срока до нашей эры', () => {
  renderYearRound(5);

  const asked = Number(screen.getByTestId('exercise-target').textContent);
  const target = dynasties.find(
    (dynasty) => asked >= dynasty.from && asked <= dynasty.to,
  )!;
  /* Нужна именно ошибка, и именно на сроке до нашей эры: он кончается точкой. */
  const wrong = dynasties.find(
    (dynasty) => dynasty.id !== target.id && dynasty.to < 0,
  )!;

  fireEvent.click(ribbonButton(spanLabel(wrong)));

  const note = document.querySelector('.history-note')!.textContent ?? '';

  expect(note).toContain(`Вы показали ${wrong.nameRu}`);
  expect(note).not.toMatch(/\.\./);
});

it('раунд идёт по всем династиям и заканчивается итогом', () => {
  const { onFinish } = renderRound();

  vi.useFakeTimers();
  try {
    for (let index = 0; index < dynasties.length; index += 1) {
      const target = askedDynasty();
      fireEvent.click(choiceWith(spanLabel(target)));
      passFeedback();
    }
  } finally {
    vi.useRealTimers();
  }

  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onFinish.mock.calls[0][0]).toHaveLength(dynasties.length);
  expect(onFinish.mock.calls[0][0][0].target.kind).toBe('history');
});

/* Один сид — один порядок: раунд обязан быть воспроизводим. */
it('повторяется по сиду', () => {
  renderRound(11);
  const first = askedName();
  screen.getByTestId('exercise-target').remove();

  render(
    <HistoryRound
      language="ru"
      roundId="round-2"
      seed={11}
      onFinish={vi.fn()}
      onExit={vi.fn()}
    />,
  );

  expect(askedName()).toBe(first);
});

it('пул можно сузить: повтор ошибок спрашивает только их', () => {
  const onFinish = vi.fn();
  render(
    <HistoryRound
      dynasties={dynasties.slice(0, 2)}
      language="ru"
      roundId="round-3"
      seed={1}
      onFinish={onFinish}
      onExit={vi.fn()}
    />,
  );

  expect(screen.getByText(/Вопрос 1 из 2/)).toBeInTheDocument();
  /* Отвлекающие всё равно из полной ленты: иначе четвёртому неоткуда взяться. */
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

/*
 * Зеркальная игра: там названа династия и спрашивают срок, здесь назван год и
 * спрашивают династию.
 */
it('спрашивает год и предлагает четыре имени', () => {
  renderYearRound();

  const asked = Number(screen.getByTestId('exercise-target').textContent);

  expect(answerableYears(dynasties)).toContain(asked);
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);

  const names = dynasties.map((dynasty) => dynasty.nameRu);
  for (const option of screen.getAllByTestId('choice-option')) {
    expect(names.some((name) => option.textContent?.includes(name))).toBe(true);
  }
});

it('на год отвечают и нажатием по ленте', () => {
  renderYearRound();

  const asked = Number(screen.getByTestId('exercise-target').textContent);
  const target = dynasties.find(
    (dynasty) => asked >= dynasty.from && asked <= dynasty.to,
  )!;

  fireEvent.click(ribbonButton(spanLabel(target)));

  expect(spanOf(target.id).dataset.mark).toBe('correct');
});

it('спрашивает столицу династии и предлагает четыре города', () => {
  renderCapitalRound();

  const dynasty = askedCapitalDynasty();

  expect(capitalOfDynasty(dynasty.id)).toBeDefined();
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

/* Уточнение произносится вопросом: у «столицы Хань» два верных ответа. */
it('вопрос называет время, когда столица менялась', () => {
  renderCapitalRound();

  const dynasty = askedCapitalDynasty();
  const capital = capitalOfDynasty(dynasty.id)!;
  const asked = screen.getByTestId('exercise-target').textContent ?? '';

  if (capital.qualifier !== undefined) {
    expect(asked).toContain(capital.qualifier);
  }
});

it('верным считается город, а цель раунда остаётся династией', () => {
  const { onFinish } = renderCapitalRound();

  const dynasty = askedCapitalDynasty();
  const capital = capitalOfDynasty(dynasty.id)!;
  const city = cityById(capital.cityId)!;

  const option = screen
    .getAllByTestId('choice-option')
    .find((item) => item.textContent?.includes(city.nameRu))!;
  fireEvent.click(option);

  expect(option).toHaveAttribute('data-result', 'correct');
  expect(onFinish).not.toHaveBeenCalled();
});

/* Лента здесь не отвечает: спрашивают город, нажимать по времени нечего. */
it('в игре о столицах лента не принимает нажатие, но называет династию', () => {
  renderCapitalRound();

  const dynasty = askedCapitalDynasty();
  const timeline = document.querySelector('.dynasty-timeline') as HTMLElement;

  expect(within(timeline).queryAllByRole('button')).toHaveLength(0);
  expect(spanOf(dynasty.id).dataset.mark).toBe('asked');
});

/* В игру идут только те династии, чья столица есть в каталоге городов. */
it('спрашиваются семь династий, а не двенадцать', () => {
  renderCapitalRound();

  expect(screen.getByText(/Вопрос 1 из 7/)).toBeInTheDocument();
});

/*
 * Найдено проверкой в браузере: подсказка звала нажимать по ленте и там, где
 * лента не отвечает, а ответом служит город.
 */
it('в игре о столицах подсказка не зовёт нажимать по ленте', () => {
  renderCapitalRound();

  expect(screen.queryByText(/Нажмите по ленте/)).toBeNull();
  expect(document.querySelector('.history-hint')).not.toBeNull();
});

it('спрашивает правителя династии и предлагает четыре имени', () => {
  renderRulerRound();

  const dynasty = askedDynasty();

  expect(rulerOfDynasty(dynasty.id)).toBeDefined();
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

/* Троецарствие исключено: у эпохи трёх государств правителя не назвать. */
it('спрашиваются одиннадцать династий, Троецарствия среди них нет', () => {
  renderRulerRound();

  expect(screen.getByText(/Вопрос 1 из 11/)).toBeInTheDocument();
});

it('верным считается правитель, а не династия', () => {
  renderRulerRound();

  const dynasty = askedDynasty();
  const ruler = rulerOfDynasty(dynasty.id)!;
  const option = screen
    .getAllByTestId('choice-option')
    .find((item) => item.textContent?.includes(ruler.nameRu))!;

  fireEvent.click(option);

  expect(option).toHaveAttribute('data-result', 'correct');
});

/* Легендарность произносится словом, а не молчит. */
it('у правителя без годов разбор говорит о предании', () => {
  const legendary = rulers.find(
    (ruler) => ruler.legendary === true && ruler.from === undefined,
  )!;
  const dynasty = dynasties.find((item) => item.id === legendary.dynastyId)!;

  render(
    <HistoryRound
      kind="ruler"
      dynasties={[dynasty]}
      language="ru"
      roundId="round-2"
      seed={1}
      onFinish={vi.fn()}
      onExit={vi.fn()}
    />,
  );

  const wrong = screen
    .getAllByTestId('choice-option')
    .find((item) => !item.textContent?.includes(legendary.nameRu))!;
  fireEvent.click(wrong);

  expect(document.querySelector('.history-note')!.textContent).toMatch(
    /по преданию/i,
  );
});

/*
 * Та же ошибка набора, что нашлась в игре по годам: срок до нашей эры уже
 * кончается точкой, и приписанная вторая давала «210 до н. э..».
 */
it('в разборе правителя не двоится точка после срока до нашей эры', () => {
  const qin = dynasties.find((dynasty) => dynasty.id === 'qin')!;

  render(
    <HistoryRound
      kind="ruler"
      dynasties={[qin]}
      language="ru"
      roundId="round-3"
      seed={2}
      onFinish={vi.fn()}
      onExit={vi.fn()}
    />,
  );

  const ruler = rulerOfDynasty('qin')!;
  fireEvent.click(
    screen
      .getAllByTestId('choice-option')
      .find((item) => !item.textContent?.includes(ruler.nameRu))!,
  );

  expect(document.querySelector('.history-note')!.textContent).not.toMatch(
    /\.\./,
  );
});
