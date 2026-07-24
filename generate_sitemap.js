import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.SITE_URL || 'https://cmoviez.com';
const PUBLIC_DIR = path.join(__dirname, '../film/public');
const DIST_DIR = path.join(__dirname, '../film/dist');

// Lazy schemas – reuse existing mongoose connections/models if they exist
function getModel(name, collectionName) {
  try {
    return mongoose.model(name);
  } catch {
    const schema = new mongoose.Schema({ id: String, slug: String }, { strict: false });
    return mongoose.model(name, schema, collectionName);
  }
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(date) {
  try {
    return new Date(date || Date.now()).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function buildUrlSetXml(items) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (const item of items) {
    xml += `  <url>\n`;
    xml += `    <loc>${escapeXml(BASE_URL + item.url)}</loc>\n`;
    xml += `    <lastmod>${formatDate(item.updatedAt)}</lastmod>\n`;
    xml += `    <changefreq>${item.changefreq || 'weekly'}</changefreq>\n`;
    xml += `    <priority>${item.priority || '0.8'}</priority>\n`;
    xml += `  </url>\n`;
  }
  xml += `</urlset>\n`;
  return xml;
}

function buildIndexXml(sitemaps) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n`;
  xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (const sm of sitemaps) {
    xml += `  <sitemap>\n`;
    xml += `    <loc>${escapeXml(BASE_URL + sm.url)}</loc>\n`;
    xml += `    <lastmod>${formatDate(sm.lastmod)}</lastmod>\n`;
    xml += `  </sitemap>\n`;
  }
  xml += `</sitemapindex>\n`;
  return xml;
}

function saveFile(filename, content) {
  try {
    if (fs.existsSync(PUBLIC_DIR)) {
      fs.writeFileSync(path.join(PUBLIC_DIR, filename), content, 'utf8');
    }
    if (fs.existsSync(DIST_DIR)) {
      fs.writeFileSync(path.join(DIST_DIR, filename), content, 'utf8');
    }
  } catch (err) {
    console.error(`[Sitemap] Failed to write ${filename}:`, err.message);
  }
}

let _sitemapGenerating = false;

export async function generateSitemaps() {
  if (_sitemapGenerating) return; // avoid concurrent runs
  _sitemapGenerating = true;

  try {
    const Movie = getModel('Movie', 'movies');
    const TVShow = getModel('TVShow', 'tvshows');
    const Anime = getModel('Anime', 'anime');

    const now = new Date();

    // ── Static Pages ────────────────────────────────────────────────────────────
    const staticPages = [
      { url: '/',              priority: '1.0', changefreq: 'daily',   updatedAt: now },
      { url: '/movies',        priority: '0.9', changefreq: 'daily',   updatedAt: now },
      { url: '/tv-shows',      priority: '0.9', changefreq: 'daily',   updatedAt: now },
      { url: '/anime',         priority: '0.9', changefreq: 'daily',   updatedAt: now },
      { url: '/upcoming',      priority: '0.7', changefreq: 'weekly',  updatedAt: now },
      { url: '/genres',        priority: '0.7', changefreq: 'weekly',  updatedAt: now },
      { url: '/about',         priority: '0.5', changefreq: 'monthly', updatedAt: now },
      { url: '/contact',       priority: '0.5', changefreq: 'monthly', updatedAt: now },
      { url: '/privacy-policy',priority: '0.3', changefreq: 'yearly',  updatedAt: now },
      { url: '/terms-of-use',  priority: '0.3', changefreq: 'yearly',  updatedAt: now },
      { url: '/dmca',          priority: '0.3', changefreq: 'yearly',  updatedAt: now },
    ];
    saveFile('sitemap-main.xml', buildUrlSetXml(staticPages));

    // ── Movies ──────────────────────────────────────────────────────────────────
    const movies = await Movie.find({}, 'slug id updatedAt').lean();
    const movieItems = movies.map(m => ({
      url: `/watch/${m.slug || m.id}`,
      updatedAt: m.updatedAt || now,
      priority: '0.8',
      changefreq: 'weekly'
    }));
    saveFile('sitemap-movies-1.xml', buildUrlSetXml(movieItems));
    console.log(`[Sitemap] Movies: ${movies.length}`);

    // ── TV Shows ────────────────────────────────────────────────────────────────
    const tvshows = await TVShow.find({}, 'slug id updatedAt').lean();
    const tvItems = tvshows.map(t => ({
      url: `/watch/${t.slug || t.id}`,
      updatedAt: t.updatedAt || now,
      priority: '0.8',
      changefreq: 'weekly'
    }));
    saveFile('sitemap-tvshows.xml', buildUrlSetXml(tvItems));
    console.log(`[Sitemap] TV Shows: ${tvshows.length}`);

    // ── Anime ───────────────────────────────────────────────────────────────────
    const anime = await Anime.find({}, 'slug id updatedAt').lean();
    const animeItems = anime.map(a => ({
      url: `/watch/${a.slug || a.id}`,
      updatedAt: a.updatedAt || now,
      priority: '0.8',
      changefreq: 'weekly'
    }));
    saveFile('sitemap-anime.xml', buildUrlSetXml(animeItems));
    console.log(`[Sitemap] Anime: ${anime.length}`);

    // ── Index ───────────────────────────────────────────────────────────────────
    saveFile('sitemap.xml', buildIndexXml([
      { url: '/sitemap-main.xml',     lastmod: now },
      { url: '/sitemap-movies-1.xml', lastmod: now },
      { url: '/sitemap-tvshows.xml',  lastmod: now },
      { url: '/sitemap-anime.xml',    lastmod: now },
    ]));

    console.log(`[Sitemap] Generation complete. Total: ${movies.length + tvshows.length + anime.length} entries.`);
  } catch (err) {
    console.error('[Sitemap] Generation error:', err.message);
  } finally {
    _sitemapGenerating = false;
  }
}

// Allow running directly: node generate_sitemap.js
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  import('dotenv').then(d => {
    d.default.config();
    mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cmoviez')
      .then(() => generateSitemaps())
      .then(() => mongoose.disconnect())
      .catch(err => { console.error(err); process.exit(1); });
  });
}
