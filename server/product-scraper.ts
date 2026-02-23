/**
 * Product Scraper v1.0
 *
 * Deep e-commerce product catalog extraction engine.
 * Crawls product listing pages, individual product pages, and extracts:
 * - Product names, descriptions, prices, categories
 * - All product images (including lazy-loaded)
 * - Size/color variants
 * - Structured data (JSON-LD, Open Graph, microdata)
 *
 * Designed for security professionals who need full site replication.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface ScrapedProduct {
  name: string;
  description: string;
  price: string;
  originalPrice?: string; // for sale items
  currency: string;
  category: string;
  subcategory?: string;
  images: string[]; // URLs
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

export interface ScrapedCategory {
  name: string;
  url: string;
  productCount: number;
  subcategories?: Array<{ name: string; url: string }>;
}

export interface CatalogResult {
  products: ScrapedProduct[];
  categories: ScrapedCategory[];
  totalProductsFound: number;
  totalImagesFound: number;
  pagesScraped: number;
  downloadedImages: Array<{
    originalUrl: string;
    localPath: string;
    productName: string;
    imageBuffer: Buffer;
    contentType: string;
  }>;
}

// ─── User Agent Pool ────────────────────────────────────────────────

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Fetch with retry and rate limiting ─────────────────────────────

async function fetchWithRetry(
  url: string,
  options?: { maxRetries?: number; delayMs?: number; timeoutMs?: number }
): Promise<string | null> {
  const { maxRetries = 2, delayMs = 500, timeoutMs = 15000 } = options || {};

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, delayMs * attempt));
      }
      const resp = await fetch(url, {
        headers: {
          "User-Agent": randomUA(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      if (!resp.ok) continue;
      return await resp.text();
    } catch {
      continue;
    }
  }
  return null;
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

  // Lazy-loaded: data-src, data-lazy-src, data-original
  const lazySrcRegex = /data-(?:src|lazy-src|original|image|srcset|lazy)=["']([^"']+)["']/gi;
  while ((match = lazySrcRegex.exec(html)) !== null) {
    const val = match[1];
    // srcset may have multiple URLs
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

  // CSS background-image
  const bgRegex = /background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    const url = resolveUrl(match[1]);
    if (url) images.add(url);
  }

  // Filter out tracking pixels, icons, and tiny images by URL pattern
  return Array.from(images).filter(url => {
    const lower = url.toLowerCase();
    if (lower.includes("pixel") || lower.includes("tracking") || lower.includes("analytics")) return false;
    if (lower.includes("favicon") || lower.includes(".ico")) return false;
    if (lower.match(/\b1x1\b/) || lower.match(/\bspacer\b/)) return false;
    return true;
  });
}

// ─── Extract structured product data from JSON-LD ───────────────────

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
            description: (item.description || "").substring(0, 500),
            price: mainOffer.price || mainOffer.lowPrice || "",
            currency: mainOffer.priceCurrency || "USD",
            category: item.category || "",
            images: Array.isArray(item.image) ? item.image : (item.image ? [item.image] : []),
            sku: item.sku || item.productID || "",
            url: item.url || "",
            inStock: mainOffer.availability?.includes("InStock") ?? true,
            rating: item.aggregateRating?.ratingValue?.toString() || "",
            reviewCount: parseInt(item.aggregateRating?.reviewCount) || 0,
            brand: item.brand?.name || item.brand || "",
            sizes: offerList.length > 1 ? offerList.map((o: any) => o.name || o.sku || "").filter(Boolean) : undefined,
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
                description: (product.description || "").substring(0, 500),
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

// ─── Extract products from HTML patterns ────────────────────────────

function extractProductsFromHtml(html: string, pageUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const baseOrigin = new URL(pageUrl).origin;

  // Common product card patterns
  const cardPatterns = [
    // Pattern 1: <div class="product-card"> or similar
    /<(?:div|article|li)[^>]*class=["'][^"']*(?:product[-_]?card|product[-_]?tile|product[-_]?item|plp[-_]?card|glass[-_]?product|product[-_]?grid[-_]?item)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
    // Pattern 2: data-component="product" or similar
    /<(?:div|article|li)[^>]*data-(?:component|type|testid)=["'][^"']*product[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
  ];

  for (const pattern of cardPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const cardHtml = match[0];

      // Extract product name
      const nameMatch = cardHtml.match(/<(?:h[1-6]|span|a|p)[^>]*class=["'][^"']*(?:product[-_]?name|product[-_]?title|item[-_]?name|title)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h[1-6]|span|a|p)>/i)
        || cardHtml.match(/<(?:h[1-6])[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i);
      const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, "").trim() : "";

      // Extract price
      const priceMatch = cardHtml.match(/(?:class=["'][^"']*price[^"']*["'][^>]*>|data-price=["'])([^<"']*)/i)
        || cardHtml.match(/(\$[\d,]+\.?\d{0,2}|£[\d,]+\.?\d{0,2}|€[\d,]+\.?\d{0,2}|USD\s*[\d,]+)/);
      const price = priceMatch ? priceMatch[1].replace(/<[^>]*>/g, "").trim() : "";

      // Extract product link
      const linkMatch = cardHtml.match(/<a[^>]*href=["']([^"']*(?:product|item|shop|p\/)[^"']*)["']/i)
        || cardHtml.match(/<a[^>]*href=["']([^"']+)["']/i);
      let url = linkMatch ? linkMatch[1] : "";
      if (url.startsWith("/")) url = baseOrigin + url;

      // Extract images
      const cardImages = extractAllImages(cardHtml, pageUrl);

      if (name && name.length > 2) {
        products.push({
          name,
          description: "",
          price,
          currency: price.startsWith("£") ? "GBP" : price.startsWith("€") ? "EUR" : "USD",
          category: "",
          images: cardImages.slice(0, 5), // Max 5 images per product from card
          url,
          tags: [],
        });
      }
    }
  }

  return products;
}

// ─── Deep crawl product/collection pages ────────────────────────────

async function discoverProductPages(
  baseUrl: string,
  homepageHtml: string,
  maxPages: number = 150
): Promise<string[]> {
  const baseOrigin = new URL(baseUrl).origin;
  const visited = new Set<string>();
  const productPages: string[] = [];
  const categoryPages: string[] = [];

  // Product/collection URL patterns
  const productPatterns = [
    /\/product[s]?\//i, /\/item[s]?\//i, /\/shop\//i, /\/store\//i,
    /\/collection[s]?\//i, /\/catalog\//i, /\/category\//i, /\/categorie[s]?\//i,
    /\/p\//i, /\/pd\//i, /\/buy\//i, /\/merchandise\//i,
    /\/men\b/i, /\/women\b/i, /\/kids\b/i, /\/unisex\b/i,
    /\/shoes\b/i, /\/clothing\b/i, /\/accessories\b/i, /\/gear\b/i,
    /\/new[-_]?arrival/i, /\/sale\b/i, /\/best[-_]?seller/i, /\/trending\b/i,
    /\/brand[s]?\//i, /\/designer[s]?\//i,
  ];

  // Extract all links from homepage
  const linkRegex = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = linkRegex.exec(homepageHtml)) !== null) {
    let href = match[1];
    if (href.startsWith("/")) href = baseOrigin + href;
    try {
      const linkUrl = new URL(href);
      if (linkUrl.origin !== baseOrigin) continue;
      if (visited.has(linkUrl.pathname)) continue;
      visited.add(linkUrl.pathname);

      // Skip non-content pages
      if (linkUrl.pathname.match(/\.(js|css|png|jpg|gif|svg|ico|woff|ttf|pdf)$/i)) continue;
      if (linkUrl.pathname.match(/\/(login|signin|register|signup|cart|checkout|account|privacy|terms|cookie)/i)) continue;

      if (productPatterns.some(p => p.test(linkUrl.pathname))) {
        categoryPages.push(linkUrl.href);
      }
    } catch { /* skip invalid */ }
  }

  // Prioritize category/collection pages first (they list multiple products)
  const collectionPatterns = [/\/collection/i, /\/category/i, /\/shop\//i, /\/catalog/i, /\/men\b/i, /\/women\b/i, /\/sale\b/i];
  categoryPages.sort((a, b) => {
    const aScore = collectionPatterns.filter(p => p.test(a)).length;
    const bScore = collectionPatterns.filter(p => p.test(b)).length;
    return bScore - aScore;
  });

  // Fetch category pages and extract more product links
  const toFetch = categoryPages.slice(0, Math.min(30, maxPages));
  for (const url of toFetch) {
    const html = await fetchWithRetry(url);
    if (!html) continue;

    productPages.push(url);

    // Extract product links from this category page
    const innerLinkRegex = /href=["']([^"'#]+)["']/gi;
    while ((match = innerLinkRegex.exec(html)) !== null) {
      let href = match[1];
      if (href.startsWith("/")) href = baseOrigin + href;
      try {
        const linkUrl = new URL(href);
        if (linkUrl.origin !== baseOrigin) continue;
        if (visited.has(linkUrl.pathname)) continue;
        visited.add(linkUrl.pathname);
        if (productPatterns.some(p => p.test(linkUrl.pathname))) {
          productPages.push(linkUrl.href);
        }
      } catch { /* skip */ }
    }

    // Check for pagination
    const paginationRegex = /href=["']([^"']*(?:\?page=|&page=|\/page\/)\d+[^"']*)["']/gi;
    while ((match = paginationRegex.exec(html)) !== null) {
      let href = match[1];
      if (href.startsWith("/")) href = baseOrigin + href;
      try {
        const linkUrl = new URL(href);
        if (linkUrl.origin === baseOrigin && !visited.has(linkUrl.href)) {
          visited.add(linkUrl.href);
          productPages.push(linkUrl.href);
        }
      } catch { /* skip */ }
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 300));

    if (productPages.length >= maxPages) break;
  }

  return productPages.slice(0, maxPages);
}

// ─── Download product images in bulk ────────────────────────────────

async function downloadProductImages(
  products: ScrapedProduct[],
  maxImagesPerProduct: number = 3,
  maxTotalImages: number = 200
): Promise<CatalogResult["downloadedImages"]> {
  const downloaded: CatalogResult["downloadedImages"] = [];
  let totalDownloaded = 0;

  for (const product of products) {
    if (totalDownloaded >= maxTotalImages) break;

    const imagesToDownload = product.images.slice(0, maxImagesPerProduct);
    let imgIndex = 0;

    for (const imgUrl of imagesToDownload) {
      if (totalDownloaded >= maxTotalImages) break;

      try {
        const resp = await fetch(imgUrl, {
          headers: { "User-Agent": randomUA() },
          signal: AbortSignal.timeout(15000),
          redirect: "follow",
        });

        if (!resp.ok) continue;
        const contentType = resp.headers.get("content-type") || "image/jpeg";
        if (!contentType.startsWith("image/")) continue;

        const buffer = Buffer.from(await resp.arrayBuffer());
        if (buffer.length < 200) continue; // Skip tiny/broken images
        if (buffer.length > 10 * 1024 * 1024) continue; // Skip >10MB

        // Determine extension
        let ext = "jpg";
        if (contentType.includes("png")) ext = "png";
        else if (contentType.includes("webp")) ext = "webp";
        else if (contentType.includes("svg")) ext = "svg+xml";
        else if (contentType.includes("gif")) ext = "gif";
        else if (contentType.includes("avif")) ext = "avif";

        // Clean product name for filename
        const safeName = product.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .substring(0, 50);

        const localPath = `images/products/${safeName}${imgIndex > 0 ? `-${imgIndex + 1}` : ""}.${ext}`;

        downloaded.push({
          originalUrl: imgUrl,
          localPath,
          productName: product.name,
          imageBuffer: buffer,
          contentType,
        });

        totalDownloaded++;
        imgIndex++;
      } catch {
        // Skip failed downloads
      }
    }

    // Rate limit between products
    if (totalDownloaded % 10 === 0) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return downloaded;
}

// ─── Main: Scrape Full Product Catalog ──────────────────────────────

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
    maxPages = 100,
    maxProducts = 500,
    maxImages = 200,
    onProgress = () => {},
  } = options || {};

  const allProducts: ScrapedProduct[] = [];
  const categories: ScrapedCategory[] = [];
  const seenProductNames = new Set<string>();
  let pagesScraped = 0;

  // Step 1: Extract products from homepage JSON-LD
  onProgress("Extracting structured data from homepage...");
  const homepageJsonLd = extractJsonLdProducts(homepageHtml);
  for (const p of homepageJsonLd) {
    if (p.name && !seenProductNames.has(p.name.toLowerCase())) {
      seenProductNames.add(p.name.toLowerCase());
      allProducts.push(p);
    }
  }
  onProgress(`Found ${homepageJsonLd.length} products from homepage structured data`);

  // Step 2: Extract products from homepage HTML patterns
  const homepageHtmlProducts = extractProductsFromHtml(homepageHtml, targetUrl);
  for (const p of homepageHtmlProducts) {
    if (p.name && !seenProductNames.has(p.name.toLowerCase())) {
      seenProductNames.add(p.name.toLowerCase());
      allProducts.push(p);
    }
  }

  // Step 3: Discover and crawl product/collection pages
  onProgress("Discovering product and collection pages...");
  const productPageUrls = await discoverProductPages(targetUrl, homepageHtml, maxPages);
  onProgress(`Found ${productPageUrls.length} product/collection pages to crawl`);

  // Step 4: Scrape each product page
  for (const pageUrl of productPageUrls) {
    if (allProducts.length >= maxProducts) break;

    try {
      const html = await fetchWithRetry(pageUrl);
      if (!html) continue;
      pagesScraped++;

      // Try JSON-LD first (most reliable)
      const jsonLdProducts = extractJsonLdProducts(html);
      for (const p of jsonLdProducts) {
        if (p.name && !seenProductNames.has(p.name.toLowerCase())) {
          seenProductNames.add(p.name.toLowerCase());
          if (!p.category) {
            // Try to infer category from URL
            const urlParts = new URL(pageUrl).pathname.split("/").filter(Boolean);
            p.category = urlParts.length > 1 ? urlParts[0].replace(/-/g, " ") : "";
          }
          allProducts.push(p);
        }
      }

      // Also try HTML pattern extraction
      const htmlProducts = extractProductsFromHtml(html, pageUrl);
      for (const p of htmlProducts) {
        if (p.name && !seenProductNames.has(p.name.toLowerCase())) {
          seenProductNames.add(p.name.toLowerCase());
          allProducts.push(p);
        }
      }

      // Extract category info
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "";
      if (title) {
        const existingCat = categories.find(c => c.url === pageUrl);
        if (!existingCat) {
          categories.push({
            name: title.split("|")[0].split("-")[0].trim(),
            url: pageUrl,
            productCount: jsonLdProducts.length + htmlProducts.length,
          });
        }
      }

      onProgress(`Scraped ${pagesScraped}/${productPageUrls.length} pages — ${allProducts.length} products found`);

      // Rate limit
      await new Promise(r => setTimeout(r, 300));
    } catch {
      // Skip failed pages
    }
  }

  // Step 5: Enrich products that are missing images by visiting their detail pages
  onProgress("Enriching products with missing images...");
  let enriched = 0;
  for (const product of allProducts) {
    if (product.images.length === 0 && product.url && enriched < 50) {
      try {
        const html = await fetchWithRetry(product.url);
        if (html) {
          product.images = extractAllImages(html, product.url).slice(0, 5);
          // Also try to get description if missing
          if (!product.description) {
            const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
            if (descMatch) product.description = descMatch[1].substring(0, 500);
          }
          enriched++;
          pagesScraped++;
        }
        await new Promise(r => setTimeout(r, 300));
      } catch { /* skip */ }
    }
  }

  // Step 6: Download product images
  onProgress(`Downloading images for ${allProducts.length} products...`);
  const downloadedImages = await downloadProductImages(allProducts, 3, maxImages);
  onProgress(`Downloaded ${downloadedImages.length} product images`);

  // Update product image references to use local paths
  const imageMap = new Map<string, string>();
  for (const img of downloadedImages) {
    imageMap.set(img.originalUrl, `/public/${img.localPath}`);
  }
  for (const product of allProducts) {
    product.images = product.images.map(url => imageMap.get(url) || url);
  }

  return {
    products: allProducts.slice(0, maxProducts),
    categories,
    totalProductsFound: allProducts.length,
    totalImagesFound: downloadedImages.length,
    pagesScraped,
    downloadedImages,
  };
}
