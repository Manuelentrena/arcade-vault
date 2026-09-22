import type { Metadata } from "next";
import { Press_Start_2P, JetBrains_Mono } from "next/font/google";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { SessionProvider } from "@/components/session-provider";
import { getServerSession } from "@/lib/supabase/session";
import "./globals.css";

const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arcade Vault",
  description: "Compite por las mejores puntuaciones en clásicos arcade.",
};

// Resolver la sesión aquí vuelve dinámicas las siete rutas. Es el precio de
// que el nav salga ya con el nombre puesto en el primer HTML.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initialUser = await getServerSession();

  return (
    <html
      lang="es"
      className={`${pressStart.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="av-bg" aria-hidden />
        <div className="av-noise" aria-hidden />
        <SessionProvider initialUser={initialUser}>
          <div className="av-shell">
            <Nav />
            <main className="av-main">{children}</main>
            <Footer />
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
