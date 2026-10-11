"use client";

import { useEffect, useRef } from "react";

export function AuthWatercolor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 767px)");
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    let stopped = false;
    let frame = 0;
    let timer = 0;
    let idle = 0;
    let time = 30.44;
    let last = performance.now();
    let engine: typeof import("./watercolor-engine") | undefined;
    const stop = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
    const draw = (now: number) => {
      if (stopped || document.hidden || !engine) return;
      time += (Math.min(now - last, 100) / 1000) * 0.12;
      last = now;
      try {
        if (
          !engine.paintWatercolor(
            canvas,
            time,
            document.documentElement.classList.contains("dark"),
          )
        )
          return;
      } catch {
        delete canvas.dataset.ready;
        return;
      }
      canvas.dataset.ready = "true";
      if (motion.matches || connection?.saveData) return;
      timer = window.setTimeout(
        () => {
          frame = requestAnimationFrame(draw);
        },
        1000 / (mobile.matches ? 12 : 20),
      );
    };
    const resume = () => {
      stop();
      last = performance.now();
      if (!document.hidden && !stopped) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(
        1,
        (mobile.matches ? 400 : 720) / Math.max(1, bounds.width, bounds.height),
      );
      canvas.width = Math.max(1, Math.round(bounds.width * scale));
      canvas.height = Math.max(1, Math.round(bounds.height * scale));
      resume();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const themeObserver = new MutationObserver(resume);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    document.addEventListener("visibilitychange", resume);
    motion.addEventListener("change", resume);
    const load = () => {
      void import("./watercolor-engine")
        .then((module) => {
          if (stopped) return;
          engine = module;
          resize();
        })
        .catch(() => {
          /* The CSS wash remains visible if loading fails. */
        });
    };
    const loadTimer = window.setTimeout(() => {
      if (window.requestIdleCallback)
        idle = window.requestIdleCallback(load, { timeout: 1500 });
      else load();
    }, 600);
    return () => {
      stopped = true;
      stop();
      window.clearTimeout(loadTimer);
      if (idle) window.cancelIdleCallback?.(idle);
      observer.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", resume);
      motion.removeEventListener("change", resume);
      engine?.releaseWatercolor();
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="auth-watercolor" aria-hidden="true" />
  );
}
