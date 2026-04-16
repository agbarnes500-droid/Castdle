// api/titles.js
// Returns a list of popular film titles for the autocomplete dropdown

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const API_KEY = process.env.TMDB_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    const base = 'https://api.themoviedb.org/3';
    const pages = await Promise.all(
      [1, 2, 3, 4, 5].map(p =>
        fetch(`${base}/movie/popular?api_key=${API_KEY}&page=${p}`).then(r => r.json())
      )
    );
    const topRated = await fetch(`${base}/movie/top_rated?api_key=${API_KEY}&page=1`).then(r => r.json());
    const titles = [...pages.flatMap(p => p.results), ...topRated.results].map(m => m.title);
    res.status(200).json([...new Set(titles)]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
