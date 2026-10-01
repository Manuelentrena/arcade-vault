import fs from "fs";
import path from "path";

export type BlogPostMeta = {
  title: string;
  date: string;
  version: string;
  bump: "Mayor" | "Menor" | "Fix";
};

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsB[i] ?? 0) - (partsA[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function getAllPosts(): Promise<BlogPostMeta[]> {
  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith(".mdx"));

  const posts = await Promise.all(
    files.map(async (file) => {
      const version = file.replace(/^v/, "").replace(/\.mdx$/, "");
      const mod = await import(`@/content/blog/v${version}.mdx`);
      return mod.metadata as BlogPostMeta;
    }),
  );

  return posts.sort((a, b) => compareVersions(a.version, b.version));
}
