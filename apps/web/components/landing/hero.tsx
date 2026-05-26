import { ArrowRight, BarChart3, Check, Flame, Timer } from "lucide-react";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative overflow-hidden isolate">
      {/* Full-bleed motion background — palindrome video, perfectly seamless loop */}
      <div className="absolute inset-0 -z-10 bg-background">
        <video
          src={"/hero-brain-loop.mp4"}
          poster={"/landing-hero.png"}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover scale-105"
        />
        {/* Soft green light sweep */}
        <div className="pointer-events-none absolute inset-0 mix-blend-screen opacity-40">
          <div className="absolute -inset-x-1/2 -top-1/2 h-[200%] w-[200%] bg-[conic-gradient(from_120deg_at_50%_50%,transparent_0%,oklch(0.88_0.16_120/0.25)_18%,transparent_38%,transparent_62%,oklch(0.92_0.14_105/0.22)_82%,transparent_100%)] animate-shimmer-slow" />
        </div>
        {/* Subtle green tint */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,oklch(0.62_0.15_125/0.18),transparent_60%)]" />
        {/* Readability vignette */}
        <div className="absolute inset-0 bg-linear-to-b from-background/35 via-background/10 to-background/85" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at center, transparent 35%, color-mix(in oklab, var(--background) 55%, transparent) 100%)",
          }}
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.06] mask-[radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
          style={{
            backgroundImage:
              "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div className="relative max-w-310 mx-auto px-6 pt-28 pb-32 md:pt-40 md:pb-44 min-h-[88vh] flex flex-col items-center justify-center text-center">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl text-[12px] text-background/90 shadow-sm animate-fade-up">
          <span className="size-1.5 rounded-full bg-success animate-pulse-soft" />
          New · AI behavioral coach in beta
        </span>

        {/* Glassmorphic title plate */}
        <div className="relative mt-6 animate-fade-up [animation-delay:80ms]">
          <div className="absolute -inset-x-10 -inset-y-6 rounded-[40px] bg-white/10 backdrop-blur-2xl border border-white/15 shadow-[0_30px_80px_-20px_oklch(0_0_0/0.5)] mask-[linear-gradient(180deg,black_60%,transparent_100%)]" />
          <h1 className="relative px-6 py-4 text-[44px] md:text-[78px] font-semibold tracking-tight leading-[1.02] text-white drop-shadow-[0_2px_24px_oklch(0_0_0/0.45)]">
            Study with{" "}
            <span className="bg-linear-to-r from-white to-primary bg-clip-text text-transparent">
              calm intelligence
            </span>
            .
          </h1>
        </div>

        <p className="relative mt-7 max-w-160 text-[16.5px] md:text-[18px] text-background/80 leading-relaxed animate-fade-up [animation-delay:160ms]">
          Lumivox turns your everyday focus, tasks and habits into a personal
          learning signal — then quietly recommends the next best step. Built
          for students who want to grow without burning out.
        </p>

        <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3 animate-fade-up [animation-delay:240ms]">
          <Link
            href="/auth/sign-up"
            className="group inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-white text-[oklch(0.145_0.01_270)] text-[14.5px] font-medium hover:bg-white/90 transition-all shadow-[0_10px_40px_-10px_oklch(0.7_0.18_277/0.6)]"
          >
            Start focusing free
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#how"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-xl border border-white/20 bg-white/10 backdrop-blur-xl text-[14.5px] font-medium text-white hover:bg-white/15 transition-colors"
          >
            See how it works
          </a>
        </div>

        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] text-white/70 animate-fade-up [animation-delay:320ms]">
          <span className="flex items-center gap-1.5">
            <Check className="size-3.5 text-success" /> Free forever plan
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-3.5 text-success" /> No card required
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-3.5 text-success" /> Private by default
          </span>
        </div>

        {/* Floating glass stat cards */}
        <div className="pointer-events-none hidden md:block">
          <div className="absolute left-4 lg:left-10 top-[28%] px-3.5 py-2.5 rounded-2xl bg-white/12 backdrop-blur-xl border border-white/20 shadow-lg text-[12px] flex items-center gap-2.5 text-foreground animate-float">
            <div className="size-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-[12px]">
              ✦
            </div>
            <div className="text-left">
              <p className="font-medium leading-tight">AI suggested</p>
              <p className="text-[10.5px] text-foreground/70">
                Deep work · 25 min
              </p>
            </div>
          </div>
          <div className="absolute right-4 lg:right-10 top-[34%] px-3.5 py-2.5 rounded-2xl bg-white/12 backdrop-blur-xl border border-white/20 shadow-lg text-[12px] flex items-center gap-2.5 text-foreground animate-float [animation-delay:-2s]">
            <Timer className="size-4 " />
            <div className="text-left">
              <p className="font-medium leading-tight font-mono">24:32</p>
              <p className="text-[10.5px] text-foreground/70">In focus</p>
            </div>
          </div>
          <div className="absolute left-8 lg:left-16 bottom-[18%] px-3.5 py-2.5 rounded-2xl bg-white/12 backdrop-blur-xl border border-white/20 shadow-lg text-[12px] flex items-center gap-2.5 text-foreground animate-float [animation-delay:-4s]">
            <Flame className="size-4" style={{ color: "var(--streak-fire)" }} />
            <div className="text-left">
              <p className="font-medium leading-tight">12-day streak</p>
              <p className="text-[10.5px] text-foreground/70">
                +3 tokens earned
              </p>
            </div>
          </div>
          <div className="absolute right-8 lg:right-16 bottom-[20%] px-3.5 py-2.5 rounded-2xl bg-white/12 backdrop-blur-xl border border-white/20 shadow-lg text-[12px] flex items-center gap-2.5 text-foreground animate-float [animation-delay:-3s]">
            <BarChart3 className="size-4" />
            <div className="text-left">
              <p className="font-medium leading-tight">+18% this week</p>
              <p className="text-[10.5px] text-foreground/70">Consistency</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trusted by */}
      <div className="relative max-w-310 mx-auto px-6 pb-16">
        <p className="text-center text-[11.5px] font-medium tracking-[0.18em] text-muted-foreground uppercase mb-6">
          Trusted by curious learners from
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
          {[
            "Stanford",
            "RMIT",
            "MIT Media Lab",
            "FPT University",
            "NUS",
            "ETH Zürich",
          ].map((u) => (
            <span
              key={u}
              className="text-[14px] font-semibold tracking-tight text-secondary"
            >
              {u}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
