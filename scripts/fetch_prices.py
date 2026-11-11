#!/usr/bin/env python3
"""Fetch daily closing prices for every ticker in stocks.json into prices.json.

Source: Tiingo end-of-day API (US stocks and ETFs). Needs the TIINGO_API_KEY
repository secret. Runs in GitHub Actions (.github/workflows/stock-prices.yml).
Standard library only. If a ticker can't be fetched, its previous prices are
kept and the error is noted for the page.
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

API = "https://api.tiingo.com/tiingo/daily/"
KEY = os.environ.get("TIINGO_API_KEY", "").strip()
DAYS = 740  # a little over 2 years of calendar days


class NotFound(Exception):
    pass


def call(path, params=None):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
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
    # adjClose is split-adjusted, so trendlines don't jump at a stock split; the latest adjClose equals the real close
    closes = [[r["date"][:10], round(float(r.get("adjClose") or r["close"]), 4)] for r in rows if r.get("close") is not None]
    if len(closes) < 2:
        return None, "No prices returned", "unavailable"
    return {"name": name, "currency": "USD", "exchange": exch or "", "price": closes[-1][1], "price_time": rows[-1]["date"], "closes": closes}, None, None


def main():
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
        time.sleep(1)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [f"    {json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in quotes.items()]
    body = '{\n  "updated": "' + now + '",\n  "quotes": {\n' + ",\n".join(lines) + ("\n" if lines else "") + "  }\n}\n"
    open("prices.json", "w").write(body)
    print(f"Updated {len(quotes) - fails}/{len(quotes)} tickers")


if __name__ == "__main__":
    main()
