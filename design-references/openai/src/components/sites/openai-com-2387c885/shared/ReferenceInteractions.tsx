"use client";

import { useEffect } from "react";
import { PageTabs } from "./PageTabs";
import { ArticleDialogs } from "./ArticleDialogs";
import type { ReferenceContent } from "./types";

// The articles are sanitized source DOM. Delegation preserves behavior when a
// captured tab replaces part of that DOM without re-rendering the whole article.
export function ReferenceInteractions({ content }: { content: ReferenceContent }) {
  useEffect(() => {
    const root = document.getElementById("reference-capture");
    if (!root) return;
    const abort = new AbortController();
    const { signal } = abort;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
      timers.add(timer);
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const behavior = () => reduced.matches ? "instant" as const : "smooth" as const;
    const status = document.createElement("span");
    status.className = "sr-only";
    status.setAttribute("role", "status");
    root.append(status);
    const announce = (message: string) => { status.textContent = message; };
    const text = (element: Element) => element.textContent?.trim() ?? "";
    const originalLink = (button: HTMLButtonElement, label: string, href = content.url) => {
      const link = document.createElement("a");
      link.className = button.className;
      link.innerHTML = button.innerHTML;
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", label);
      link.title = label;
      button.replaceWith(link);
    };
    const closestWith = (element: Element, selector: string) => {
      for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
        if (parent.querySelector(selector)) return parent;
      }
      return null;
    };

    const enhanceContent = () => {
      root.querySelectorAll<SVGSVGElement>("svg.marks, [role='graphics-document'] > svg").forEach((svg) => {
        const width = Number(svg.getAttribute("width"));
        const height = Number(svg.getAttribute("height"));
        if (!svg.hasAttribute("viewBox") && width > 0 && height > 0) svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
      });
      root.querySelectorAll<HTMLMediaElement>("audio, video").forEach((media) => {
        media.autoplay = false;
        media.removeAttribute("autoplay");
        media.preload = "none";
      });
      root.querySelectorAll<HTMLButtonElement>("button[aria-label='Play audio of page text']").forEach((button) => {
        const audio = closestWith(button, "audio")?.querySelector("audio");
        if (!audio?.getAttribute("src") && !audio?.querySelector("source[src]")) originalLink(button, "Listen to article on OpenAI (opens in a new window)");
      });
      root.querySelectorAll<HTMLButtonElement>("[data-dotcom-chart-action-menu-trigger]").forEach((button) => {
        button.style.opacity = "1";
        button.setAttribute("aria-label", (button.getAttribute("aria-label") ?? "Chart options").replace("Chart options for", "Download chart for"));
        button.removeAttribute("aria-haspopup");
      });
    };
    enhanceContent();
    root.addEventListener("reference:content-changed", enhanceContent, { signal });

    const toc = [...root.querySelectorAll<HTMLElement>("nav[aria-label='Table of contents']")];
    const tocLinks = toc.flatMap((nav) => [...nav.querySelectorAll<HTMLAnchorElement>("a[href^='#']")]);
    const targets = [...new Set(tocLinks.map((link) => link.hash))].map((hash) => document.getElementById(decodeURIComponent(hash.slice(1)))).filter((target): target is HTMLElement => !!target);
    const mobileToc = toc.find((nav) => nav.hasAttribute("data-show-toc"));
    const disclosure = mobileToc?.querySelector<HTMLButtonElement>("button[aria-expanded]");
    const tocPanel = mobileToc?.querySelector<HTMLElement>("div[aria-hidden]");
    const setTocOpen = (open: boolean) => {
      disclosure?.setAttribute("aria-expanded", String(open));
      tocPanel?.setAttribute("aria-hidden", String(!open));
      if (tocPanel) {
        tocPanel.style.visibility = open ? "visible" : "hidden";
        tocPanel.style.gridTemplateRows = open ? "1fr" : "0fr";
      }
      const close = mobileToc?.querySelector<HTMLButtonElement>("button[aria-label='Close table of contents']");
      if (close) close.style.pointerEvents = open ? "auto" : "none";
      const icon = close?.querySelector("svg");
      if (icon) icon.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
    };
    let scrollFrame = 0;
    const updateToc = () => {
      scrollFrame = 0;
      let current = targets[0];
      for (const target of targets) {
        if (target.getBoundingClientRect().top <= 132) current = target;
      }
      tocLinks.forEach((link) => {
        const active = link.hash === `#${current?.id}`;
        link.setAttribute("aria-current", String(active));
        link.classList.toggle("text-primary-100", active);
        link.classList.toggle("text-primary-60", !active);
      });
      const active = tocLinks.find((link) => link.hash === `#${current?.id}`);
      const label = disclosure?.querySelector("span");
      if (label && active) label.textContent = text(active);
      if (mobileToc && targets.length) {
        const visible = targets[0].getBoundingClientRect().top < 180;
        mobileToc.style.opacity = visible ? "1" : "0";
        mobileToc.style.pointerEvents = visible ? "auto" : "none";
      }
    };
    const onScroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateToc); };
    window.addEventListener("scroll", onScroll, { signal, passive: true });
    window.addEventListener("resize", onScroll, { signal, passive: true });
    updateToc();

    const mobileMenu = root.querySelector<HTMLElement>("#header-mobile-drawer-panel");
    const menuButton = root.querySelector<HTMLButtonElement>("button[aria-label='Open mobile navigation']");
    const setMenuOpen = (open: boolean) => {
      mobileMenu?.setAttribute("aria-hidden", String(!open));
      menuButton?.setAttribute("aria-expanded", String(open));
      menuButton?.setAttribute("aria-label", open ? "Close mobile navigation" : "Open mobile navigation");
      if (mobileMenu) {
        mobileMenu.style.clipPath = open ? "inset(0 0 0 0)" : "inset(0 0 100% 0)";
        mobileMenu.style.pointerEvents = open ? "auto" : "none";
      }
      if (open) mobileMenu?.querySelector<HTMLElement>("a, button")?.focus();
      else menuButton?.focus({ preventScroll: true });
    };
    mobileMenu?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      const category = text(button).toLowerCase();
      originalLink(button, `${text(button)} on OpenAI`, `https://openai.com/${category}/`);
    });
    // Search, account menus, and cookie preferences belong to the original host.
    root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      const label = button.getAttribute("aria-label");
      if (label === "Open Search") originalLink(button, "Search OpenAI (opens in a new window)", "https://openai.com/search/");
      else if (text(button) === "Log in") originalLink(button, "Log in on OpenAI (opens in a new window)", "https://chatgpt.com/auth/login");
      else if (text(button) === "Manage Cookies") originalLink(button, "Cookie preferences on OpenAI (opens in a new window)");
    });

    const testimonials = (content.states["interaction-states"] ?? []).filter((state) => state.kind === "testimonial" && state.html);
    let testimonialIndex = 0;
    const showTestimonial = (index: number) => {
      const state = testimonials[Math.max(0, Math.min(index, testimonials.length - 1))];
      const current = root.querySelector<HTMLElement>("figure[aria-live]");
      if (!state?.html || !current) return;
      testimonialIndex = testimonials.indexOf(state);
      const template = document.createElement("template");
      template.innerHTML = state.html;
      const next = template.content.querySelector<HTMLElement>("figure[aria-live]") ?? template.content.querySelector<HTMLElement>("figure");
      if (!next) return;
      next.style.opacity = "1";
      current.replaceWith(next);
      if (!reduced.matches) next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
      const region = next.closest("[data-testid='testimonial-carousel-carousel-view']") ?? closestWith(next, "[aria-label='Next testimonial']") ?? root;
      region.querySelectorAll<HTMLButtonElement>("button[aria-label^='Show testimonial from']").forEach((button) => {
        const active = button.getAttribute("aria-label") === `Show testimonial from ${state.name}`;
        button.setAttribute("aria-current", String(active));
        button.classList.toggle("opacity-100", active);
        button.classList.toggle("opacity-60", !active);
        button.classList.toggle("text-primary-100", active);
      });
      const previous = region.querySelector<HTMLButtonElement>("button[aria-label='Previous testimonial']");
      const following = region.querySelector<HTMLButtonElement>("button[aria-label='Next testimonial']");
      if (previous) previous.disabled = testimonialIndex === 0;
      if (following) following.disabled = testimonialIndex === testimonials.length - 1;
      region.querySelectorAll("[data-testid='testimonial-carousel-controls'] span").forEach((span) => {
        if (/^\d+ of \d+$/.test(text(span))) span.textContent = `${testimonialIndex + 1} of ${testimonials.length}`;
      });
    };

    const copy = async (value: string, button: HTMLButtonElement, message: string) => {
      try {
        await navigator.clipboard.writeText(value);
        const before = button.getAttribute("aria-label");
        button.setAttribute("aria-label", message);
        button.title = message;
        announce(message);
        later(() => { if (before) button.setAttribute("aria-label", before); else button.removeAttribute("aria-label"); button.removeAttribute("title"); }, 1800);
      } catch { announce("Copy unavailable in this browser. Select and copy the text manually."); }
    };
    const play = async (button: HTMLButtonElement, media: HTMLMediaElement) => {
      const audio = media instanceof HTMLAudioElement;
      try {
        if (media.paused) {
          root.querySelectorAll<HTMLMediaElement>("audio, video").forEach((other) => { if (other !== media) other.pause(); });
          await media.play();
        } else media.pause();
        button.setAttribute("aria-label", `${media.paused ? "Play" : "Pause"} ${audio ? "audio" : "video"}`);
        button.setAttribute("aria-pressed", String(!media.paused));
        media.addEventListener("ended", () => {
          button.setAttribute("aria-label", `Play ${audio ? "audio" : "video"}`);
          button.setAttribute("aria-pressed", "false");
        }, { once: true, signal });
      } catch { announce("This media could not be loaded. Open the original article to try again."); }
    };
    const download = (button: HTMLButtonElement) => {
      const container = closestWith(button, "svg.marks, [role='graphics-document'] svg, canvas, img[data-reference-canvas]");
      const svg = container?.querySelector<SVGSVGElement>("svg.marks, [role='graphics-document'] svg");
      if (!svg) { announce("This chart is a captured raster figure. Its SVG source is not available in the local reference."); return; }
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const originals = [svg, ...svg.querySelectorAll("*")];
      [clone, ...clone.querySelectorAll("*")].forEach((element, index) => {
        const computed = getComputedStyle(originals[index]);
        ["fill", "stroke", "font-family", "font-size", "font-weight", "opacity"].forEach((property) => (element as SVGElement).style.setProperty(property, computed.getPropertyValue(property)));
      });
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(button.getAttribute("aria-label") ?? "chart").replace(/[^\w-]+/g, "-").slice(0,100)}.svg`;
      link.click();
      later(() => URL.revokeObjectURL(url), 1000);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || (!root.contains(target) && !target.closest("[data-reference-drawer]"))) return;
      const anchor = target.closest<HTMLAnchorElement>("nav[aria-label='Table of contents'] a[href^='#']");
      if (anchor) {
        const section = document.getElementById(decodeURIComponent(anchor.hash.slice(1)));
        if (section) { event.preventDefault(); section.scrollIntoView({ behavior: behavior(), block: "start" }); history.replaceState(null, "", anchor.hash); setTocOpen(false); }
        return;
      }
      const button = target.closest<HTMLButtonElement>("button");
      if (!button) return;
      const label = button.getAttribute("aria-label") ?? "";
      if (button === menuButton) { setMenuOpen(mobileMenu?.getAttribute("aria-hidden") !== "false"); return; }
      if (button === disclosure) { setTocOpen(disclosure.getAttribute("aria-expanded") !== "true"); return; }
      if (label === "Close table of contents") { setTocOpen(false); disclosure?.focus(); return; }
      if (text(button) === "Share") { void copy(content.url, button, "Article link copied"); return; }
      if (label === "Copy code block") {
        const code = closestWith(button, "pre")?.querySelector("pre");
        if (code) {
          const rows = [...code.querySelectorAll(":scope > div > div:last-child")];
          const value = rows.length ? rows.map((row) => row.textContent ?? "").join("\n") : code.textContent ?? "";
          void copy(value, button, "Code copied");
        }
        return;
      }
      if (label === "Next testimonial") { showTestimonial(testimonialIndex + 1); return; }
      if (label === "Previous testimonial") { showTestimonial(testimonialIndex - 1); return; }
      if (label.startsWith("Show testimonial from ")) { showTestimonial(testimonials.findIndex((state) => `Show testimonial from ${state.name}` === label)); return; }
      if (button.hasAttribute("data-dotcom-chart-action-menu-trigger")) { download(button); return; }
      if (/^(Play|Pause) (audio|video)/.test(label)) {
        const container = closestWith(button, "audio, video, iframe[src*='vimeo']");
        const media = container?.querySelector<HTMLMediaElement>("audio, video");
        if (media) { void play(button, media); return; }
        const iframe = container?.querySelector<HTMLIFrameElement>("iframe[src*='vimeo']");
        if (iframe) {
          const url = new URL(iframe.src); url.searchParams.set("autoplay", "1"); url.searchParams.set("muted", "0"); url.searchParams.set("controls", "1"); iframe.src = url.href;
          container?.querySelectorAll<HTMLButtonElement>("button[aria-label='Play video']").forEach((overlay) => { overlay.hidden = true; });
        }
        return;
      }
      if (label === "Fullscreen") { const media = closestWith(button, "video, iframe")?.querySelector<HTMLElement>("video, iframe"); void media?.requestFullscreen?.().catch(() => announce("Fullscreen is unavailable.")); return; }
      if (label === "Video Settings") { const video = closestWith(button, "video")?.querySelector("video"); if (video) video.controls = true; else announce("Playback settings are available in the video player."); return; }
      if (/^(Previous|Next) timeline item$/.test(label)) {
        const viewport = document.getElementById(button.getAttribute("aria-controls") ?? "");
        if (!viewport) return;
        const items = [...viewport.querySelectorAll<HTMLElement>("[class*='itc-card']")].filter((item) => !item.parentElement?.closest("[class*='itc-card']"));
        const cards = items.length ? items : [...viewport.querySelectorAll<HTMLElement>("section")];
        const current = Number(viewport.dataset.referenceIndex ?? "0");
        const next = Math.max(0, Math.min(cards.length - 1, current + (label.startsWith("Next") ? 1 : -1)));
        viewport.dataset.referenceIndex = String(next);
        const card = cards[next];
        if (card) viewport.scrollTo({ left: viewport.scrollLeft + card.getBoundingClientRect().left - viewport.getBoundingClientRect().left, behavior: behavior() });
        const controls = button.parentElement;
        controls?.querySelectorAll("span").forEach((span) => { span.textContent = `${next + 1} of ${cards.length}`; });
        const previous = controls?.querySelector<HTMLButtonElement>("[aria-label='Previous timeline item']");
        const following = controls?.querySelector<HTMLButtonElement>("[aria-label='Next timeline item']");
        if (previous) previous.disabled = next === 0;
        if (following) following.disabled = next === cards.length - 1;
      }
      if (/^(Accept all|Reject all|Reject non-essential|Allow all|Close cookie)/i.test(label || text(button))) button.closest<HTMLElement>("[role='dialog'], [data-testid*='cookie']")?.remove();
    };
    document.addEventListener("click", onClick, { signal });
    const highlight = (event: Event, reset: boolean) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-dotcom-chart-legend-highlight]") : null;
      if (!target) return;
      const list = target.closest("[role='list']");
      list?.querySelectorAll<HTMLElement>("[data-dotcom-chart-legend-entry]").forEach((entry) => { entry.style.opacity = reset || target.contains(entry) ? "1" : "0.3"; });
      const layerId = target.closest("[data-legend-entry-id]")?.getAttribute("data-legend-entry-id");
      target.closest("[data-conversation-map]")?.querySelectorAll<HTMLElement>("[data-conversation-map-layer]").forEach((layer) => {
        layer.style.transition = reduced.matches ? "none" : "opacity 200ms ease";
        layer.style.opacity = reset || layer.getAttribute("data-conversation-map-layer") === layerId ? "1" : "0.15";
      });
    };
    root.addEventListener("pointerover", (event) => highlight(event, false), { signal });
    root.addEventListener("pointerout", (event) => highlight(event, true), { signal });
    root.addEventListener("focusin", (event) => highlight(event, false), { signal });
    root.addEventListener("focusout", (event) => highlight(event, true), { signal });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { setTocOpen(false); if (mobileMenu?.getAttribute("aria-hidden") === "false") setMenuOpen(false); }
      if (event.key === "Tab" && mobileMenu?.getAttribute("aria-hidden") === "false") {
        const focusable = [menuButton, ...mobileMenu.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((item): item is HTMLElement => !!item);
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }, { signal });
    return () => {
      abort.abort();
      cancelAnimationFrame(scrollFrame);
      timers.forEach(clearTimeout);
      status.remove();
      root.querySelectorAll<HTMLMediaElement>("audio, video").forEach((media) => media.pause());
    };
  }, [content]);

  return <><PageTabs content={content} /><ArticleDialogs content={content} /></>;
}
