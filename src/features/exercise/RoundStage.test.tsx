import { fireEvent, render, screen } from '@testing-library/react';
import { RoundStage } from './RoundStage';

function renderStage(overrides: Partial<Parameters<typeof RoundStage>[0]> = {}) {
  return render(
    <RoundStage
      prompt={<p>Сычуань</p>}
      promptState="question"
      startedAt={0}
      progress={<p>Вопрос 1 из 34</p>}
      onExit={() => {}}
      {...overrides}
    >
      <p>тут карта</p>
    </RoundStage>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(document, 'fullscreenEnabled');
});

it('ставит плашку, карту и счёт по своим местам', () => {
  renderStage();

  expect(screen.getByText('Сычуань')).toBeTruthy();
  expect(screen.getByText('тут карта')).toBeTruthy();
  expect(screen.getByText('Вопрос 1 из 34')).toBeTruthy();
});

it('плашка объявляет смену содержимого читалке', () => {
  renderStage();

  const live = screen.getByText('Сычуань').closest('[aria-live]');
  expect(live?.getAttribute('aria-live')).toBe('polite');
  expect(screen.getByText('Сычуань').closest('.stage-prompt')).toHaveAttribute(
    'data-state',
    'question',
  );
});

it('без слота вариантов полосы нет', () => {
  const { container } = renderStage();

  expect(container.querySelector('.stage-choices-band')).toBeNull();
});

it('со слотом вариантов полоса есть', () => {
  const { container } = renderStage({ choices: <p>кнопки</p> });

  expect(container.querySelector('.stage-choices-band')).toBeTruthy();
});

it('«Прервать раунд» отдаёт выход наверх', () => {
  const onExit = vi.fn();
  renderStage({ onExit });

  fireEvent.click(screen.getByRole('button', { name: 'Прервать раунд' }));

  expect(onExit).toHaveBeenCalledTimes(1);
});

it('без Fullscreen API кнопки полного экрана нет', () => {
  renderStage();

  expect(screen.queryByRole('button', { name: 'Во весь экран' })).toBeNull();
});

it('с Fullscreen API кнопка разворачивает оболочку', () => {
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    value: true,
  });
  const request = vi.fn().mockResolvedValue(undefined);
  HTMLElement.prototype.requestFullscreen = request;

  renderStage();
  fireEvent.click(screen.getByRole('button', { name: 'Во весь экран' }));

  expect(request).toHaveBeenCalledTimes(1);
});

it('называет игру над ходом раунда', () => {
  renderStage({ title: 'Регионы · Найти на карте' });

  expect(screen.getByText('Регионы · Найти на карте')).toBeTruthy();
});

it('до ответа печати исхода нет', () => {
  const { container } = renderStage();

  expect(container.querySelector('.stage-verdict')).toBeNull();
});

/*
 * Исход несёт слово, а не только печать: иероглиф скрыт от читалки, слово
 * стоит в живой области вопроса и объявляется.
 */
it('исход ответа назван словом в живой области, печать скрыта', () => {
  renderStage({ verdict: 'incorrect' });

  const word = screen.getByText('Неверно');
  expect(word.closest('[aria-live]')).not.toBeNull();
  expect(screen.getByText('错')).toHaveAttribute('aria-hidden', 'true');
});

it('верный исход — печать 对 нефритом', () => {
  renderStage({ verdict: 'correct' });

  expect(screen.getByText('Верно')).toBeTruthy();
  expect(screen.getByText('对')).toHaveAttribute('data-tone', 'correct');
});

/* Настройки показа стоят в строке действий, а не на карте: углы карты — цели. */
it('слот настроек стоит в строке действий, а не на карте', () => {
  const { container } = renderStage({ tools: <p>рельеф</p> });

  expect(screen.getByText('рельеф').closest('.stage-strip')).not.toBeNull();
  expect(container.querySelector('.stage-map')).not.toHaveTextContent('рельеф');
});

/*
 * После ошибки раунд стоит, пока ученик не пойдёт дальше (решение владельца
 * от 2026-10-18): пробелом, Enter или кнопкой. Кнопка нужна мыши и пальцу,
 * клавиши — тому, кто не хочет к ней тянуться.
 */
it('без ожидания кнопки «Дальше» нет', () => {
  renderStage();

  expect(screen.queryByRole('button', { name: /Дальше/ })).toBeNull();
});

it('после ошибки «Дальше» получает фокус и ведёт раунд дальше', () => {
  const onContinue = vi.fn();
  renderStage({ onContinue });

  const next = screen.getByRole('button', { name: /Дальше/ });
  expect(next).toHaveFocus();
  expect(next).toHaveTextContent('пробел / Enter');

  fireEvent.click(next);
  expect(onContinue).toHaveBeenCalledOnce();
});

it('пробел и Enter ведут дальше, даже если фокус ушёл с кнопки', () => {
  const onContinue = vi.fn();
  renderStage({ onContinue });
  (document.activeElement as HTMLElement | null)?.blur();

  fireEvent.keyDown(window, { key: ' ' });
  fireEvent.keyDown(window, { key: 'Enter' });

  expect(onContinue).toHaveBeenCalledTimes(2);
});

it('прочие клавиши раунд дальше не ведут', () => {
  const onContinue = vi.fn();
  renderStage({ onContinue });

  fireEvent.keyDown(window, { key: 'a' });
  fireEvent.keyDown(window, { key: 'Tab' });

  expect(onContinue).not.toHaveBeenCalled();
});

/* Кнопка вне живой области: фокус объявит её сам, второе объявление перебило бы ответ. */
it('«Дальше» стоит вне живой области и называет клавиши для читалки', () => {
  renderStage({ onContinue: () => {} });

  const next = screen.getByRole('button', { name: 'Дальше' });
  expect(next.closest('[aria-live]')).toBeNull();
  expect(next).toHaveAttribute('aria-keyshortcuts', 'Space Enter');
});

/* Зажатый Enter, которым ответили, не должен смахнуть разбор ошибки. */
it('повтор зажатой клавиши дальше не ведёт', () => {
  const onContinue = vi.fn();
  renderStage({ onContinue });

  const repeat = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true });
  screen.getByRole('button', { name: 'Дальше' }).dispatchEvent(repeat);

  expect(onContinue).not.toHaveBeenCalled();
  expect(repeat.defaultPrevented).toBe(true);
});

/* Под окном «Прервать раунд и перейти…?» ученик вопроса не видит. */
it('под открытым окном и с модификатором дальше не ведёт', () => {
  const onContinue = vi.fn();
  renderStage({ onContinue });
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.append(dialog);
  try {
    fireEvent.keyDown(window, { key: ' ' });
  } finally {
    dialog.remove();
  }
  fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
  fireEvent.keyDown(window, { key: ' ', shiftKey: true });

  expect(onContinue).not.toHaveBeenCalled();
});

/* Кнопка исчезает вместе с фокусом — фокус обязан вернуться к ответу. */
it('с концом ожидания фокус возвращается туда, откуда ушёл', () => {
  const { rerender } = render(
    <RoundStage
      prompt={<p>Сычуань</p>}
      promptState="question"
      startedAt={0}
      progress={<p>Вопрос 1 из 34</p>}
      onExit={() => {}}
    >
      <button type="button">цель</button>
    </RoundStage>,
  );
  screen.getByRole('button', { name: 'цель' }).focus();

  rerender(
    <RoundStage
      prompt={<p>Сычуань</p>}
      promptState="answer"
      startedAt={0}
      progress={<p>Вопрос 1 из 34</p>}
      onExit={() => {}}
      onContinue={() => {}}
    >
      <button type="button">цель</button>
    </RoundStage>,
  );
  expect(screen.getByRole('button', { name: 'Дальше' })).toHaveFocus();

  rerender(
    <RoundStage
      prompt={<p>Хубэй</p>}
      promptState="question"
      startedAt={0}
      progress={<p>Вопрос 2 из 34</p>}
      onExit={() => {}}
    >
      <button type="button">цель</button>
    </RoundStage>,
  );
  expect(screen.getByRole('button', { name: 'цель' })).toHaveFocus();
});
