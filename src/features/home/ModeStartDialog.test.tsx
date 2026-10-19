import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModeStartDialog } from './ModeStartDialog';

/*
 * jsdom не знает `showModal`: окно открывается атрибутом, как в браузере.
 */
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

function renderDialog(overrides: Partial<ComponentProps<typeof ModeStartDialog>> = {}) {
  const onStart = vi.fn();
  render(
    <ModeStartDialog
      mark="地"
      group="Регионы"
      title="Найти регион"
      summary="Вопрос называет регион — ответ нажимается прямо на карте."
      volume="34 региона"
      defaultLanguage="ru"
      onStart={onStart}
      onClose={() => {}}
      {...overrides}
    />,
  );

  return { onStart };
}

const LEVELS = {
  value: 'easy',
  easyVolume: '34 региона, около 9 минут',
  hardVolume: '34 региона, около 7 минут',
} as const;

/*
 * Уровень сложности выбирается там же, где язык (решение владельца от
 * 2026-10-18): лёгкий — найденное остаётся на карте, сложный — карта каждый
 * раз чистая.
 */
it('у игры с уровнями — выбор сложности, лёгкий отмечен', () => {
  renderDialog({ levelChoice: LEVELS });

  expect(screen.getByRole('group', { name: 'Сложность' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Лёгкий/ })).toBeChecked();
  expect(screen.getByRole('radio', { name: /Сложный/ })).not.toBeChecked();
  expect(screen.getByText(/найденное остаётся на карте, три попытки/)).toBeInTheDocument();
  expect(screen.getByText(/карта каждый раз чистая, одна попытка/)).toBeInTheDocument();
});

it('выбранный уровень уходит в onStart', () => {
  const { onStart } = renderDialog({ levelChoice: LEVELS });

  fireEvent.click(screen.getByRole('radio', { name: /Сложный/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

  expect(onStart).toHaveBeenCalledWith('ru', '', 'hard');
});

it('объём в окне — для выбранного уровня', () => {
  renderDialog({ levelChoice: LEVELS });

  expect(screen.getByText('34 региона, около 9 минут')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: /Сложный/ }));
  expect(screen.getByText('34 региона, около 7 минут')).toBeInTheDocument();
});

it('без levelChoice группы сложности нет', () => {
  renderDialog();

  expect(screen.queryByRole('group', { name: 'Сложность' })).toBeNull();
});
