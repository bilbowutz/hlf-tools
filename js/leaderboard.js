// Rangliste über ein Google-Apps-Script (siehe tools/leaderboard.gs).
// Die URL steht in der verschlüsselten Beladeliste (content.leaderboard).

const CACHE_KEY = 'hlf.top';
const NICK_KEY = 'hlf.nick';

async function request(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function createLeaderboard(url) {
  return {
    cached() {
      try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; } catch { return []; }
    },
    async top() {
      const { top } = await request(url);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(top)); } catch {}
      return top;
    },
    // Ohne Content-Type-Header bleibt es eine „einfache“ Anfrage (kein CORS-Preflight)
    async submit(nick, score) {
      const data = await request(url, { method: 'POST', body: JSON.stringify({ nick, score }) });
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data.top)); } catch {}
      return data;
    },
  };
}

export const nickname = {
  get() { try { return localStorage.getItem(NICK_KEY) || ''; } catch { return ''; } },
  set(v) { try { localStorage.setItem(NICK_KEY, v); } catch {} },
};
