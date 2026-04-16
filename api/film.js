// api/film.js

const BASE = 'https://api.themoviedb.org/3';
const MIN_VOTES = 5000;
const PAGES_TO_FETCH = 10;

// Deterministic shuffle using a seed (Fisher-Yates)
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Day number since a fixed epoch — increments by 1 each day, never repeats
function getDayNumber(dateStr) {
  const epoch = new Date('2025-01-02');
  const today = new Date(dateStr);
  return Math.floor((today - epoch) / 86400000);
}

async function buildFilmPool(apiKey) {
  const pages = await Promise.all(
    Array.from({ length: PAGES_TO_FETCH }, (_, i) =>
      fetch(`${BASE}/movie/top_rated?api_key=${apiKey}&page=${i + 1}`).then(r => r.json())
    )
  );
  return pages
    .flatMap(p => p.results || [])
    .filter(m =>
      m.vote_count >= MIN_VOTES &&
      m.original_language === 'en' &&
      !m.genre_ids.includes(16) // exclude animation
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
    runtime: details.runtime ? `${details.runtime} min` : 'N/A',
    boxoffice: details.revenue > 0 ? '$' + Math.round(details.revenue / 1000000) + 'M' : 'N/A',
    cast,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const API_KEY = process.env.TMDB_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    const pool = await buildFilmPool(API_KEY);
    if (!pool.length) throw new Error('Film pool is empty');

    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const dayNum = getDayNumber(date);

    // Shuffle the pool with a fixed seed so order is always the same,
    // then pick by day number — wraps around only after every film has been used
    const shuffled = seededShuffle(pool, 42);
    const filmId = shuffled[dayNum % shuffled.length];

    const film = await fetchFilmData(API_KEY, filmId);
    res.status(200).json(film);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load film', detail: err.message });
  }
}
