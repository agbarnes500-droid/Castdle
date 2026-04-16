// api/film.js
// Vercel serverless function — keeps your TMDB key server-side
// Film pool is built dynamically from TMDB's top-rated list — no manual curation needed

const BASE = 'https://api.themoviedb.org/3';

// Quality filters — tweak these to adjust difficulty/variety
const MIN_VOTES = 5000;   // ensures the film is well-known enough
const MIN_RATING = 7.0;   // keeps quality high
const PAGES_TO_FETCH = 10; // 10 pages = up to 200 films in the pool

async function buildFilmPool(apiKey) {
  const pages = await Promise.all(
    Array.from({ length: PAGES_TO_FETCH }, (_, i) =>
      fetch(`${BASE}/movie/top_rated?api_key=${apiKey}&page=${i + 1}`)
        .then(r => r.json())
    )
  );
  return pages
    .flatMap(p => p.results || [])
    .filter(m =>
  m.vote_count >= MIN_VOTES &&
  m.vote_average >= MIN_RATING &&
  m.original_language === 'en' &&
  !m.genre_ids.includes(16)
)
    .map(m => m.id);
}

async function fetchFilmData(apiKey, filmId) {
  const [detailsRes, creditsRes] = await Promise.all([
    fetch(`${BASE}/movie/${filmId}?api_key=${apiKey}`),
    fetch(`${BASE}/movie/${filmId}/credits?api_key=${apiKey}`),
  ]);
  const details = await detailsRes.json();
  const credits = await creditsRes.json();

  // Build cast ordered least → most famous (reverse billing order)
 const cast = credits.cast
  .filter(a =>
    a.character &&
    !a.character.toLowerCase().includes('uncredited')
  )
    .slice(0, 6)
    .reverse()
    .map(a => ({ name: a.name, role: a.character }));

  const director = credits.crew.find(c => c.job === 'Director');

  return {
    title: details.title,
    year: details.release_date?.slice(0, 4) || 'N/A',
    imdb: details.vote_average?.toFixed(1) || 'N/A',
    genre: details.genres?.slice(0, 2).map(g => g.name).join(' / ') || 'N/A',
    director: director?.name || 'N/A',
    boxoffice: details.revenue ? '$'+details.revenue.toLocaleString('en-US') : 'N/A',
    runtime: details.runtime ? `${details.runtime} min` : 'N/A',
    cast,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const API_KEY = process.env.TMDB_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    // Build the pool fresh each day (Vercel caches this automatically)
    const pool = await buildFilmPool(API_KEY);
    if (!pool.length) throw new Error('Film pool is empty');

    // Pick today's film using the date as a seed
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const seed = parseInt(date.replace(/-/g, ''));
    const filmId = pool[seed % pool.length];

    const film = await fetchFilmData(API_KEY, filmId);
    res.status(200).json(film);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load film', detail: err.message });
  }
}
