import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSitemaps } from './generate_sitemap.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN === '*' ? '*' : (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*'),
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization'
}));
app.use(express.json());

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
  description: String,
  poster: String,
  backdrop: String,
  logo: String,
  mobileHero: String,
  country: String,
  director: String,
  watchOffline: String,
  audio: mongoose.Schema.Types.Mixed,
  subtitles: mongoose.Schema.Types.Mixed,
  thisShowIs: mongoose.Schema.Types.Mixed,
  downloadUrl: String,
  download_links: { type: mongoose.Schema.Types.Mixed, default: {} },
  downloadUrl480p: String,
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
  trendingRank: { type: Number, default: 0 }
}, {
  timestamps: true,
  minimize: false
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

function generateBotHTML(movie, requestUrl) {
  const title = `${movie.title} Sinhala Subtitles | CMoviez`;
  const description = movie.description 
    ? movie.description.substring(0, 200) 
    : `Download ${movie.title} with Sinhala Subtitles for free on CMoviez. High quality movie downloads.`;
  const rawPoster = movie.poster || '';
  const poster = rawPoster;
  const year = movie.year || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${description}">

  <meta property="og:type" content="video.movie">
  <meta property="og:url" content="${requestUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${poster}">
  <meta property="og:site_name" content="CMoviez">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${poster}">
</head>
<body>
  <h1>${movie.title} (${year})</h1>
  <p>${description}</p>
  <img src="${poster}" alt="${movie.title}">
  <a href="${requestUrl}">Watch on CMoviez</a>
</body>
</html>`;
}

function generateEpisodeBotHTML(movie, seasonNum, episodeNum, requestUrl) {
  const title = `${movie.title} Season ${seasonNum} Episode ${episodeNum} Sinhala Subtitles | CMoviez`;
  const description = `Download ${movie.title} Season ${seasonNum} Episode ${episodeNum} with Sinhala Subtitles for free on CMoviez. High quality episode downloads.`;
  const rawPoster = movie.backdrop || movie.poster || '';
  const poster = rawPoster;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${description}">

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

// Robots.txt to prevent search engines from crawling the API
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send("User-agent: *\nDisallow: /");
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
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@cmovie.xyz';
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
    user: { email: process.env.ADMIN_EMAIL || 'admin@cmovie.xyz', name: 'Admin' }
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
      query[searchField] = { $regex: search, $options: 'i' };
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

    let doc = await Model.findOneAndUpdate({ id }, { $set: body }, { new: true });
    if (!doc && mongoose.Types.ObjectId.isValid(id)) {
      doc = await Model.findOneAndUpdate({ _id: id }, { $set: body }, { new: true });
    }
    if (!doc) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Auto-regenerate sitemap in background
    generateSitemaps().catch(err => console.error('[Sitemap] Auto-gen error:', err.message));

    return res.json(formatDocument(doc));
  } catch (error) {
    console.error('Update document error:', error);
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

// ── OG Bot Routes (Watch paths) ────────────────────────────────────────────────

app.get('/watch/:slug', async (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  if (isBot(userAgent)) {
    try {
      const movie = await findMovieBySlug(req.params.slug);
      if (movie) {
        const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const html = generateBotHTML(formatDocument(movie), requestUrl);
        return res.send(html);
      }
    } catch (err) {
      console.error('Bot route error:', err);
    }
  }

  // Serve the React client built assets if they exist
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
        const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
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
