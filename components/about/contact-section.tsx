import { ContactForm } from "@/components/about/contact-form";

export function ContactSection() {
  return (
    <section className="about-contact reveal">
      <div className="contact-grid">
        <div className="contact-intro">
          <div className="kicker pixel neon-cyan">▸ CONTACTO</div>
          <h2 className="contact-title">CONTÁCTANOS</h2>
          <p className="contact-sub">
            ¿Tienes alguna sugerencia, quieres proponer un juego, o simplemente
            quieres saludar? Escríbenos.
          </p>
          <div className="contact-tips">
            <div className="tip">
              <span className="tip-led" />
              RESPUESTA EN 24-48H
            </div>
            <div className="tip">
              <span className="tip-led y" />
              SUGERENCIAS BIENVENIDAS
            </div>
            <div className="tip">
              <span className="tip-led m" />
              SIN SPAM, JAMÁS
            </div>
          </div>
        </div>

        <ContactForm />
      </div>
    </section>
  );
}
