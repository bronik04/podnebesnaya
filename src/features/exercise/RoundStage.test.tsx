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

  const prompt = screen.getByText('Сычуань').closest('[aria-live]');
  expect(prompt?.getAttribute('aria-live')).toBe('polite');
  expect(prompt?.getAttribute('data-state')).toBe('question');
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
