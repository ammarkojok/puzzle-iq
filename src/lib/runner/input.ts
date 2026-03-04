// ── Touch & Keyboard Input Handler ─────────────────────────────────

import { SWIPE_THRESHOLD, SWIPE_MAX_TIME } from "./constants";

export type InputCallbacks = {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
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
      case " ":
      case "Enter":
        e.preventDefault();
        callbacks.onTap();
        break;
    }
  }

  return {
    attach(el: HTMLElement) {
      element = el;
      el.addEventListener("touchstart", onTouchStart, { passive: true });
      el.addEventListener("touchend", onTouchEnd, { passive: true });
      window.addEventListener("keydown", onKeyDown);
    },
    detach() {
      if (element) {
        element.removeEventListener("touchstart", onTouchStart);
        element.removeEventListener("touchend", onTouchEnd);
      }
      window.removeEventListener("keydown", onKeyDown);
      element = null;
    },
  };
}
