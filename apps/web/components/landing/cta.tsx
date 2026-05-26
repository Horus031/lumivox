import { ArrowRight, Flame, ShieldCheck, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

export default function CTA() {
  return (
    <section className="py-24">
      <div className="max-w-310 mx-auto px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-hero text-primary-foreground p-10 md:p-16 text-center">
          <div
            className="pointer-events-none absolute inset-0 opacity-30 mask-[radial-gradient(ellipse_at_center,black,transparent_70%)]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)",
              backgroundSize: "40px 40px, 60px 60px",
            }}
          />
          <Sparkles className="size-7 mx-auto mb-4 opacity-90" />
          <h2 className="text-[32px] md:text-[44px] font-semibold tracking-tight leading-tight max-w-2xl mx-auto">
            Make your next study session your best one.
          </h2>
          <p className="mt-3 text-[15px] opacity-90 max-w-xl mx-auto">
            Join thousands of students using Lumivox to focus deeper, plan
            smarter, and finally feel proud of their week.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-white text-primary text-[14px] font-semibold hover:bg-white/95 transition-colors"
            >
              Get started free <ArrowRight className="size-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center h-11 px-5 rounded-lg border border-white/30 text-[14px] font-medium hover:bg-white/10 transition-colors"
            >
              Explore features
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-5 text-[12.5px] opacity-85">
            <span className="flex items-center gap-1.5">
              <Zap className="size-3.5" /> 60-second setup
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" /> Privacy-first
            </span>
            <span className="flex items-center gap-1.5">
              <Flame className="size-3.5" /> Loved by 47k+ students
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
