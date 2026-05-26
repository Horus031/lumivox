import CTA from "@/components/landing/cta";
import FAQ from "@/components/landing/faq";
import Features from "@/components/landing/features";
import Hero from "@/components/landing/hero";
import HowItWorks from "@/components/landing/how-it-works";
import NavBar from "@/components/landing/navbar";
import Pricing from "@/components/landing/pricing";
import Showcase from "@/components/landing/showcase";
import Stats from "@/components/landing/stats";
import Testimonials from "@/components/landing/testimonials";
import { Footer } from "react-day-picker";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Showcase />
        <Stats />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
