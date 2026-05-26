import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function NavBar() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl">
      <div className="max-w-310 mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="size-8 rounded-lg flex items-center justify-center">
            <Image
              src={"/logo.png"}
              alt="lumivox-logo"
              width={16}
              height={16}
            />
          </div>
          <span className="font-semibold tracking-tight text-[15px]">
            Lumivox
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-secondary">
          <a
            href="#features"
            className="hover:text-foreground transition-colors"
          >
            Features
          </a>
          <a href="#how" className="hover:text-foreground transition-colors">
            How it works
          </a>
          <a
            href="#analytics"
            className="hover:text-foreground transition-colors"
          >
            Analytics
          </a>
          <a
            href="#pricing"
            className="hover:text-foreground transition-colors"
          >
            Pricing
          </a>
          <a href="#faq" className="hover:text-foreground transition-colors">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/app"
            className="hidden sm:inline-flex items-center h-9 px-3 rounded-md text-[13px] font-medium text-secondary hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
          >
            Get started <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
