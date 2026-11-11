# stock-wishlist

Tracks stocks you want to buy, with trendline analysis on each one.

Live site: https://derektanjh.github.io/stock-wishlist/

- **Add a stock:** tap **Add stock** and type its Yahoo Finance ticker (US `NVDA`, Bursa `1155.KL`, SGX `D05.SI`, HK `0700.HK`), plus an optional target buy price. It's saved to `stocks.json` using a GitHub token stored only in that browser (Contents: Read and write on this repo; add Actions: Read and write for the **Update prices now** button).
- **Prices:** `.github/workflows/stock-prices.yml` runs `scripts/fetch_prices.py`, which writes 2 years of daily closes to `prices.json`. It runs every weekday after the Bursa and US closes, and whenever `stocks.json` changes.
- **Analysis** (in the browser): best-fit trendline on log prices with a ±2σ channel, trend %/year and R², distance from the line in σ, 50/200-day averages, RSI(14), 52-week range and gap to your target. Together these give each stock a signal: Buy zone, Near target, Watch, Stretched or Downtrend.
- Signals are maths on past prices, not financial advice.
- iPhone: open the site in Safari → Share → **Add to Home Screen**.
