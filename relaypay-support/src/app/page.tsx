import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import VoicePanel from "@/components/VoicePanel";
import HelpLine from "@/components/HelpLine";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="w-full max-w-[600px] mx-auto px-6 flex-1 flex flex-col">
        <Header />
        <main className="flex-1 py-10 flex flex-col gap-10">
          <HeroSection />
          <VoicePanel />
          <HelpLine />
        </main>
      </div>
      <Footer />
    </div>
  );
}
