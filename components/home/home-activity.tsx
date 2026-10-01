"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RecentScore, TopPlayer } from "@/lib/supabase/scores";

type Status = "idle" | "loading" | "loaded";

/** Clase de podio de la fila: sólo las tres primeras la llevan. */
function topClass(i: number): string {
  if (i === 0) return " top1";
  if (i === 1) return " top2";
  if (i === 2) return " top3";
  return "";
}

function TickerSkeleton() {
  return (
    <>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="tick-row skeleton">
          <span className="skeleton-bar" style={{ width: "40%" }} />
          <span className="skeleton-bar" style={{ width: "30%" }} />
          <span className="skeleton-bar" style={{ width: "20%" }} />
          <span className="skeleton-bar" style={{ width: "15%" }} />
        </div>
      ))}
    </>
  );
}

function TopSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="top-row skeleton">
          <span className="skeleton-bar" style={{ width: "24px" }} />
          <span className="skeleton-bar" style={{ width: "50%" }} />
          <span className="skeleton-bar" style={{ width: "30%" }} />
        </div>
      ))}
    </>
  );
}

export function HomeActivity() {
  const [status, setStatus] = useState<Status>("idle");
  const [recent, setRecent] = useState<RecentScore[]>([]);
  const [top, setTop] = useState<TopPlayer[]>([]);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        setStatus("loading");
        fetch("/api/home-activity")
          .then((res) => res.json())
          .then((data: { recent: RecentScore[]; top: TopPlayer[] }) => {
            setRecent(data.recent);
            setTop(data.top);
            setStatus("loaded");
          });
      },
      { rootMargin: "200px" },
    );
    io.observe(el);

    return () => io.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="home-section reveal">
      <div className="section-head">
        <div className="kicker pixel neon-yellow">{"// 03"}</div>
        <h2 className="section-title">ACTIVIDAD EN VIVO</h2>
        <div className="section-rule" />
      </div>
      <div className="activity-grid">
        <div className="activity-card">
          <div className="ac-head">
            <div className="ac-title pixel">▸ ÚLTIMAS PUNTUACIONES</div>
          </div>
          <div className="ticker">
            {status !== "loaded" && <TickerSkeleton />}
            {status === "loaded" && recent.length === 0 && (
              <div
                className="lb-empty"
                style={{ color: "var(--ink-faint)", padding: "24px 16px" }}
              >
                AÚN NADIE HA JUGADO
              </div>
            )}
            {status === "loaded" &&
              recent.map((r, i) => (
                <div
                  key={r.player + r.game + r.when}
                  className="tick-row"
                  style={{ animationDelay: i * 60 + "ms" }}
                >
                  <span className={"tk-p neon-" + r.color}>{r.player}</span>
                  <span className="tk-mid">▸ {r.game}</span>
                  <span className="tk-s">
                    +{r.score.toLocaleString("es-ES")}
                  </span>
                  <span className="tk-t">{r.when}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="activity-card">
          <div className="ac-head">
            <div className="ac-title pixel neon-magenta">▸ TOP JUGADORES</div>
            <Link className="lb-link" href="/salon">
              VER SALÓN →
            </Link>
          </div>
          <div className="top-list">
            {status !== "loaded" && <TopSkeleton />}
            {status === "loaded" && top.length === 0 && (
              <div
                className="lb-empty"
                style={{ color: "var(--ink-faint)", padding: "24px 16px" }}
              >
                AÚN NADIE HA JUGADO
              </div>
            )}
            {status === "loaded" &&
              top.map((r, i) => (
                <div key={r.player} className={"top-row" + topClass(i)}>
                  <span className="tp-rk">
                    #{String(r.rank).padStart(2, "0")}
                  </span>
                  <span className="tp-p">{r.player}</span>
                  <span className="tp-s">
                    {r.score.toLocaleString("es-ES")}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}
