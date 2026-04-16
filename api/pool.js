// api/pool.js
// TEMPORARY — delete this file once you've verified the pool
// Visit /api/pool on your site to see the full list of films

const BASE = 'https://api.themoviedb.org/3';
const MIN_VOTES = 5000;
const PAGES_TO_FETCH = 15;

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const API_KEY = process.env.TMDB_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'No API key' });

  try {
    const [topRatedPages, popularPages] = await Promise.all([
      Promise.all(Array.from({ length: PAGES_TO_FETCH }, (_, i) =>
        fetch(`${BASE}/movie/top_rated?api_key=${API_KEY}&page=${i + 1}`).then(r => r.json())
      )),
      Promise.all(Array.from({ length: PAGES_TO_FETCH }, (_, i) =>
        fetch(`${BASE}/movie/popular?api_key=${API_KEY}&page=${i + 1}`).then(r => r.json())
      )),
    ]);

    const allFilms = [...topRatedPages, ...popularPages].flatMap(p => p.results || []);
    const seen = new Set();
    const unique = allFilms.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    const pool = unique.filter(m =>
      m.vote_count >= MIN_VOTES &&
      m.original_language === 'en' &&
      !m.genre_ids.includes(16)
    );

    const shuffled = seededShuffle(pool.map(m => m.id), 42);

    // Fetch titles for all IDs so you can read the list
    const titles = pool.reduce((acc, m) => {
      acc[m.id] = m.title;
      return acc;
    }, {});

    const epoch = new Date('2025-01-01');
    const today = new Date();
    const dayNum = Math.floor((today - epoch) / 86400000);

    res.status(200).json({
      totalFilms: pool.length,
      daysUntilRepeat: pool.length,
      todayDayNumber: dayNum,
      todayFilmId: shuffled[dayNum % shuffled.length],
      todayFilmTitle: titles[shuffled[dayNum % shuffled.length]],
      fullSchedule: shuffled.map((id, i) => ({
        day: i,
        date: new Date(epoch.getTime() + i * 86400000).toISOString().slice(0, 10),
        id,
        title: titles[id] || 'Unknown',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
