import { useEffect, useRef, useState } from 'react';
import type { Difficulty } from '../../domain/difficulty';
import type { QuestionLanguage } from '../../domain/question-language';

/** Строка набора: название слева, число целей справа. */
export type SetOption = {
  readonly value: string;
  readonly label: string;
  readonly count: number;
  /** Слово при числе в нужной форме: «объект», «города». */
  readonly word: string;
};

export type ModeStartDialogProps = {
  /** Знак режима на печати: 地, 山, 史… */
  readonly mark: string;
  /** Глава, к которой относится игра: «Физическая карта». */
  readonly group: string;
  readonly title: string;
  /**
   * Чем эта игра отличается от соседней. С карточки описание ушло сюда: там
   * одиннадцать абзацев подряд стояли между учеником и выбором, а здесь он
   * уже выбрал игру и спрашивает, как в ней спрашивают.
   */
  readonly summary: string;
  /** «34 региона, около 7 минут» — то же, что на карточке. */
  readonly volume: string;
  readonly defaultLanguage: QuestionLanguage;
  /**
   * Вторая группа окна: чем глубже набор, тем больше целей. Задана списком
   * пар, а не видом игры: наборы есть и у городов, и у физической географии, и
   * третья почти такая же группа была бы копией. Подписи с числами собирает
   * вызывающая сторона — считать цели окну незачем, а знать о них неоткуда.
   */
  readonly setChoice?: {
    readonly legend: string;
    readonly options: readonly SetOption[];
    readonly value: string;
  } | null;
  /**
   * Уровень сложности (решение владельца от 2026-10-18): задан — третья
   * группа «Сложность», и объём в окне — у выбранного уровня. Не задан — игра
   * без уровней.
   */
  readonly levelChoice?: {
    readonly value: Difficulty;
    readonly easyVolume: string;
    readonly hardVolume: string;
  } | null;
  readonly onStart: (
    language: QuestionLanguage,
    set: string,
    level: Difficulty,
  ) => void;
  readonly onClose: () => void;
};

/** Уровни: название и чем он отличается — одной строкой под ним. */
const LEVELS: readonly (readonly [Difficulty, string, string])[] = [
  ['easy', 'Лёгкий', 'найденное остаётся на карте, три попытки'],
  ['hard', 'Сложный', 'карта каждый раз чистая, одна попытка'],
];

const LANGUAGES: readonly (readonly [QuestionLanguage, string])[] = [
  ['ru', 'Русское название'],
  ['zh', '中文'],
];

/**
 * Окно перед стартом: чем спрашивать — русским названием или иероглифами.
 *
 * Отдельным окном, а не переключателем на карточке: на карточке он стоял вне
 * кнопки запуска (интерактивный элемент внутри кнопки недостижим с
 * клавиатуры), то есть на доске, а не на бумаге, — тёмное по тёмному. Окно
 * ставит выбор на бумагу и задаёт его один раз, там, где ученик уже решил
 * играть.
 *
 * Родной `<dialog>` взят ради того, чего иначе пришлось бы писать руками:
 * верхний слой, Esc, возврат фокуса и недоступность остальной страницы.
 */
export function ModeStartDialog({
  mark,
  group,
  title,
  summary,
  volume,
  defaultLanguage,
  setChoice = null,
  levelChoice = null,
  onStart,
  onClose,
}: ModeStartDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const [language, setLanguage] = useState<QuestionLanguage>(defaultLanguage);
  const [set, setSet] = useState(setChoice?.value ?? '');
  const [level, setLevel] = useState<Difficulty>(levelChoice?.value ?? 'easy');
  const shownVolume =
    levelChoice === null
      ? volume
      : level === 'easy'
        ? levelChoice.easyVolume
        : levelChoice.hardVolume;

  useEffect(() => {
    dialogRef.current?.showModal();
    /*
     * Фокус ставится после открытия и явно: `autoFocus` React выставляет
     * свойством, а не атрибутом, и родной `showModal` его не видит — фокус
     * уходил на первую радиокнопку. Обычный случай — просто играть, а язык уже
     * назван выбранной строкой выше.
     */
    startRef.current?.focus();
  }, []);

  return (
    <dialog
      className="mode-dialog"
      ref={dialogRef}
      aria-labelledby="mode-dialog-title"
      onClose={onClose}
      /*
       * Нажатие мимо окна попадает в сам `<dialog>`: его прямоугольник — это
       * подложка во весь экран, а содержимое лежит во вложенном блоке.
       */
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
    >
      <div className="mode-dialog-body">
        <div className="mode-dialog-head">
          {/*
            Печать режима — та же метка, что отличала карточки до пилюль. Знак,
            а не слово: читалке экрана его не читать.
          */}
          <span className="seal seal-solid seal-large" lang="zh-Hans" aria-hidden="true">
            {mark}
          </span>
          <div>
            <p className="eyebrow">{group}</p>
            <h2 id="mode-dialog-title">{title}</h2>
          </div>
        </div>
        <p className="mode-dialog-summary">{summary}</p>
        <p className="mode-dialog-volume">{shownVolume}</p>
        <fieldset className="mode-dialog-language">
          <legend>Чем спрашивать</legend>
          <div className="mode-dialog-language-options">
            {LANGUAGES.map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="mode-dialog-language"
                  value={value}
                  checked={language === value}
                  onChange={() => setLanguage(value)}
                />
                <span lang={value === 'zh' ? 'zh-Hans' : undefined}>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {setChoice === null ? null : (
          <fieldset className="mode-dialog-set">
            <legend>{setChoice.legend}</legend>
            {setChoice.options.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="mode-dialog-set"
                  value={option.value}
                  checked={set === option.value}
                  onChange={() => setSet(option.value)}
                />
                <span>{option.label}</span>{' '}
                {/*
                  Число крупно, слово мелко — объём набора читается взглядом
                  по столбцу. Тире скрыто от глаза, но входит в имя кнопки:
                  без него читалка склеила бы «И хребты 28 объектов».
                */}
                <span className="mode-dialog-count">
                  <span className="visually-hidden">—</span>{' '}
                  <span className="mode-dialog-count-number">{option.count}</span>{' '}
                  {option.word}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {levelChoice === null ? null : (
          <fieldset className="mode-dialog-set mode-dialog-level">
            <legend>Сложность</legend>
            {LEVELS.map(([value, label, note]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="mode-dialog-level"
                  value={value}
                  checked={level === value}
                  onChange={() => setLevel(value)}
                />
                <span>{label}</span>{' '}
                {/*
                  Пояснение мельче названия, как объём у набора. Тире скрыто от
                  глаза, но входит в имя: без него читалка склеила бы «Лёгкий
                  найденное остаётся».
                */}
                <span className="mode-dialog-count">
                  <span className="visually-hidden">—</span> {note}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="mode-dialog-actions">
          <button
            type="button"
            className="primary"
            ref={startRef}
            onClick={() => onStart(language, set, level)}
          >
            Начать
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => dialogRef.current?.close()}
          >
            Отмена
          </button>
        </div>
      </div>
    </dialog>
  );
}
