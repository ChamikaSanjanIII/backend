import fs from 'fs';
import path from 'path';

// Lazy-load sharp so backend still starts even if sharp isn't installed yet
let sharpModule = null;
async function getSharp() {
  if (sharpModule !== null) return sharpModule;
  try {
    const mod = await import('sharp');
    const sharp = mod.default || mod;
    // Ultra-low RAM & CPU footprint for Oracle Always Free VPS
    sharp.concurrency(1);
    sharp.cache(false);
    sharpModule = sharp;
    return sharp;
  } catch (err) {
    console.warn('[ImageHost] sharp not installed yet — run `npm install sharp` in Backend:', err.message);
    sharpModule = false;
    return false;
  }
}

export const IMAGE_STORAGE_DIR = process.env.IMAGE_STORAGE_DIR || '/var/www/cmoviez-images';
export const IMAGE_PUBLIC_BASE_URL = (process.env.IMAGE_PUBLIC_BASE_URL || 'https://image.cmoviez.com').replace(/\/+$/, '');

function sanitizeFolder(str) {
  return String(str || 'untitled')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'untitled';
}

function getOriginalBasename(url) {
  try {
    const pathname = new URL(url).pathname;
    const base = path.basename(pathname, path.extname(pathname));
    const safe = base.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    return safe || `img_${Date.now()}`;
  } catch {
    return `img_${Date.now()}`;
  }
}

function hasNonEmptyValue(val) {
  if (!val) return false;
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t || t === '{}' || t === '[]') return false;
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return hasNonEmptyValue(JSON.parse(t)); } catch { return true; }
    }
    return true;
  }
  if (Array.isArray(val)) return val.some(item => hasNonEmptyValue(item));
  if (typeof val === 'object') return Object.values(val).some(v => hasNonEmptyValue(v));
  return false;
}

function episodeHasLink(ep) {
  if (!ep || typeof ep !== 'object') return false;
  const direct = String(
    ep.downloadUrl || ep.videoUrl || ep.url || ep.link || ep.src ||
    ep.streamUrl || ep.VideoUrl || ep.download || ep.dl ||
    ep.downloadUrl480p || ep.downloadUrl540p || ep.downloadUrl720p || ep.downloadUrl1080p || ''
  ).trim();
  if (direct.length > 0) return true;
  return (
    hasNonEmptyValue(ep.download_links) ||
    hasNonEmptyValue(ep.burned_subtitle_links) ||
    hasNonEmptyValue(ep.softcode_subtitle_links) ||
    hasNonEmptyValue(ep.subtitle_links)
  );
}

async function downloadAndConvertToWebp(sourceUrl, maxWidth = 640) {
  if (!sourceUrl || typeof sourceUrl !== 'string') return sourceUrl;
  const trimmed = sourceUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return sourceUrl;
  if (trimmed.startsWith(IMAGE_PUBLIC_BASE_URL)) return trimmed;

  const sharp = await getSharp();
  if (!sharp) return sourceUrl;

  try {
    const baseName = getOriginalBasename(trimmed);
    const fileName = `${baseName}.webp`;
    const absPath = path.join(IMAGE_STORAGE_DIR, fileName);

    // If already downloaded in flat VPS folder, reuse immediately
    if (fs.existsSync(absPath) && fs.statSync(absPath).size > 0) {
      return `${IMAGE_PUBLIC_BASE_URL}/${fileName}`;
    }

    const res = await fetch(trimmed);
    if (!res.ok) return sourceUrl;
    const inputBuf = Buffer.from(await res.arrayBuffer());

    fs.mkdirSync(IMAGE_STORAGE_DIR, { recursive: true });
    await sharp(inputBuf)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality: 75, effort: 4 })
      .toFile(absPath);

    return `${IMAGE_PUBLIC_BASE_URL}/${fileName}`;
  } catch (err) {
    console.error(`[ImageHost] Failed to localize ${trimmed}:`, err.message);
    return sourceUrl;
  }
}

/**
 * Automatically downloads external poster, backdrop, and linked-episode thumbnails,
 * converts them to compressed WebP in ONE flat VPS folder, and rewrites URLs to image.cmoviez.com/<name>.webp.
 */
export async function localizeDocumentImages(table, body) {
  if (!body || typeof body !== 'object') return body;
  if (process.env.DISABLE_AUTO_IMAGE_HOST === 'true') return body;

  if (body.poster && typeof body.poster === 'string') {
    body.poster = await downloadAndConvertToWebp(body.poster, 500);
  }
  if (body.backdrop && typeof body.backdrop === 'string') {
    body.backdrop = await downloadAndConvertToWebp(body.backdrop, 1280);
  }

  if (body.episodes) {
    const wasString = typeof body.episodes === 'string';
    let epsArr = body.episodes;
    if (wasString) {
      try { epsArr = JSON.parse(body.episodes); } catch { epsArr = null; }
    }

    if (Array.isArray(epsArr)) {
      let changed = false;

      for (const ep of epsArr) {
        if (!ep || typeof ep !== 'object') continue;
        if (!episodeHasLink(ep)) continue;
        if (ep.thumbnail && typeof ep.thumbnail === 'string' && !ep.thumbnail.startsWith(IMAGE_PUBLIC_BASE_URL)) {
          const newUrl = await downloadAndConvertToWebp(ep.thumbnail, 640);
          if (newUrl !== ep.thumbnail) {
            ep.thumbnail = newUrl;
            changed = true;
          }
        }
      }

      if (changed) {
        body.episodes = wasString ? JSON.stringify(epsArr) : epsArr;
      }
    }
  }

  return body;
}

export function listHostedImages() {
  if (!fs.existsSync(IMAGE_STORAGE_DIR)) {
    return {
      images: [],
      totalCount: 0,
      totalBytes: 0,
      baseUrl: IMAGE_PUBLIC_BASE_URL,
      storageDir: IMAGE_STORAGE_DIR
    };
  }

  const images = [];
  let totalBytes = 0;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(webp|jpe?g|png|avif)$/i.test(entry.name)) {
        const stat = fs.statSync(full);
        const rel = path.relative(IMAGE_STORAGE_DIR, full).split(path.sep).join('/');
        const parts = rel.split('/');
        const collection = parts.length > 1 ? parts[0] : 'root';
        const folder = parts.length > 2 ? parts[1] : '';
        totalBytes += stat.size;
        images.push({
          path: rel,
          url: `${IMAGE_PUBLIC_BASE_URL}/${rel}`,
          collection,
          folder,
          filename: entry.name,
          size: stat.size,
          updatedAt: stat.mtime.toISOString()
        });
      }
    }
  }

  walk(IMAGE_STORAGE_DIR);
  images.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return {
    images,
    totalCount: images.length,
    totalBytes,
    baseUrl: IMAGE_PUBLIC_BASE_URL,
    storageDir: IMAGE_STORAGE_DIR
  };
}

export function deleteHostedImages(relPaths = []) {
  const rootResolved = path.resolve(IMAGE_STORAGE_DIR);
  const deleted = [];
  const errors = [];

  for (const rel of relPaths) {
    if (!rel || typeof rel !== 'string') continue;
    const cleanRel = rel.replace(/^\/+/, '');
    const target = path.resolve(rootResolved, cleanRel);

    // Prevent path traversal outside IMAGE_STORAGE_DIR
    if (!target.startsWith(rootResolved + path.sep)) {
      errors.push({ path: rel, error: 'Invalid path' });
      continue;
    }

    try {
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        fs.unlinkSync(target);
        deleted.push(cleanRel);

        // Clean up empty parent directories up to IMAGE_STORAGE_DIR
        let parent = path.dirname(target);
        while (parent.startsWith(rootResolved + path.sep) && parent !== rootResolved) {
          if (fs.readdirSync(parent).length === 0) {
            fs.rmdirSync(parent);
            parent = path.dirname(parent);
          } else {
            break;
          }
        }
      }
    } catch (err) {
      errors.push({ path: rel, error: err.message });
    }
  }

  return { deleted, errors };
}
