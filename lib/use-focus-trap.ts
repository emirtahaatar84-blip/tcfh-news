"use client";

import { useEffect, type RefObject } from "react";

/**
 * Modal diyaloglar için basit odak tuzağı: Tab/Shift+Tab diyaloğun
 * içinde döner, arkadaki içeriğe kaçmaz.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!active || !element) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const nodes = Array.from(
        element.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.offsetParent !== null);

      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, [active, ref]);
}
