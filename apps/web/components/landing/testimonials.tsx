import { testimonials } from "@/lib/constants";
import { Quote, Star } from "lucide-react";

export default function Testimonials() {
  return (
    <section className="py-24">
      <div className="max-w-310 mx-auto px-6">
        <div className="max-w-2xl mb-12 text-center mx-auto">
          <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
            Loved by students
          </p>
          <h2 className="text-[34px] md:text-[42px] font-semibold tracking-tight leading-tight">
            Calmer minds, sharper results
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <figure
              key={t.name}
              className="rounded-2xl border border-border bg-surface p-6 hover:shadow-md transition-shadow"
            >
              <Quote className="size-5 text-primary/60 mb-3" />
              <blockquote className="text-[14.5px] text-foreground leading-relaxed">
                {t.quote}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 pt-4 border-t border-border">
                <div className="size-9 rounded-full bg-gradient-hero flex items-center justify-center text-white text-[12px] font-semibold">
                  {t.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")}
                </div>
                <div>
                  <p className="text-[13.5px] font-medium">{t.name}</p>
                  <p className="text-[12px] text-muted-foreground">{t.role}</p>
                </div>
                <div className="ml-auto flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="size-3 fill-current text-(--warning)"
                    />
                  ))}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
