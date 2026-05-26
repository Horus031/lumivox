import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

async function getCurrentYear() {
  "use cache";
  return new Date().getFullYear();
}

export default async function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="max-w-310 mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="size-7 rounded-md bg-gradient-hero flex items-center justify-center">
              <Sparkles className="size-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold tracking-tight">Lumivox</span>
          </div>
          <p className="text-[13.5px] text-secondary max-w-sm leading-relaxed">
            Calm intelligence for your study — behavioral analytics and AI
            recommendations for the next generation of learners.
          </p>
        </div>
        <div>
          <p className="text-[12px] font-semibold tracking-wider uppercase text-muted-foreground mb-3">
            Product
          </p>
          <ul className="space-y-2 text-[13.5px] text-secondary">
            <li>
              <a href="#features" className="hover:text-foreground">
                Features
              </a>
            </li>
            <li>
              <a href="#analytics" className="hover:text-foreground">
                Analytics
              </a>
            </li>
            <li>
              <a href="#pricing" className="hover:text-foreground">
                Pricing
              </a>
            </li>
            <li>
              <Link href="/app" className="hover:text-foreground">
                Open app
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-semibold tracking-wider uppercase text-muted-foreground mb-3">
            Company
          </p>
          <ul className="space-y-2 text-[13.5px] text-secondary">
            <li>
              <a href="#" className="hover:text-foreground">
                About
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-foreground">
                Privacy
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-foreground">
                Terms
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-foreground">
                Contact
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-310 mx-auto px-6 py-5 text-[12px] text-muted-foreground flex flex-col sm:flex-row gap-2 justify-between">
          <Suspense fallback={<span>...</span>}>
            <span>
              © {await getCurrentYear()} Lumivox. All rights reserved.
            </span>
          </Suspense>
          <span>Made calmly, with care.</span>
        </div>
      </div>
    </footer>
  );
}
