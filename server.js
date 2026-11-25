import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateSitemaps } from './generate_sitemap.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Allowed Origins list
const ALLOWED_ORIGINS = [
  'https://cmoviez.com',
  'https://www.cmoviez.com',
  'http://cmoviez.com',
  'https://cmoviez.com',
  'https://www.cmoviez.com',
  'http://cmoviez.com',
  'https://dashboard.cmoviez.com',
  'http://dashboard.cmoviez.com',
  'http://localhost:3000',
  'http://localhost:3005',
  'http://localhost:5173',
  'http://localhost:5000'
];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, server-to-server or cURL)
    if (!origin) return callback(null, true);

    const isExplicitAllowed = ALLOWED_ORIGINS.includes(origin) || 
      (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.split(',').includes(origin));

    // Allow specific testing IP (192.168.1.73) and localhost
    const isSpecificLocalIP = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.1\.73)(:\d+)?$/.test(origin);

    if (isExplicitAllowed || isSpecificLocalIP) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy: Origin not allowed'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cmoviez')
  .then(() => {
    console.log('MongoDB connected successfully');
    // Generate sitemaps on startup to include all existing films
    generateSitemaps().catch(err => console.error('[Sitemap] Startup generation error:', err.message));
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Database Schemas
const documentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: String,
  slug: String,
  year: String,
  rating: String,
  type: { type: String, default: 'movie' },
  genres: mongoose.Schema.Types.Mixed,
  cast: mongoose.Schema.Types.Mixed,
  castWithPhotos: mongoose.Schema.Types.Mixed,
  directorsWithPhotos: mongoose.Schema.Types.Mixed,
  directorPhotos: mongoose.Schema.Types.Mixed,
  studios: mongoose.Schema.Types.Mixed,
  studioLogos: mongoose.Schema.Types.Mixed,
  description: String,
  poster: String,
  backdrop: String,
  logo: String,
  mobileHero: String,
  country: String,
  director: mongoose.Schema.Types.Mixed,
  watchOffline: String,
  audio: mongoose.Schema.Types.Mixed,
  subtitles: mongoose.Schema.Types.Mixed,
  thisShowIs: mongoose.Schema.Types.Mixed,
  downloadUrl: String,
  download_links: { type: mongoose.Schema.Types.Mixed, default: {} },
  burned_subtitle_links: { type: mongoose.Schema.Types.Mixed, default: {} },
  softcode_subtitle_links: { type: mongoose.Schema.Types.Mixed, default: {} },
  downloadUrl540p: String,
  downloadUrl720p: String,
  downloadUrl1080p: String,
  tmdbId: String,
  releaseDate: String,
  episodes: mongoose.Schema.Types.Mixed,
  seasons: mongoose.Schema.Types.Mixed,
  isFeaturedHome: { type: Boolean, default: false },
  isFeaturedMovies: { type: Boolean, default: false },
  isFeaturedTV: { type: Boolean, default: false },
  isFeaturedAnime: { type: Boolean, default: false },
  isTrending: { type: Boolean, default: false },
  trendingRank: { type: Number, default: 0 },
  isCompleted: { type: Boolean, default: false }
}, {
  timestamps: true,
  minimize: false,
  strict: false
});

// Create models for each collection
const Movie = mongoose.model('Movie', documentSchema, 'movies');
const TVShow = mongoose.model('TVShow', documentSchema, 'tvshows');
const Anime = mongoose.model('Anime', documentSchema, 'anime');
const Upcoming = mongoose.model('Upcoming', documentSchema, 'upcoming');

const modelsMap = {
  movies: Movie,
  tvshows: TVShow,
  anime: Anime,
  upcoming: Upcoming
};

// ── Movie Request Schema ───────────────────────────────────────────────────────
const movieRequestSchema = new mongoose.Schema({
  requesterName: { type: String, required: true },
  movieName: { type: String, required: true },
  type: { type: String, enum: ['movie', 'series', 'anime'], default: 'movie' },
  moreDetails: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'complete', 'rejected'], default: 'pending' },
  adminNote: { type: String, default: '' }
}, {
  timestamps: true
});

const MovieRequest = mongoose.model('MovieRequest', movieRequestSchema, 'movie_requests');

// Formatting helper to match the exact schema expected by client apps
function formatDocument(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;

  // Access the custom 'id' field directly from the Mongoose document to bypass the virtual 'id' getter conflict
  let id = '';
  if (doc.get && typeof doc.get === 'function') {
    id = doc.get('id');
  }
  if (!id) {
    id = obj.id || (obj._id ? obj._id.toString() : '');
  }

  const createdAt = obj.createdAt ? obj.createdAt.toISOString() : new Date().toISOString();
  const updatedAt = obj.updatedAt ? obj.updatedAt.toISOString() : new Date().toISOString();

  return {
    ...obj,
    _id: undefined,
    __v: undefined,
    id,
    $id: id,
    createdAt,
    updatedAt,
    $createdAt: createdAt,
    $updatedAt: updatedAt
  };
}

// ── Auth Helpers ───────────────────────────────────────────────────────────────

function verifyAuth(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  return token === (process.env.ADMIN_TOKEN || 'secret-admin-token-123');
}

// ── OG Bot Helpers ─────────────────────────────────────────────────────────────

const BOT_USER_AGENTS = [
  'facebookexternalhit', 'Facebot', 'Twitterbot', 'WhatsApp',
  'TelegramBot', 'LinkedInBot', 'Slackbot', 'Discordbot',
  'Pinterest', 'Viber', 'Googlebot', 'Google-Inspection-Tool', 'Google', 'bingbot', 'Applebot',
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some(bot => ua.includes(bot.toLowerCase()));
}

async function findMovieBySlug(slug) {
  const cleanSlug = slug
    .split('/')[0]
    .split('?')[0]
    .replace('-with-sinhala-subtitles', '')
    .replace('-sinhala-subtitles', '')
    .replace('-sinhala-sub', '');

  const collections = [Movie, TVShow, Anime, Upcoming];
  for (const Model of collections) {
    const doc = await Model.findOne({
      $or: [
        { slug: slug },
        { slug: cleanSlug },
        { id: slug },
        { id: cleanSlug }
      ]
    });
    if (doc) return doc;
  }
  return null;
}

function getRequestUrl(req) {
  const host = req.get('host') || 'cmoviez.com';
  return `https://${host}${req.originalUrl}`;
}

function generateBotHTML(movie, requestUrl) {
  const isTV = movie.type === 'tv' || movie.type === 'tvshow';
  const schemaType = isTV ? 'TVSeries' : 'Movie';
  const title = `${movie.title} with Sinhala Subtitles | ${movie.title} සිංහල උපසිරැසි සමඟ | CMoviez`;
  const description = movie.description
    ? movie.description.substring(0, 160)
    : `Download ${movie.title} with Sinhala Subtitles for free on CMoviez. High quality movie downloads.`;
  const poster = movie.poster || movie.backdrop || '';
  const year = movie.year || '';

  const schema = {
    "@context": "https://schema.org",
    "@type": schemaType,
    "name": `${movie.title} with Sinhala Subtitles`,
    "alternateName": movie.title,
    "description": description,
    "image": poster,
    "url": requestUrl,
    ...(year ? { "datePublished": String(year) } : {})
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${requestUrl}">

  <meta property="og:type" content="${isTV ? 'video.tv_show' : 'video.movie'}">
  <meta property="og:url" content="${requestUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${poster}">
  <meta property="og:site_name" content="CMoviez">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${poster}">

  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <h1>${movie.title} (${year}) with Sinhala Subtitles</h1>
  <p>${description}</p>
  <img src="${poster}" alt="${movie.title}">
  <a href="${requestUrl}">Watch on CMoviez</a>
</body>
</html>`;
}

function generateEpisodeBotHTML(movie, seasonNum, episodeNum, requestUrl) {
  const title = `${movie.title} Season ${seasonNum} Episode ${episodeNum} with Sinhala Subtitles | CMoviez`;
  const description = `Download ${movie.title} Season ${seasonNum} Episode ${episodeNum} with Sinhala Subtitles for free on CMoviez. High quality episode downloads.`;
  const poster = movie.backdrop || movie.poster || '';

  const schema = {
    "@context": "https://schema.org",
    "@type": "TVEpisode",
    "name": `${movie.title} S${seasonNum}E${episodeNum}`,
    "description": description,
    "image": poster,
    "url": requestUrl
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${requestUrl}">

  <meta property="og:type" content="video.episode">
  <meta property="og:url" content="${requestUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${poster}">
  <meta property="og:site_name" content="CMoviez">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${poster}">

  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <h1>${movie.title} Season ${seasonNum} Episode ${episodeNum}</h1>
  <p>${description}</p>
  <img src="${poster}" alt="${movie.title}">
  <a href="${requestUrl}">Watch on CMoviez</a>
</body>
</html>`;
}

// ── REST API Routes ────────────────────────────────────────────────────────────

// Robots.txt — Serve real robots.txt with allowed media & sitemap index
app.get('/robots.txt', (req, res) => {
  const distRobots = path.join(__dirname, '../film/dist/robots.txt');
  const publicRobots = path.join(__dirname, '../film/public/robots.txt');
  res.sendFile(distRobots, (err) => {
    if (err) {
      res.sendFile(publicRobots, (err2) => {
        if (err2) {
          res.type('text/plain').send("User-agent: *\nAllow: /\n\nSitemap: https://cmoviez.com/sitemap.xml");
        }
      });
    }
  });
});

// Root API path health check & status
app.get('/api', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.json({
    status: 'online',
    message: 'CMovieZ API Server is running',
    version: '1.0.0'
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@cmoviez.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const adminToken = process.env.ADMIN_TOKEN || 'secret-admin-token-123';

  if (email === adminEmail && password === adminPassword) {
    return res.json({
      success: true,
      user: { email, name: 'Admin' },
      token: adminToken,
    });
  }
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Session check
app.get('/api/auth/session', (req, res) => {
  if (!verifyAuth(req)) {
    return res.status(401).json({ success: false });
  }
  return res.json({
    success: true,
    user: { email: process.env.ADMIN_EMAIL || 'admin@cmoviez.com', name: 'Admin' }
  });
});

// List Documents
app.get('/api/collections/:table/documents', async (req, res) => {
  const { table } = req.params;
  const Model = modelsMap[table];
  if (!Model) {
    return res.status(400).json({ error: 'Invalid collection name' });
  }

  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const orderBy = req.query.orderBy || 'createdAt';
    const orderDir = req.query.orderDir === 'ASC' ? 1 : -1;
    const search = req.query.search || '';
    const searchField = req.query.searchField || 'title';

    const query = {};
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query[searchField] = { $regex: escapedSearch, $options: 'i' };
    }

    const sortQuery = {};
    if (orderBy === 'id' || orderBy === '$id') {
      sortQuery['id'] = orderDir;
    } else {
      sortQuery[orderBy] = orderDir;
    }

    const docs = await Model.find(query)
      .sort(sortQuery)
      .skip(offset)
      .limit(limit);

    const total = await Model.countDocuments(query);

    return res.json({
      documents: docs.map(formatDocument),
      total
    });
  } catch (error) {
    console.error('List documents error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get single document
app.get('/api/collections/:table/documents/:id', async (req, res) => {
  const { table, id } = req.params;
  const Model = modelsMap[table];
  if (!Model) {
    return res.status(400).json({ error: 'Invalid collection name' });
  }

  try {
    let doc = await Model.findOne({ id });
    if (!doc && mongoose.Types.ObjectId.isValid(id)) {
      doc = await Model.findById(id);
    }
    if (!doc) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json(formatDocument(doc));
  } catch (error) {
    console.error('Get document error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get single movie/series by slug across all collections (for fast SSR & SEO)
app.get('/api/movie-by-slug/:slug', async (req, res) => {
  try {
    const movie = await findMovieBySlug(req.params.slug);
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    return res.json(formatDocument(movie));
  } catch (error) {
    console.error('movie-by-slug error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Create Document
app.post('/api/collections/:table/documents', async (req, res) => {
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { table } = req.params;
  const Model = modelsMap[table];
  if (!Model) {
    return res.status(400).json({ error: 'Invalid collection name' });
  }

  try {
    const body = req.body;
    const id = body.id || new mongoose.Types.ObjectId().toString();
    delete body.id;

    if (!body.lastUpdateNote) {
      if (table === 'tvshows') {
        body.lastUpdateNote = 'New TV Series Added';
      } else if (table === 'anime') {
        body.lastUpdateNote = 'New Anime Added';
      } else {
        body.lastUpdateNote = 'New Movie Added';
      }
    }

    const newDoc = new Model({ ...body, id });
    await newDoc.save();

    // Auto-regenerate sitemap in background
    generateSitemaps().catch(err => console.error('[Sitemap] Auto-gen error:', err.message));

    return res.status(201).json(formatDocument(newDoc));
  } catch (error) {
    console.error('Create document error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Helper: normalize episodes to detect ONLY episode add/delete or episode download link changes
function normalizeEpisodeDownloadLinks(val) {
  if (!val) return {};
  let parsed = val;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return {};
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  if (Array.isArray(parsed)) {
    return parsed
      .map(item => normalizeEpisodeDownloadLinks(item))
      .filter(item => item !== '' && item !== null && item !== undefined);
  }
  if (typeof parsed === 'object' && parsed !== null) {
    const out = {};
    for (const key of Object.keys(parsed).sort()) {
      const v = parsed[key];
      if (v === null || v === undefined) continue;
      if (typeof v === 'string') {
        const t = v.trim();
        if (t) out[key] = t;
      } else {
        const norm = normalizeEpisodeDownloadLinks(v);
        if (
          (Array.isArray(norm) && norm.length > 0) ||
          (typeof norm === 'object' && norm !== null && Object.keys(norm).length > 0) ||
          (typeof norm === 'string' && norm.length > 0)
        ) {
          out[key] = norm;
        }
      }
    }
    return out;
  }
  return String(parsed).trim();
}

function parseNormalizedEpisodes(raw) {
  if (!raw) return [];
  let arr = raw;
  if (typeof arr === 'string') {
    const trimmed = arr.trim();
    if (!trimmed) return [];
    try {
      arr = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];

  // Flatten nested seasons structure if present
  const flat = [];
  if (arr.length > 0 && (arr[0]?.episodes || arr[0]?.Episodes || arr[0]?.eps)) {
    arr.forEach((s, idx) => {
      const sNum = Number(s.season ?? s.seasonNumber ?? idx + 1) || 1;
      const eps = s.episodes || s.Episodes || s.eps || [];
      if (Array.isArray(eps)) {
        eps.forEach(ep => flat.push({ ...ep, season: Number(ep.season) || sNum }));
      }
    });
  } else {
    arr.forEach(ep => {
      if (ep && typeof ep === 'object') flat.push(ep);
    });
  }

  const normalized = flat.map(ep => {
    const dl = String(
      ep.downloadUrl || ep.videoUrl || ep.url || ep.link || ep.src ||
      ep.streamUrl || ep.VideoUrl || ep.download || ep.dl || ''
    ).trim();
    return {
      s: Number(ep.season) || 1,
      e: Number(ep.episode) || 0,
      dl,
      links: normalizeEpisodeDownloadLinks(ep.download_links)
    };
  });

  normalized.sort((a, b) => (a.s - b.s) || (a.e - b.e));
  return normalized;
}

function episodeHasDownloadLink(ep) {
  if (!ep) return false;
  if (ep.dl && ep.dl.length > 0) return true;
  if (ep.links && typeof ep.links === 'object' && Object.keys(ep.links).length > 0) return true;
  if (typeof ep.links === 'string' && ep.links.length > 0) return true;
  return false;
}

function formatAddedEpisodesNote(addedEps) {
  if (!Array.isArray(addedEps) || addedEps.length === 0) return null;
  const bySeason = new Map();
  for (const ep of addedEps) {
    const s = ep.s || 1;
    if (!bySeason.has(s)) bySeason.set(s, []);
    if (ep.e > 0 && !bySeason.get(s).includes(ep.e)) {
      bySeason.get(s).push(ep.e);
    }
  }
  const seasons = Array.from(bySeason.keys()).sort((a, b) => a - b);
  if (seasons.length === 1) {
    const s = seasons[0];
    const eps = bySeason.get(s).sort((a, b) => a - b);
    if (eps.length === 0) return `Season ${s} Updated`;
    if (eps.length === 1) return `Season ${s} • Episode ${eps[0]} Added`;
    return `Season ${s} • Episodes ${eps.join(', ')} Added`;
  }
  const parts = seasons.map(s => {
    const eps = bySeason.get(s).sort((a, b) => a - b);
    return eps.length > 0 ? `S${s} E${eps.join(', ')}` : `S${s}`;
  });
  return `${parts.join(' & ')} Added`;
}

// Update Document
app.put('/api/collections/:table/documents/:id', async (req, res) => {
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { table, id } = req.params;
  const Model = modelsMap[table];
  if (!Model) {
    return res.status(400).json({ error: 'Invalid collection name' });
  }

  try {
    const body = req.body;

    // Clean up incoming object properties to prevent overriding system attributes directly
    delete body.id;
    delete body._id;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.$id;
    delete body.$createdAt;
    delete body.$updatedAt;

    let existing = await Model.findOne({ id }).lean();
    if (!existing && mongoose.Types.ObjectId.isValid(id)) {
      existing = await Model.findOne({ _id: id }).lean();
    }
    if (!existing) {
      return res.status(404).json({ error: 'Not found' });
    }

    // ONLY bump updatedAt if an episode was added/deleted OR an episode's download link changed.
    // All other edits (title, poster, cast, trending/featured, movie links, etc.) preserve updatedAt.
    let shouldBumpUpdatedAt = false;
    let computedUpdateNote = null;

    if (Object.prototype.hasOwnProperty.call(body, 'episodes')) {
      const oldEps = parseNormalizedEpisodes(existing.episodes);
      const newEps = parseNormalizedEpisodes(body.episodes);
      const oldSig = JSON.stringify(oldEps);
      const newSig = JSON.stringify(newEps);

      if (oldSig !== newSig) {
        shouldBumpUpdatedAt = true;

        // Detect which episodes were added or had download links added/updated in this save
        const oldMap = new Map(oldEps.map(ep => [`${ep.s}-${ep.e}`, ep]));
        const addedOrLinked = [];
        for (const ep of newEps) {
          const prev = oldMap.get(`${ep.s}-${ep.e}`);
          if (!prev) {
            addedOrLinked.push(ep);
          } else if (
            episodeHasDownloadLink(ep) &&
            (prev.dl !== ep.dl || JSON.stringify(prev.links) !== JSON.stringify(ep.links))
          ) {
            addedOrLinked.push(ep);
          }
        }

        if (addedOrLinked.length > 0) {
          computedUpdateNote = formatAddedEpisodesNote(addedOrLinked);
        }
      }
    }

    const updatePayload = { ...body };
    if (shouldBumpUpdatedAt) {
      updatePayload.updatedAt = new Date();
      if (computedUpdateNote) {
        updatePayload.lastUpdateNote = computedUpdateNote;
      }
    }

    // Use native MongoDB collection driver so Mongoose NEVER touches updatedAt unless explicitly set above
    await Model.collection.updateOne({ _id: existing._id }, { $set: updatePayload });
    const doc = await Model.findById(existing._id);

    // Auto-regenerate sitemap in background
    generateSitemaps().catch(err => console.error('[Sitemap] Auto-gen error:', err.message));

    return res.json(formatDocument(doc));
  } catch (error) {
    console.error('Update document error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Public Get Like Count
app.get('/api/collections/:table/documents/:id/like', async (req, res) => {
  const { table, id } = req.params;
  const Model = modelsMap[table];
  if (!Model) {
    return res.status(400).json({ error: 'Invalid collection name' });
  }
  try {
    let doc = await Model.findOne({ id }, { likes: 1 });
    if (!doc && mongoose.Types.ObjectId.isValid(id)) {
      doc = await Model.findOne({ _id: id }, { likes: 1 });
    }
    if (!doc) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ likes: Math.max(0, Number(doc.likes) || 0) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Public Like / Unlike Document (Atomic Counter)
app.post('/api/collections/:table/documents/:id/like', async (req, res) => {
  const { table, id } = req.params;
  const Model = modelsMap[table];
  if (!Model) {
    return res.status(400).json({ error: 'Invalid collection name' });
  }

  try {
    const action = req.body?.action === 'unlike' ? 'unlike' : 'like';
    const delta = action === 'unlike' ? -1 : 1;

    // Use native MongoDB collection driver so Mongoose NEVER touches updatedAt
    let doc = await Model.findOne({ id }, { _id: 1, likes: 1 }).lean();
    if (!doc && mongoose.Types.ObjectId.isValid(id)) {
      doc = await Model.findOne({ _id: id }, { _id: 1, likes: 1 }).lean();
    }
    if (!doc) {
      return res.status(404).json({ error: 'Not found' });
    }

    const currentLikes = Number(doc.likes) || 0;
    const finalLikes = Math.max(0, currentLikes + delta);
    await Model.collection.updateOne({ _id: doc._id }, { $set: { likes: finalLikes } });

    return res.json({ likes: finalLikes });
  } catch (error) {
    console.error('Like document error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Public Track Download Count (Per-Link + Total Atomic Counter)
app.post('/api/collections/:table/documents/:id/track-download', async (req, res) => {
  const { table, id } = req.params;
  const Model = modelsMap[table];
  if (!Model) {
    return res.status(400).json({ error: 'Invalid collection name' });
  }

  try {
    const rawKey = String(req.body?.key || 'general').trim();
    const safeKey = rawKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'general';
    const isSubtitle = Boolean(req.body?.isSubtitle);

    const incObj = {
      downloads: 1,
      [`linkDownloads.${safeKey}`]: 1
    };
    if (isSubtitle) {
      incObj.subtitleDownloads = 1;
    }

    // Use native MongoDB collection driver so Mongoose NEVER touches updatedAt
    let doc = await Model.findOne({ id }, { _id: 1, downloads: 1, subtitleDownloads: 1, linkDownloads: 1 }).lean();
    if (!doc && mongoose.Types.ObjectId.isValid(id)) {
      doc = await Model.findOne({ _id: id }, { _id: 1, downloads: 1, subtitleDownloads: 1, linkDownloads: 1 }).lean();
    }
    if (!doc) {
      return res.status(404).json({ error: 'Not found' });
    }

    await Model.collection.updateOne({ _id: doc._id }, { $inc: incObj });

    return res.json({
      downloads: (Number(doc.downloads) || 0) + 1,
      subtitleDownloads: (Number(doc.subtitleDownloads) || 0) + (isSubtitle ? 1 : 0)
    });
  } catch (error) {
    console.error('Track download error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Delete Document
app.delete('/api/collections/:table/documents/:id', async (req, res) => {
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { table, id } = req.params;
  const Model = modelsMap[table];
  if (!Model) {
    return res.status(400).json({ error: 'Invalid collection name' });
  }

  try {
    let result = await Model.deleteOne({ id });
    if (result.deletedCount === 0 && mongoose.Types.ObjectId.isValid(id)) {
      result = await Model.deleteOne({ _id: id });
    }
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Auto-regenerate sitemap in background
    generateSitemaps().catch(err => console.error('[Sitemap] Auto-gen error:', err.message));

    return res.json({ success: true, id });
  } catch (error) {
    console.error('Delete document error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ── Movie Request Routes ───────────────────────────────────────────────────────

// Submit a request (public)
app.post('/api/requests', async (req, res) => {
  try {
    const { requesterName, movieName, type, moreDetails } = req.body;
    if (!requesterName || !movieName) {
      return res.status(400).json({ error: 'requesterName and movieName are required' });
    }
    const newRequest = new MovieRequest({ requesterName, movieName, type: type || 'movie', moreDetails: moreDetails || '' });
    await newRequest.save();
    return res.status(201).json(newRequest);
  } catch (error) {
    console.error('Submit request error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Public stats — no auth required (counts only, no private data)
app.get('/api/requests/stats', async (req, res) => {
  try {
    const total    = await MovieRequest.countDocuments();
    const pending  = await MovieRequest.countDocuments({ status: 'pending' });
    const complete = await MovieRequest.countDocuments({ status: 'complete' });
    const rejected = await MovieRequest.countDocuments({ status: 'rejected' });
    return res.json({ total, pending, complete, rejected });
  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Public list of recent requests for user status view
app.get('/api/requests/public', async (req, res) => {
  try {
    const requests = await MovieRequest.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .select('requesterName movieName type status adminNote createdAt');
    return res.json(requests);
  } catch (error) {
    console.error('Public requests error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// List all requests (Public for all users & Admin)
app.get('/api/requests', async (req, res) => {
  try {
    const status = req.query.status || '';
    const query = status ? { status } : {};
    const requests = await MovieRequest.find(query).sort({ createdAt: -1 }).limit(100);

    // Stats
    const total = await MovieRequest.countDocuments();
    const pending = await MovieRequest.countDocuments({ status: 'pending' });
    const complete = await MovieRequest.countDocuments({ status: 'complete' });
    const rejected = await MovieRequest.countDocuments({ status: 'rejected' });

    return res.json({ requests, stats: { total, pending, complete, rejected } });
  } catch (error) {
    console.error('List requests error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Update request status (admin)
app.put('/api/requests/:id', async (req, res) => {
  if (!verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { status, adminNote } = req.body;
    const request = await MovieRequest.findByIdAndUpdate(
      req.params.id,
      { ...(status && { status }), ...(adminNote !== undefined && { adminNote }) },
      { new: true }
    );
    if (!request) return res.status(404).json({ error: 'Not found' });
    return res.json(request);
  } catch (error) {
    console.error('Update request error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Delete request (admin)
app.delete('/api/requests/:id', async (req, res) => {
  if (!verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await MovieRequest.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete request error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ── OG Bot Routes (Watch paths) ────────────────────────────────────────────────

app.get('/watch/:slug', async (req, res) => {
  // 1. If static pre-rendered HTML exists in dist/watch/:slug/index.html, serve it directly!
  const prerenderedPath = path.join(__dirname, '../film/dist/watch', req.params.slug, 'index.html');
  if (fs.existsSync(prerenderedPath)) {
    return res.sendFile(prerenderedPath);
  }

  // 2. Dynamic fallback for bots if not pre-rendered yet
  const userAgent = req.headers['user-agent'] || '';
  if (isBot(userAgent)) {
    try {
      const movie = await findMovieBySlug(req.params.slug);
      if (movie) {
        const requestUrl = getRequestUrl(req);
        const html = generateBotHTML(formatDocument(movie), requestUrl);
        return res.send(html);
      }
    } catch (err) {
      console.error('Bot route error:', err);
    }
  }

  // 3. Fallback to standard SPA index
  const frontendIndex = path.join(__dirname, '../film/dist/index.html');
  res.sendFile(frontendIndex, (err) => {
    if (err) {
      res.status(404).send('Web app is loading, please try again later or check server configuration.');
    }
  });
});

app.get('/watch/:slug/season/:season/episode/:episode', async (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  if (isBot(userAgent)) {
    try {
      const movie = await findMovieBySlug(req.params.slug);
      if (movie) {
        const requestUrl = getRequestUrl(req);
        const html = generateEpisodeBotHTML(formatDocument(movie), req.params.season, req.params.episode, requestUrl);
        return res.send(html);
      }
    } catch (err) {
      console.error('Bot route error:', err);
    }
  }

  const frontendIndex = path.join(__dirname, '../film/dist/index.html');
  res.sendFile(frontendIndex, (err) => {
    if (err) {
      res.status(404).send('Web app is loading, please try again later or check server configuration.');
    }
  });
});

// ── Sitemap Routes ─────────────────────────────────────────────────────────────

// Serve sitemap files with correct Content-Type to ensure Google can fetch them
app.get('/sitemap*.xml', (req, res) => {
  const distFilePath = path.join(__dirname, '../film/dist', req.path);
  const publicFilePath = path.join(__dirname, '../film/public', req.path);

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  res.sendFile(distFilePath, (err) => {
    if (err) {
      res.sendFile(publicFilePath, (err2) => {
        if (err2) {
          console.error('Sitemap serve error:', err2.message);
          res.status(404).send('Sitemap not found');
        }
      });
    }
  });
});

// ── SPA Serving Fallback ───────────────────────────────────────────────────────

// Static files of the main website
app.use(express.static(path.join(__dirname, '../film/dist')));

// Known SPA routes that should serve index.html with 200 OK
// This prevents spam/unknown URLs from being indexed by Google
const VALID_SPA_ROUTES = [
  '/',
  '/movies',
  '/tv-shows',
  '/anime',
  '/upcoming',
  '/genres',
  '/search',
  '/notifications',
  '/my-list',
  '/about',
  '/contact',
  '/blog',
  '/help',
  '/privacy-policy',
  '/terms-of-use',
  '/dmca',
  '/download-selection',
  '/download',
  '/final-download',
  '/years',
  '/actors',
  '/request',
];
// Patterns that match dynamic SPA routes (with parameters)
const VALID_SPA_PATTERNS = [
  /^\/watch\/[\w-]+$/,                                    // /watch/:slug
  /^\/watch\/[\w-]+\/season\/\d+\/episode\/\d+$/,         // /watch/:slug/season/:n/episode/:n
  /^\/category\/[\w-]+$/,                                 // /category/:categoryId
  /^\/genre\/[\w-]+\/[\w%-]+$/,                           // /genre/:type/:genreName
  /^\/year\/\d{4}$/,                                      // /year/:year
  /^\/blog\/[\w-]+$/,                                     // /blog/:postSlug
];

function isValidSPARoute(urlPath) {
  // Remove query string and trailing slash for comparison
  const cleanPath = urlPath.split('?')[0].replace(/\/+$/, '') || '/';

  // Check exact match routes
  if (VALID_SPA_ROUTES.includes(cleanPath)) return true;

  // Check pattern match routes
  return VALID_SPA_PATTERNS.some(pattern => pattern.test(cleanPath));
}

// Serve index.html ONLY for valid SPA routes
app.get('*', (req, res) => {
  if (isValidSPARoute(req.path)) {
    // Valid SPA route — serve the React app
    res.sendFile(path.join(__dirname, '../film/dist/index.html'), (err) => {
      if (err) {
        res.status(404).send('Not Found');
      }
    });
  } else {
    // Unknown route — return 404 so Google doesn't index spam URLs
    res.status(404).sendFile(path.join(__dirname, '../film/dist/index.html'), (err) => {
      if (err) {
        res.status(404).send('Not Found');
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`CMoviez API server running on port ${PORT}`);
});
