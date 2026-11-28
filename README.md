# stock-wishlist

Tracks stocks you want to buy, with trendline analysis on each one.

Live site: https://derektanjh.github.io/stock-wishlist/

- **Add a stock:** tap **Add stock** and type a US stock or ETF ticker (e.g. `NVDA`, `VOO`, `BRK-B`), plus an optional target buy price. It's saved to `stocks.json` using a GitHub token stored only in that browser (Contents: Read and write on this repo; add Actions: Read and write for the **Update prices now** button).
- **Prices:** `.github/workflows/stock-prices.yml` runs `scripts/fetch_prices.py`, which writes 2 years of daily closes from [Tiingo](https://www.tiingo.com) to `prices.json` (needs the `TIINGO_API_KEY` repository secret). It runs every weekday after the US close, and whenever `stocks.json` changes.
- **Analysis** (in the browser): best-fit trendline on log prices with a ±2σ channel, trend %/year and R², distance from the line in σ, 50/200-day averages, RSI(14), 52-week range and gap to your target. Together these give each stock a signal: Buy zone, Near target, Watch, Stretched or Downtrend.
- **Indicators** (Indicators button on each stock's chart, choices remembered per device), all calculated in the browser from Tiingo's daily and 15-minute prices (`indicators.js`):
  - On the price chart: trendline channel, SMA 20/50/200, EMA 9/21/50, Hull MA, Bollinger Bands, Keltner Channels, Donchian Channels, Envelopes, Ichimoku Cloud, Parabolic SAR, Supertrend, VWAP, classic pivot points, auto Fibonacci retracement.
  - Panels below: Volume, RSI, MACD, Stochastic, Stochastic RSI, CCI, Williams %R, ADX/DMI, ATR, OBV, MFI, Chaikin Money Flow, Rate of Change, Awesome Oscillator, Aroon, historical volatility.
  - **Technical rating** (Strong sell … Strong buy): a vote of moving averages and oscillators on daily prices.
  - Volume-based indicators need daily data; the free plan has no volume for 15-minute prices.
- **Swing trade plan (1–4 weeks)** for each stock: looks for a pullback-to-the-21-day-average, a breakout above the 20-day high (on strong volume) or an oversold bounce above the 200-day average, then gives an entry (or buy zone / breakout level to wait for), a stop-loss under the 10-day swing low sized by ATR, Target 1 and Target 2 with reward/risk, exit rules (half at T1 and stop to entry, rest at T2, a close below the 21-day average or ~4 weeks), and a backtest of the same rules on that stock's last 2 years. Plan lines can be drawn on the chart ("Swing plan lines").
- **Long-term outlook**: 200-day average and slope, golden/death cross, 1-year trendline, Ichimoku cloud, ADX, 52-week position and target, rated Strong sell to Strong buy.
- Signals and ratings are maths on past prices, not financial advice.
- iPhone: open the site in Safari → Share → **Add to Home Screen**.
