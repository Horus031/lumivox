import { features } from "@/lib/constants";

export default function Features() {
  return (
    <section id="features" className="relative py-24">
      <div className="max-w-310 mx-auto px-6">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
            Everything you need
          </p>
          <h2 className="text-[34px] md:text-[42px] font-semibold tracking-tight leading-tight">
            A study workspace that thinks{" "}
            <span className="italic text-secondary">with</span> you
          </h2>
          <p className="mt-4 text-secondary text-[15.5px] leading-relaxed">
            Six quiet superpowers, designed to remove friction from learning and
            replace it with momentum.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group relative rounded-2xl border border-border bg-surface p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="absolute inset-0 -z-10 bg-linear-to-br from-accent-soft/0 to-accent-soft/0 group-hover:from-accent-soft/60 group-hover:to-transparent transition-colors duration-500" />
                <div className="size-10 rounded-xl bg-accent-soft flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                  <Icon className="size-5" strokeWidth={2} />
                </div>
                <h3 className="text-[16px] font-semibold tracking-tight mb-1.5">
                  {f.title}
                </h3>
                <p className="text-[13.5px] text-secondary leading-relaxed">
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
