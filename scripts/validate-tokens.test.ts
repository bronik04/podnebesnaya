/**
 * Контракт дизайн-системы. Каждая пара, от которой зависит понимание
 * интерфейса, проверена по WCAG 2.2. Тест падает, если палитру ухудшили.
 *
 * Проверяются только пары, которые реально встречаются на экране: контраст
 * двух цветов, никогда не оказывающихся рядом, ничего не значит.
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GRAPHIC_CONTRAST,
  TEXT_CONTRAST,
  contrastRatioRounded,
  parseHex,
  relativeLuminance,
} from '../src/design/contrast';
import { parseTokens, resolve } from '../src/design/tokens';
import { MAP_VIEWBOX_HEIGHT, MAP_VIEWBOX_WIDTH } from '../src/map/target-size';

/*
 * Контракт живёт рядом со скриптами сборки, а не в src: чтение файла требует
 * узловых API, и держать их в области сборки приложения значило бы позволить
 * компоненту написать readFileSync и узнать об ошибке только в браузере.
 *
 * Путь считается от корня проекта: и Vitest, и `npx tsx` запускаются оттуда.
 */
const tokens = parseTokens(
  readFileSync(resolvePath(process.cwd(), 'src/design/tokens.css'), 'utf8'),
);
const color = (name: string) => resolve(tokens, name);

const LAND_TONES = [
  '--map-kind-province',
  '--map-kind-autonomous-region',
  '--map-kind-municipality',
  '--map-kind-sar',
] as const;

/** Все заливки, поверх которых карта когда-либо рисует границу или подпись. */
const MAP_FILLS = [...LAND_TONES, '--map-locked', '--map-sea'] as const;

/**
 * Заливки карты освоенности. В `MAP_FILLS` не входят намеренно: карта
 * освоенности не интерактивна, выделения и «верного ответа» на ней не бывает,
 * и требовать контраста между ними и этими заливками значило бы проверять
 * пару, которой на экране не существует.
 *
 * Граница по ним всё равно рисуется, поэтому в проверке границы они есть.
 */
const PROGRESS_FILLS = [
  '--map-progress-mastered',
  '--map-progress-in-progress',
  '--map-progress-untouched',
] as const;

/** Состояния, которые перекрашивают регион целиком. */
const FILLED_STATES = ['--map-selected', '--map-asked', '--map-correct'] as const;

function expectAtLeast(
  foreground: string,
  background: string,
  threshold: number,
) {
  const ratio = contrastRatioRounded(color(foreground), color(background));

  expect(
    ratio,
    `${foreground} (${color(foreground)}) на ${background} (${color(
      background,
    )}): ${ratio}:1, нужно ${threshold}:1`,
  ).toBeGreaterThanOrEqual(threshold);
}

/**
 * Линия с ореолом: на светлой полосе её отделяет от фона сама линия, на тёмной
 * — светлый ореол вокруг неё. Довольно одного из двух, но сама линия обязана
 * отделяться от ореола, иначе ореол её съест.
 */
function expectSeparatedByLineOrHalo(
  line: string,
  halo: string,
  background: string,
  threshold: number,
) {
  const byLine = contrastRatioRounded(color(line), color(background));
  const byHalo = contrastRatioRounded(color(halo), color(background));

  expect(
    Math.max(byLine, byHalo),
    `${line} на ${background}: ${byLine}:1, ореол ${halo}: ${byHalo}:1, нужно ${threshold}:1`,
  ).toBeGreaterThanOrEqual(threshold);
  expectAtLeast(line, halo, threshold);
}

describe('текст', () => {
  it('основной текст на бумаге читается', () => {
    expectAtLeast('--text-on-paper', '--surface-paper', TEXT_CONTRAST);
    expectAtLeast('--text-on-paper', '--surface-paper-bright', TEXT_CONTRAST);
  });

  it('вспомогательный текст на бумаге читается', () => {
    expectAtLeast('--text-on-paper-muted', '--surface-paper', TEXT_CONTRAST);
    /* Светлая бумага — плашка шкалы высот на листе карты: «равнины» и
       «нагорье» набраны на ней приглушённым тоном. */
    expectAtLeast('--text-on-paper-muted', '--surface-paper-bright', TEXT_CONTRAST);
  });

  it('текст на доске читается', () => {
    expectAtLeast('--text-on-ground', '--surface-ground', TEXT_CONTRAST);
    expectAtLeast('--text-on-ground', '--surface-raised', TEXT_CONTRAST);
  });

  it('вспомогательный текст на доске читается', () => {
    expectAtLeast('--text-on-ground-muted', '--surface-ground', TEXT_CONTRAST);
    expectAtLeast('--text-on-ground-muted', '--surface-raised', TEXT_CONTRAST);
  });

  it('заголовок на доске читается на обеих её поверхностях', () => {
    expectAtLeast('--text-on-ground-strong', '--surface-ground', TEXT_CONTRAST);
    expectAtLeast('--text-on-ground-strong', '--surface-raised', TEXT_CONTRAST);
  });

  it('акцент на доске читается', () => {
    expectAtLeast('--accent-on-ground', '--surface-ground', TEXT_CONTRAST);
  });

  it('акцент на бумаге читается', () => {
    expectAtLeast('--accent', '--surface-paper', TEXT_CONTRAST);
  });

  /*
   * Бумага на киновари. Пара одна на два места: главная кнопка и печать в
   * шапке — знак сайта, набранный иероглифом. Пока её здесь не было, обе
   * держались на том, что цвета подобраны удачно.
   */
  it('подпись на киноварной заливке читается', () => {
    expectAtLeast('--surface-paper-bright', '--accent', TEXT_CONTRAST);
  });

  /*
   * Выбранный вид карты залит тушью: переключатель лежит на бумажной плашке
   * поверх карты, и выбранный сегмент — единственное место, где бумага
   * набрана по туши, а не наоборот.
   */
  it('подпись на заливке тушью читается', () => {
    expectAtLeast('--surface-paper-bright', '--text-on-paper', TEXT_CONTRAST);
  });
});

describe('границы и поверхности', () => {
  /*
   * Доска с редизайна «Тушь и киноварь» сама бумажная (DECISIONS.md,
   * 2026-10-14), и контраста поверхностей между ней и бумагой больше нет и не
   * должно быть. Панель от фона отделяет линия тушью — она и проверяется на
   * каждой из трёх бумаг, между которыми проходит.
   */
  it('панели на бумажной доске очерчены линией тушью', () => {
    for (const surface of ['--surface-ground', '--surface-raised', '--surface-paper']) {
      expectAtLeast('--line-on-ground', surface, GRAPHIC_CONTRAST);
    }
  });

  it('линия на бумаге видна', () => {
    expectAtLeast('--line-on-paper', '--surface-paper', 1.4);
  });

  /*
   * Линий на доске две, и порог есть только у одной. `--line-on-ground`
   * разделяет — отбивка списка, черта под шапкой, край панели; разделителю
   * контраст не предписан. `--line-on-ground-strong` очерчивает управляющий
   * элемент, и ему WCAG 2.2 (1.4.11) требует 3:1 на обеих поверхностях доски.
   *
   * До того как вторая линия появилась, границей кнопок, поля поиска, кнопок
   * равнозначного списка и фильтра служил разделительный тон: 2.01:1 на доске
   * и 1.77:1 на поднятой поверхности.
   */
  it('граница управляющего элемента видна на обеих поверхностях доски', () => {
    expectAtLeast('--line-on-ground-strong', '--surface-ground', GRAPHIC_CONTRAST);
    expectAtLeast('--line-on-ground-strong', '--surface-raised', GRAPHIC_CONTRAST);
  });

  /*
   * Обе киновари нужны врозь. `--accent` — цвет цели на бумаге; на доске он
   * даёт 2.81:1, и черта «вы здесь» в шапке была слабее любой другой линии на
   * экране. `--accent-on-ground` — тот же смысл для тёмного.
   */
  it('акцент на доске годится и в роли черты, и в роли рамки', () => {
    expectAtLeast('--accent-on-ground', '--surface-ground', GRAPHIC_CONTRAST);
    expectAtLeast('--accent-on-ground', '--surface-raised', GRAPHIC_CONTRAST);
  });

  /*
   * «Верно» знаком на доске: лента хода раунда набирает 34 отметки `✓ ● ○` в
   * колонке вопроса. Заливкой карты (#356f52) их набирать нельзя — 2.78:1.
   */
  it('нефрит для доски читается знаком', () => {
    expectAtLeast('--state-correct-on-ground', '--surface-ground', TEXT_CONTRAST);
    expectAtLeast('--state-correct-on-ground', '--surface-raised', TEXT_CONTRAST);
  });

  /*
   * Лента династий печатается на бумаге. Полоса — значимая графика: по её
   * длине и месту ученик и читает время, поэтому порог графики, а не текста.
   */
  it('полосы ленты династий видны на бумаге', () => {
    expectAtLeast('--timeline-span', '--surface-paper', GRAPHIC_CONTRAST);
    expectAtLeast('--timeline-span-correct', '--surface-paper', GRAPHIC_CONTRAST);
    expectAtLeast('--timeline-span-wrong', '--surface-paper', GRAPHIC_CONTRAST);
  });

  /*
   * Полоса набрана тушью, а не сланцем: холодный серо-зелёный был единственным
   * местом в проекте, где чужой листу тон занимал такую площадь. Сила выбрана
   * по контрасту, а не на глаз: тушь в 55 % даёт 3.94 к бумаге, в 45 % — 2.94,
   * то есть порога графики не проходит.
   */
  it('полосы ленты набраны тушью, а не сланцем', () => {
    expect(color('--timeline-span')).toBe(color('--c-ink-300'));
  });

  /*
   * Помеченная полоса не должна опознаваться одним цветом: заливки исхода и
   * сама лента различаются между собой слабо. Различает их обводка — она
   * обязана быть видна и на обеих заливках исхода, и на соседних полосах.
   */
  it('обводка помеченной полосы видна на обеих заливках исхода', () => {
    expectAtLeast(
      '--timeline-span-outline',
      '--timeline-span-correct',
      GRAPHIC_CONTRAST,
    );
    expectAtLeast(
      '--timeline-span-outline',
      '--timeline-span-wrong',
      GRAPHIC_CONTRAST,
    );
    expectAtLeast('--timeline-span-outline', '--timeline-span', GRAPHIC_CONTRAST);
  });

  it('на любой поверхности видно кольцо фокуса', () => {
    const surfaces = [
      '--surface-ground',
      '--surface-raised',
      '--surface-paper',
      '--surface-paper-bright',
      ...MAP_FILLS,
      ...FILLED_STATES,
    ];

    for (const surface of surfaces) {
      const onPaper = contrastRatioRounded(
        color('--focus-on-paper'),
        color(surface),
      );
      const onDark = contrastRatioRounded(
        color('--focus-on-dark'),
        color(surface),
      );

      expect(
        Math.max(onPaper, onDark),
        `фокус на ${surface} (${color(surface)}): тушь ${onPaper}:1, бумага ${onDark}:1`,
      ).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
    }
  });

  /*
   * Тёмные заливки карты получают кольцо бумагой — правило в styles.css рядом
   * с `data-answer-state='correct'`. Прежде здесь засчитывалось золото, которым
   * карта фокус не рисовала.
   */
  it('кольцо фокуса на тёмной заливке карты рисуется бумагой', () => {
    for (const state of FILLED_STATES) {
      expectAtLeast('--focus-on-dark', state, GRAPHIC_CONTRAST);
    }
  });

  it('кольцо фокуса на карте рисуется тушью и видно на каждой заливке', () => {
    for (const fill of [...LAND_TONES, '--map-locked', '--map-sea']) {
      expectAtLeast('--focus-on-paper', fill, GRAPHIC_CONTRAST);
    }
  });

  /* Золото было кольцом тёмной доски; на бумажной оно не даёт 3:1. */
  it('кольцо фокуса на доске рисуется тушью', () => {
    expect(color('--focus-on-ground')).toBe(color('--c-ink-900'));
    expectAtLeast('--focus-on-ground', '--surface-ground', GRAPHIC_CONTRAST);
    expectAtLeast('--focus-on-ground', '--surface-raised', GRAPHIC_CONTRAST);
  });
});

/*
 * Состояния и второстепенные линии редизайна. Пары взяты с экрана: бумага на
 * главной кнопке под рукой и в нажатии, тушь на нажатой второстепенной,
 * описание игры и рамка варианта в окне старта, кольцо «впереди» в ходе.
 */
describe('состояния кнопок и второстепенные линии', () => {
  it('подпись главной кнопки читается под рукой и в нажатии', () => {
    expectAtLeast('--surface-paper-bright', '--accent-hover', TEXT_CONTRAST);
    expectAtLeast('--surface-paper-bright', '--accent-pressed', TEXT_CONTRAST);
  });

  it('подпись нажатой второстепенной кнопки читается', () => {
    expectAtLeast('--text-on-ground', '--surface-pressed', TEXT_CONTRAST);
  });

  it('описание игры читается на бумаге окна', () => {
    expectAtLeast('--text-on-ground-secondary', '--surface-ground', TEXT_CONTRAST);
  });

  it('рамка варианта и кольцо хода — графика не ниже 3:1', () => {
    for (const surface of ['--surface-ground', '--surface-raised'] as const) {
      expectAtLeast('--line-on-ground-soft', surface, GRAPHIC_CONTRAST);
      expectAtLeast('--line-on-ground-quiet', surface, GRAPHIC_CONTRAST);
    }
  });
});

describe('карта', () => {
  it('граница провинции видна на любой заливке (MAP_SPEC.md: не ниже 3:1)', () => {
    for (const fill of [...MAP_FILLS, ...PROGRESS_FILLS]) {
      expectAtLeast('--map-border', fill, GRAPHIC_CONTRAST);
    }
  });

  it('подпись состояния читается на его заливке', () => {
    for (const state of FILLED_STATES) {
      expectAtLeast(`${state}-ink`, state, TEXT_CONTRAST);
    }
  });

  it('подпись региона читается на любой заливке суши', () => {
    for (const fill of [...LAND_TONES, '--map-locked']) {
      expectAtLeast('--map-label', fill, TEXT_CONTRAST);
    }
  });

  it('залитое состояние отличимо от любой соседней заливки', () => {
    for (const state of FILLED_STATES) {
      for (const fill of MAP_FILLS) {
        expectAtLeast(state, fill, GRAPHIC_CONTRAST);
      }
    }
  });

  it('отметка ошибки видна поверх любой заливки суши', () => {
    // Ошибка не перекрашивает регион, а штрихуется поверх его цвета,
    // поэтому проверяется цвет штриховки против всех возможных заливок.
    for (const fill of [...LAND_TONES, '--map-locked']) {
      expectAtLeast('--map-incorrect-mark', fill, GRAPHIC_CONTRAST);
    }
  });

  /*
   * Пары «верно против неверно» здесь нет намеренно: это два разных региона,
   * а не два цвета друг на друге. Различают их вид отметки — сплошная тёмная
   * заливка против штриховки поверх собственного цвета — и обе проверены
   * против всех заливок суши выше.
   */

  it('закрытая заливка отличима от активных', () => {
    // После ответа выбор закрыт. Прежняя пара #EAECF0/#D0D5DD давала 1.25:1 —
    // ученик не видел, что карта больше не отвечает.
    for (const fill of LAND_TONES) {
      const ratio = contrastRatioRounded(color('--map-locked'), color(fill));
      expect(ratio, `--map-locked против ${fill}: ${ratio}:1`).toBeGreaterThan(
        1,
      );
    }
  });
});

describe('шкала высот', () => {
  /**
   * Семь полос физической карты. Проверяется всё, что ложится на них поверх:
   * линия реки, приглушённая граница региона, метки исхода и подпись объекта.
   * Отрезок светлоты снизу держит река — ей нужно 3:1 к самой тёмной полосе.
   */
  const BANDS = [
    '--map-relief-band-0',
    '--map-relief-band-200',
    '--map-relief-band-500',
    '--map-relief-band-1000',
    '--map-relief-band-2000',
    '--map-relief-band-3000',
    '--map-relief-band-4000',
  ] as const;

  /** Тон в градусах: им различаются полосы, которые не различаются светлотой. */
  function hueOf(hex: string): number {
    const [red, green, blue] = parseHex(hex).map((channel) => channel / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const span = max - min;

    if (span === 0) return 0;

    const sector =
      max === red
        ? ((green - blue) / span) % 6
        : max === green
          ? (blue - red) / span + 2
          : (red - green) / span + 4;

    return (sector * 60 + 360) % 360;
  }

  it('линия реки видна на каждой полосе', () => {
    for (const band of BANDS) {
      expectAtLeast('--map-river', band, GRAPHIC_CONTRAST);
    }
  });

  it('приглушённая граница региона видна на каждой полосе', () => {
    for (const band of BANDS) {
      expectAtLeast('--map-border-on-relief', band, GRAPHIC_CONTRAST);
    }
  });

  it('метки исхода видны на каждой полосе', () => {
    for (const band of BANDS) {
      expectAtLeast('--map-correct-mark', band, GRAPHIC_CONTRAST);
      expectAtLeast('--map-incorrect-mark-relief', band, GRAPHIC_CONTRAST);
    }
  });

  /*
   * Выделение объекта под курсором и в фокусе. Тушь, а не цвет: цветовой канал
   * занят самими полосами, и перекрасить форму значило бы соврать про её
   * высоту. Штриховка и граница ложатся на любую из семи полос.
   */
  it('выделение объекта видно на каждой полосе', () => {
    for (const band of BANDS) {
      expectAtLeast('--map-highlight', band, GRAPHIC_CONTRAST);
    }
  });

  /*
   * Обводка выделения — фиолетовая с ореолом бумагой (решение владельца от
   * 2026-10-18): тушью она терялась на тёмных полосах и рядом с границами.
   */
  it('обводка выделения отделена от каждой полосы — сама или ореолом', () => {
    for (const band of BANDS) {
      expectSeparatedByLineOrHalo(
        '--map-highlight-outline',
        '--map-highlight-halo',
        band,
        GRAPHIC_CONTRAST,
      );
    }
  });

  it('подпись объекта читается на каждой полосе', () => {
    for (const band of BANDS) {
      expectAtLeast('--map-label', band, TEXT_CONTRAST);
    }
  });

  /*
   * Соседние полосы обязаны различаться — но не обязательно светлотой.
   * Зелень равнин темнее соломенной полосы над ней: так устроены физические
   * карты, и различает эту пару тон. Поэтому условие через «или»: либо
   * заметная разница светлоты, либо заметная разница тона.
   */
  it('соседние полосы различимы светлотой или тоном', () => {
    for (let index = 1; index < BANDS.length; index += 1) {
      const lower = color(BANDS[index - 1]);
      const upper = color(BANDS[index]);
      const ratio = contrastRatioRounded(lower, upper);
      const hueGap = Math.abs(hueOf(lower) - hueOf(upper));

      expect(
        ratio >= 1.15 || hueGap >= 12,
        `${BANDS[index - 1]} против ${BANDS[index]}: контраст ${ratio.toFixed(
          2,
        )}:1, разница тона ${hueGap.toFixed(0)}°`,
      ).toBe(true);
    }
  });

  /*
   * Выше 500 м светлота падает строго: «темнее значит выше» — то правило, по
   * которому шкалу читают, и ниже него у полос не остаётся никакого порядка.
   */
  it('выше 500 м каждая полоса темнее предыдущей', () => {
    const upper = BANDS.slice(2);

    for (let index = 1; index < upper.length; index += 1) {
      const previous = relativeLuminance(color(upper[index - 1]));
      const current = relativeLuminance(color(upper[index]));

      expect(
        current,
        `${upper[index]} (${current.toFixed(3)}) не темнее ${upper[index - 1]} (${previous.toFixed(3)})`,
      ).toBeLessThan(previous);
    }
  });

  /* Равнины и солома идут вверх по светлоте — это и есть условность шкалы. */
  it('нижние полосы идут от зелени к соломе, а не наоборот', () => {
    const plains = relativeLuminance(color('--map-relief-band-0'));
    const middle = relativeLuminance(color('--map-relief-band-200'));
    const straw = relativeLuminance(color('--map-relief-band-500'));

    expect(plains).toBeLessThan(middle);
    expect(middle).toBeLessThan(straw);
  });
});

describe('шкалы', () => {
  it('цель нажатия не меньше 44 px', () => {
    expect(Number.parseInt(resolve(tokens, '--target-min'), 10)).toBeGreaterThanOrEqual(
      44,
    );
  });

  it('семейства начинаются с наших шрифтов и сохраняют системный фолбэк', () => {
    expect(resolve(tokens, '--t-family-display')).toMatch(/^'Cormorant Garamond'/);
    expect(resolve(tokens, '--t-family-display')).toMatch(/serif$/);
    expect(resolve(tokens, '--t-family-text')).toMatch(/^'Onest'/);
    expect(resolve(tokens, '--t-family-han')).toMatch(/^'Noto Serif SC'/);
  });

  it('латинские шрифты уступают китайскому знаки, которых у них нет', () => {
    // `● ○ ✓ → ≈` есть только в Noto Serif SC, поэтому он стоит вторым.
    expect(resolve(tokens, '--t-family-display')).toContain("'Noto Serif SC'");
    expect(resolve(tokens, '--t-family-text')).toContain("'Noto Serif SC'");
  });

  it('длительности заданы токенами, чтобы их можно было обнулить', () => {
    expect(tokens.has('--duration-quick')).toBe(true);
    expect(tokens.has('--duration-calm')).toBe(true);
  });
});

/*
 * Вид «Рельеф: тушью» — та же шкала бумажными тонами. Поверх ложится всё то
 * же, что на цветную; различать полосы ей нечем, кроме светлоты, поэтому
 * каждая следующая темнее предыдущей с заметным шагом.
 */
describe('шкала высот тушью', () => {
  const INK_BANDS = [
    '--map-relief-ink-0',
    '--map-relief-ink-200',
    '--map-relief-ink-500',
    '--map-relief-ink-1000',
    '--map-relief-ink-2000',
    '--map-relief-ink-3000',
    '--map-relief-ink-4000',
  ] as const;

  it('река, граница, метки и выделение видны на каждой полосе', () => {
    for (const band of INK_BANDS) {
      expectAtLeast('--map-river', band, GRAPHIC_CONTRAST);
      expectAtLeast('--map-border-on-relief', band, GRAPHIC_CONTRAST);
      expectAtLeast('--map-correct-mark', band, GRAPHIC_CONTRAST);
      expectAtLeast('--map-incorrect-mark-relief', band, GRAPHIC_CONTRAST);
      expectAtLeast('--map-highlight', band, GRAPHIC_CONTRAST);
      expectSeparatedByLineOrHalo(
        '--map-highlight-outline',
        '--map-highlight-halo',
        band,
        GRAPHIC_CONTRAST,
      );
    }
  });

  it('подпись объекта читается на каждой полосе', () => {
    for (const band of INK_BANDS) {
      expectAtLeast('--map-label', band, TEXT_CONTRAST);
    }
  });

  it('каждая полоса темнее предыдущей с заметным шагом', () => {
    for (let index = 1; index < INK_BANDS.length; index += 1) {
      const lower = color(INK_BANDS[index - 1]);
      const upper = color(INK_BANDS[index]);

      expect(relativeLuminance(upper)).toBeLessThan(relativeLuminance(lower));
      expect(
        contrastRatioRounded(lower, upper),
        `${INK_BANDS[index - 1]} против ${INK_BANDS[index]}`,
      ).toBeGreaterThanOrEqual(1.15);
    }
  });
});

describe('игровая карта', () => {
  const OUTCOMES = ['--map-first-try', '--map-second-try', '--map-failed'] as const;

  it('граница тушью видна на несыгранном и на каждом исходе', () => {
    expectAtLeast('--map-border', '--map-unplayed', GRAPHIC_CONTRAST);
    for (const outcome of OUTCOMES) {
      expectAtLeast('--map-border', outcome, GRAPHIC_CONTRAST);
    }
  });

  it('граница тушью видна на море: береговую линию держит обводка', () => {
    expectAtLeast('--map-border', '--map-sea', GRAPHIC_CONTRAST);
  });

  it('каждый исход отличим от несыгранного, иначе прогресс не виден', () => {
    for (const outcome of OUTCOMES) {
      expectAtLeast(outcome, '--map-unplayed', GRAPHIC_CONTRAST);
    }
  });

  it('подпись читается поверх любого исхода', () => {
    for (const outcome of OUTCOMES) {
      expectAtLeast('--map-outcome-ink', outcome, TEXT_CONTRAST);
    }
  });

  /*
   * Попарного контраста между тремя исходами здесь нет намеренно: он
   * недостижим. Обводка тушью требует светлоты не ниже 0.118, подпись
   * бумагой — не выше 0.18, и все три цвета живут в этой полосе.
   * Различает их узор, см. MapDefs.tsx.
   */
});

describe('макет карты', () => {
  it('пропорция карты в токенах совпадает с viewBox', () => {
    const [width, height] = resolve(tokens, '--map-aspect')
      .split('/')
      .map((part) => Number(part.trim()));

    expect(width).toBe(MAP_VIEWBOX_WIDTH);
    expect(height).toBe(MAP_VIEWBOX_HEIGHT);
  });

});

describe('карта коллекции', () => {
  it('граница тушью видна и на входящих регионах, и на остальных', () => {
    expectAtLeast('--map-border', '--map-member', GRAPHIC_CONTRAST);
    expectAtLeast('--map-border', '--map-outside', GRAPHIC_CONTRAST);
  });

  it('входящий регион отличим от остальных: в этом весь смысл карты', () => {
    expectAtLeast('--map-member', '--map-outside', GRAPHIC_CONTRAST);
  });
});

describe('справочная карта', () => {
  const KINDS = [
    '--map-kind-province',
    '--map-kind-autonomous-region',
    '--map-kind-municipality',
    '--map-kind-sar',
  ] as const;

  it('граница и подпись тушью видны на каждом типе региона', () => {
    for (const kind of KINDS) {
      expectAtLeast('--map-border', kind, GRAPHIC_CONTRAST);
      expectAtLeast('--map-label', kind, TEXT_CONTRAST);
    }
  });
});
