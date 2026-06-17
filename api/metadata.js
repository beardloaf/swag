export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url param required' });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 10000,
    });
    const html = await response.text();

    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
                   html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
                  html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const priceMatch = html.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    const price = priceMatch ? '$' + priceMatch[1] : null;
    const priceNum = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0;

    const images = new Set();
    if (ogImage) images.add(ogImage);
    const imgMatches = html.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
    imgMatches.slice(0, 10).forEach(tag => {
      const src = tag.match(/src=["']([^"']+)["']/i)?.[1];
      if (src && src.includes('http')) images.add(src);
    });
    const imgArray = Array.from(images).filter(img => img && !img.includes('data:'));

    res.status(200).json({
      image: ogImage || imgArray[0] || null,
      images: imgArray.slice(0, 5),
      title: ogTitle || null,
      description: ogDesc || null,
      price,
      priceNum,
      suggestedTier: priceNum > 250 ? 'milestone' : priceNum > 100 ? 'elevated' : 'everyday',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
