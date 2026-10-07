import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const TMDB_API_KEY = '15d1600f0761d65466063664d014454c';

const documentSchema = new mongoose.Schema({
  id: String,
  title: String,
  tmdbId: String,
  type: String,
  cast: mongoose.Schema.Types.Mixed,
  castWithPhotos: mongoose.Schema.Types.Mixed,
}, { strict: false });

const Movie = mongoose.model('Movie', documentSchema, 'movies');
const TVShow = mongoose.model('TVShow', documentSchema, 'tvshows');
const Anime = mongoose.model('Anime', documentSchema, 'anime');
const Upcoming = mongoose.model('Upcoming', documentSchema, 'upcoming');

const collections = [
  { name: 'movies', model: Movie },
  { name: 'tvshows', model: TVShow },
  { name: 'anime', model: Anime },
  { name: 'upcoming', model: Upcoming },
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchCreditsFromTMDB(tmdbId, isTV) {
  try {
    const endpoint = isTV ? `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits` : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Error fetching TMDB credits for ${tmdbId}:`, err.message);
    return null;
  }
}

async function searchTMDBId(title, isTV) {
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/${isTV ? 'tv' : 'movie'}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&page=1`;
    const res = await fetch(searchUrl);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.results && data.results.length > 0) {
      return data.results[0].id;
    }
  } catch (err) {
    console.error(`Error searching TMDB for title ${title}:`, err.message);
  }
  return null;
}

async function runSync() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/cmoviez';
  console.log('Connecting to MongoDB:', mongoUri);
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB. Starting Cast, Director & Studio Photos Sync...\n');

  let totalUpdated = 0;

  for (const item of collections) {
    console.log(`Processing collection: ${item.name}...`);
    const docs = await item.model.find({});
    console.log(`Found ${docs.length} documents in ${item.name}.`);

    for (const doc of docs) {
      const isTV = item.name === 'tvshows' || doc.type === 'tv' || doc.type === 'series';
      let tmdbId = doc.tmdbId;

      if (!tmdbId && doc.title) {
        tmdbId = await searchTMDBId(doc.title, isTV);
        await sleep(250);
      }

      if (tmdbId) {
        const fullDetails = await fetchCreditsFromTMDB(tmdbId, isTV);
        if (fullDetails) {
          // 1. Cast photos
          if (fullDetails.credits?.cast) {
            const castCredits = fullDetails.credits.cast.slice(0, 15).map(c => ({
              name: c.name,
              character: c.character || '',
              photo: c.profile_path ? `https://image.tmdb.org/t/p/w500${c.profile_path}` : null,
              profile_path: c.profile_path
            }));
            doc.castWithPhotos = castCredits;
            doc.cast = castCredits.map(c => c.character ? `${c.name} (${c.character})` : c.name);
          }

          // 2. Director photos
          if (fullDetails.credits?.crew) {
            const directors = fullDetails.credits.crew.filter(c => c.job === 'Director' || c.department === 'Directing');
            if (directors.length > 0) {
              const directorsWithPhotos = directors.map(d => ({
                name: d.name,
                job: 'Director',
                photo: d.profile_path ? `https://image.tmdb.org/t/p/w500${d.profile_path}` : null,
                profile_path: d.profile_path || null
              }));
              doc.directorsWithPhotos = directorsWithPhotos;
              const directorPhotosMap = {};
              directorsWithPhotos.forEach(d => { if (d.name && d.photo) directorPhotosMap[d.name] = d.photo; });
              doc.directorPhotos = directorPhotosMap;
              if (!doc.director) {
                doc.director = directors.map(d => d.name).join(', ');
              }
            }
          }

          // 3. Studio logos
          const companies = fullDetails.production_companies || fullDetails.networks || [];
          if (companies.length > 0) {
            const studiosWithLogos = companies.map(s => ({
              name: s.name,
              logo: s.logo_path ? `https://image.tmdb.org/t/p/w500${s.logo_path}` : null,
              logo_path: s.logo_path || null
            }));
            doc.studios = studiosWithLogos;
            const studioLogosMap = {};
            studiosWithLogos.forEach(s => { if (s.name && s.logo) studioLogosMap[s.name] = s.logo; });
            doc.studioLogos = studioLogosMap;
          }

          if (!doc.tmdbId) {
            doc.tmdbId = String(tmdbId);
          }

          await doc.save();
          totalUpdated++;
          console.log(`✅ [${item.name}] Updated metadata & photos for: "${doc.title}"`);
        } else {
          console.log(`⚠️ [${item.name}] No TMDB details found for: "${doc.title}"`);
        }
      } else {
        console.log(`❌ [${item.name}] Could not find TMDB ID for: "${doc.title}"`);
      }
      await sleep(200);
    }
  }

  console.log(`\n🎉 Sync finished! Updated cast photos for ${totalUpdated} items across all collections.`);
  await mongoose.disconnect();
  process.exit(0);
}

runSync().catch(err => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
