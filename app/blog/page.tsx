import Link from "next/link";
import { getAllPosts } from "@/lib/blog";

export default async function BlogPage() {
  const posts = await getAllPosts();

  return (
    <div className="home-section fade-in">
      <div className="section-head">
        <span className="kicker neon-cyan">NOVEDADES</span>
        <h1 className="section-title">BLOG DE CAMBIOS</h1>
        <div className="section-rule" />
      </div>

      <div className="av-grid">
        {posts.map((post) => (
          <Link
            key={post.version}
            className="card"
            href={`/blog/v${post.version}`}
          >
            <div className="meta">
              <span className="chip">v{post.version}</span>
              <h2 className="title">{post.title}</h2>
              <p className="desc">{post.date}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
