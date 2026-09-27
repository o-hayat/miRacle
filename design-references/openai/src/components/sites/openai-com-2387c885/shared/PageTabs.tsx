"use client";

import { useEffect } from "react";
import type { ReferenceContent } from "./types";

function fragment(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

/** Captures made during the source's letter reveal need its final visible state. */
function finishLetterReveal(panel: HTMLElement) {
  if (!panel.id.startsWith("chain-of-thought-translation-")) return;
  panel.setAttribute("aria-busy", "false");
  const visibleLayer = Array.from(panel.children).find((child) =>
    child.classList.contains("z-1"),
  );
  visibleLayer?.querySelectorAll("span").forEach((letter) => {
    letter.classList.remove("opacity-0", "transition-none");
    letter.classList.add("opacity-100");
    // CSS-module reveal keyframes in some captures otherwise reset letters to 0.
    letter.style.animation = "none";
    letter.style.opacity = "1";
  });
}

/** Replays captured tab panels, without executing any source-site scripts. */
export function PageTabs({ content }: { content: ReferenceContent }) {
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("#reference-capture main");
    if (!main) return;

    const panels = new Map<string, HTMLElement>();
    const remember = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>('[role="tabpanel"]').forEach((panel) => {
        const tabId = panel.getAttribute("aria-labelledby");
        if (tabId) panels.set(tabId, panel.cloneNode(true) as HTMLElement);
      });
    };
    remember(fragment(content.html));
    for (const state of content.states["interaction-states"] ?? []) {
      if (["chart-tab", "voice", "demo"].includes(state.kind ?? "") && state.html) {
        remember(fragment(state.html));
      }
    }
    const translated = content.states["plain-language"];
    if (translated) remember(fragment(translated.html));

    // The source demo requires its own live service. Keep that action explicit.
    const sessionButtons = main.querySelectorAll<HTMLButtonElement>(
      '[data-analytics="gpt-live-1-demo-start-session"]',
    );
    sessionButtons.forEach((button) => {
      const link = document.createElement("a");
      link.className = button.className;
      link.innerHTML = button.innerHTML;
      link.href = content.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", "Start session on the original OpenAI website (opens in a new tab)");
      button.replaceWith(link);
    });

    main.querySelectorAll<HTMLMediaElement>("audio[autoplay], video[autoplay]").forEach((media) => {
      media.autoplay = false;
      media.removeAttribute("autoplay");
      media.pause();
    });
    main.querySelectorAll<HTMLElement>('[role="tabpanel"]').forEach(finishLetterReveal);
    main.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((tab) => {
      tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
    });

    function activate(tab: HTMLButtonElement) {
      const list = tab.closest<HTMLElement>('[role="tablist"]');
      const captured = panels.get(tab.id);
      if (!list || !captured || !main) return;
      const oldTab = list.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
      const previousId = oldTab?.getAttribute("aria-controls");
      const current = previousId ? main.querySelector<HTMLElement>(`#${CSS.escape(previousId)}`) : null;
      if (!current) return;

      current.querySelectorAll<HTMLMediaElement>("audio, video").forEach((media) => media.pause());
      const next = captured.cloneNode(true) as HTMLElement;
      next.hidden = false;
      next.removeAttribute("aria-hidden");
      finishLetterReveal(next);
      next.querySelectorAll<HTMLMediaElement>("audio, video").forEach((media) => {
        media.autoplay = false;
        media.removeAttribute("autoplay");
        media.preload = "none";
      });
      current.replaceWith(next);

      const languageTabs = list.getAttribute("aria-label") === "Reasoning language";
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((item) => {
        const selected = item === tab;
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
        item.classList.toggle("bg-primary-4", selected);
        if (languageTabs) {
          item.classList.toggle("bg-transparent", !selected);
          item.classList.toggle("text-primary-solid-60", !selected);
          item.classList.toggle("text-primary-100", selected);
        }
        item.querySelectorAll<HTMLElement>('[class*="countdown"]').forEach((countdown) => {
          countdown.hidden = !selected;
          countdown.style.animationPlayState = "paused";
        });
      });
      // Shared controls can normalize chart sizing and media in the new panel.
      main.dispatchEvent(new CustomEvent("reference:content-changed", { bubbles: true }));
    }

    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const tab = target.closest<HTMLButtonElement>('button[role="tab"]');
      if (!tab || !main?.contains(tab)) return;
      event.preventDefault();
      activate(tab);
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement) || target.getAttribute("role") !== "tab") return;
      const list = target.closest('[role="tablist"]');
      if (!list) return;
      const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('button[role="tab"]'));
      const index = tabs.indexOf(target);
      let nextIndex: number;
      switch (event.key) {
        case "ArrowRight": nextIndex = (index + 1) % tabs.length; break;
        case "ArrowLeft": nextIndex = (index - 1 + tabs.length) % tabs.length; break;
        case "Home": nextIndex = 0; break;
        case "End": nextIndex = tabs.length - 1; break;
        default: return;
      }
      event.preventDefault();
      const next = tabs[nextIndex];
      activate(next);
      next.focus({ preventScroll: true });
      // Scroll only the horizontal tab strip; retain the article's vertical position.
      const strip = list as HTMLElement;
      if (next.offsetLeft < strip.scrollLeft || next.offsetLeft + next.offsetWidth > strip.scrollLeft + strip.clientWidth) {
        strip.scrollLeft = Math.max(0, next.offsetLeft - (strip.clientWidth - next.offsetWidth) / 2);
      }
    }

    main.addEventListener("click", onClick);
    main.addEventListener("keydown", onKeyDown);
    return () => {
      main.removeEventListener("click", onClick);
      main.removeEventListener("keydown", onKeyDown);
    };
  }, [content]);

  return null;
}
