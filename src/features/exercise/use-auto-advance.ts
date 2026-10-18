import { useEffect, useRef, useState } from 'react';
import { CORRECT_PAUSE_MS } from './round-pace';

/**
 * Переход к следующему вопросу, общий для всех раундов с одним ответом на
 * вопрос (регионы, города, страны, физическая карта, достопримечательности,
 * история, культура).
 *
 * Верный ответ ведёт дальше сам, через `CORRECT_PAUSE_MS`. После ошибки раунд
 * стоит (`waiting`), пока ученик сам не пойдёт дальше — `proceed`: пробелом,
 * Enter или кнопкой «Дальше» в `RoundStage` (решение владельца от 2026-10-18;
 * прежде разбор держался две секунды и гас сам, и ученик не успевал
 * разглядеть свой ответ рядом с верным).
 *
 * Таймер и отложенный переход живут в ссылках, а не только в состоянии: уход
 * с экрана посреди паузы не должен переводить раунд, которого уже нет, а
 * пробел, пришедший и на кнопку, и на окно, не должен перевести его дважды.
 */
export function useAutoAdvance() {
  const advanceTimer = useRef<number | null>(null);
  const pendingAdvance = useRef<(() => void) | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(
    () => () => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current);
      }
      pendingAdvance.current = null;
    },
    [],
  );

  function schedule(isCorrect: boolean, advance: () => void) {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }

    if (!isCorrect) {
      pendingAdvance.current = advance;
      setWaiting(true);
      return;
    }

    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      advance();
    }, CORRECT_PAUSE_MS);
  }

  function proceed() {
    const advance = pendingAdvance.current;
    if (advance === null) {
      return;
    }

    pendingAdvance.current = null;
    setWaiting(false);
    advance();
  }

  return { schedule, waiting, proceed };
}
