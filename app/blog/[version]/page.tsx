import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts } from "@/lib/blog";

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ version: `v${post.version}` }));
}

export const dynamicParams = false;

export default async function BlogPostPage(
  props: PageProps<"/blog/[version]">,
) {
  const { version } = await props.params;
  const posts = await getAllPosts();
  const meta = posts.find((post) => `v${post.version}` === version);
  if (!meta) notFound();

  const { default: Post } = await import(`@/content/blog/${version}.mdx`);

  return (
    <article className="home-section fade-in blog-post">
      <div className="section-head">
        <span className="kicker neon-cyan">v{meta.version}</span>
        <span className="chip">{meta.date}</span>
        <div className="section-rule" />
      </div>

      <Post />

      <div className="detail-actions">
        <Link className="btn ghost lg" href="/blog">
          VOLVER AL BLOG
        </Link>
      </div>
    </article>
  );
}
