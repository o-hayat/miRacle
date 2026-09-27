"use client";

import { useEffect } from "react";
import type { ReferenceContent } from "./types";
import styles from "./ArticleDialogs.module.css";

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Replays inspected article drawers with their original, sanitized content. */
export function ArticleDialogs({ content }: { content: ReferenceContent }) {
  useEffect(() => {
    const root = document.getElementById("reference-capture");
    if (!root) return;

    const methods = content.states["methods-states"] ?? [];
    const attributes = content.states["interaction-states"]?.find(
      (state) => state.kind === "attributes",
    );
    let disposeActive: (() => void) | undefined;

    function openDrawer(html: string, opener: HTMLButtonElement) {
      disposeActive?.();
      const template = document.createElement("template");
      template.innerHTML = html;
      const capturedDialog = template.content.querySelector<HTMLElement>('[role="dialog"]');
      if (!capturedDialog) return;
      const dialog: HTMLElement = capturedDialog;

      // Capture can happen during the source drawer's entrance animation.
      dialog.dataset.state = "open";
      dialog.classList.add(styles.drawer);
      dialog.setAttribute("aria-modal", "true");
      dialog.tabIndex = -1;
      dialog.querySelectorAll('[data-state="closed"]').forEach((node) => {
        node.removeAttribute("data-state");
      });
      dialog.querySelectorAll("[inert]").forEach((node) => node.removeAttribute("inert"));
      dialog.querySelectorAll<SVGSVGElement>("svg[width][height]").forEach((svg) => {
        const width = Number(svg.getAttribute("width"));
        const height = Number(svg.getAttribute("height"));
        if (width > 200 && height > 0) {
          if (!svg.hasAttribute("viewBox")) svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
          svg.classList.add(styles.figure);
        }
      });

      const host = document.createElement("div");
      host.className = styles.host;
      host.dataset.open = "false";
      host.dataset.referenceDrawer = "true";
      const backdrop = document.createElement("div");
      backdrop.className = styles.backdrop;
      backdrop.setAttribute("aria-hidden", "true");
      host.append(backdrop, dialog);
      document.body.append(host);

      const inertStates = [...document.body.children]
        .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== host)
        .map((node) => ({ node, inert: node.inert }));
      inertStates.forEach(({ node }) => { node.inert = true; });
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      opener.setAttribute("aria-expanded", "true");
      opener.dataset.state = "open";

      let closeTimer: ReturnType<typeof setTimeout> | undefined;
      let disposed = false;
      let closing = false;
      const focusable = () => [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((node) => node.getClientRects().length > 0 && !node.closest("[inert]"));

      function dispose() {
        if (disposed) return;
        disposed = true;
        clearTimeout(closeTimer);
        cancelAnimationFrame(entranceFrame);
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("focusin", onFocusIn, true);
        backdrop.removeEventListener("click", close);
        dialog.removeEventListener("click", onDialogClick);
        host.remove();
        inertStates.forEach(({ node, inert }) => { node.inert = inert; });
        document.body.style.overflow = previousOverflow;
        opener.setAttribute("aria-expanded", "false");
        opener.dataset.state = "closed";
        if (opener.isConnected) opener.focus({ preventScroll: true });
        if (disposeActive === dispose) disposeActive = undefined;
      }

      function close() {
        if (closing) return;
        closing = true;
        host.dataset.open = "false";
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) dispose();
        else closeTimer = setTimeout(dispose, 200);
      }

      function onDialogClick(event: MouseEvent) {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('button[aria-label="Close drawer"]')) close();
      }

      function onKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (event.key === "Tab") {
          const items = focusable();
          const first = items[0];
          const last = items.at(-1);
          if (!first) {
            event.preventDefault();
            dialog.focus();
          } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
            event.preventDefault();
            first.focus();
          }
        }
      }

      function onFocusIn(event: FocusEvent) {
        if (event.target instanceof Node && !dialog.contains(event.target)) {
          (focusable()[0] ?? dialog).focus({ preventScroll: true });
        }
      }

      backdrop.addEventListener("click", close);
      dialog.addEventListener("click", onDialogClick);
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("focusin", onFocusIn, true);
      // Force the initial state to paint before the captured 200ms entrance.
      void host.offsetWidth;
      const entranceFrame = requestAnimationFrame(() => { host.dataset.open = "true"; });
      dialog.focus({ preventScroll: true });
      disposeActive = dispose;
    }

    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button || !root?.contains(button)) return;
      let html: string | undefined;
      if (button.dataset.analytics === "rsi-view-methods") {
        const buttons = [...root.querySelectorAll<HTMLButtonElement>('button[data-analytics="rsi-view-methods"]')];
        const index = buttons.indexOf(button);
        html = methods.find((state) => state.index === index)?.html;
      } else if (button.dataset.analytics === "mentalhealthbench-at-a-glance-conversation-attributes") {
        html = attributes?.states?.[0]?.html ?? attributes?.html;
      }
      if (html) {
        event.preventDefault();
        openDrawer(html, button);
      }
    }

    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("click", onClick);
      disposeActive?.();
    };
  }, [content]);

  return null;
}
