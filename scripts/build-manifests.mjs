import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAMES_DIR = path.join(REPO_ROOT, "games");
const MUSIC_DIR = path.join(REPO_ROOT, "music");
const REPORT_PATH = path.join(REPO_ROOT, "build-report.json");
const GAMES_OUTPUT_PATH = path.join(REPO_ROOT, "games.json");
const MUSIC_OUTPUT_PATH = path.join(REPO_ROOT, "music.json");

const MUSIC_SOURCE_URL = "https://vision22.my.canva.site/vision/music";
const DOC_SOURCE_URL = "https://docs.google.com/document/d/197mgI1UY2csBnDMrUWwWJxuBjFI6fQaWSN9ar3dWglI/export?format=html";
const DRIVE_DOWNLOAD_PREFIX = "https://drive.google.com/uc?export=download&id=";
const MAX_CONCURRENCY = 6;

const POPULAR_NAME_PATTERNS = [
  /\b8\s*ball\b/i,
  /\bamong us\b/i,
  /\bangry birds\b/i,
  /\bbaldi/i,
  /\bbasketball\b/i,
  /\bbuckshot\b/i,
  /\bcookie clicker\b/i,
  /\bcut the rope\b/i,
  /\bfive nights|fnaf\b/i,
  /\bfriday night funkin\b/i,
  /\bhappy wheels\b/i,
  /\bmario\b/i,
  /\bminecraft\b/i,
  /\bpapa'?s\b/i,
  /\bpokemon\b/i,
  /\bretro bowl\b/i,
  /\brun 3\b/i,
  /\bslither\b/i,
  /\bslope\b/i,
  /\bsonic\b/i,
  /\bsubway surfers\b/i,
  /\btetris\b/i,
  /\btomb of the mask\b/i,
  /\bworld'?s hardest\b/i,
  /\bzelda\b/i
];

const CRITICAL_RELATIVE_REF_EXTENSIONS = /\.(?:css|js|mjs|cjs|json|wasm|unityweb|data|mem|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|ogg|wav|mp4|webm)(?:[?#].*)?$/i;

await fs.mkdir(GAMES_DIR, { recursive: true });
await fs.mkdir(MUSIC_DIR, { recursive: true });

const musicTracks = await buildMusicManifest();
const gameBuild = await buildGameManifest();

await fs.writeFile(MUSIC_OUTPUT_PATH, `${JSON.stringify(musicTracks, null, 2)}\n`, "utf8");
await fs.writeFile(GAMES_OUTPUT_PATH, `${JSON.stringify(gameBuild.games, null, 2)}\n`, "utf8");
await fs.writeFile(
  REPORT_PATH,
  `${JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      musicCount: musicTracks.length,
      gameCount: gameBuild.games.length,
      kept: gameBuild.kept,
      skipped: gameBuild.skipped
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Music tracks: ${musicTracks.length}`);
console.log(`Games kept: ${gameBuild.games.length}`);
console.log(`Games skipped: ${gameBuild.skipped.length}`);

async function buildMusicManifest() {
  const response = await fetch(MUSIC_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Could not fetch Canva music page (${response.status}).`);
  }

  const html = await response.text();
  const driveLinks = [...new Set([...html.matchAll(/https?:\/\/drive\.google\.com\/file\/d\/[^"]+/g)].map(match => match[0].trim()))];

  const trackMetadata = await runLimited(
    driveLinks,
    MAX_CONCURRENCY,
    async (link, index) => {
      const fileId = extractDriveFileId(link);
      if (!fileId) {
        return null;
      }

      const downloadUrl = `${DRIVE_DOWNLOAD_PREFIX}${fileId}`;

      try {
        const response = await fetch(downloadUrl, {
          method: "HEAD",
          redirect: "follow"
        });

        if (!response.ok) {
          return null;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("audio/")) {
          return null;
        }

        const disposition = response.headers.get("content-disposition") || "";
        const fileName = (disposition.match(/filename="([^"]+)"/i)?.[1] || disposition.match(/filename=([^;]+)/i)?.[1] || `Track ${index + 1}`).trim();

        return {
          id: fileId,
          name: cleanTrackName(fileName),
          sourceUrl: link,
          downloadUrl,
          contentType,
          size: Number(response.headers.get("content-length") || 0) || 0,
          extension: path.extname(fileName) || extensionFromContentType(contentType)
        };
      } catch (error) {
        return null;
      }
    }
  );

  const usedKeys = new Set();
  const tracks = trackMetadata
    .filter(Boolean)
    .map((track, index) => ({
      ...track,
      key: createUniqueKey(track.name || `Track ${index + 1}`, usedKeys),
      order: index + 1
    }));

  await runLimited(tracks, MAX_CONCURRENCY, async track => {
    const safeExtension = track.extension && /^\.[a-z0-9]+$/i.test(track.extension) ? track.extension.toLowerCase() : ".mp3";
    const fileName = `${track.key}${safeExtension}`;
    const localPath = path.join(MUSIC_DIR, fileName);
    const existingStats = await fs.stat(localPath).catch(() => null);

    if (existingStats && (!track.size || existingStats.size === track.size)) {
      track.path = `./music/${fileName}`;
      return;
    }

    const response = await fetch(track.downloadUrl, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Could not download track ${track.name}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(arrayBuffer));
    track.path = `./music/${fileName}`;
  });

  await removeStaleFiles(MUSIC_DIR, new Set(tracks.map(track => path.basename(track.path))));

  return tracks;
}

async function buildGameManifest() {
  const response = await fetch(DOC_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Could not fetch game document (${response.status}).`);
  }

  const html = await response.text();
  const candidates = extractGameCandidates(html);
  const usedKeys = new Set();

  const results = await runLimited(candidates, MAX_CONCURRENCY, async candidate => {
    const validation = await validateAndDownloadGame(candidate);
    if (!validation.ok) {
      return {
        status: "skipped",
        reason: validation.reason,
        name: candidate.name,
        sourceUrl: candidate.sourceUrl,
        fileId: candidate.fileId
      };
    }

    const key = createUniqueKey(candidate.name, usedKeys);
    const fileName = `${key}.html`;
    const localPath = path.join(GAMES_DIR, fileName);
    const manifestEntry = {
      key,
      name: candidate.name,
      category: candidate.category,
      platform: candidate.platform,
      popular: candidate.popular,
      order: candidate.order,
      fileId: candidate.fileId,
      sourceUrl: candidate.sourceUrl,
      path: `./games/${fileName}`
    };

    await fs.writeFile(localPath, validation.html, "utf8");

    return {
      status: "kept",
      entry: manifestEntry,
      info: {
        name: candidate.name,
        fileId: candidate.fileId,
        baseHref: validation.baseHref,
        relativeRefs: validation.relativeRefs
      }
    };
  });

  const games = [];
  const kept = [];
  const skipped = [];

  for (const result of results) {
    if (!result) {
      continue;
    }

    if (result.status === "kept") {
      games.push(result.entry);
      kept.push(result.info);
      continue;
    }

    skipped.push({
      name: result.name,
      reason: result.reason,
      sourceUrl: result.sourceUrl,
      fileId: result.fileId
    });
  }

  games.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  await removeStaleFiles(GAMES_DIR, new Set(games.map(game => path.basename(game.path))));

  return { games, kept, skipped };
}

function extractGameCandidates(html) {
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match => match[1]);
  const candidates = [];
  let currentCategory = "Mixed";
  let currentPlatform = "Web";
  let order = 0;
  let beforeLetters = true;

  for (const paragraph of paragraphs) {
    const plainText = normalizeWhitespace(stripTags(paragraph));
    if (!plainText) {
      continue;
    }

    if (/^NDS Games$/i.test(plainText)) {
      break;
    }

    if (/^Community links$/i.test(plainText)) {
      break;
    }

    if (/^[~\-]+$/.test(plainText) || /^WEBSITESSSS/i.test(plainText)) {
      continue;
    }

    if (/^[A-Z]$/.test(plainText)) {
      currentCategory = plainText;
      currentPlatform = "Web";
      beforeLetters = false;
      continue;
    }

    if (/^[A-Za-z0-9 ]+ Games$/i.test(plainText)) {
      currentCategory = "Mixed";
      currentPlatform = plainText.replace(/\s+Games$/i, "").trim();
      continue;
    }

    const hrefMatch = paragraph.match(/<a\b[^>]*href="([^"]+)"/i) || paragraph.match(/<a\b[^>]*href='([^']+)'/i);
    if (!hrefMatch) {
      continue;
    }

    const link = normalizeDocLink(decodeHtml(hrefMatch[1]));
    const fileId = extractDriveFileId(link);
    if (!fileId) {
      continue;
    }

    const name = normalizeGameName(plainText.split(":")[0] || plainText);
    if (!name) {
      continue;
    }

    order += 1;

    candidates.push({
      order,
      name,
      category: beforeLetters ? "Mixed" : currentCategory,
      platform: currentPlatform,
      popular: beforeLetters || POPULAR_NAME_PATTERNS.some(pattern => pattern.test(name)),
      sourceUrl: link,
      fileId
    });
  }

  return candidates;
}

async function validateAndDownloadGame(candidate) {
  const downloadUrl = `${DRIVE_DOWNLOAD_PREFIX}${candidate.fileId}`;

  let response;

  try {
    response = await fetch(downloadUrl, { redirect: "follow" });
  } catch (error) {
    return { ok: false, reason: "Network request failed" };
  }

  if (!response.ok) {
    return { ok: false, reason: `Download returned ${response.status}` };
  }

  const text = await response.text();
  const html = sanitizeGameHtml(text);
  const lower = html.toLowerCase();

  if (html.length < 500) {
    return { ok: false, reason: "Downloaded file was too small" };
  }

  if (
    lower.includes("sorry, the file you have requested does not exist") ||
    lower.includes("google drive - virus scan warning") ||
    lower.includes("access denied") ||
    lower.includes("<title>google drive</title>")
  ) {
    return { ok: false, reason: "Drive returned an unusable file page" };
  }

  if (!/<(?:!doctype|html|body|iframe|script)/i.test(html)) {
    return { ok: false, reason: "Downloaded file did not look like an HTML game" };
  }

  if (/\.swf(?:[?#"'\\s]|$)/i.test(html)) {
    return { ok: false, reason: "Game depends on Flash SWF assets" };
  }

  const baseHref = html.match(/<base\b[^>]*href=["']([^"']+)["']/i)?.[1] || "";
  const relativeRefs = collectUnsafeRelativeRefs(html);

  if (!baseHref && relativeRefs.some(ref => CRITICAL_RELATIVE_REF_EXTENSIONS.test(ref) || !/\.[a-z0-9]{2,5}(?:[?#].*)?$/i.test(ref))) {
    return { ok: false, reason: "Game depends on missing relative assets" };
  }

  return {
    ok: true,
    html: ensureDoctype(html),
    baseHref,
    relativeRefs
  };
}

function sanitizeGameHtml(html) {
  return html
    .replace(/^\s*<module>\s*/i, "")
    .replace(/<script>\s*gadgets\.util\.runOnLoadHandlers\(\);\s*<\/script>/gi, "")
    .replace(/<script>\s*window\.google\.csi\.tickDl\(\);\s*<\/script>/gi, "")
    .replace(/<script\b[^>]*src=["']\s*["'][^>]*>\s*<\/script>/gi, "")
    .replace(/\uFEFF/g, "")
    .trim();
}

function ensureDoctype(html) {
  if (/^\s*<!doctype/i.test(html)) {
    return html;
  }

  return `<!DOCTYPE html>\n${html}`;
}

function collectUnsafeRelativeRefs(html) {
  const refs = new Set();
  const attributeMatches = html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi);
  const cssMatches = html.matchAll(/\burl\((['"]?)([^)'"]+)\1\)/gi);

  for (const match of attributeMatches) {
    const value = (match[1] || "").trim();
    if (isUnsafeRelativeRef(value)) {
      refs.add(value);
    }
  }

  for (const match of cssMatches) {
    const value = (match[2] || "").trim();
    if (isUnsafeRelativeRef(value)) {
      refs.add(value);
    }
  }

  return [...refs];
}

function isUnsafeRelativeRef(value) {
  if (!value) {
    return false;
  }

  if (/^(?:https?:|data:|blob:|mailto:|javascript:|#|\/\/)/i.test(value)) {
    return false;
  }

  if (/^\?/.test(value)) {
    return false;
  }

  return true;
}

function normalizeDocLink(link) {
  try {
    const parsed = new URL(link);
    if (parsed.hostname === "www.google.com" && parsed.pathname === "/url") {
      return parsed.searchParams.get("q") || link;
    }
  } catch (error) {
    return link;
  }

  return link;
}

function extractDriveFileId(link) {
  if (!link) {
    return "";
  }

  try {
    const parsed = new URL(link);

    const directId = parsed.searchParams.get("id");
    if (directId) {
      return directId;
    }

    const match = parsed.pathname.match(/\/d\/([^/]+)/);
    if (match) {
      return match[1];
    }

    const openMatch = parsed.pathname.match(/\/open$/);
    if (openMatch && parsed.searchParams.get("id")) {
      return parsed.searchParams.get("id") || "";
    }
  } catch (error) {
    return "";
  }

  return "";
}

function cleanTrackName(fileName) {
  return normalizeWhitespace(
    fileName
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
  );
}

function extensionFromContentType(contentType) {
  if (contentType === "audio/mpeg") {
    return ".mp3";
  }

  if (contentType === "audio/wav") {
    return ".wav";
  }

  if (contentType === "audio/ogg") {
    return ".ogg";
  }

  return "";
}

function normalizeGameName(value) {
  return normalizeWhitespace(
    decodeHtml(value)
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function createUniqueKey(name, usedKeys) {
  const baseKey = slugify(name) || "item";
  let candidate = baseKey;
  let index = 2;

  while (usedKeys.has(candidate)) {
    candidate = `${baseKey}_${index}`;
    index += 1;
  }

  usedKeys.add(candidate);
  return candidate;
}

function slugify(value) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, "\"")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-")
    .replace(/&#(\d+);/g, (_, codePoint) => {
      const code = Number(codePoint);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint) => {
      const code = Number.parseInt(codePoint, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

async function runLimited(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => consume());
  await Promise.all(workers);
  return results;
}

async function removeStaleFiles(directoryPath, keepFileNames) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  await Promise.all(entries.map(async entry => {
    if (!entry.isFile() || keepFileNames.has(entry.name)) {
      return;
    }

    await fs.unlink(path.join(directoryPath, entry.name));
  }));
}
