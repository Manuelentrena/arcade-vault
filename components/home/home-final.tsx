import Link from "next/link";

export function HomeFinal() {
  return (
    <section className="home-final reveal">
      <h2 className="final-title pixel">¿LISTO PARA JUGAR?</h2>
      <Link className="btn xl pulse final-cta" href="/biblioteca">
        INSERTAR MONEDA →
      </Link>
      <div className="final-tag">
        Gratis. Sin registro obligatorio. Empieza en segundos.
      </div>
    </section>
  );
}
