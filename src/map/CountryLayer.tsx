import { countryById } from '../content/countries';
import { COUNTRY_SHAPES, DISPUTED_SHAPES } from './country-geometry';
import type { AnswerState } from './region-selection';

export type CountryLayerProps = {
  readonly selectedCountryId: string | null;
  readonly onSelect: (countryId: string) => void;
  /**
   * Отвечают ли нажатием по стране. В «назвать страну» ответ выбирается
   * кнопкой, и контуры перестают быть управлением: роль и фокус снимаются,
   * иначе читалка экрана объявит четырнадцать кнопок, которые ничего не
   * делают. Тот же довод, по которому роли нет у спорных участков.
   */
  readonly answers?: boolean;
  readonly answerStates?: Readonly<Record<string, AnswerState>>;
};

const NO_STATES: Readonly<Record<string, AnswerState>> = {};

/**
 * Слой сопредельных государств: четырнадцать стран за границей Китая.
 *
 * Рисуется порталом внутрь уже вставленной разметки карты — как слой городов и
 * физический, и по той же причине: система координат и увеличение достаются
 * ему от самой карты, а не подгоняются вторым `svg` поверх.
 *
 * Подписей у стран нет: в обеих играх имя страны и есть ответ (решение
 * владельца от 2026-08-31). До ответа его называет только имя цели для
 * читалки экрана, после — разбор.
 *
 * Слой рисуется на расширенном кадре: при обычном, обрезанном по Китаю, от
 * Афганистана оставалась полоска в 8.4 единицы. Множитель общий с генератором
 * геометрии — `COUNTRY_FRAME_OUTSET`.
 */
export function CountryLayer({
  selectedCountryId,
  onSelect,
  answers = true,
  answerStates = NO_STATES,
}: CountryLayerProps) {
  return (
    <g className="country-layer" data-answers={answers}>
      {COUNTRY_SHAPES.map((shape) => {
        const country = countryById(shape.id);
        const answerState = answerStates[shape.id];

        return (
          <path
            key={shape.id}
            className="country"
            d={shape.d}
            data-country-id={shape.id}
            data-selected={shape.id === selectedCountryId}
            data-answer-state={answerState}
            role={answers ? 'button' : undefined}
            tabIndex={answers ? 0 : undefined}
            /*
             * Там, где по контурам не отвечают, у них снимается и имя: фигура
             * с именем остаётся в дереве доступности и без роли, и читалка
             * экрана обошла бы четырнадцать безролевых названий вместо
             * четырнадцати кнопок. Тот же приём, что у слоёв городов и
             * достопримечательностей.
             */
            aria-label={
              answers ? `${country?.nameRu}, ${country?.nameZh}` : undefined
            }
            aria-hidden={answers ? undefined : 'true'}
            aria-disabled={answers && answerState ? true : undefined}
            onClick={answers ? () => onSelect(shape.id) : undefined}
            onKeyDown={
              answers
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(shape.id);
                    }
                  }
                : undefined
            }
          />
        );
      })}

      {/*
        Спорные участки идут поверх заливок и целью ответа не бывают: страна —
        цель, спор — обстоятельство. Роли и фокуса у них нет, иначе читалка
        экрана объявила бы управление, которое ничего не делает; нажатие они
        пропускают сквозь себя к стране под ними.
      */}
      {DISPUTED_SHAPES.map((shape) => (
        <path
          key={shape.id}
          className="country-disputed"
          d={shape.d}
          data-disputed-id={shape.id}
          aria-hidden="true"
        />
      ))}

      {/*
        Штриховка недоступна программе чтения с экрана, поэтому спорные участки
        названы ещё и текстом. Слова взяты у источника: он сам говорит, кто
        участком управляет и кто его заявляет.

        Формулировка источника английская, и это помечено `lang`: без пометки
        русский синтезатор читает «Admin. by China» русской фонетикой
        (WCAG 3.1.2). Переводить её нельзя — дословность записана решением
        владельца от 2026-08-30.
      */}
      <foreignObject className="country-disputed-note" width="1" height="1">
        <ul>
          {DISPUTED_SHAPES.map((shape) => (
            <li key={shape.id}>
              {shape.nameRu} — спорная территория:{' '}
              <span lang="en">{shape.note}</span>
            </li>
          ))}
        </ul>
      </foreignObject>
    </g>
  );
}
