#!/usr/bin/env node
/* Daily pre-market screener for Stock Wishlist.
   Runs in GitHub Actions (.github/workflows/screener.yml) several times on the morning after each US session.
   Each run tops up the price history of at most MAX_CALLS tickers (Tiingo's free plan allows ~50 requests an hour),
   keeping the history in .screener-cache (restored and saved with actions/cache, not committed).
   When every ticker is up to date for the latest session, it runs the same analysis as the page
   (indicators.js + analysis.js) and writes screener.json. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, '.screener-cache');
const KEY = (process.env.TIINGO_API_KEY || '').trim();
const MAX_CALLS = +(process.env.MAX_CALLS || 44);
const FORCE = process.argv.includes('--force'); // write screener.json even if some tickers are behind
const DAYS = 420; // calendar days of history: enough for the 200-day average and 52-week high

/* ---------- the page's analysis code, loaded as-is ---------- */
const ctx = { console, Math, Date, JSON, isFinite, Array, Object, String, Number };
ctx.window = ctx;
ctx.fp = v => (v == null || !isFinite(v)) ? '–' : (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
ctx.pct = (v, dp) => (v == null || !isFinite(v)) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(dp == null ? 1 : dp) + '%';
ctx.esc = s => String(s == null ? '' : s);
vm.createContext(ctx);
for (const f of ['indicators.js', 'analysis.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });

/* ---------- dates: the latest US session whose daily close should be published ---------- */
function nyParts(d) {
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; }); return p;
}
function expectedSession(now = new Date()) {
  // Tiingo publishes daily closes in the evening New York time; before 8 pm use the previous weekday
  let d = new Date(now), p = nyParts(d);
  if (+p.hour < 20) { d = new Date(d.getTime() - 86400000); p = nyParts(d); }
  while (p.weekday === 'Sat' || p.weekday === 'Sun') { d = new Date(d.getTime() - 86400000); p = nyParts(d); }
  return `${p.year}-${p.month}-${p.day}`;
}

/* ---------- Tiingo ---------- */
async function daily(sym, start) {
  const t = encodeURIComponent(sym.toLowerCase().replace('.', '-'));
  const url = `https://api.tiingo.com/tiingo/daily/${t}/prices?startDate=${start}`;
  const r = await fetch(url, { headers: { Authorization: 'Token ' + KEY, 'Content-Type': 'application/json', 'User-Agent': 'stock-wishlist-screener/1.0' } });
  if (r.status === 404) return { notFound: true };
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const rows = await r.json();
  const r4 = v => v == null ? null : Math.round(+v * 10000) / 10000;
  return { rows: rows.filter(x => x.close != null).map(x => { const c = r4(x.adjClose ?? x.close); return [x.date.slice(0, 10), c, r4(x.adjOpen) ?? c, r4(x.adjHigh) ?? c, r4(x.adjLow) ?? c, Math.round(x.adjVolume ?? x.volume ?? 0)]; }) };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dayAdd = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/* ---------- main ---------- */
const universe = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe.json'), 'utf8')).stocks;
fs.mkdirSync(CACHE, { recursive: true });
const want = expectedSession();
const file = s => path.join(CACHE, s.replace(/[^A-Za-z0-9.-]/g, '_') + '.json');
const load = s => { try { return JSON.parse(fs.readFileSync(file(s), 'utf8')); } catch { return { bars: [] }; } };

let calls = 0, updated = 0, failed = 0;
if (!KEY) console.error('TIINGO_API_KEY is not set: using cached history only');
for (const [sym] of universe) {
  const h = load(sym);
  if (h.checkedFor === want || h.notFound) continue;
  if (!KEY || calls >= MAX_CALLS) continue;
  const last = h.bars.length ? h.bars[h.bars.length - 1][0] : null;
  const start = last ? dayAdd(last, -5) : dayAdd(want, -DAYS);
  calls++;
  try {
    const res = await daily(sym, start);
    if (res.notFound) { h.notFound = true; console.log(sym, 'not found on Tiingo'); }
    else {
      const m = new Map(h.bars.map(b => [b[0], b]));
      res.rows.forEach(b => m.set(b[0], b));
      h.bars = [...m.values()].sort((a, b) => a[0] < b[0] ? -1 : 1).filter(b => b[0] >= dayAdd(want, -DAYS));
      if (h.bars.length && h.bars[h.bars.length - 1][0] >= want) h.checkedFor = want; // done once the session's close is in (else retried next run; the last run of the morning writes the screen anyway)
      updated++;
    }
    fs.writeFileSync(file(sym), JSON.stringify(h));
  } catch (e) { failed++; console.error(sym, e.message); if (/HTTP 429/.test(e.message)) break; }
  await sleep(1200);
}
const pending = universe.filter(([s]) => { const h = load(s); return h.checkedFor !== want && !h.notFound; }).map(([s]) => s);
console.log(`Session ${want}: fetched ${updated} (${calls} calls, ${failed} failed), ${pending.length} still to fetch`);

if (pending.length && !FORCE) { console.log('Screen not written yet: waiting for the remaining tickers on the next run'); process.exit(0); }

/* ---------- screen ---------- */
const items = [];
for (const [sym, name] of universe) {
  const h = load(sym); const c = h.bars;
  if (!c || c.length < 60) continue;
  const A = { s: { symbol: sym }, c, last: c[c.length - 1][1], tgt: null };
  let P, H;
  try { P = ctx.swingPlan(A); H = ctx.horizons(A); } catch (e) { console.error(sym, 'analysis failed:', e.message); continue; }
  if (P.none) continue;
  const n = c.length, cl = i => c[Math.max(0, n - 1 - i)][1], vol = c.slice(-21, -1).map(b => b[5]), va = vol.reduce((a, b) => a + b, 0) / (vol.length || 1);
  const hi52 = Math.max(...c.slice(-252).map(b => b[3]));
  const rsiArr = ctx.IND.BY.rsi.calc(ctx.barsOf(c, false)).lines[0].d;
  const p = P.plan, r2 = v => v == null ? null : Math.round(v * 100) / 100;
  items.push({
    t: sym, n: name, d: c[n - 1][0], c: r2(cl(0)), d1: r2((cl(0) / cl(1) - 1) * 100), d5: r2((cl(0) / cl(5) - 1) * 100), m1: r2((cl(0) / cl(21) - 1) * 100),
    rv: va ? r2(c[n - 1][5] / va) : null, rsi: r2(rsiArr[n - 1]), hi: r2((cl(0) / hi52 - 1) * 100), atr: r2(P.atrPct * 100),
    act: P.action, k: P.k, setup: P.setup ? P.setup.name : null, grade: P.setup ? P.setup.grade : null,
    plan: p ? { e: r2(p.entry), zl: P.zone ? r2(P.zone[0]) : null, zh: P.zone ? r2(P.zone[1]) : null, s: r2(p.stop), t1: r2(p.t1), t2: r2(p.t2), rr: r2(p.rr1) } : null,
    brk: r2(P.hiBreak), bt: P.bt.n ? { n: P.bt.n, w: r2(P.bt.winRate * 100), avg: r2(P.bt.avg * 100) } : null,
    lg: H.long.label, lk: H.long.k, ls: r2(H.long.score)
  });
}
const out = { session: want, generated: new Date().toISOString(), screened: items.length, of: universe.length, missing: pending, items };
const body = JSON.stringify(out).replace(/\},\{"t"/g, '},\n{"t"');
const prev = fs.existsSync(path.join(ROOT, 'screener.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'screener.json'), 'utf8')) : null;
if (prev && prev.session === want && !FORCE && JSON.stringify(prev.items) === JSON.stringify(items)) { console.log('Screen unchanged'); process.exit(0); }
fs.writeFileSync(path.join(ROOT, 'screener.json'), body + '\n');
console.log(`Wrote screener.json: ${items.length} stocks, ${items.filter(i => i.act === 'Buy setup').length} buy setups`);
