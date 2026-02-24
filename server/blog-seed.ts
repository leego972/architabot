import { getDb } from "./db";
import { blogPosts, blogCategories } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import seedData from "./blog-seed-data.json";
import { createLogger } from "./_core/logger.js";
import { getErrorMessage } from "./_core/errors.js";
const log = createLogger("BlogSeed");

interface SeedPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  focusKeyword: string;
  tags: string[];
  secondaryKeywords: string[];
  metaTitle: string;
  metaDescription: string;
  content: string;
}

/**
 * Auto-seed blog posts on server startup.
 * Only inserts posts that don't already exist (by slug).
 * Returns the number of newly inserted posts.
 */
export async function seedBlogPosts(): Promise<number> {
  const db = await getDb();
  if (!db) {
    log.info("[BlogSeed] DB not available, skipping");
    return 0;
  }

  const posts = seedData as SeedPost[];
  let inserted = 0;

  for (const post of posts) {
    try {
      // Check if post already exists
      const existing = await db
        .select({ id: blogPosts.id })
        .from(blogPosts)
        .where(eq(blogPosts.slug, post.slug))
        .limit(1);

      if (existing.length > 0) continue;

      const wordCount = post.content.split(/\s+/).length;
      const readingTime = Math.ceil(wordCount / 200);

      // Calculate basic SEO score
      let seoScore = 50;
      if (post.metaTitle && post.metaTitle.length <= 60) seoScore += 10;
      if (post.metaDescription && post.metaDescription.length <= 160) seoScore += 10;
      if (post.focusKeyword && post.content.toLowerCase().includes(post.focusKeyword.toLowerCase())) seoScore += 10;
      if (post.tags && post.tags.length >= 3) seoScore += 5;
      if (wordCount >= 1000) seoScore += 10;
      if (post.excerpt) seoScore += 5;

      await db.insert(blogPosts).values({
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        category: post.category,
        tags: post.tags,
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        focusKeyword: post.focusKeyword,
        secondaryKeywords: post.secondaryKeywords,
        seoScore,
        readingTimeMinutes: readingTime,
        status: "published",
        publishedAt: new Date(),
      });

      inserted++;
    } catch (err: unknown) {
      // Skip duplicates silently
      if ((err as any)?.code === "ER_DUP_ENTRY") continue;
      log.error(`[BlogSeed] Failed to insert "${post.slug}":`, { error: getErrorMessage(err) });
    }
  }

  // Ensure categories exist
  if (inserted > 0) {
    const categories = [...new Set(posts.map(p => p.category))];
    for (const cat of categories) {
      try {
        const name = cat.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
        const existing = await db
          .select()
          .from(blogCategories)
          .where(eq(blogCategories.slug, cat))
          .limit(1);

        if (existing.length === 0) {
          // Count posts in this category
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(blogPosts)
            .where(eq(blogPosts.category, cat));

          await db.insert(blogCategories).values({
            name,
            slug: cat,
            postCount: count,
          });
        } else {
          // Update post count
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(blogPosts)
            .where(eq(blogPosts.category, cat));

          await db
            .update(blogCategories)
            .set({ postCount: count })
            .where(eq(blogCategories.slug, cat));
        }
      } catch (err: unknown) {
        // Ignore category errors
      }
    }
  }

  return inserted;
}
