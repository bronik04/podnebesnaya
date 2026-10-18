import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { cultureCollectionsUpTo } from '../../content/culture-sets';
import { CultureRound } from './CultureRound';
import { passFeedback } from '../../test/round-pace';

const POOL = cultureCollectionsUpTo('culture');

/*
 * Снимки грузятся до первого вопроса, поэтому раунд начинается не в том же
 * такте, что отрисовка. Ожидание здесь не украшение: без него тест проверял бы
 * экран «Готовим снимки».
 */
async function renderRound(seed = 4) {
  const onFinish = vi.fn();
  render(
    <CultureRound
      collections={POOL}
      language="ru"
      roundId="round-1"
      seed={seed}
      onFinish={onFinish}
      onExit={vi.fn()}
    />,
  );

  /*
   * Ждём сам узел, а не роль: `alt` у снимка пуст намеренно, и роли `img` у
   * него поэтому нет.
   */
  await waitFor(() => {
    expect(document.querySelector('.culture-stage img')).not.toBeNull();
  });

  return { onFinish };
}

/** Что показано: снимок ведёт на файл коллекции, по нему её и опознаём. */
function askedId(): string {
  const src = document.querySelector('.culture-stage img')!.getAttribute('src')!;

  return /\/photos\/(.+)-\d+\.webp$/.exec(src)![1];
}

function askedCollection() {
  const photoId = askedId();

  return POOL.find((item) => item.photos.some((photo) => photo.id === photoId))!;
}

it('показывает снимок и четыре названия', async () => {
  await renderRound();

  expect(document.querySelector('.culture-stage img')).not.toBeNull();
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
  expect(screen.getByTestId('exercise-target')).toHaveTextContent('Что на снимке');
});

/*
 * Подписи об авторе на снимке нет: она называет место и тем отвечает на
 * вопрос. Автор назван на странице коллекции, куда ведёт итог раунда.
 */
it('не подписывает снимок автором: подпись назвала бы ответ', async () => {
  await renderRound();

  expect(document.querySelector('.culture-stage figcaption')).toBeNull();
  expect(
    document.querySelector('.culture-stage img')?.getAttribute('alt'),
  ).toBe('');
});

it('верный ответ засчитывается', async () => {
  await renderRound();

  const target = askedCollection();
  const option = screen
    .getAllByTestId('choice-option')
    .find((item) => item.textContent?.includes(target.nameRu))!;
  fireEvent.click(option);

  expect(option).toHaveAttribute('data-result', 'correct');
});

it('после ошибки называет верный ответ и объясняет его', async () => {
  await renderRound();

  const target = askedCollection();
  const wrong = screen
    .getAllByTestId('choice-option')
    .find((item) => !item.textContent?.includes(target.nameRu))!;
  fireEvent.click(wrong);

  expect(screen.getByTestId('exercise-target')).toHaveTextContent(target.nameRu);
  expect(document.querySelector('.culture-note')).not.toBeNull();
});

it('раунд идёт по всем снимкам набора и заканчивается итогом', async () => {
  const { onFinish } = await renderRound();

  vi.useFakeTimers();
  try {
    for (let index = 0; index < POOL.length; index += 1) {
      const target = askedCollection();
      fireEvent.click(
        screen
          .getAllByTestId('choice-option')
          .find((item) => item.textContent?.includes(target.nameRu))!,
      );
      passFeedback();
    }
  } finally {
    vi.useRealTimers();
  }

  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onFinish.mock.calls[0][0]).toHaveLength(POOL.length);
  expect(onFinish.mock.calls[0][0][0].target.kind).toBe('collection');
});

/*
 * Ради этого прогрев и сделан: снимок — сам вопрос, и загружаемый по ходу он
 * значил бы, что на восьмом вопросе при упавшем Wi-Fi спрашивать станет
 * нечем. До готовности раунд не показывает ни снимка, ни отвечаемых кнопок.
 *
 * Событие `load` здесь придерживается: заглушка окружения шлёт его сразу
 * после присвоения `src`, и без задержки состояние ожидания не увидеть.
 */
it('не начинает раунд, пока снимки не загружены', () => {
  const source = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    'src',
  )!;

  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: true,
    get: source.get,
    set() {},
  });

  try {
    render(
      <CultureRound
        collections={POOL}
        language="ru"
        roundId="round-2"
        seed={1}
        onFinish={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('exercise-target')).toHaveTextContent(
      'Готовим снимки',
    );
    expect(document.querySelector('.culture-stage img')).toBeNull();
    for (const option of screen.getAllByTestId('choice-option')) {
      expect(option).toBeDisabled();
    }
    /* Выйти можно и во время ожидания: оболочка раунда на месте. */
    expect(
      screen.getByRole('button', { name: 'Прервать раунд' }),
    ).toBeInTheDocument();
  } finally {
    Object.defineProperty(HTMLImageElement.prototype, 'src', source);
  }
});
