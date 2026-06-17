export default async function handler(req, res) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'Redis not configured' });
  }

  const redisCall = async (command, ...args) => {
    const response = await fetch(redisUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command: [command, ...args] }),
    });
    const data = await response.json();
    return data.result;
  };

  function initials(n) {
    const p = n.trim().split(/\s+/);
    let s = (p[0] ? p[0][0] : '') + (p[1] ? p[1][0] : '');
    if (!p[1] && p[0]) s = p[0].slice(0, 2);
    return s.toUpperCase();
  }

  function colorFor(n) {
    const PALETTE = ['#e24b4a', '#185fa5', '#0f6e56', '#b8731a', '#534ab7', '#993556', '#1d9e75', '#d85a30', '#0c447c', '#444441'];
    let h = 0;
    for (let i = 0; i < n.length; i++) h = ((h * 31 + n.charCodeAt(i)) >>> 0);
    return PALETTE[h % PALETTE.length];
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const raw = await redisCall('GET', 'swag:state');
      const state = raw ? JSON.parse(raw) : { users: {}, picks: {} };
      return res.status(200).json(state);
    }

    if (req.method === 'POST') {
      const raw = await redisCall('GET', 'swag:state');
      let state = raw ? JSON.parse(raw) : { users: {}, picks: {} };

      const { type, name, id, item, trashed } = req.body;

      if (type === 'user') {
        if (!state.users) state.users = {};
        if (!state.users[name]) {
          state.users[name] = { i: initials(name), c: colorFor(name) };
        }
      } else if (type === 'toggle') {
        if (!state.picks) state.picks = {};
        if (!state.picks[id]) state.picks[id] = [];
        const idx = state.picks[id].indexOf(name);
        if (idx >= 0) state.picks[id].splice(idx, 1);
        else state.picks[id].push(name);
      } else if (type === 'addItem') {
        if (!state.items) state.items = [];
        state.items.push(item);
      } else if (type === 'bootstrap') {
        if (!state.items) state.items = [];
        const existingIds = new Set(state.items.map(i => i.id));
        const { items } = req.body;
        (items || []).forEach(item => {
          if (!existingIds.has(item.id)) {
            state.items.push(item);
          }
        });
      } else if (type === 'trash') {
        if (!state.items) state.items = [];
        const itemToTrash = state.items.find(i => i.id === id);
        if (itemToTrash) {
          itemToTrash.trashed = trashed;
        }
      }

      await redisCall('SET', 'swag:state', JSON.stringify(state));
      return res.status(200).json(state);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
