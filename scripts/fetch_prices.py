#!/usr/bin/env python3
"""Fetch daily closing prices for every ticker in stocks.json into prices.json.

Runs in GitHub Actions (see .github/workflows/stock-prices.yml). Standard library only.
If a ticker can't be fetched this run, its previous prices are kept and an error is noted.
"""
import csv, http.cookiejar, io, json, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

RANGE = "2y"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
HOSTS = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]

JAR = http.cookiejar.CookieJar()
OPENER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(JAR))
CRUMB = None


class NotFound(Exception):
    pass


def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "en-US,en;q=0.9"})
    return OPENER.open(req, timeout=25)


def session():
    """Get Yahoo's session cookie and crumb, like a browser does. Without them Yahoo often answers 429."""
    global CRUMB
    for url in ("https://fc.yahoo.com", "https://finance.yahoo.com/quote/AAPL"):
        try:
            get(url, "text/html").read()
        except urllib.error.HTTPError:
            pass  # fc.yahoo.com answers 404 but still sets the cookie
        except Exception as e:
            print(f"cookie step {url}: {e}", file=sys.stderr)
        for host in HOSTS:
            try:
                c = get(f"https://{host}/v1/test/getcrumb", "text/plain").read().decode().strip()
                if c and "<" not in c and len(c) < 40:
                    CRUMB = c
                    print("Yahoo session ready")
                    return
            except Exception as e:
                print(f"crumb {host}: {e}", file=sys.stderr)
    print("No Yahoo crumb; trying without it", file=sys.stderr)


def yahoo(symbol):
    q = urllib.parse.quote(symbol, safe="")
    extra = "&crumb=" + urllib.parse.quote(CRUMB) if CRUMB else ""
    last = None
    for attempt in range(4):
        host = HOSTS[attempt % len(HOSTS)]
        url = f"https://{host}/v8/finance/chart/{q}?range={RANGE}&interval=1d&events=split{extra}"
        try:
            with get(url) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise NotFound("Ticker not found on Yahoo Finance")
            last = f"HTTP {e.code}"
            time.sleep([3, 10, 20, 0][attempt] if e.code == 429 else 2)
        except Exception as e:  # network hiccup
            last = str(e)
            time.sleep(2)
    raise RuntimeError(last)


def stooq(symbol):
    """Backup source for US tickers (Stooq daily CSV)."""
    if "." in symbol or "^" in symbol or "=" in symbol:
        return None
    url = f"https://stooq.com/q/d/l/?s={urllib.parse.quote(symbol.lower())}.us&i=d"
    with get(url, "text/csv") as r:
        text = r.read().decode("utf-8", "replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows or "Close" not in rows[0]:
        return None
    since = (datetime.now(timezone.utc) - timedelta(days=740)).strftime("%Y-%m-%d")
    closes = [[x["Date"], round(float(x["Close"]), 4)] for x in rows if x.get("Date", "") >= since and x.get("Close") not in (None, "", "N/D")]
    if len(closes) < 2:
        return None
    return {"name": "", "currency": "USD", "exchange": "US", "price": closes[-1][1], "price_time": None, "closes": closes, "source": "stooq"}


def fetch(symbol):
    """Returns (quote, error, kind) where kind is 'not_found' or 'unavailable'."""
    try:
        q, err = parse(yahoo(symbol))
        if q:
            return q, None, None
        if "not found" in err.lower() or "delisted" in err.lower():
            return None, err, "not_found"
        yerr = err
    except NotFound as e:
        return None, str(e), "not_found"
    except Exception as e:
        yerr = str(e)
    try:
        q = stooq(symbol)
        if q:
            print(f"{symbol}: Yahoo failed ({yerr}), used Stooq")
            return q, None, None
    except Exception as e:
        print(f"{symbol}: Stooq failed too ({e})", file=sys.stderr)
    return None, f"Price service busy ({yerr}). Will retry on the next update", "unavailable"


def parse(raw):
    chart = raw.get("chart") or {}
    res = chart.get("result")
    if not res:
        err = (chart.get("error") or {}).get("description") or "No data"
        return None, err
    r = res[0]
    meta = r.get("meta") or {}
    ts = r.get("timestamp") or []
    closes = ((r.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    off = meta.get("gmtoffset") or 0
    series = {}
    for t, c in zip(ts, closes):
        if c is None:
            continue
        day = (datetime.fromtimestamp(t, timezone.utc) + timedelta(seconds=off)).strftime("%Y-%m-%d")
        series[day] = round(float(c), 4)  # last value of a day wins
    if not series:
        return None, "No prices returned"
    price = meta.get("regularMarketPrice")
    ptime = meta.get("regularMarketTime")
    out = {
        "name": meta.get("longName") or meta.get("shortName") or "",
        "currency": meta.get("currency") or "",
        "exchange": meta.get("fullExchangeName") or meta.get("exchangeName") or "",
        "price": round(float(price), 4) if price is not None else None,
        "price_time": datetime.fromtimestamp(ptime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if ptime else None,
        "closes": [[d, series[d]] for d in sorted(series)],
    }
    return out, None


def main():
    stocks = json.load(open("stocks.json")).get("stocks", [])
    try:
        old = json.load(open("prices.json")).get("quotes", {})
    except Exception:
        old = {}
    quotes, fails = {}, 0
    session()
    for s in stocks:
        sym = str(s.get("symbol", "")).strip().upper()
        if not sym or sym in quotes:
            continue
        q, err, kind = fetch(sym)
        if q:
            quotes[sym] = q
            print(f"{sym}: {len(q['closes'])} days, last {q['closes'][-1]}")
        else:
            fails += 1
            keep = {k: v for k, v in (old.get(sym) or {}).items() if k not in ("error", "error_kind")}
            keep["error"] = err
            keep["error_kind"] = kind
            quotes[sym] = keep
            print(f"{sym}: {err}", file=sys.stderr)
        time.sleep(1.5)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [f"    {json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in quotes.items()]
    body = '{\n  "updated": "' + now + '",\n  "quotes": {\n' + ",\n".join(lines) + ("\n" if lines else "") + "  }\n}\n"
    open("prices.json", "w").write(body)
    print(f"Updated {len(quotes) - fails}/{len(quotes)} tickers")


if __name__ == "__main__":
    main()
