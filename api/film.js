// api/film.js

const BASE = 'https://api.themoviedb.org/3';
const MIN_VOTES = 1000; // lowered to let more films in
const PAGES_TO_FETCH = 25; // more pages from each list

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

function getDayNumber(dateStr) {
  const epoch = new Date('2025-01-01');
  const today = new Date(dateStr);
  return Math.floor((today - epoch) / 86400000);
}

async function buildFilmPool(apiKey) {
  // Fetch from multiple TMDB lists in parallel for maximum coverage
  const [topRatedPages, popularPages, nowPlayingPages, discoverActionPages, discoverDramaPages, discoverThrillerPages] = await Promise.all([
    Promise.all(Array.from({ length: PAGES_TO_FETCH }, (_, i) =>
      fetch(`${BASE}/movie/top_rated?api_key=${apiKey}&page=${i + 1}`).then(r => r.json())
    )),
    Promise.all(Array.from({ length: PAGES_TO_FETCH }, (_, i) =>
      fetch(`${BASE}/movie/popular?api_key=${apiKey}&page=${i + 1}`).then(r => r.json())
    )),
    Promise.all(Array.from({ length: 10 }, (_, i) =>
      fetch(`${BASE}/movie/now_playing?api_key=${apiKey}&page=${i + 1}`).then(r => r.json())
    )),
    // Action blockbusters
    Promise.all(Array.from({ length: 10 }, (_, i) =>
      fetch(`${BASE}/discover/movie?api_key=${apiKey}&with_genres=28&sort_by=popularity.desc&page=${i + 1}`).then(r => r.json())
    )),
    // Dramas
    Promise.all(Array.from({ length: 10 }, (_, i) =>
      fetch(`${BASE}/discover/movie?api_key=${apiKey}&with_genres=18&sort_by=popularity.desc&page=${i + 1}`).then(r => r.json())
    )),
    // Thrillers
    Promise.all(Array.from({ length: 10 }, (_, i) =>
      fetch(`${BASE}/discover/movie?api_key=${apiKey}&with_genres=53&sort_by=popularity.desc&page=${i + 1}`).then(r => r.json())
    )),
  ]);

  const allFilms = [
    ...topRatedPages,
    ...popularPages,
    ...nowPlayingPages,
    ...discoverActionPages,
    ...discoverDramaPages,
    ...discoverThrillerPages,
  ].flatMap(p => p.results || []);

  // Deduplicate by id
  const seen = new Set();
  const unique = allFilms.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return unique
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

    // Fresh shuffle with new seed (99)
    const shuffled = seededShuffle(pool, 99);
    const filmId = shuffled[dayNum % shuffled.length];

    const film = await fetchFilmData(API_KEY, filmId);
    res.status(200).json(film);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load film', detail: err.message });
  }
}
