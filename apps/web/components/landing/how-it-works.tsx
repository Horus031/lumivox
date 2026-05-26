import { steps } from "@/lib/constants";

export default function HowItWorks() {
  return (
    <section
      id="how"
      className="relative py-24 bg-elevated/40 border-y border-border"
    >
      <div className="max-w-310 mx-auto px-6">
        <div className="max-w-2xl mb-14">
          <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
            How it works
          </p>
          <h2 className="text-[34px] md:text-[42px] font-semibold tracking-tight leading-tight">
            From scattered to focused — in three quiet steps
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.n}
                className="relative rounded-2xl border border-border bg-surface p-7 hover:shadow-md transition-shadow"
              >
                <span className="font-mono text-[12px] text-muted-foreground">
                  {s.n}
                </span>
                <div className="mt-3 size-11 rounded-xl bg-gradient-hero flex items-center justify-center text-white shadow-glow">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-5 text-[18px] font-semibold tracking-tight">
                  {s.title}
                </h3>
                <p className="mt-2 text-[14px] text-secondary leading-relaxed">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
