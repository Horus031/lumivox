import { faqs } from "@/lib/constants";

export default function FAQ() {
  return (
    <section id="faq" className="py-24">
      <div className="max-w-215 mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
            FAQ
          </p>
          <h2 className="text-[34px] md:text-[42px] font-semibold tracking-tight">
            Questions, answered
          </h2>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {faqs.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <h3 className="text-[15.5px] font-medium pr-6">{f.q}</h3>
                <span className="size-7 rounded-full border border-border flex items-center justify-center text-secondary group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[14px] text-secondary leading-relaxed">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
