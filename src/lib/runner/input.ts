// ── Touch & Keyboard Input Handler ─────────────────────────────────

import { SWIPE_THRESHOLD, SWIPE_MAX_TIME } from "./constants";

export type InputCallbacks = {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeUp: () => void;
  onSwipeDown: () => void;
  onTap: () => void;
};

export type InputHandler = {
  attach: (element: HTMLElement) => void;
  detach: () => void;
};

export function createInputHandler(
  callbacks: InputCallbacks
): InputHandler {
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let element: HTMLElement | null = null;

  function onTouchStart(e: TouchEvent) {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
  }

  function onTouchEnd(e: TouchEvent) {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const elapsed = Date.now() - startTime;

    if (
      Math.abs(dy) > SWIPE_THRESHOLD &&
      Math.abs(dy) > Math.abs(dx) &&
      elapsed < SWIPE_MAX_TIME
    ) {
      if (dy < 0) callbacks.onSwipeUp();
      else callbacks.onSwipeDown();
    } else if (
      Math.abs(dx) > SWIPE_THRESHOLD &&
      Math.abs(dx) > Math.abs(dy) &&
      elapsed < SWIPE_MAX_TIME
    ) {
      if (dx < 0) callbacks.onSwipeLeft();
      else callbacks.onSwipeRight();
    } else if (
      Math.abs(dx) < 15 &&
      Math.abs(dy) < 15 &&
      elapsed < SWIPE_MAX_TIME
    ) {
      callbacks.onTap();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowLeft":
      case "a":
      case "A":
        e.preventDefault();
        callbacks.onSwipeLeft();
        break;
      case "ArrowRight":
      case "d":
      case "D":
        e.preventDefault();
        callbacks.onSwipeRight();
        break;
      case "ArrowUp":
      case "w":
      case "W":
        e.preventDefault();
        callbacks.onSwipeUp();
        break;
      case "ArrowDown":
      case "s":
      case "S":
        e.preventDefault();
        callbacks.onSwipeDown();
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        callbacks.onTap();
        break;
    }
  }

  function onMouseClick(e: MouseEvent) {
    // Only handle simple clicks (no drag), and avoid double-firing with touch
    if (e.detail > 0) {
      callbacks.onTap();
    }
  }

  return {
    attach(el: HTMLElement) {
      element = el;
      el.addEventListener("touchstart", onTouchStart, { passive: true });
      el.addEventListener("touchend", onTouchEnd, { passive: true });
      el.addEventListener("click", onMouseClick);
      window.addEventListener("keydown", onKeyDown);
    },
    detach() {
      if (element) {
        element.removeEventListener("touchstart", onTouchStart);
        element.removeEventListener("touchend", onTouchEnd);
        element.removeEventListener("click", onMouseClick);
      }
      window.removeEventListener("keydown", onKeyDown);
      element = null;
    },
  };
}
