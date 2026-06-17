export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url param required' });

  // Always respond with JSON so the client never hits a parse error.
  try {
    let pageUrl;
    try { pageUrl = new URL(url); }
    catch (e) { return res.status(200).json({ error: 'Invalid URL', images: [] }); }

    // Real timeout — fetch's `timeout` option is ignored in Node; use AbortController.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 9000);
    let response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (e) {
      clearTimeout(t);
      return res.status(200).json({ error: 'Could not reach page (' + (e.name === 'AbortError' ? 'timed out' : e.message) + ')', images: [] });
    }
    clearTimeout(t);

    const html = await response.text();

    const meta = (prop) =>
      html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'))?.[1] ||
      html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']' + prop + '["\']', 'i'))?.[1];

    const decode = (s) => (s || '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

    const resolve = (src) => {
      if (!src) return null;
      try { return new URL(src, pageUrl).href; } catch (e) { return null; }
    };

    const ogTitle = decode(meta('og:title')) || decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]);
    const ogDesc = decode(meta('og:description')) || decode(meta('description'));

    const priceMatch = html.match(/[$£€]\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    const price = priceMatch ? '$' + priceMatch[1] : null;
    const priceNum = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : 0;

    // --- Collect image candidates from many sources ---
    const candidates = [];
    const push = (s) => { const r = resolve(decode(s)); if (r) candidates.push(r); };

    // Prefer social/meta images first (usually the hero shot)
    push(meta('og:image'));
    push(meta('og:image:secure_url'));
    push(meta('twitter:image'));
    push(meta('twitter:image:src'));

    // <img src> and common lazy-load attributes
    const imgTags = html.match(/<img[^>]+>/gi) || [];
    imgTags.forEach((tag) => {
      const src = tag.match(/\s(?:src|data-src|data-original|data-lazy-src|data-image)=["']([^"']+)["']/i)?.[1];
      if (src) push(src);
      // srcset: take the largest entry
      const srcset = tag.match(/\ssrcset=["']([^"']+)["']/i)?.[1];
      if (srcset) {
        const parts = srcset.split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
        if (parts.length) push(parts[parts.length - 1]);
      }
    });

    // <link rel="image_src">
    push(html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)?.[1]);

    // --- Filter out junk: icons, logos, sprites, pixels, svg, data URIs ---
    const junk = /(sprite|icon|logo|favicon|pixel|spinner|loader|placeholder|1x1|blank|\.svg(\?|$)|%3csvg|<svg|svg%20|\/oc-csi\/|fls-na\.amaz|data:|googletag|doubleclick|analytics|beacon)/i;
    const seen = new Set();
    const images = [];
    for (const c of candidates) {
      if (junk.test(c)) continue;
      if (!/^https?:\/\//i.test(c)) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      images.push(c);
      if (images.length >= 12) break;
    }

    return res.status(200).json({
      image: images[0] || null,
      images,
      title: ogTitle || null,
      description: ogDesc || null,
      price,
      priceNum,
      suggestedTier: priceNum > 250 ? 'milestone' : priceNum > 100 ? 'elevated' : 'everyday',
    });
  } catch (e) {
    return res.status(200).json({ error: e.message || 'Failed to read page', images: [] });
  }
}
