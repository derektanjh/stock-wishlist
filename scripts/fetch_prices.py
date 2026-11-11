#!/usr/bin/env python3
"""Fetch daily closing prices for every ticker in stocks.json into prices.json.

Source: Tiingo (US stocks and ETFs). Needs the TIINGO_API_KEY repository secret.

  python scripts/fetch_prices.py          full run: 2 years of daily closes + live prices
  python scripts/fetch_prices.py --live   market hours: live IEX prices only (one request
                                          for all tickers); history only for new tickers
 Runs in GitHub Actions (.github/workflows/stock-prices.yml).
Standard library only. If a ticker can't be fetched, its previous prices are
kept and the error is noted for the page.
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
INTRA_MAX = 20  # intraday costs 1 request per stock per run; Tiingo's free plan allows ~50 an hour

API = "https://api.tiingo.com/tiingo/daily/"
IEX = "https://api.tiingo.com/iex/"
KEY = os.environ.get("TIINGO_API_KEY", "").strip()
DAYS = 740  # a little over 2 years of calendar days


class NotFound(Exception):
    pass


def call(path, params=None, base=API):
    url = base + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"Authorization": "Token " + KEY, "Content-Type": "application/json", "User-Agent": "stock-wishlist/1.0"})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise NotFound("Ticker not found (US stocks and ETFs only, e.g. NVDA, BRK-B)")
            if e.code in (401, 403):
                raise RuntimeError("Tiingo didn't accept the API key")
            last = f"HTTP {e.code}"
            time.sleep(5 * (attempt + 1) if e.code == 429 else 2)
        except Exception as e:  # network hiccup
            last = str(e)
            time.sleep(2)
    raise RuntimeError(last)


def fetch(symbol, old):
    """Returns (quote, error, kind) where kind is 'not_found' or 'unavailable'."""
    if not KEY:
        return None, "No Tiingo API key set up yet", "unavailable"
    t = symbol.lower().replace(".", "-")  # BRK.B -> brk-b
    try:
        name = old.get("name")
        exch = old.get("exchange")
        if not name:
            meta = call(urllib.parse.quote(t))
            name, exch = meta.get("name") or "", meta.get("exchangeCode") or ""
        start = (datetime.now(timezone.utc) - timedelta(days=DAYS)).strftime("%Y-%m-%d")
        rows = call(urllib.parse.quote(t) + "/prices", {"startDate": start})
    except NotFound as e:
        return None, str(e), "not_found"
    except Exception as e:
        return None, f"Price service unavailable ({e}). Will retry on the next update", "unavailable"
    # Each day: [date, close, open, high, low, volume]. Close stays in position 1 so older readers still work.
    # Adjusted values are split-adjusted, so charts don't jump at a stock split; the latest adjusted close equals the real close.
    def r4(v):
        return round(float(v), 4) if v is not None else None
    closes = []
    for r in rows:
        if r.get("close") is None:
            continue
        c = r4(r.get("adjClose") or r["close"])
        closes.append([r["date"][:10], c, r4(r.get("adjOpen")) or c, r4(r.get("adjHigh")) or c, r4(r.get("adjLow")) or c, int(r.get("adjVolume") or r.get("volume") or 0)])
    if len(closes) < 2:
        return None, "No prices returned", "unavailable"
    return {"name": name, "currency": "USD", "exchange": exch or "", "price": closes[-1][1], "price_time": rows[-1]["date"], "closes": closes}, None, None


def live_prices(symbols):
    """Latest IEX trade for every ticker in one request: {SYMBOL: {price, prev, time}}."""
    if not KEY or not symbols:
        return {}
    by_t = {s.lower().replace(".", "-"): s for s in symbols}
    try:
        rows = call("", {"tickers": ",".join(by_t)}, base=IEX)
    except Exception as e:
        print(f"Live prices unavailable: {e}", file=sys.stderr)
        return {}
    out = {}
    for r in rows or []:
        sym = by_t.get(str(r.get("ticker", "")).lower())
        price = r.get("tngoLast") or r.get("last")
        if sym and price and r.get("timestamp"):
            # 2026-11-11T12:08:11.463092717-05:00 -> 2026-11-11T12:08:11.463-05:00 (browsers can't read 9 decimals)
            ts = re.sub(r"(\.\d{3})\d+", r"\1", r["timestamp"])
            out[sym] = {"price": round(float(price), 4), "prev": r.get("prevClose"), "time": ts,
                        "open": r.get("open"), "high": r.get("high"), "low": r.get("low"), "volume": r.get("volume")}
    return out


def intraday(symbol):
    """Last 5 trading days in 15-minute steps, as [["2026-11-11T09:30", close, open, high, low, volume], ...] in New York time."""
    t = urllib.parse.quote(symbol.lower().replace(".", "-"))
    start = (datetime.now(timezone.utc) - timedelta(days=9)).strftime("%Y-%m-%d")
    rows = call(t + "/prices", {"startDate": start, "resampleFreq": "15min", "columns": "date,open,high,low,close,volume"}, base=IEX)
    pts = []
    for r in rows or []:
        if r.get("close") is None:
            continue
        d = datetime.fromisoformat(r["date"].replace("Z", "+00:00")).astimezone(NY)
        c = round(float(r["close"]), 4)
        f = lambda k: round(float(r[k]), 4) if r.get(k) is not None else c
        pts.append([d.strftime("%Y-%m-%dT%H:%M"), c, f("open"), f("high"), f("low"), int(r.get("volume") or 0)])
    days = sorted({p[0][:10] for p in pts})[-5:]
    return [p for p in pts if p[0][:10] in days]


def main():
    live_only = "--live" in sys.argv
    stocks = json.load(open("stocks.json")).get("stocks", [])
    try:
        old = json.load(open("prices.json")).get("quotes", {})
    except Exception:
        old = {}
    if not KEY:
        print("TIINGO_API_KEY secret is not set", file=sys.stderr)
    quotes, fails = {}, 0
    for s in stocks:
        sym = str(s.get("symbol", "")).strip().upper()
        if not sym or sym in quotes:
            continue
        prev = old.get(sym) or {}
        if live_only and prev.get("closes"):
            quotes[sym] = {k: v for k, v in prev.items() if k != "live"}
            continue
        q, err, kind = fetch(sym, prev)
        if q:
            quotes[sym] = q
            print(f"{sym}: {len(q['closes'])} days, last {q['closes'][-1]}")
        else:
            fails += 1
            keep = {k: v for k, v in prev.items() if k not in ("error", "error_kind")}
            keep["error"], keep["error_kind"] = err, kind
            quotes[sym] = keep
            print(f"{sym}: {err}", file=sys.stderr)
        if not live_only:
            time.sleep(1)
    live = live_prices(list(quotes))
    for sym, q in quotes.items():
        lv = live.get(sym)
        last_day = q["closes"][-1][0] if q.get("closes") else ""
        # keep a live price only if it's from a day after the last daily close
        if lv and lv["time"][:10] > last_day:
            q["live"] = lv
    print(f"Live prices for {len([q for q in quotes.values() if 'live' in q])}/{len(quotes)} tickers")
    n = 0
    for sym, q in quotes.items():
        if not q.get("closes") or n >= INTRA_MAX:
            continue
        n += 1
        try:
            pts = intraday(sym)
            if len(pts) >= 2:
                q["intraday"] = pts
        except Exception as e:  # keep the previous intraday prices
            print(f"{sym}: intraday unavailable ({e})", file=sys.stderr)
    print(f"Intraday prices for {len([q for q in quotes.values() if q.get('intraday')])}/{len(quotes)} tickers")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [f"    {json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in quotes.items()]
    body = '{\n  "updated": "' + now + '",\n  "quotes": {\n' + ",\n".join(lines) + ("\n" if lines else "") + "  }\n}\n"
    open("prices.json", "w").write(body)
    print(f"Updated {len(quotes) - fails}/{len(quotes)} tickers")


if __name__ == "__main__":
    main()
