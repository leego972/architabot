/**
 * Universal Deep Content Scraper v2.0
 *
 * Maximizes content extraction from any website type with a strong focus on retail/e-commerce.
 * Auto-detects site type and applies industry-specific extraction strategies:
 *
 * - RETAIL / E-COMMERCE: Products, prices, sizes, colors, SKUs, images, categories, variants
 * - REAL ESTATE: Listings (sale + rental), bedrooms, bathrooms, sqft, price, photos, agents
 * - RESTAURANTS: Menus, dishes, prices, categories, photos, hours, locations
 * - JOB BOARDS: Job listings, titles, companies, salaries, locations, descriptions
 * - NEWS / BLOGS: Articles, headlines, authors, dates, content, featured images
 * - DIRECTORIES / SERVICES: Business listings, contact info, services, reviews
 * - GENERIC: All visible content, links, images, structured data
 *
 * Designed for security professionals who need maximum site replication fidelity.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type SiteType = "retail" | "realestate" | "restaurant" | "jobboard" | "news" | "directory" | "generic";

export interface ScrapedProduct {
  name: string;
  description: string;
  price: string;
  originalPrice?: string;
  currency: string;
  category: string;
  subcategory?: string;
  images: string[];
  sizes?: string[];
  colors?: string[];
  sku?: string;
  url: string;
  inStock?: boolean;
  rating?: string;
  reviewCount?: number;
  brand?: string;
  tags?: string[];
}

export interface ScrapedListing {
  title: string;
  description: string;
  price: string;
  priceType?: string; // "sale" | "rent" | "per_month" | "per_night"
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  lotSize?: string;
  yearBuilt?: number;
  propertyType?: string; // "house" | "condo" | "apartment" | "land" | "commercial"
  listingType?: string; // "for_sale" | "for_rent" | "sold" | "pending"
  mlsNumber?: string;
  agent?: string;
  agentPhone?: string;
  images: string[];
  url: string;
  amenities?: string[];
  openHouse?: string;
  hoaFees?: string;
}

export interface ScrapedMenuItem {
  name: string;
  description: string;
  price: string;
  category: string;
  image?: string;
  dietary?: string[]; // "vegetarian", "vegan", "gluten-free"
  spicy?: boolean;
}

export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  salary?: string;
  type?: string; // "full-time", "part-time", "contract"
  description: string;
  url: string;
  postedDate?: string;
}

export interface ScrapedArticle {
  title: string;
  author?: string;
  date?: string;
  excerpt: string;
  content?: string;
  image?: string;
  category?: string;
  url: string;
  tags?: string[];
}

export interface ScrapedCategory {
  name: string;
  url: string;
  productCount: number;
  subcategories?: Array<{ name: string; url: string }>;
}

export interface DownloadedImage {
  originalUrl: string;
  localPath: string;
  associatedName: string;
  imageBuffer: Buffer;
  contentType: string;
}

export interface CatalogResult {
  siteType: SiteType;
  products: ScrapedProduct[];
  listings: ScrapedListing[];
  menuItems: ScrapedMenuItem[];
  jobs: ScrapedJob[];
  articles: ScrapedArticle[];
  categories: ScrapedCategory[];
  totalProductsFound: number;
  totalImagesFound: number;
  pagesScraped: number;
  downloadedImages: DownloadedImage[];
  siteMetadata: {
    title: string;
    description: string;
    logo?: string;
    phone?: string;
    email?: string;
    address?: string;
    socialLinks: string[];
    hours?: string;
  };
}

// ─── User Agent Pool ────────────────────────────────────────────────

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Fetch with retry and anti-detection ────────────────────────────

async function fetchWithRetry(
  url: string,
  options?: { maxRetries?: number; delayMs?: number; timeoutMs?: number }
): Promise<string | null> {
  const { maxRetries = 3, delayMs = 400, timeoutMs = 20000 } = options || {};

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff with jitter
        const jitter = Math.random() * 500;
        await new Promise(r => setTimeout(r, delayMs * Math.pow(1.5, attempt) + jitter));
      }
      const resp = await fetch(url, {
        headers: {
          "User-Agent": randomUA(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          Referer: new URL(url).origin + "/",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      if (resp.status === 429) {
        // Rate limited — wait longer
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
        continue;
      }
      if (!resp.ok) continue;
      return await resp.text();
    } catch {
      continue;
    }
  }
  return null;
}

// ─── Auto-detect site type ──────────────────────────────────────────

function detectSiteType(html: string, url: string): SiteType {
  const lower = html.toLowerCase();
  const urlLower = url.toLowerCase();

  // Score each type
  const scores: Record<SiteType, number> = {
    retail: 0, realestate: 0, restaurant: 0,
    jobboard: 0, news: 0, directory: 0, generic: 0,
  };

  // RETAIL signals
  if (lower.includes("add to cart") || lower.includes("add to bag")) scores.retail += 5;
  if (lower.includes("\"@type\":\"product\"") || lower.includes("'@type':'product'")) scores.retail += 5;
  if (lower.includes("product-card") || lower.includes("product-tile") || lower.includes("product-grid")) scores.retail += 4;
  if (/\$[\d,]+\.\d{2}/.test(lower) || /£[\d,]+\.\d{2}/.test(lower) || /€[\d,]+\.\d{2}/.test(lower)) scores.retail += 3;
  if (lower.includes("shop now") || lower.includes("buy now") || lower.includes("free shipping")) scores.retail += 3;
  if (lower.includes("size guide") || lower.includes("size chart") || lower.includes("select size")) scores.retail += 3;
  if (lower.includes("checkout") || lower.includes("shopping cart") || lower.includes("wishlist")) scores.retail += 2;
  if (urlLower.includes("shop") || urlLower.includes("store")) scores.retail += 2;
  if (lower.includes("collection") || lower.includes("catalog")) scores.retail += 2;
  if (lower.includes("sku") || lower.includes("product-id") || lower.includes("item-number")) scores.retail += 2;

  // REAL ESTATE signals
  if (lower.includes("bedroom") || lower.includes("bathroom") || lower.includes("sq ft") || lower.includes("sqft")) scores.realestate += 5;
  if (lower.includes("for sale") || lower.includes("for rent") || lower.includes("listing")) scores.realestate += 3;
  if (lower.includes("mls") || lower.includes("realtor") || lower.includes("real estate")) scores.realestate += 4;
  if (lower.includes("property type") || lower.includes("lot size") || lower.includes("year built")) scores.realestate += 4;
  if (lower.includes("open house") || lower.includes("schedule a tour") || lower.includes("virtual tour")) scores.realestate += 3;
  if (lower.includes("mortgage") || lower.includes("hoa") || lower.includes("home value")) scores.realestate += 2;
  if (urlLower.includes("realty") || urlLower.includes("homes") || urlLower.includes("property") || urlLower.includes("zillow") || urlLower.includes("realtor")) scores.realestate += 4;

  // RESTAURANT signals
  if (lower.includes("menu") && (lower.includes("appetizer") || lower.includes("entrée") || lower.includes("entree") || lower.includes("dessert"))) scores.restaurant += 5;
  if (lower.includes("order online") || lower.includes("delivery") || lower.includes("takeout") || lower.includes("dine-in")) scores.restaurant += 3;
  if (lower.includes("reservation") || lower.includes("book a table")) scores.restaurant += 3;
  if (lower.includes("gluten-free") || lower.includes("vegetarian") || lower.includes("vegan")) scores.restaurant += 2;
  if (urlLower.includes("restaurant") || urlLower.includes("menu") || urlLower.includes("food")) scores.restaurant += 3;

  // JOB BOARD signals
  if (lower.includes("apply now") || lower.includes("job description") || lower.includes("job listing")) scores.jobboard += 4;
  if (lower.includes("full-time") || lower.includes("part-time") || lower.includes("remote work")) scores.jobboard += 3;
  if (lower.includes("salary") || lower.includes("compensation") || lower.includes("benefits")) scores.jobboard += 2;
  if (urlLower.includes("careers") || urlLower.includes("jobs") || urlLower.includes("hiring")) scores.jobboard += 3;

  // NEWS signals
  if (lower.includes("published") || lower.includes("by author") || lower.includes("read more")) scores.news += 2;
  if (lower.includes("\"@type\":\"article\"") || lower.includes("\"@type\":\"newsarticle\"")) scores.news += 4;
  if (lower.includes("breaking news") || lower.includes("latest news") || lower.includes("trending")) scores.news += 3;
  if (urlLower.includes("news") || urlLower.includes("blog") || urlLower.includes("magazine")) scores.news += 3;

  // DIRECTORY signals
  if (lower.includes("business listing") || lower.includes("find a") || lower.includes("directory")) scores.directory += 3;
  if (lower.includes("reviews") && lower.includes("rating") && lower.includes("phone")) scores.directory += 3;

  // Find highest score
  let maxScore = 0;
  let detected: SiteType = "generic";
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detected = type as SiteType;
    }
  }

  // Minimum threshold
  return maxScore >= 3 ? detected : "generic";
}

// ─── Extract ALL images from HTML (including lazy-loaded) ───────────

function extractAllImages(html: string, baseUrl: string): string[] {
  const images = new Set<string>();
  const baseOrigin = new URL(baseUrl).origin;

  function resolveUrl(src: string): string | null {
    if (!src || src.startsWith("data:") || src.length < 5) return null;
    if (src.startsWith("//")) return "https:" + src;
    if (src.startsWith("/")) return baseOrigin + src;
    if (src.startsWith("http")) return src;
    return baseOrigin + "/" + src;
  }

  // Standard <img src>
  const imgSrcRegex = /<img[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgSrcRegex.exec(html)) !== null) {
    const url = resolveUrl(match[1]);
    if (url) images.add(url);
  }

  // Lazy-loaded: data-src, data-lazy-src, data-original, data-image, data-bg
  const lazySrcRegex = /data-(?:src|lazy-src|original|image|srcset|lazy|bg|background|hi-res|zoom|full|large)=["']([^"']+)["']/gi;
  while ((match = lazySrcRegex.exec(html)) !== null) {
    const val = match[1];
    if (val.includes(",")) {
      for (const part of val.split(",")) {
        const url = resolveUrl(part.trim().split(/\s+/)[0]);
        if (url) images.add(url);
      }
    } else {
      const url = resolveUrl(val.trim().split(/\s+/)[0]);
      if (url) images.add(url);
    }
  }

  // <source srcset> (picture element)
  const sourceSrcsetRegex = /<source[^>]*\bsrcset=["']([^"']+)["'][^>]*>/gi;
  while ((match = sourceSrcsetRegex.exec(html)) !== null) {
    for (const part of match[1].split(",")) {
      const url = resolveUrl(part.trim().split(/\s+/)[0]);
      if (url) images.add(url);
    }
  }

  // <img srcset>
  const imgSrcsetRegex = /<img[^>]*\bsrcset=["']([^"']+)["'][^>]*>/gi;
  while ((match = imgSrcsetRegex.exec(html)) !== null) {
    for (const part of match[1].split(",")) {
      const url = resolveUrl(part.trim().split(/\s+/)[0]);
      if (url) images.add(url);
    }
  }

  // CSS background-image
  const bgRegex = /background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    const url = resolveUrl(match[1]);
    if (url) images.add(url);
  }

  // Open Graph and Twitter Card images
  const ogRegex = /<meta[^>]*(?:property|name)=["'](?:og:image|twitter:image)[^"']*["'][^>]*content=["']([^"']+)["']/gi;
  while ((match = ogRegex.exec(html)) !== null) {
    const url = resolveUrl(match[1]);
    if (url) images.add(url);
  }

  // Filter out tracking pixels, icons, and tiny images
  return Array.from(images).filter(url => {
    const lower = url.toLowerCase();
    if (lower.includes("pixel") || lower.includes("tracking") || lower.includes("analytics")) return false;
    if (lower.includes("favicon") || lower.includes(".ico") || lower.includes("spinner")) return false;
    if (lower.match(/\b1x1\b/) || lower.match(/\bspacer\b/) || lower.match(/\btransparent\b/)) return false;
    if (lower.match(/\blogo\b/) && lower.match(/\bfacebook\b|\btwitter\b|\binstagram\b|\bgoogle\b/)) return false;
    return true;
  });
}

// ─── Extract site metadata ──────────────────────────────────────────

function extractSiteMetadata(html: string, url: string): CatalogResult["siteMetadata"] {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);

  // Logo
  const logoMatch = html.match(/<link[^>]*rel=["'](?:icon|apple-touch-icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<img[^>]*class=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i);
  let logo = logoMatch ? logoMatch[1] : undefined;
  if (logo && logo.startsWith("/")) logo = new URL(url).origin + logo;

  // Phone
  const phoneMatch = html.match(/(?:tel:|phone|call)[^"']*["']?\s*:?\s*([\+\d\s\-\(\)]{7,20})/i)
    || html.match(/href=["']tel:([^"']+)["']/i);

  // Email
  const emailMatch = html.match(/href=["']mailto:([^"']+)["']/i)
    || html.match(/[\w.+-]+@[\w-]+\.[\w.]+/);

  // Address
  const addressMatch = html.match(/<address[^>]*>([\s\S]*?)<\/address>/i);

  // Social links
  const socialLinks: string[] = [];
  const socialRegex = /href=["'](https?:\/\/(?:www\.)?(?:facebook|twitter|x|instagram|linkedin|youtube|tiktok|pinterest)\.com[^"']*)["']/gi;
  let match;
  while ((match = socialRegex.exec(html)) !== null) {
    if (!socialLinks.includes(match[1])) socialLinks.push(match[1]);
  }

  // Hours
  const hoursMatch = html.match(/(?:hours|open|schedule)[^<]*(?:<[^>]*>)*\s*((?:mon|tue|wed|thu|fri|sat|sun|daily|weekday)[^<]{5,100})/i);

  return {
    title: (ogTitleMatch?.[1] || titleMatch?.[1] || "").replace(/<[^>]*>/g, "").trim(),
    description: (descMatch?.[1] || "").trim(),
    logo,
    phone: phoneMatch ? phoneMatch[1].trim() : undefined,
    email: emailMatch ? emailMatch[0].replace("mailto:", "").trim() : undefined,
    address: addressMatch ? addressMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : undefined,
    socialLinks,
    hours: hoursMatch ? hoursMatch[1].trim() : undefined,
  };
}

// ─── Extract structured data from JSON-LD ───────────────────────────

function extractJsonLdProducts(html: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const items = data["@graph"] || (Array.isArray(data) ? data : [data]);

      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"] === "IndividualProduct") {
          const offers = item.offers || item.offer || {};
          const offerList = Array.isArray(offers) ? offers : [offers];
          const mainOffer = offerList[0] || {};

          products.push({
            name: item.name || "",
            description: (item.description || "").substring(0, 1000),
            price: mainOffer.price || mainOffer.lowPrice || "",
            originalPrice: mainOffer.highPrice || undefined,
            currency: mainOffer.priceCurrency || "USD",
            category: item.category || "",
            images: Array.isArray(item.image) ? item.image : (item.image ? [item.image] : []),
            sku: item.sku || item.productID || item.gtin13 || item.gtin12 || "",
            url: item.url || "",
            inStock: mainOffer.availability?.includes("InStock") ?? true,
            rating: item.aggregateRating?.ratingValue?.toString() || "",
            reviewCount: parseInt(item.aggregateRating?.reviewCount) || 0,
            brand: item.brand?.name || item.brand || "",
            sizes: offerList.length > 1 ? offerList.map((o: any) => o.name || o.sku || "").filter(Boolean) : undefined,
            colors: item.color ? [item.color] : undefined,
            tags: [],
          });
        }

        // Handle ItemList (collection pages)
        if (item["@type"] === "ItemList" && item.itemListElement) {
          for (const listItem of item.itemListElement) {
            const product = listItem.item || listItem;
            if (product.name) {
              products.push({
                name: product.name,
                description: (product.description || "").substring(0, 1000),
                price: product.offers?.price || product.offers?.lowPrice || "",
                currency: product.offers?.priceCurrency || "USD",
                category: "",
                images: Array.isArray(product.image) ? product.image : (product.image ? [product.image] : []),
                url: product.url || listItem.url || "",
                brand: product.brand?.name || "",
                tags: [],
              });
            }
          }
        }
      }
    } catch {
      // Skip invalid JSON-LD
    }
  }

  return products;
}

// ─── Extract JSON-LD for real estate, restaurants, jobs, articles ────

function extractJsonLdListings(html: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const items = data["@graph"] || (Array.isArray(data) ? data : [data]);

      for (const item of items) {
        if (item["@type"] === "RealEstateListing" || item["@type"] === "Residence" || item["@type"] === "Apartment" || item["@type"] === "House") {
          listings.push({
            title: item.name || "",
            description: (item.description || "").substring(0, 1000),
            price: item.offers?.price || "",
            address: item.address?.streetAddress || "",
            city: item.address?.addressLocality || "",
            state: item.address?.addressRegion || "",
            zip: item.address?.postalCode || "",
            images: Array.isArray(item.image) ? item.image : (item.image ? [item.image] : []),
            url: item.url || "",
            propertyType: item["@type"]?.toLowerCase() || "",
          });
        }
      }
    } catch { /* skip */ }
  }

  return listings;
}

function extractJsonLdArticles(html: string): ScrapedArticle[] {
  const articles: ScrapedArticle[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const items = data["@graph"] || (Array.isArray(data) ? data : [data]);

      for (const item of items) {
        if (item["@type"] === "Article" || item["@type"] === "NewsArticle" || item["@type"] === "BlogPosting") {
          articles.push({
            title: item.headline || item.name || "",
            author: item.author?.name || item.author || "",
            date: item.datePublished || "",
            excerpt: (item.description || "").substring(0, 500),
            content: (item.articleBody || "").substring(0, 2000),
            image: Array.isArray(item.image) ? item.image[0] : item.image,
            url: item.url || "",
            tags: item.keywords ? (Array.isArray(item.keywords) ? item.keywords : item.keywords.split(",").map((k: string) => k.trim())) : [],
          });
        }
      }
    } catch { /* skip */ }
  }

  return articles;
}

// ─── Extract products from HTML patterns (retail focus) ─────────────

function extractProductsFromHtml(html: string, pageUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const baseOrigin = new URL(pageUrl).origin;

  // Expanded product card patterns for maximum coverage
  const cardPatterns = [
    // Standard product cards
    /<(?:div|article|li|section)[^>]*class=["'][^"']*(?:product[-_]?card|product[-_]?tile|product[-_]?item|plp[-_]?card|glass[-_]?product|product[-_]?grid[-_]?item|product[-_]?listing|product[-_]?thumb|product[-_]?block|product[-_]?box|item[-_]?card|shop[-_]?item|goods[-_]?item|merchandise[-_]?item)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li|section)>/gi,
    // Data attribute patterns
    /<(?:div|article|li)[^>]*data-(?:component|type|testid|product|item)=["'][^"']*(?:product|item|card|tile)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
    // Grid item patterns (common in modern sites)
    /<(?:div|article|li)[^>]*class=["'][^"']*(?:grid[-_]?item|col[-_]?product|collection[-_]?item|catalog[-_]?item|search[-_]?result[-_]?item)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
  ];

  for (const pattern of cardPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const cardHtml = match[0];

      // Extract product name (multiple strategies)
      const nameMatch = cardHtml.match(/<(?:h[1-6]|span|a|p|div)[^>]*class=["'][^"']*(?:product[-_]?name|product[-_]?title|item[-_]?name|item[-_]?title|card[-_]?title|title)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h[1-6]|span|a|p|div)>/i)
        || cardHtml.match(/<(?:h[1-6])[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i)
        || cardHtml.match(/<a[^>]*class=["'][^"']*(?:product[-_]?link|item[-_]?link)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
      const name = nameMatch ? (nameMatch[1] || nameMatch[2] || "").replace(/<[^>]*>/g, "").trim() : "";

      // Extract price (multiple formats)
      const priceMatch = cardHtml.match(/(?:class=["'][^"']*(?:price|cost|amount)[^"']*["'][^>]*>)\s*([^<]*[\$£€¥][\d,]+\.?\d{0,2}[^<]*)/i)
        || cardHtml.match(/(?:class=["'][^"']*(?:price|cost|amount)[^"']*["'][^>]*>)\s*([^<]*\d+\.?\d{0,2}[^<]*)/i)
        || cardHtml.match(/([\$£€¥]\s*[\d,]+\.?\d{0,2})/i)
        || cardHtml.match(/data-price=["']([^"']+)["']/i);
      const price = priceMatch ? priceMatch[1].replace(/<[^>]*>/g, "").trim() : "";

      // Extract original/sale price
      const origPriceMatch = cardHtml.match(/(?:class=["'][^"']*(?:original[-_]?price|was[-_]?price|compare[-_]?price|old[-_]?price|strike|line-through)[^"']*["'][^>]*>)\s*([^<]*[\$£€¥][\d,]+\.?\d{0,2}[^<]*)/i);
      const originalPrice = origPriceMatch ? origPriceMatch[1].replace(/<[^>]*>/g, "").trim() : undefined;

      // Extract product link
      const linkMatch = cardHtml.match(/<a[^>]*href=["']([^"']*(?:product|item|shop|p\/|pd\/|buy\/)[^"']*)["']/i)
        || cardHtml.match(/<a[^>]*href=["']([^"']+)["']/i);
      let url = linkMatch ? linkMatch[1] : "";
      if (url.startsWith("/")) url = baseOrigin + url;

      // Extract images from card
      const cardImages = extractAllImages(cardHtml, pageUrl);

      // Extract brand
      const brandMatch = cardHtml.match(/(?:class=["'][^"']*brand[^"']*["'][^>]*>)\s*([^<]+)/i);
      const brand = brandMatch ? brandMatch[1].trim() : "";

      // Extract rating
      const ratingMatch = cardHtml.match(/(?:class=["'][^"']*rating[^"']*["'][^>]*>)\s*([0-9.]+)/i)
        || cardHtml.match(/data-rating=["']([^"']+)["']/i);
      const rating = ratingMatch ? ratingMatch[1] : "";

      if (name && name.length > 2 && name.length < 200) {
        products.push({
          name,
          description: "",
          price,
          originalPrice,
          currency: price.startsWith("£") ? "GBP" : price.startsWith("€") ? "EUR" : price.startsWith("¥") ? "JPY" : "USD",
          category: "",
          images: cardImages.slice(0, 8),
          url,
          brand,
          rating,
          tags: [],
        });
      }
    }
  }

  return products;
}

// ─── Extract real estate listings from HTML ─────────────────────────

function extractListingsFromHtml(html: string, pageUrl: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  const baseOrigin = new URL(pageUrl).origin;

  // Real estate card patterns
  const cardPatterns = [
    /<(?:div|article|li)[^>]*class=["'][^"']*(?:listing[-_]?card|property[-_]?card|home[-_]?card|result[-_]?card|listing[-_]?item|property[-_]?item|search[-_]?result)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
    /<(?:div|article|li)[^>]*data-(?:listing|property|home)[-_]?id=["'][^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
  ];

  for (const pattern of cardPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const cardHtml = match[0];

      // Address / title
      const titleMatch = cardHtml.match(/<(?:h[1-6]|span|a|address)[^>]*class=["'][^"']*(?:address|title|street)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h[1-6]|span|a|address)>/i)
        || cardHtml.match(/<(?:h[1-6])[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "";

      // Price
      const priceMatch = cardHtml.match(/([\$£€]\s*[\d,]+(?:,\d{3})*)/i);
      const price = priceMatch ? priceMatch[1].trim() : "";

      // Bedrooms
      const bedMatch = cardHtml.match(/(\d+)\s*(?:bed|br|bedroom)/i);
      const bedrooms = bedMatch ? parseInt(bedMatch[1]) : undefined;

      // Bathrooms
      const bathMatch = cardHtml.match(/(\d+(?:\.\d)?)\s*(?:bath|ba|bathroom)/i);
      const bathrooms = bathMatch ? parseFloat(bathMatch[1]) : undefined;

      // Square footage
      const sqftMatch = cardHtml.match(/([\d,]+)\s*(?:sq\s*ft|sqft|square\s*feet)/i);
      const sqft = sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, "")) : undefined;

      // Listing type
      let listingType: string | undefined;
      const cardLower = cardHtml.toLowerCase();
      if (cardLower.includes("for sale")) listingType = "for_sale";
      else if (cardLower.includes("for rent") || cardLower.includes("/mo") || cardLower.includes("per month")) listingType = "for_rent";
      else if (cardLower.includes("sold")) listingType = "sold";
      else if (cardLower.includes("pending")) listingType = "pending";

      // Property type
      let propertyType: string | undefined;
      if (cardLower.includes("condo")) propertyType = "condo";
      else if (cardLower.includes("apartment") || cardLower.includes("apt")) propertyType = "apartment";
      else if (cardLower.includes("townhouse") || cardLower.includes("townhome")) propertyType = "townhouse";
      else if (cardLower.includes("land") || cardLower.includes("lot")) propertyType = "land";
      else if (cardLower.includes("commercial")) propertyType = "commercial";
      else if (cardLower.includes("house") || cardLower.includes("home") || cardLower.includes("single family")) propertyType = "house";

      // Link
      const linkMatch = cardHtml.match(/<a[^>]*href=["']([^"']+)["']/i);
      let url = linkMatch ? linkMatch[1] : "";
      if (url.startsWith("/")) url = baseOrigin + url;

      // Images
      const cardImages = extractAllImages(cardHtml, pageUrl);

      // Agent
      const agentMatch = cardHtml.match(/(?:agent|realtor|listed by|broker)[^<]*(?:<[^>]*>)*\s*([A-Z][a-z]+ [A-Z][a-z]+)/i);

      if (title && title.length > 3) {
        listings.push({
          title,
          description: "",
          price,
          listingType,
          propertyType,
          bedrooms,
          bathrooms,
          sqft,
          images: cardImages.slice(0, 10),
          url,
          agent: agentMatch ? agentMatch[1].trim() : undefined,
        });
      }
    }
  }

  return listings;
}

// ─── Extract menu items from HTML ───────────────────────────────────

function extractMenuItemsFromHtml(html: string): ScrapedMenuItem[] {
  const items: ScrapedMenuItem[] = [];

  // Menu item patterns
  const menuPatterns = [
    /<(?:div|li|article)[^>]*class=["'][^"']*(?:menu[-_]?item|dish[-_]?item|food[-_]?item|menu[-_]?card)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|li|article)>/gi,
  ];

  for (const pattern of menuPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const cardHtml = match[0];

      const nameMatch = cardHtml.match(/<(?:h[1-6]|span|p)[^>]*class=["'][^"']*(?:name|title|dish)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h[1-6]|span|p)>/i)
        || cardHtml.match(/<(?:h[1-6])[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i);
      const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, "").trim() : "";

      const priceMatch = cardHtml.match(/([\$£€]\s*[\d,]+\.?\d{0,2})/i);
      const price = priceMatch ? priceMatch[1].trim() : "";

      const descMatch = cardHtml.match(/<(?:p|span|div)[^>]*class=["'][^"']*(?:description|desc|detail)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div)>/i);
      const description = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "";

      const imgMatch = cardHtml.match(/<img[^>]*src=["']([^"']+)["']/i);

      const cardLower = cardHtml.toLowerCase();
      const dietary: string[] = [];
      if (cardLower.includes("vegetarian") || cardLower.includes("🥬") || cardLower.includes("(v)")) dietary.push("vegetarian");
      if (cardLower.includes("vegan") || cardLower.includes("🌱")) dietary.push("vegan");
      if (cardLower.includes("gluten-free") || cardLower.includes("gf")) dietary.push("gluten-free");

      if (name && name.length > 2) {
        items.push({
          name,
          description,
          price,
          category: "",
          image: imgMatch ? imgMatch[1] : undefined,
          dietary: dietary.length > 0 ? dietary : undefined,
          spicy: cardLower.includes("spicy") || cardLower.includes("🌶"),
        });
      }
    }
  }

  return items;
}

// ─── Extract job listings from HTML ─────────────────────────────────

function extractJobsFromHtml(html: string, pageUrl: string): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];
  const baseOrigin = new URL(pageUrl).origin;

  const jobPatterns = [
    /<(?:div|article|li)[^>]*class=["'][^"']*(?:job[-_]?card|job[-_]?listing|job[-_]?item|position[-_]?card|vacancy[-_]?item|career[-_]?item)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
  ];

  for (const pattern of jobPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const cardHtml = match[0];

      const titleMatch = cardHtml.match(/<(?:h[1-6]|a|span)[^>]*class=["'][^"']*(?:title|name|position)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h[1-6]|a|span)>/i)
        || cardHtml.match(/<(?:h[1-6])[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "";

      const companyMatch = cardHtml.match(/(?:class=["'][^"']*company[^"']*["'][^>]*>)\s*([^<]+)/i);
      const locationMatch = cardHtml.match(/(?:class=["'][^"']*location[^"']*["'][^>]*>)\s*([^<]+)/i);
      const salaryMatch = cardHtml.match(/([\$£€]\s*[\d,]+(?:k|K)?(?:\s*[-–]\s*[\$£€]?\s*[\d,]+(?:k|K)?)?(?:\s*\/?\s*(?:yr|year|month|hr|hour))?)/i);

      const linkMatch = cardHtml.match(/<a[^>]*href=["']([^"']+)["']/i);
      let url = linkMatch ? linkMatch[1] : "";
      if (url.startsWith("/")) url = baseOrigin + url;

      let type: string | undefined;
      const cardLower = cardHtml.toLowerCase();
      if (cardLower.includes("full-time") || cardLower.includes("full time")) type = "full-time";
      else if (cardLower.includes("part-time") || cardLower.includes("part time")) type = "part-time";
      else if (cardLower.includes("contract")) type = "contract";
      else if (cardLower.includes("remote")) type = "remote";
      else if (cardLower.includes("internship") || cardLower.includes("intern")) type = "internship";

      if (title && title.length > 2) {
        jobs.push({
          title,
          company: companyMatch ? companyMatch[1].trim() : "",
          location: locationMatch ? locationMatch[1].trim() : "",
          salary: salaryMatch ? salaryMatch[1].trim() : undefined,
          type,
          description: "",
          url,
        });
      }
    }
  }

  return jobs;
}

// ─── Extract articles from HTML ─────────────────────────────────────

function extractArticlesFromHtml(html: string, pageUrl: string): ScrapedArticle[] {
  const articles: ScrapedArticle[] = [];
  const baseOrigin = new URL(pageUrl).origin;

  const articlePatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<(?:div|li)[^>]*class=["'][^"']*(?:post[-_]?card|article[-_]?card|blog[-_]?card|news[-_]?card|story[-_]?card|entry[-_]?card)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|li)>/gi,
  ];

  for (const pattern of articlePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const cardHtml = match[0];

      const titleMatch = cardHtml.match(/<(?:h[1-6])[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "";

      const excerptMatch = cardHtml.match(/<(?:p|div)[^>]*class=["'][^"']*(?:excerpt|summary|description|teaser)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i)
        || cardHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const excerpt = excerptMatch ? excerptMatch[1].replace(/<[^>]*>/g, "").trim().substring(0, 500) : "";

      const authorMatch = cardHtml.match(/(?:class=["'][^"']*(?:author|byline|writer)[^"']*["'][^>]*>)\s*([^<]+)/i);
      const dateMatch = cardHtml.match(/<time[^>]*datetime=["']([^"']+)["']/i)
        || cardHtml.match(/(?:class=["'][^"']*date[^"']*["'][^>]*>)\s*([^<]+)/i);

      const imgMatch = cardHtml.match(/<img[^>]*src=["']([^"']+)["']/i);
      let imgUrl = imgMatch ? imgMatch[1] : undefined;
      if (imgUrl && imgUrl.startsWith("/")) imgUrl = baseOrigin + imgUrl;

      const linkMatch = cardHtml.match(/<a[^>]*href=["']([^"']+)["']/i);
      let url = linkMatch ? linkMatch[1] : "";
      if (url.startsWith("/")) url = baseOrigin + url;

      if (title && title.length > 5) {
        articles.push({
          title,
          author: authorMatch ? authorMatch[1].trim() : undefined,
          date: dateMatch ? dateMatch[1].trim() : undefined,
          excerpt,
          image: imgUrl,
          url,
        });
      }
    }
  }

  return articles;
}

// ─── Deep crawl: discover all content pages ─────────────────────────

async function discoverContentPages(
  baseUrl: string,
  homepageHtml: string,
  siteType: SiteType,
  maxPages: number = 200
): Promise<string[]> {
  const baseOrigin = new URL(baseUrl).origin;
  const visited = new Set<string>();
  const contentPages: string[] = [];
  const priorityPages: string[] = [];
  const secondaryPages: string[] = [];

  // URL patterns by site type
  const priorityPatterns: Record<SiteType, RegExp[]> = {
    retail: [
      /\/product[s]?\//i, /\/item[s]?\//i, /\/shop\//i, /\/store\//i,
      /\/collection[s]?\//i, /\/catalog\//i, /\/category\//i, /\/categorie[s]?\//i,
      /\/p\//i, /\/pd\//i, /\/buy\//i, /\/merchandise\//i,
      /\/men\b/i, /\/women\b/i, /\/kids\b/i, /\/unisex\b/i,
      /\/shoes\b/i, /\/clothing\b/i, /\/accessories\b/i, /\/gear\b/i,
      /\/new[-_]?arrival/i, /\/sale\b/i, /\/best[-_]?seller/i, /\/trending\b/i,
      /\/brand[s]?\//i, /\/designer[s]?\//i, /\/department[s]?\//i,
      /\/search\?/i, /\/browse\//i, /\/all\b/i,
    ],
    realestate: [
      /\/listing[s]?\//i, /\/propert(?:y|ies)\//i, /\/home[s]?\//i,
      /\/for[-_]?sale/i, /\/for[-_]?rent/i, /\/rental[s]?\//i,
      /\/house[s]?\//i, /\/condo[s]?\//i, /\/apartment[s]?\//i,
      /\/mls\//i, /\/search\?/i, /\/browse\//i,
      /\/neighborhood[s]?\//i, /\/communit(?:y|ies)\//i,
      /\/agent[s]?\//i, /\/realtor[s]?\//i,
    ],
    restaurant: [
      /\/menu/i, /\/food/i, /\/order/i, /\/delivery/i,
      /\/catering/i, /\/specials/i, /\/drinks/i, /\/wine/i,
      /\/lunch/i, /\/dinner/i, /\/breakfast/i, /\/brunch/i,
    ],
    jobboard: [
      /\/job[s]?\//i, /\/career[s]?\//i, /\/position[s]?\//i,
      /\/opening[s]?\//i, /\/vacanc(?:y|ies)\//i, /\/hiring/i,
      /\/apply/i, /\/search\?/i,
    ],
    news: [
      /\/article[s]?\//i, /\/post[s]?\//i, /\/blog\//i, /\/news\//i,
      /\/stor(?:y|ies)\//i, /\/opinion/i, /\/editorial/i,
      /\/categor(?:y|ies)\//i, /\/tag[s]?\//i, /\/author\//i,
      /\/\d{4}\/\d{2}\//i, // Date-based URLs
    ],
    directory: [
      /\/listing[s]?\//i, /\/business\//i, /\/compan(?:y|ies)\//i,
      /\/service[s]?\//i, /\/provider[s]?\//i, /\/categor(?:y|ies)\//i,
      /\/search\?/i, /\/find\//i, /\/browse\//i,
    ],
    generic: [
      /\/about/i, /\/service[s]?/i, /\/feature[s]?/i, /\/pricing/i,
      /\/portfolio/i, /\/gallery/i, /\/team/i, /\/contact/i,
    ],
  };

  // Skip patterns
  const skipPatterns = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|mp4|mp3|webm)$/i;
  const skipPaths = /\/(login|signin|register|signup|cart|checkout|account|privacy|terms|cookie|faq|help|support|sitemap|feed|rss|api\/|wp-admin|wp-json)/i;

  // Extract all links from homepage
  const linkRegex = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = linkRegex.exec(homepageHtml)) !== null) {
    let href = match[1];
    if (href.startsWith("/")) href = baseOrigin + href;
    try {
      const linkUrl = new URL(href);
      if (linkUrl.origin !== baseOrigin) continue;
      const pathname = linkUrl.pathname + linkUrl.search;
      if (visited.has(pathname)) continue;
      visited.add(pathname);
      if (skipPatterns.test(linkUrl.pathname)) continue;
      if (skipPaths.test(linkUrl.pathname)) continue;

      const patterns = priorityPatterns[siteType] || priorityPatterns.generic;
      if (patterns.some(p => p.test(pathname))) {
        priorityPages.push(linkUrl.href);
      } else {
        secondaryPages.push(linkUrl.href);
      }
    } catch { /* skip invalid */ }
  }

  // Sort priority pages: collection/category pages first (they list multiple items)
  const collectionPatterns = [/\/collection/i, /\/category/i, /\/shop\//i, /\/catalog/i, /\/all\b/i, /\/browse/i, /\/search/i, /\/listing/i];
  priorityPages.sort((a, b) => {
    const aScore = collectionPatterns.filter(p => p.test(a)).length;
    const bScore = collectionPatterns.filter(p => p.test(b)).length;
    return bScore - aScore;
  });

  // Crawl priority pages first, then secondary
  const allToFetch = [...priorityPages, ...secondaryPages].slice(0, maxPages);

  for (const url of allToFetch) {
    if (contentPages.length >= maxPages) break;

    const html = await fetchWithRetry(url);
    if (!html) continue;

    contentPages.push(url);

    // Extract more links from this page (depth 2)
    const innerLinkRegex = /href=["']([^"'#]+)["']/gi;
    while ((match = innerLinkRegex.exec(html)) !== null) {
      let href = match[1];
      if (href.startsWith("/")) href = baseOrigin + href;
      try {
        const linkUrl = new URL(href);
        if (linkUrl.origin !== baseOrigin) continue;
        const pathname = linkUrl.pathname + linkUrl.search;
        if (visited.has(pathname)) continue;
        visited.add(pathname);
        if (skipPatterns.test(linkUrl.pathname)) continue;
        if (skipPaths.test(linkUrl.pathname)) continue;

        const patterns = priorityPatterns[siteType] || priorityPatterns.generic;
        if (patterns.some(p => p.test(pathname)) && contentPages.length + priorityPages.length < maxPages) {
          priorityPages.push(linkUrl.href);
        }
      } catch { /* skip */ }
    }

    // Follow pagination (all site types)
    const paginationRegex = /href=["']([^"']*(?:\?page=|&page=|\/page\/|[?&]p=|[?&]offset=|[?&]start=)\d+[^"']*)["']/gi;
    while ((match = paginationRegex.exec(html)) !== null) {
      let href = match[1];
      if (href.startsWith("/")) href = baseOrigin + href;
      try {
        const linkUrl = new URL(href);
        if (linkUrl.origin === baseOrigin && !visited.has(linkUrl.href)) {
          visited.add(linkUrl.href);
          contentPages.push(linkUrl.href);
        }
      } catch { /* skip */ }
    }

    // "Next" page link
    const nextMatch = html.match(/<a[^>]*class=["'][^"']*next[^"']*["'][^>]*href=["']([^"']+)["']/i)
      || html.match(/<a[^>]*rel=["']next["'][^>]*href=["']([^"']+)["']/i)
      || html.match(/<a[^>]*href=["']([^"']+)["'][^>]*>(?:\s*next\s*|›|»|→)/i);
    if (nextMatch) {
      let href = nextMatch[1];
      if (href.startsWith("/")) href = baseOrigin + href;
      try {
        const linkUrl = new URL(href);
        if (linkUrl.origin === baseOrigin && !visited.has(linkUrl.href)) {
          visited.add(linkUrl.href);
          contentPages.push(linkUrl.href);
        }
      } catch { /* skip */ }
    }

    // Rate limit — vary delay to appear more human
    await new Promise(r => setTimeout(r, 200 + Math.random() * 400));

    if (contentPages.length >= maxPages) break;
  }

  return contentPages.slice(0, maxPages);
}

// ─── Download images in bulk ────────────────────────────────────────

async function downloadImages(
  imageUrls: Array<{ url: string; name: string }>,
  subdir: string,
  maxImages: number = 300
): Promise<DownloadedImage[]> {
  const downloaded: DownloadedImage[] = [];
  let totalDownloaded = 0;
  const seen = new Set<string>();

  for (const { url: imgUrl, name } of imageUrls) {
    if (totalDownloaded >= maxImages) break;
    if (seen.has(imgUrl)) continue;
    seen.add(imgUrl);

    try {
      const resp = await fetch(imgUrl, {
        headers: {
          "User-Agent": randomUA(),
          Referer: new URL(imgUrl).origin + "/",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });

      if (!resp.ok) continue;
      const contentType = resp.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) continue;

      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length < 500) continue; // Skip tiny/broken images
      if (buffer.length > 15 * 1024 * 1024) continue; // Skip >15MB

      let ext = "jpg";
      if (contentType.includes("png")) ext = "png";
      else if (contentType.includes("webp")) ext = "webp";
      else if (contentType.includes("svg")) ext = "svg";
      else if (contentType.includes("gif")) ext = "gif";
      else if (contentType.includes("avif")) ext = "avif";

      const safeName = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 60);

      const localPath = `images/${subdir}/${safeName}-${totalDownloaded + 1}.${ext}`;

      downloaded.push({
        originalUrl: imgUrl,
        localPath,
        associatedName: name,
        imageBuffer: buffer,
        contentType,
      });

      totalDownloaded++;
    } catch {
      // Skip failed downloads
    }

    // Rate limit
    if (totalDownloaded % 15 === 0) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return downloaded;
}

// ─── Main: Universal Deep Content Scraper ───────────────────────────

export async function scrapeProductCatalog(
  targetUrl: string,
  homepageHtml: string,
  options?: {
    maxPages?: number;
    maxProducts?: number;
    maxImages?: number;
    onProgress?: (message: string) => void;
  }
): Promise<CatalogResult> {
  const {
    maxPages = 200,
    maxProducts = 1000,
    maxImages = 300,
    onProgress = () => {},
  } = options || {};

  // Step 0: Detect site type
  onProgress("Analyzing site type...");
  const siteType = detectSiteType(homepageHtml, targetUrl);
  onProgress(`Detected site type: ${siteType.toUpperCase()}`);

  // Extract site metadata
  const siteMetadata = extractSiteMetadata(homepageHtml, targetUrl);

  const allProducts: ScrapedProduct[] = [];
  const allListings: ScrapedListing[] = [];
  const allMenuItems: ScrapedMenuItem[] = [];
  const allJobs: ScrapedJob[] = [];
  const allArticles: ScrapedArticle[] = [];
  const categories: ScrapedCategory[] = [];
  const seenNames = new Set<string>();
  let pagesScraped = 0;

  // Helper to deduplicate by name
  function addUnique<T extends { name?: string; title?: string }>(arr: T[], items: T[], max: number): number {
    let added = 0;
    for (const item of items) {
      if (arr.length >= max) break;
      const key = ((item as any).name || (item as any).title || "").toLowerCase().trim();
      if (key && key.length > 2 && !seenNames.has(key)) {
        seenNames.add(key);
        arr.push(item);
        added++;
      }
    }
    return added;
  }

  // Step 1: Extract from homepage
  onProgress("Extracting content from homepage...");

  // Always try all extractors on homepage — sites often have mixed content
  const homepageJsonLd = extractJsonLdProducts(homepageHtml);
  addUnique(allProducts, homepageJsonLd, maxProducts);

  const homepageHtmlProducts = extractProductsFromHtml(homepageHtml, targetUrl);
  addUnique(allProducts, homepageHtmlProducts, maxProducts);

  const homepageListingsJsonLd = extractJsonLdListings(homepageHtml);
  addUnique(allListings, homepageListingsJsonLd, maxProducts);

  const homepageListingsHtml = extractListingsFromHtml(homepageHtml, targetUrl);
  addUnique(allListings, homepageListingsHtml, maxProducts);

  const homepageArticlesJsonLd = extractJsonLdArticles(homepageHtml);
  addUnique(allArticles, homepageArticlesJsonLd, maxProducts);

  const homepageArticlesHtml = extractArticlesFromHtml(homepageHtml, targetUrl);
  addUnique(allArticles, homepageArticlesHtml, maxProducts);

  const homepageMenuItems = extractMenuItemsFromHtml(homepageHtml);
  addUnique(allMenuItems, homepageMenuItems, maxProducts);

  const homepageJobs = extractJobsFromHtml(homepageHtml, targetUrl);
  addUnique(allJobs, homepageJobs, maxProducts);

  const totalHomepage = allProducts.length + allListings.length + allArticles.length + allMenuItems.length + allJobs.length;
  onProgress(`Found ${totalHomepage} items from homepage`);

  // Step 2: Discover and crawl content pages
  onProgress("Discovering content pages...");
  const contentPageUrls = await discoverContentPages(targetUrl, homepageHtml, siteType, maxPages);
  onProgress(`Found ${contentPageUrls.length} content pages to crawl`);

  // Step 3: Scrape each content page
  for (const pageUrl of contentPageUrls) {
    const totalItems = allProducts.length + allListings.length + allMenuItems.length + allJobs.length + allArticles.length;
    if (totalItems >= maxProducts) break;

    try {
      const html = await fetchWithRetry(pageUrl);
      if (!html) continue;
      pagesScraped++;

      // Apply all relevant extractors based on site type (but always try products for retail)
      if (siteType === "retail" || siteType === "generic") {
        const jsonLdProducts = extractJsonLdProducts(html);
        addUnique(allProducts, jsonLdProducts, maxProducts);

        const htmlProducts = extractProductsFromHtml(html, pageUrl);
        addUnique(allProducts, htmlProducts, maxProducts);
      }

      if (siteType === "realestate" || siteType === "generic") {
        const jsonLdListings = extractJsonLdListings(html);
        addUnique(allListings, jsonLdListings, maxProducts);

        const htmlListings = extractListingsFromHtml(html, pageUrl);
        addUnique(allListings, htmlListings, maxProducts);
      }

      if (siteType === "restaurant" || siteType === "generic") {
        const menuItems = extractMenuItemsFromHtml(html);
        addUnique(allMenuItems, menuItems, maxProducts);
      }

      if (siteType === "jobboard" || siteType === "generic") {
        const jobs = extractJobsFromHtml(html, pageUrl);
        addUnique(allJobs, jobs, maxProducts);
      }

      if (siteType === "news" || siteType === "generic") {
        const jsonLdArticles = extractJsonLdArticles(html);
        addUnique(allArticles, jsonLdArticles, maxProducts);

        const htmlArticles = extractArticlesFromHtml(html, pageUrl);
        addUnique(allArticles, htmlArticles, maxProducts);
      }

      // Extract category info from page title
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "";
      if (title) {
        const existingCat = categories.find(c => c.url === pageUrl);
        if (!existingCat) {
          categories.push({
            name: title.split("|")[0].split("-")[0].split("–")[0].trim(),
            url: pageUrl,
            productCount: 0, // Will be updated later
          });
        }
      }

      const currentTotal = allProducts.length + allListings.length + allMenuItems.length + allJobs.length + allArticles.length;
      if (pagesScraped % 5 === 0 || pagesScraped <= 3) {
        onProgress(`Scraped ${pagesScraped}/${contentPageUrls.length} pages — ${currentTotal} items found`);
      }

      // Rate limit with jitter
      await new Promise(r => setTimeout(r, 200 + Math.random() * 400));
    } catch {
      // Skip failed pages
    }
  }

  // Step 4: Enrich items with missing data by visiting detail pages
  onProgress("Enriching items with full details...");
  let enriched = 0;
  const maxEnrich = 100;

  // Enrich products
  for (const product of allProducts) {
    if (enriched >= maxEnrich) break;
    if (product.images.length === 0 && product.url) {
      try {
        const html = await fetchWithRetry(product.url);
        if (html) {
          product.images = extractAllImages(html, product.url).slice(0, 8);
          if (!product.description) {
            const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
            if (descMatch) product.description = descMatch[1].substring(0, 1000);
          }
          // Try to get sizes and colors from detail page
          if (!product.sizes) {
            const sizeMatch = html.match(/(?:size|taille)[^<]*(?:<[^>]*>)*\s*(?:<option[^>]*>([^<]+)<\/option>\s*)+/gi);
            if (sizeMatch) {
              const sizes: string[] = [];
              const optRegex = /<option[^>]*>([^<]+)<\/option>/gi;
              let m;
              while ((m = optRegex.exec(sizeMatch[0])) !== null) {
                const s = m[1].trim();
                if (s && !s.toLowerCase().includes("select") && !s.toLowerCase().includes("choose")) sizes.push(s);
              }
              if (sizes.length > 0) product.sizes = sizes;
            }
          }
          if (!product.colors) {
            const colorMatch = html.match(/(?:color|colour)[^<]*(?:<[^>]*>)*\s*(?:<option[^>]*>([^<]+)<\/option>\s*)+/gi);
            if (colorMatch) {
              const colors: string[] = [];
              const optRegex = /<option[^>]*>([^<]+)<\/option>/gi;
              let m;
              while ((m = optRegex.exec(colorMatch[0])) !== null) {
                const c = m[1].trim();
                if (c && !c.toLowerCase().includes("select") && !c.toLowerCase().includes("choose")) colors.push(c);
              }
              if (colors.length > 0) product.colors = colors;
            }
          }
          enriched++;
          pagesScraped++;
        }
        await new Promise(r => setTimeout(r, 250));
      } catch { /* skip */ }
    }
  }

  // Enrich listings
  for (const listing of allListings) {
    if (enriched >= maxEnrich) break;
    if (listing.images.length === 0 && listing.url) {
      try {
        const html = await fetchWithRetry(listing.url);
        if (html) {
          listing.images = extractAllImages(html, listing.url).slice(0, 15);
          if (!listing.description) {
            const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
            if (descMatch) listing.description = descMatch[1].substring(0, 1000);
          }
          // Try to get amenities
          const amenityMatch = html.match(/(?:amenities|features)[^<]*(?:<[^>]*>)*([\s\S]*?)(?:<\/(?:ul|div|section)>)/i);
          if (amenityMatch) {
            const amenities: string[] = [];
            const liRegex = /<li[^>]*>([^<]+)<\/li>/gi;
            let m;
            while ((m = liRegex.exec(amenityMatch[1])) !== null) {
              amenities.push(m[1].trim());
            }
            if (amenities.length > 0) listing.amenities = amenities;
          }
          enriched++;
          pagesScraped++;
        }
        await new Promise(r => setTimeout(r, 250));
      } catch { /* skip */ }
    }
  }

  onProgress(`Enriched ${enriched} items with full details`);

  // Step 5: Download images
  const allImageUrls: Array<{ url: string; name: string }> = [];

  // Collect all image URLs from all content types
  for (const p of allProducts) {
    for (const img of p.images) {
      if (img.startsWith("http")) allImageUrls.push({ url: img, name: p.name });
    }
  }
  for (const l of allListings) {
    for (const img of l.images) {
      if (img.startsWith("http")) allImageUrls.push({ url: img, name: l.title });
    }
  }
  for (const m of allMenuItems) {
    if (m.image && m.image.startsWith("http")) allImageUrls.push({ url: m.image, name: m.name });
  }
  for (const a of allArticles) {
    if (a.image && a.image.startsWith("http")) allImageUrls.push({ url: a.image, name: a.title });
  }

  onProgress(`Downloading images (${Math.min(allImageUrls.length, maxImages)} of ${allImageUrls.length} available)...`);
  const subdir = siteType === "realestate" ? "properties" : siteType === "restaurant" ? "menu" : "products";
  const downloadedImages = await downloadImages(allImageUrls, subdir, maxImages);
  onProgress(`Downloaded ${downloadedImages.length} images`);

  // Update references to use local paths
  const imageMap = new Map<string, string>();
  for (const img of downloadedImages) {
    imageMap.set(img.originalUrl, `/public/${img.localPath}`);
  }
  for (const product of allProducts) {
    product.images = product.images.map(url => imageMap.get(url) || url);
  }
  for (const listing of allListings) {
    listing.images = listing.images.map(url => imageMap.get(url) || url);
  }
  for (const menuItem of allMenuItems) {
    if (menuItem.image) menuItem.image = imageMap.get(menuItem.image) || menuItem.image;
  }
  for (const article of allArticles) {
    if (article.image) article.image = imageMap.get(article.image) || article.image;
  }

  const totalItems = allProducts.length + allListings.length + allMenuItems.length + allJobs.length + allArticles.length;
  onProgress(`Scraping complete: ${totalItems} items, ${downloadedImages.length} images, ${pagesScraped} pages`);

  return {
    siteType,
    products: allProducts.slice(0, maxProducts),
    listings: allListings.slice(0, maxProducts),
    menuItems: allMenuItems.slice(0, maxProducts),
    jobs: allJobs.slice(0, maxProducts),
    articles: allArticles.slice(0, maxProducts),
    categories,
    totalProductsFound: totalItems,
    totalImagesFound: downloadedImages.length,
    pagesScraped,
    downloadedImages,
    siteMetadata,
  };
}
