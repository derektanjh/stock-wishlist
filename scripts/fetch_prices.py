#!/usr/bin/env python3
"""Fetch daily closing prices for every ticker in stocks.json into prices.json.

Runs in GitHub Actions (see .github/workflows/stock-prices.yml). Standard library only.
If a ticker can't be fetched this run, its previous prices are kept and an error is noted.
"""
import json, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

RANGE = "2y"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]


def fetch(symbol):
    q = urllib.parse.quote(symbol, safe="")
    last = None
    for attempt in range(3):
        host = HOSTS[attempt % len(HOSTS)]
        url = f"https://{host}/v8/finance/chart/{q}?range={RANGE}&interval=1d&events=split"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                try:
                    return json.load(e)
                except Exception:
                    return {"chart": {"result": None, "error": {"description": "Ticker not found"}}}
            last = e
        except Exception as e:  # network hiccup
            last = e
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(str(last))


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
    for s in stocks:
        sym = str(s.get("symbol", "")).strip().upper()
        if not sym or sym in quotes:
            continue
        try:
            q, err = parse(fetch(sym))
        except Exception as e:
            q, err = None, f"Couldn't reach the price service ({e})"
        if q:
            quotes[sym] = q
            print(f"{sym}: {len(q['closes'])} days, last {q['closes'][-1]}")
        else:
            fails += 1
            keep = dict(old.get(sym) or {})
            keep["error"] = err
            quotes[sym] = keep
            print(f"{sym}: {err}", file=sys.stderr)
        time.sleep(0.6)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [f"    {json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in quotes.items()]
    body = '{\n  "updated": "' + now + '",\n  "quotes": {\n' + ",\n".join(lines) + ("\n" if lines else "") + "  }\n}\n"
    open("prices.json", "w").write(body)
    print(f"Updated {len(quotes) - fails}/{len(quotes)} tickers")


if __name__ == "__main__":
    main()
