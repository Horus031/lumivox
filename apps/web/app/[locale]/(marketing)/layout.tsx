import Footer from "@/components/landing/footer";
import NavBar from "@/components/landing/navbar";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />

      <main>{children}</main>

      <Footer />
    </div>
  );
}