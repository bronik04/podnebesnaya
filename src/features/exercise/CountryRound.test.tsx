import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { countries } from '../../content/countries';
import { CORRECT_PAUSE_MS } from './round-pace';
import {
  COUNTRY_FRAME_OUTSET,
  MAP_VIEWBOX_WIDTH,
} from '../../map/target-size';
import { CountryRound, type CountryExerciseType } from './CountryRound';

/**
 * Ответ — нажатием на страну карты: её доступное имя — «название, 中文». Слой
 * стран подгружается отдельно, поэтому цель ждут, а не берут сразу.
 */
function mapTarget(nameRu: string): Promise<HTMLElement> {
  // Слой стран грузится отдельно; под нагрузкой полного прогона секунды мало.
  return screen.findByRole(
    'button',
    { name: new RegExp(`^${nameRu}, `) },
    { timeout: 5000 },
  );
}

function renderRound(
  exerciseType: CountryExerciseType = 'find-on-map',
  onFinish: (attempts: readonly unknown[]) => void = () => {},
) {
  return render(
    <CountryRound
      exerciseType={exerciseType}
      language="ru"
      roundId="r1"
      seed={1}
      onFinish={onFinish}
      onExit={() => {}}
    />,
  );
}

function asked(): string {
  return screen.getByTestId('exercise-target').textContent ?? '';
}

it('спрашивает все четырнадцать стран', () => {
  renderRound();

  expect(screen.getByText(`Вопрос 1 из ${countries.length}`)).toBeInTheDocument();
  expect(countries.map((country) => country.nameRu)).toContain(asked());
});

it('отвечает нажатием на карте и идёт дальше сам', async () => {
  renderRound();
  const target = countries.find((country) => country.nameRu === asked())!;
  const button = await mapTarget(target.nameRu);

  vi.useFakeTimers();
  try {
    fireEvent.click(button);

    /* Верный ответ виден полсекунды, потом раунд едет дальше сам. */
    act(() => {
      vi.advanceTimersByTime(CORRECT_PAUSE_MS);
    });

    expect(screen.getByText('Вопрос 2 из 14')).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it('после ошибки называет верную страну', async () => {
  renderRound();

  const target = countries.find((country) => country.nameRu === asked())!;
  const other = countries.find((country) => country.id !== target.id)!;
  fireEvent.click(await mapTarget(other.nameRu));

  expect(asked()).toContain(target.nameRu);
  expect(asked()).toContain(target.nameZh);
});

it('в «назвать страну» вопрос не называет страну, а варианты называют', () => {
  renderRound('name-target');

  expect(asked()).toBe('Страна на карте');
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

it('в повторе одной страны вариантов всё равно четыре', () => {
  const single = countries.filter((country) => country.id === 'nepal');

  render(
    <CountryRound
      countries={single}
      exerciseType="name-target"
      language="ru"
      roundId="r1"
      seed={1}
      onFinish={() => {}}
      onExit={() => {}}
    />,
  );

  /* Спрашивается одна страна, но отвлекающие берутся из всего справочника. */
  expect(screen.getByText('Вопрос 1 из 1')).toBeInTheDocument();
  expect(screen.getAllByTestId('choice-option')).toHaveLength(4);
});

/*
 * Слой стран приезжает отдельным куском сборки, поэтому проверяется через
 * ожидание: без этого раунд можно оставить с картой, на которой нет ни одной
 * страны, и весь набор тестов останется зелёным.
 */
async function countryLayer(container: HTMLElement): Promise<Element> {
  return await waitFor(() => {
    const layer = container.querySelector('.country-layer');
    expect(layer).not.toBeNull();
    return layer!;
  });
}

it('рисует страны на карте раунда и берёт расширенный кадр', async () => {
  const { container } = renderRound();
  const layer = await countryLayer(container);

  expect(layer.querySelectorAll('[data-country-id]')).toHaveLength(
    countries.length,
  );
  expect(layer.getAttribute('data-answers')).toBe('true');

  const [, , width] = (
    container.querySelector('.china-map svg')?.getAttribute('viewBox') ?? ''
  )
    .split(' ')
    .map(Number);
  expect(width).toBeCloseTo(MAP_VIEWBOX_WIDTH * COUNTRY_FRAME_OUTSET, 1);
});

it('в «назвать страну» одна страна подсвечена, а контуры не отвечают', async () => {
  const { container } = renderRound('name-target');
  const layer = await countryLayer(container);

  expect(layer.getAttribute('data-answers')).toBe('false');
  expect(
    layer.querySelectorAll('[data-country-id][data-selected="true"]'),
  ).toHaveLength(1);
});
