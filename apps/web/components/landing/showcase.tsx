import { Check } from "lucide-react";
// import Image from "next/image";

export default function Showcase() {
  return (
    <section id="analytics" className="py-24">
      <div className="max-w-310 mx-auto px-6 space-y-24">
        {/* Row 1 — Analytics */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
              Analytics
            </p>
            <h3 className="text-[30px] md:text-[36px] font-semibold tracking-tight leading-tight">
              Patterns you can finally see
            </h3>
            <p className="mt-4 text-secondary text-[15px] leading-relaxed">
              A 12-week consistency heatmap, focus distribution by task type,
              and weekly KPIs — all calm, all readable. No vanity charts.
            </p>
            <ul className="mt-6 space-y-3 text-[14px]">
              {[
                "Discover your peak focus hours",
                "Spot subjects that drain or energize you",
                "Track streaks, shields, and tokens earned",
              ].map((t) => (
                <li
                  key={t}
                  className="flex items-center gap-2.5 text-secondary"
                >
                  <span className="size-5 rounded-full bg-success/15 text-success flex items-center justify-center">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          {/* <div className="relative rounded-3xl border border-border bg-surface overflow-hidden shadow-lg">
            <Image
              src={"/landing-analytics.jpg"}
              alt="Analytics preview"
              loading="lazy"
              width={1280}
              height={960}
              className="w-full h-auto"
            />
          </div> */}
        </div>

        {/* Row 2 — Focus */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="lg:order-2">
            <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
              Focus session
            </p>
            <h3 className="text-[30px] md:text-[36px] font-semibold tracking-tight leading-tight">
              A timer that respects your attention
            </h3>
            <p className="mt-4 text-secondary text-[15px] leading-relaxed">
              Immersive dark mode, breath-paced rings, and soft cues to start
              and end without shock.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Pomodoro", "Deep work", "Custom", "Reading"].map((t) => (
                <span
                  key={t}
                  className="px-3 py-1.5 rounded-full border border-border bg-surface text-[12.5px] text-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          {/* <div className="relative rounded-3xl border border-border bg-surface overflow-hidden shadow-lg lg:order-1">
            <Image
              src={"/landing-focus.jpg"}
              alt="Focus session preview"
              loading="lazy"
              width={1280}
              height={960}
              className="w-full h-auto"
            />
          </div> */}
        </div>

        {/* Row 3 — Study room */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
              Study rooms
            </p>
            <h3 className="text-[30px] md:text-[36px] font-semibold tracking-tight leading-tight">
              Quietly study — together
            </h3>
            <p className="mt-4 text-secondary text-[15px] leading-relaxed">
              Drop into Calm Forest, Midnight Mode or Library Quiet. See others
              focusing in real time, cheer with reactions, never feel alone at 2
              AM again.
            </p>
          </div>
          {/* <div className="relative rounded-3xl border border-border bg-surface overflow-hidden shadow-lg">
            <Image
              src={"/landing-room.jpg"}
              alt="Study rooms preview"
              loading="lazy"
              width={1280}
              height={960}
              className="w-full h-auto"
            />
          </div> */}
        </div>
      </div>
    </section>
  );
}
