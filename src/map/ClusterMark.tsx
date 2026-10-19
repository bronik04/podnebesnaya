import type { ReactNode } from 'react';
import type { MapCluster } from './cluster';
import type { MarkOutcome } from './mark-outcome';

/**
 * Свёрнутая гроздь на карте: знак своего слоя и кружок с числом.
 *
 * Знак рисует слой и передаёт сюда: род знака — его дело, а не грозди. Что
 * значит нажатие, тоже решает слой: у городов оно приближает карту, у
 * достопримечательностей — отвечает всей гроздью (`cluster.ts`).
 *
 * `label` — и подпись, и признак: пока его нет, гроздь не отвечает на нажатие
 * и не берёт фокус. То же правило, что у городов: разметка называет цель ровно
 * тогда, когда в неё можно попасть.
 */

export type ClusterMarkProps = {
  readonly cluster: MapCluster;
  readonly label?: string;
  /**
   * Радиус цели нажатия. Приходит снаружи, потому что задан в пикселях экрана
   * и делится на увеличение: гроздь не знает ни того, ни другого, а WCAG 2.2
   * (2.5.8) требует 24 px независимо от вида карты.
   */
  readonly hitRadius: number;
  /**
   * Спрошена ли цель внутри грозди. Свёрнутая гроздь обязана показывать это
   * сама: в «назвать» подсвеченная точка и есть вопрос, а до приближения
   * карты её знак живёт именно здесь.
   */
  readonly selected: boolean;
  /** Исход ответа по грозди — её знак красится так же, как одиночный. */
  readonly outcome?: MarkOutcome;
  /** Знак свёрнутой грозди — рисуется в её середине. */
  readonly mark: ReactNode;
  readonly onActivate?: () => void;
};

/**
 * Кружок с числом отходит от знака вверх-вправо.
 *
 * Радиус 5 единиц — не оформительский выбор: при опорной ширине карты единица
 * равна пикселю, и кружок в 3,6 давал 7 px, в которых цифру не прочесть.
 */
const BADGE_OFFSET = 5.5;
const BADGE_RADIUS = 5;

/** Кольцо вокруг знака грозди со спрошенной целью — как у одиночного города. */
const HALO_RADIUS = 11;

export function ClusterMark({
  cluster,
  label,
  hitRadius,
  selected,
  outcome,
  mark,
  onActivate,
}: ClusterMarkProps) {
  return (
    <g
      className="map-cluster"
      data-cluster-id={cluster.id}
      data-selected={selected}
      data-outcome={outcome}
    >
      {mark}
      <circle
        className="cluster-halo"
        cx={cluster.x}
        cy={cluster.y}
        r={HALO_RADIUS}
        fill="none"
        stroke="none"
        aria-hidden="true"
      />
      <circle
        className="cluster-badge"
        cx={cluster.x + BADGE_OFFSET}
        cy={cluster.y - BADGE_OFFSET}
        r={BADGE_RADIUS}
        aria-hidden="true"
      />
      <text
        className="cluster-count"
        x={cluster.x + BADGE_OFFSET}
        y={cluster.y - BADGE_OFFSET + BADGE_RADIUS * 0.36}
        textAnchor="middle"
        aria-hidden="true"
      >
        {cluster.members.length}
      </text>
      <circle
        className="cluster-hit"
        cx={cluster.x}
        cy={cluster.y}
        r={hitRadius}
        role={label === undefined ? undefined : 'button'}
        aria-label={label}
        aria-hidden={label === undefined ? 'true' : undefined}
        tabIndex={label === undefined ? -1 : 0}
        onClick={label === undefined ? undefined : onActivate}
        onKeyDown={
          label === undefined
            ? undefined
            : (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onActivate?.();
                }
              }
        }
      />
    </g>
  );
}
