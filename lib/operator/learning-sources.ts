export type FeedItem = {
  title: string;
  url: string;
  excerpt: string;
};

const SKIP_PATH = /\/(tag|tags|category|categories|author|search|about|archive|page|pages|login|subscribe)(\/|$)/i;

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value: string) {
  return stripHtml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

function absoluteUrl(href: string, base: string) {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isHomepage(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" || parsed.pathname === "";
  } catch {
    return false;
  }
}

export function looksLikeFeed(contentType: string, body: string) {
  const type = contentType.toLowerCase();
  if (/rss|atom|xml/.test(type) && !/xhtml|html/.test(type)) return true;
  const head = body.slice(0, 800).toLowerCase();
  return /<(rss|feed|rdf:rdf)\b/.test(head);
}

export function insightFallback(excerpt: string) {
  const text = excerpt.replace(/\s+/g, " ").trim();
  const sentence = text.split(/(?<=[.?!])\s+/).find(part => part.length > 40) ?? text;
  return sentence.slice(0, 280);
}

export function articleExcerpt(html: string) {
  const main = html.match(/<article[\s\S]*?<\/article>/i)?.[0]
    ?? html.match(/<main[\s\S]*?<\/main>/i)?.[0]
    ?? html;
  const paragraphs = [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => stripHtml(match[1] ?? ""))
    .filter(text => text.length > 50 && !/cookie|subscribe|sign in|newsletter/i.test(text));
  if (paragraphs.length) return paragraphs.slice(0, 3).join(" ").slice(0, 1_800);
  return insightFallback(stripHtml(main).slice(0, 2_000));
}

export function parseRssOrAtom(xml: string, baseUrl: string): FeedItem[] {
  const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi), ...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)];
  return items.map(match => {
    const block = match[0];
    const title = decodeXml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim());
    const link = absoluteUrl(
      (block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]
        ?? block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]
        ?? "").trim(),
      baseUrl,
    );
    const excerpt = decodeXml((
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]
      ?? block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1]
      ?? block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1]
      ?? ""
    ).trim());
    return { title: title.slice(0, 160), url: link, excerpt: insightFallback(excerpt) };
  }).filter(item => item.url && item.title && !isHomepage(item.url));
}

export function discoverFeedUrl(html: string, pageUrl: string) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]);
  for (const tag of links) {
    if (!/rel=["'][^"']*alternate/i.test(tag)) continue;
    if (!/type=["'][^"']*(rss|atom|xml)/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    const url = href ? absoluteUrl(href, pageUrl) : "";
    if (url) return url;
  }
  return null;
}

export function extractArticleLinks(html: string, pageUrl: string) {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluteUrl(match[1] ?? "", pageUrl);
    if (!url || seen.has(url) || isHomepage(url)) continue;
    let host = "";
    let path = "";
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      path = parsed.pathname;
    } catch {
      continue;
    }
    let pageHost = "";
    try { pageHost = new URL(pageUrl).hostname; } catch { pageHost = ""; }
    if (pageHost && host !== pageHost && !host.endsWith(`.${pageHost}`)) continue;
    if (SKIP_PATH.test(path)) continue;
    if (!/\/20\d{2}\/|\/(blog|posts|p|articles|writing|notes)\//i.test(path) && (path.match(/\//g) ?? []).length < 2) continue;
    const label = stripHtml(match[2] ?? "");
    if (label.length < 12 && !/\/20\d{2}\//.test(path)) continue;
    seen.add(url);
    found.push(url);
    if (found.length >= 6) break;
  }
  return found;
}

export function commonFeedUrls(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    if (!isHomepage(url.toString()) && /rss|atom|feed|xml/i.test(url.pathname)) return [];
    return [
      new URL("/feed", url).toString(),
      new URL("/atom.xml", url).toString(),
      new URL("/rss.xml", url).toString(),
      new URL("/feed.xml", url).toString(),
      new URL("/index.xml", url).toString(),
      new URL("/atom/everything/", url).toString(),
    ];
  } catch {
    return [];
  }
}
