import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL(".", import.meta.url).pathname);
const linksPath = resolve(root, "links.json");
const dataPath = resolve(root, "links-data.js");
const url = process.argv[2];

if (!url) {
  console.error("Usage: node add-link.mjs <url> [tag tag...]");
  process.exit(1);
}

const tags = process.argv.slice(3).length ? process.argv.slice(3) : ["읽을거리"];
const normalizedUrl = normalizeUrl(url);
const existing = await readLinks();
const metadata = await fetchMetadata(normalizedUrl);
const finalUrl = metadata.finalUrl || normalizedUrl;
const previous = existing.find((link) => link.url === normalizedUrl || link.url === finalUrl);
const nextItem = {
  id: previous?.id || createId(normalizedUrl),
  url: finalUrl,
  sourceUrl: normalizedUrl === finalUrl ? previous?.sourceUrl || "" : normalizedUrl,
  title: metadata.title || normalizedUrl,
  domain: metadata.domain,
  summary: metadata.summary,
  detail: metadata.detail,
  image: metadata.image,
  tags: unique([...(previous?.tags || []), ...tags]),
  status: previous?.status || "읽기 전",
  savedAt: previous?.savedAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const nextLinks = previous
  ? existing.map((link) => (link.url === normalizedUrl || link.url === finalUrl ? nextItem : link))
  : [nextItem, ...existing];

await writeFile(linksPath, `${JSON.stringify(nextLinks, null, 2)}\n`);
await writeFile(dataPath, `window.LINK_INDEX_DATA = ${JSON.stringify(nextLinks, null, 2)};\n`);

console.log(previous ? "Updated existing link:" : "Added link:");
console.log(`${nextItem.title} (${nextItem.domain})`);

async function readLinks() {
  if (!existsSync(linksPath)) return [];
  const raw = await readFile(linksPath, "utf8");
  return raw.trim() ? JSON.parse(raw) : [];
}

function normalizeUrl(value) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withProtocol);
  parsed.hash = "";
  return parsed.toString();
}

async function fetchMetadata(targetUrl) {
  const response = await fetch(targetUrl, {
    headers: {
      "user-agent": "CotanaLinkIndex/0.1 (+https://openclaw.local)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${targetUrl}: ${response.status} ${response.statusText}`);
  }

  const finalUrl = response.url || targetUrl;
  const html = await response.text();
  const domain = new URL(finalUrl).hostname.replace(/^www\./, "");
  const title = pickMeta(html, ["og:title", "twitter:title"]) || textBetween(html, "title");
  const description = pickMeta(html, ["og:description", "twitter:description", "description"]);
  const image = absolutize(pickMeta(html, ["og:image", "twitter:image"]), finalUrl);
  const markdownUrl = absolutize(pickAlternateMarkdown(html), finalUrl);
  const markdownDetail = markdownUrl ? await fetchMarkdownDetail(markdownUrl) : "";
  const articleBody = pickJsonLdArticleBody(html);
  const bodyText = stripHtml(html).replace(/\s+/g, " ").trim();
  const summary = clip(description || bodyText, 220);
  const detail = clipPreserve(markdownDetail || articleBody || bodyText || description, 3200);

  return {
    finalUrl,
    domain,
    title: clean(title),
    summary: clean(summary),
    detail: cleanDetail(detail),
    image,
  };
}

function pickAlternateMarkdown(html) {
  const match = String(html || "").match(/<link[^>]+rel=["']alternate["'][^>]+type=["']text\/markdown["'][^>]+href=["']([^"']+)["'][^>]*>/i)
    || String(html || "").match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']alternate["'][^>]+type=["']text\/markdown["'][^>]*>/i);
  return match?.[1] || "";
}

async function fetchMarkdownDetail(markdownUrl) {
  try {
    const response = await fetch(markdownUrl, {
      headers: {
        "user-agent": "CotanaLinkIndex/0.1 (+https://openclaw.local)",
        accept: "text/markdown,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) return "";
    const markdown = await response.text();
    const body = markdown.match(/## Topic Body\s+([\s\S]*?)(?:\n## Comments|\n## Metadata|$)/i)?.[1] || markdown;
    return body.trim();
  } catch {
    return "";
  }
}

function pickJsonLdArticleBody(html) {
  const scripts = String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    try {
      const payload = JSON.parse(decodeEntities(script[1]).trim());
      const items = Array.isArray(payload) ? payload : [payload];
      for (const item of items) {
        const body = findArticleBody(item);
        if (body) return body;
      }
    } catch {
      // Some sites emit invalid JSON-LD. Ignore it and fall back to body text.
    }
  }
  return "";
}

function findArticleBody(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.articleBody === "string") return value.articleBody;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findArticleBody(item);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findArticleBody(child);
      if (found) return found;
    }
  }
  return "";
}

function pickMeta(html, names) {
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeEntities(match[1]);
    }
  }
  return "";
}

function textBetween(html, tag) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ? decodeEntities(stripHtml(match[1])) : "";
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanDetail(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clip(value, length) {
  const cleaned = clean(value);
  return cleaned.length > length ? `${cleaned.slice(0, length - 1)}...` : cleaned;
}

function clipPreserve(value, length) {
  const cleaned = cleanDetail(value);
  return cleaned.length > length ? `${cleaned.slice(0, length - 1)}...` : cleaned;
}

function absolutize(value, base) {
  if (!value) return "";
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createId(value) {
  return Buffer.from(value).toString("base64url").slice(0, 16);
}

function unique(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}
