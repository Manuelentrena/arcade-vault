import { AboutDivider } from "@/components/about/about-divider";
import { AboutHero } from "@/components/about/about-hero";
import { ContactSection } from "@/components/about/contact-section";

export default function Acerca() {
  return (
    <div className="about fade-in">
      <AboutHero />
      <AboutDivider />
      <ContactSection />
    </div>
  );
}
