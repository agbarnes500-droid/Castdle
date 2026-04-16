// api/film.js
// Vercel serverless function — keeps your TMDB key server-side

const FILM_POOL = [
  278, 238, 240, 424, 389, 680, 13, 769, 155, 497,
  550, 11, 1891, 120, 121, 122, 105, 85, 174, 539,
  597, 77, 807, 562, 197, 786, 244786, 76341, 419430, 581389,
  530915, 490132, 399055, 334533, 857, 598, 761, 1366, 289, 745,
];

export default async function handler(req, res) {
  // Allow requests from your site only (update this once you have a domain)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const API_KEY = process.env.TMDB_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  // Use the date as a seed so everyone gets the same film each day
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const seed = date.replace(/-/g, '');
  const filmId = FILM_POOL[parseInt(seed) % FILM_POOL.length];

  try {
    const base = 'https://api.themoviedb.org/3';
    const [detailsRes, creditsRes] = await Promise.all([
      fetch(`${base}/movie/${filmId}?api_key=${API_KEY}`),
      fetch(`${base}/movie/${filmId}/credits?api_key=${API_KEY}`),
    ]);
    const details = await detailsRes.json();
    const credits = await creditsRes.json();

    // Build cast: filter named acting roles, reverse billing order (least → most famous)
    const cast = credits.cast
      .filter(a => a.known_for_department === 'Acting' && a.character && !a.character.toLowerCase().includes('uncredited'))
      .slice(0, 6)
      .reverse()
      .map(a => ({ name: a.name, role: a.character }));

    const director = credits.crew.find(c => c.job === 'Director');

    res.status(200).json({
      title: details.title,
      year: details.release_date?.slice(0, 4) || 'N/A',
      imdb: details.vote_average?.toFixed(1) || 'N/A',
      genre: details.genres?.slice(0, 2).map(g => g.name).join(' / ') || 'N/A',
      director: director?.name || 'N/A',
      runtime: details.runtime ? `${details.runtime} min` : 'N/A',
      cast,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch film data', detail: err.message });
  }
}
