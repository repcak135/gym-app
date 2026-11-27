// Spike: logs /schedule and /cancel so we can see whether a locked iPhone still sends them.
const ORIGINS = ['https://repcak135.github.io', 'http://localhost:5173'];

function cors(origin: string | null): Record<string, string> {
  return origin && ORIGINS.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    : {};
}

export default {
  async fetch(req: Request): Promise<Response> {
    const origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    const path = new URL(req.url).pathname;
    if (req.method === 'POST' && (path === '/schedule' || path === '/cancel')) {
      const now = Date.now();
      const text = (await req.text()).slice(0, 500);
      let body: { seq?: number; at?: number; endsAt?: number; kind?: string } = {};
      try { body = JSON.parse(text); } catch { /* ignore */ }
      console.log(JSON.stringify({ spike: path, seq: body.seq, kind: body.kind, delayMs: body.at ? now - body.at : null, endsInMs: body.endsAt ? body.endsAt - now : null, now }));
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    return new Response('Banana Gym push', { status: 200, headers: cors(origin) });
  },
};
