/* Technical indicators for Stock Wishlist.
   Everything is calculated in the browser from the open/high/low/close/volume data the site already has.
   Each indicator returns arrays aligned with the bars (null where there isn't enough history yet). */
(function (W) {
  'use strict';
  var COL = ['#2563eb', '#d97706', '#16a34a', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#65a30d', '#ea580c', '#0d9488'];

  /* ---------- building blocks ---------- */
  function nulls(n) { return new Array(n).fill(null); }
  function sma(a, n) { // simple moving average; restarts after gaps
    var o = nulls(a.length), s = 0, c = 0;
    for (var i = 0; i < a.length; i++) {
      var v = a[i]; if (v == null || !isFinite(v)) { s = 0; c = 0; continue; }
      s += v; c++; if (c > n) { s -= a[i - n]; c = n; }
      if (c === n) o[i] = s / n;
    }
    return o;
  }
  function seeded(a, n, step) { // EMA-style series seeded with the SMA of the first n values
    var o = nulls(a.length), prev = null, s = 0, c = 0;
    for (var i = 0; i < a.length; i++) {
      var v = a[i]; if (v == null || !isFinite(v)) { if (prev == null) { s = 0; c = 0; } continue; }
      if (prev == null) { s += v; c++; if (c === n) { prev = s / n; o[i] = prev; } }
      else { prev = step(prev, v); o[i] = prev; }
    }
    return o;
  }
  function ema(a, n) { var k = 2 / (n + 1); return seeded(a, n, function (p, v) { return p + k * (v - p); }); }
  function rma(a, n) { return seeded(a, n, function (p, v) { return (p * (n - 1) + v) / n; }); } // Wilder's smoothing
  function wma(a, n) {
    var o = nulls(a.length), d = n * (n + 1) / 2;
    for (var i = n - 1; i < a.length; i++) {
      var s = 0, ok = true;
      for (var j = 0; j < n; j++) { var v = a[i - j]; if (v == null) { ok = false; break; } s += v * (n - j); }
      if (ok) o[i] = s / d;
    }
    return o;
  }
  function stdev(a, n) {
    var m = sma(a, n), o = nulls(a.length);
    for (var i = n - 1; i < a.length; i++) {
      if (m[i] == null) continue; var s = 0;
      for (var j = 0; j < n; j++) s += Math.pow(a[i - j] - m[i], 2);
      o[i] = Math.sqrt(s / n);
    }
    return o;
  }
  function highest(a, n) { var o = nulls(a.length); for (var i = n - 1; i < a.length; i++) { var m = -Infinity; for (var j = 0; j < n; j++) m = Math.max(m, a[i - j]); o[i] = m; } return o; }
  function lowest(a, n) { var o = nulls(a.length); for (var i = n - 1; i < a.length; i++) { var m = Infinity; for (var j = 0; j < n; j++) m = Math.min(m, a[i - j]); o[i] = m; } return o; }
  function map2(a, b, f) { return a.map(function (v, i) { return v == null || b[i] == null ? null : f(v, b[i], i); }); }
  function shift(a, k) { // k>0: move values k bars to the right; k<0: to the left
    var o = nulls(a.length);
    for (var i = 0; i < a.length; i++) { var j = i - k; if (j >= 0 && j < a.length) o[i] = a[j]; }
    return o;
  }
  function trueRange(B) { return B.h.map(function (h, i) { var l = B.l[i]; if (!i) return h - l; var pc = B.c[i - 1]; return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)); }); }
  function rsiArr(c, n) {
    var g = c.map(function (v, i) { return i ? Math.max(v - c[i - 1], 0) : null; }), l = c.map(function (v, i) { return i ? Math.max(c[i - 1] - v, 0) : null; });
    var ag = rma(g, n), al = rma(l, n);
    return ag.map(function (v, i) { return v == null || al[i] == null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + v / al[i]); });
  }
  function stochOf(src, hi, lo, n) { var H = highest(hi, n), L = lowest(lo, n); return src.map(function (v, i) { if (H[i] == null || v == null) return null; var r = H[i] - L[i]; return r ? 100 * (v - L[i]) / r : 50; }); }
  function line(n, d, c, o) { var x = { n: n, d: d, c: c }; for (var k in o || {}) x[k] = o[k]; return x; }

  /* ---------- indicator list ---------- */
  // calc(B) gets {o,h,l,c,v,t,intra}; returns {lines:[], fills:[], dots:[], hist:[], levels:[], range:[min,max], steps:true}
  var LIST = [
    // ----- on the price chart -----
    { id: 'swing', name: 'Swing plan lines (entry, stop, targets)', short: 'Swing plan', group: 'price', builtin: true,
      help: 'Entry, stop-loss and Target 1/2 from the swing trade plan, on the daily ranges.' },
    { id: 'trend', name: 'Trendline channel (±2σ)', short: 'Trendline', group: 'price', builtin: true,
      help: 'Best-fit line through the period on a log scale, with a ±2σ band.' },
    { id: 'sma', name: 'Moving averages SMA 20 / 50 / 200', short: 'SMA 20/50/200', group: 'price',
      calc: function (B) { return { lines: [line('SMA 20', sma(B.c, 20), COL[5], { w: 1.2 }), line('SMA 50', sma(B.c, 50), COL[0]), line('SMA 200', sma(B.c, 200), '#94a3b8')] }; } },
    { id: 'ema', name: 'Exponential MAs EMA 9 / 21 / 50', short: 'EMA 9/21/50', group: 'price',
      calc: function (B) { return { lines: [line('EMA 9', ema(B.c, 9), COL[3], { w: 1.2 }), line('EMA 21', ema(B.c, 21), COL[1]), line('EMA 50', ema(B.c, 50), COL[4])] }; } },
    { id: 'hma', name: 'Hull moving average (21)', short: 'HMA 21', group: 'price',
      calc: function (B) { var n = 21, h = Math.round(n / 2), s = Math.round(Math.sqrt(n)); var raw = map2(wma(B.c, h), wma(B.c, n), function (a, b) { return 2 * a - b; }); return { lines: [line('HMA 21', wma(raw, s), COL[7], { w: 1.8 })] }; } },
    { id: 'bb', name: 'Bollinger Bands (20, 2)', short: 'Bollinger', group: 'price',
      calc: function (B) { var m = sma(B.c, 20), sd = stdev(B.c, 20), u = map2(m, sd, function (a, b) { return a + 2 * b; }), d = map2(m, sd, function (a, b) { return a - 2 * b; });
        return { fills: [{ a: u, b: d, c: COL[0], o: 0.07 }], lines: [line('BB upper', u, COL[0], { w: 1 }), line('BB basis', m, COL[6], { w: 1 }), line('BB lower', d, COL[0], { w: 1 })] }; } },
    { id: 'keltner', name: 'Keltner Channels (20, 2)', short: 'Keltner', group: 'price',
      calc: function (B) { var m = ema(B.c, 20), r = ema(trueRange(B), 20), u = map2(m, r, function (a, b) { return a + 2 * b; }), d = map2(m, r, function (a, b) { return a - 2 * b; });
        return { fills: [{ a: u, b: d, c: COL[5], o: 0.06 }], lines: [line('KC upper', u, COL[5], { w: 1 }), line('KC basis', m, COL[5], { w: 1, dash: '4 3' }), line('KC lower', d, COL[5], { w: 1 })] }; } },
    { id: 'donchian', name: 'Donchian Channels (20)', short: 'Donchian', group: 'price',
      calc: function (B) { var u = highest(B.h, 20), d = lowest(B.l, 20); return { fills: [{ a: u, b: d, c: COL[2], o: 0.06 }], lines: [line('DC upper', u, COL[2], { w: 1 }), line('DC mid', map2(u, d, function (a, b) { return (a + b) / 2; }), COL[2], { w: 1, dash: '4 3' }), line('DC lower', d, COL[2], { w: 1 })] }; } },
    { id: 'envelope', name: 'Envelopes (SMA 20 ± 5%)', short: 'Envelopes', group: 'price',
      calc: function (B) { var m = sma(B.c, 20); return { lines: [line('Env upper', m.map(function (v) { return v == null ? null : v * 1.05; }), COL[8], { w: 1 }), line('Env lower', m.map(function (v) { return v == null ? null : v * 0.95; }), COL[8], { w: 1 })] }; } },
    { id: 'ichimoku', name: 'Ichimoku Cloud (9, 26, 52)', short: 'Ichimoku', group: 'price',
      calc: function (B) {
        function mid(n) { return map2(highest(B.h, n), lowest(B.l, n), function (a, b) { return (a + b) / 2; }); }
        var conv = mid(9), base = mid(26), a = shift(map2(conv, base, function (x, y) { return (x + y) / 2; }), 26), b = shift(mid(52), 26);
        return { fills: [{ a: a, b: b, c: COL[2], o: 0.1, c2: COL[6] }], lines: [line('Conversion', conv, COL[0], { w: 1 }), line('Base', base, COL[6], { w: 1 }), line('Lagging', shift(B.c, -26), COL[7], { w: 1 }), line('Span A', a, COL[2], { w: 0.8 }), line('Span B', b, COL[6], { w: 0.8 })] };
      } },
    { id: 'psar', name: 'Parabolic SAR (0.02, 0.2)', short: 'Parabolic SAR', group: 'price',
      calc: function (B) {
        var n = B.c.length, o = nulls(n); if (n < 3) return { dots: [] };
        var up = B.c[1] >= B.c[0], sar = up ? B.l[0] : B.h[0], ep = up ? B.h[0] : B.l[0], af = 0.02;
        for (var i = 1; i < n; i++) {
          sar = sar + af * (ep - sar);
          if (up) {
            sar = Math.min(sar, B.l[i - 1], i > 1 ? B.l[i - 2] : B.l[i - 1]);
            if (B.l[i] < sar) { up = false; sar = ep; ep = B.l[i]; af = 0.02; } else if (B.h[i] > ep) { ep = B.h[i]; af = Math.min(af + 0.02, 0.2); }
          } else {
            sar = Math.max(sar, B.h[i - 1], i > 1 ? B.h[i - 2] : B.h[i - 1]);
            if (B.h[i] > sar) { up = true; sar = ep; ep = B.h[i]; af = 0.02; } else if (B.l[i] < ep) { ep = B.l[i]; af = Math.min(af + 0.02, 0.2); }
          }
          o[i] = sar;
        }
        return { dots: [{ n: 'SAR', d: o, c: COL[4] }] };
      } },
    { id: 'supertrend', name: 'Supertrend (10, 3)', short: 'Supertrend', group: 'price',
      calc: function (B) {
        var n = B.c.length, atr = rma(trueRange(B), 10), upL = nulls(n), dnL = nulls(n), fu = null, fl = null, st = null;
        for (var i = 0; i < n; i++) {
          if (atr[i] == null) continue;
          var hl2 = (B.h[i] + B.l[i]) / 2, ub = hl2 + 3 * atr[i], lb = hl2 - 3 * atr[i], pc = i ? B.c[i - 1] : B.c[i];
          var nfu = fu == null || ub < fu || pc > fu ? ub : fu, nfl = fl == null || lb > fl || pc < fl ? lb : fl;
          if (st == null) st = B.c[i] > nfu ? nfl : nfu;
          else if (st === fu) st = B.c[i] > nfu ? nfl : nfu;
          else st = B.c[i] < nfl ? nfu : nfl;
          fu = nfu; fl = nfl;
          if (st === fl) upL[i] = st; else dnL[i] = st;
        }
        return { lines: [line('Supertrend up', upL, '#16a34a', { w: 1.8 }), line('Supertrend down', dnL, '#dc2626', { w: 1.8 })] };
      } },
    { id: 'vwap', name: 'VWAP (session on 1D/1W, 20-day rolling on daily)', short: 'VWAP', group: 'price',
      calc: function (B) {
        var n = B.c.length, o = nulls(n), pv = 0, vv = 0, day = null;
        if (!B.v.some(function (v) { return v > 0; })) return { lines: [], note: 'VWAP needs volume, which isn\'t available for 15-minute prices on the free plan.' };
        if (B.intra) {
          for (var i = 0; i < n; i++) { var d = B.t[i].slice(0, 10); if (d !== day) { day = d; pv = 0; vv = 0; } var tp = (B.h[i] + B.l[i] + B.c[i]) / 3; pv += tp * B.v[i]; vv += B.v[i]; o[i] = vv ? pv / vv : null; }
        } else {
          for (var j = 19; j < n; j++) { pv = 0; vv = 0; for (var k = 0; k < 20; k++) { var t2 = (B.h[j - k] + B.l[j - k] + B.c[j - k]) / 3; pv += t2 * B.v[j - k]; vv += B.v[j - k]; } o[j] = vv ? pv / vv : null; }
        }
        return { lines: [line('VWAP', o, COL[3], { w: 1.6 })] };
      } },
    { id: 'pivots', name: 'Pivot points (classic: previous month, or previous day on 1D/1W)', short: 'Pivots', group: 'price',
      calc: function (B) {
        var n = B.c.length, key = function (t) { return B.intra ? t.slice(0, 10) : t.slice(0, 7); }, P = nulls(n), R1 = nulls(n), S1 = nulls(n), R2 = nulls(n), S2 = nulls(n);
        var cur = null, hi = -Infinity, lo = Infinity, cl = null, piv = null;
        for (var i = 0; i < n; i++) {
          var k = key(B.t[i]);
          if (k !== cur) { if (cur != null) { var p = (hi + lo + cl) / 3; piv = { p: p, r1: 2 * p - lo, s1: 2 * p - hi, r2: p + (hi - lo), s2: p - (hi - lo) }; } cur = k; hi = -Infinity; lo = Infinity; }
          hi = Math.max(hi, B.h[i]); lo = Math.min(lo, B.l[i]); cl = B.c[i];
          if (piv) { P[i] = piv.p; R1[i] = piv.r1; S1[i] = piv.s1; R2[i] = piv.r2; S2[i] = piv.s2; }
        }
        return { steps: true, lines: [line('R2', R2, '#dc2626', { w: 1, dash: '2 3' }), line('R1', R1, '#dc2626', { w: 1 }), line('Pivot', P, COL[1], { w: 1.2 }), line('S1', S1, '#16a34a', { w: 1 }), line('S2', S2, '#16a34a', { w: 1, dash: '2 3' })] };
      } },
    { id: 'fib', name: 'Auto Fibonacci retracement (visible period)', short: 'Fibonacci', group: 'price', windowOnly: true,
      calc: function (B) {
        var hi = -Infinity, lo = Infinity, hiI = 0, loI = 0;
        B.h.forEach(function (v, i) { if (v > hi) { hi = v; hiI = i; } }); B.l.forEach(function (v, i) { if (v < lo) { lo = v; loI = i; } });
        var upMove = loI < hiI, lv = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        return { hlines: lv.map(function (r) { var y = upMove ? hi - (hi - lo) * r : lo + (hi - lo) * r; return { y: y, label: (r * 100).toFixed(1) + '%', c: r === 0.618 ? COL[1] : '#94a3b8' }; }) };
      } },

    // ----- panels below the chart -----
    { id: 'volume', name: 'Volume (with 20-bar average)', short: 'Volume', group: 'pane',
      calc: function (B) { if (!B.v.some(function (v) { return v > 0; })) return { note: 'No volume for 15-minute prices on the free plan.' };
        return { hist: [{ n: 'Volume', d: B.v.map(function (v) { return v > 0 ? v : null; }), up: B.c.map(function (c, i) { return c >= B.o[i]; }), op: 0.45 }], lines: [line('Vol avg 20', sma(B.v, 20), COL[1], { w: 1.2 })], min0: true, fmt: 'vol' }; } },
    { id: 'rsi', name: 'RSI (14)', short: 'RSI', group: 'pane',
      calc: function (B) { return { lines: [line('RSI 14', rsiArr(B.c, 14), COL[4])], levels: [30, 50, 70], range: [0, 100], band: [30, 70] }; } },
    { id: 'macd', name: 'MACD (12, 26, 9)', short: 'MACD', group: 'pane',
      calc: function (B) { var m = map2(ema(B.c, 12), ema(B.c, 26), function (a, b) { return a - b; }), s = ema(m, 9), h = map2(m, s, function (a, b) { return a - b; });
        return { hist: [{ n: 'Histogram', d: h, sign: true, op: 0.55 }], lines: [line('MACD', m, COL[0]), line('Signal', s, COL[1])], levels: [0] }; } },
    { id: 'stoch', name: 'Stochastic (14, 3, 3)', short: 'Stochastic', group: 'pane',
      calc: function (B) { var k = sma(stochOf(B.c, B.h, B.l, 14), 3), d = sma(k, 3); return { lines: [line('%K', k, COL[0]), line('%D', d, COL[1])], levels: [20, 80], range: [0, 100], band: [20, 80] }; } },
    { id: 'stochrsi', name: 'Stochastic RSI (3, 3, 14, 14)', short: 'Stoch RSI', group: 'pane',
      calc: function (B) { var r = rsiArr(B.c, 14), k = sma(stochOf(r, r, r, 14), 3), d = sma(k, 3); return { lines: [line('K', k, COL[0]), line('D', d, COL[1])], levels: [20, 80], range: [0, 100], band: [20, 80] }; } },
    { id: 'cci', name: 'Commodity Channel Index (20)', short: 'CCI', group: 'pane',
      calc: function (B) { var tp = B.c.map(function (c, i) { return (B.h[i] + B.l[i] + c) / 3; }), m = sma(tp, 20), o = nulls(tp.length);
        for (var i = 19; i < tp.length; i++) { if (m[i] == null) continue; var md = 0; for (var j = 0; j < 20; j++) md += Math.abs(tp[i - j] - m[i]); md /= 20; o[i] = md ? (tp[i] - m[i]) / (0.015 * md) : 0; }
        return { lines: [line('CCI 20', o, COL[5])], levels: [-100, 0, 100], band: [-100, 100] }; } },
    { id: 'willr', name: 'Williams %R (14)', short: 'Williams %R', group: 'pane',
      calc: function (B) { return { lines: [line('%R 14', stochOf(B.c, B.h, B.l, 14).map(function (v) { return v == null ? null : v - 100; }), COL[3])], levels: [-80, -50, -20], range: [-100, 0], band: [-80, -20] }; } },
    { id: 'adx', name: 'ADX / DMI (14)', short: 'ADX', group: 'pane',
      calc: function (B) {
        var n = B.c.length, pdm = nulls(n), mdm = nulls(n);
        for (var i = 1; i < n; i++) { var u = B.h[i] - B.h[i - 1], d = B.l[i - 1] - B.l[i]; pdm[i] = u > d && u > 0 ? u : 0; mdm[i] = d > u && d > 0 ? d : 0; }
        var tr = trueRange(B); tr[0] = null; var atr = rma(tr, 14), p = map2(rma(pdm, 14), atr, function (a, b) { return b ? 100 * a / b : 0; }), m = map2(rma(mdm, 14), atr, function (a, b) { return b ? 100 * a / b : 0; });
        var dx = map2(p, m, function (a, b) { return a + b ? 100 * Math.abs(a - b) / (a + b) : 0; });
        return { lines: [line('ADX', rma(dx, 14), COL[6], { w: 1.8 }), line('+DI', p, '#16a34a', { w: 1 }), line('−DI', m, '#dc2626', { w: 1 })], levels: [20, 25], range: [0, null] };
      } },
    { id: 'atr', name: 'Average True Range (14)', short: 'ATR', group: 'pane',
      calc: function (B) { return { lines: [line('ATR 14', rma(trueRange(B), 14), COL[3])], min0: true }; } },
    { id: 'obv', name: 'On-Balance Volume', short: 'OBV', group: 'pane',
      calc: function (B) { if (!B.v.some(function (v) { return v > 0; })) return { note: 'OBV needs volume, which isn\'t available for 15-minute prices on the free plan.' };
        var o = [], s = 0; B.c.forEach(function (c, i) { if (i) s += c > B.c[i - 1] ? B.v[i] : c < B.c[i - 1] ? -B.v[i] : 0; o.push(s); });
        return { lines: [line('OBV', o, COL[0]), line('OBV avg 20', sma(o, 20), COL[1], { w: 1 })], fmt: 'vol' }; } },
    { id: 'mfi', name: 'Money Flow Index (14)', short: 'MFI', group: 'pane',
      calc: function (B) { if (!B.v.some(function (v) { return v > 0; })) return { note: 'MFI needs volume, which isn\'t available for 15-minute prices on the free plan.' };
        var tp = B.c.map(function (c, i) { return (B.h[i] + B.l[i] + c) / 3; }), o = nulls(tp.length);
        for (var i = 14; i < tp.length; i++) { var pos = 0, neg = 0; for (var j = 0; j < 14; j++) { var k = i - j, f = tp[k] * B.v[k]; if (tp[k] > tp[k - 1]) pos += f; else if (tp[k] < tp[k - 1]) neg += f; } o[i] = neg ? 100 - 100 / (1 + pos / neg) : 100; }
        return { lines: [line('MFI 14', o, COL[2])], levels: [20, 80], range: [0, 100], band: [20, 80] }; } },
    { id: 'cmf', name: 'Chaikin Money Flow (20)', short: 'CMF', group: 'pane',
      calc: function (B) { if (!B.v.some(function (v) { return v > 0; })) return { note: 'CMF needs volume, which isn\'t available for 15-minute prices on the free plan.' };
        var mfv = B.c.map(function (c, i) { var r = B.h[i] - B.l[i]; return r ? ((c - B.l[i]) - (B.h[i] - c)) / r * B.v[i] : 0; }), o = nulls(mfv.length);
        for (var i = 19; i < mfv.length; i++) { var a = 0, v = 0; for (var j = 0; j < 20; j++) { a += mfv[i - j]; v += B.v[i - j]; } o[i] = v ? a / v : 0; }
        return { hist: [{ n: 'CMF 20', d: o, sign: true, op: 0.55 }], levels: [0] }; } },
    { id: 'roc', name: 'Rate of Change (12)', short: 'ROC', group: 'pane',
      calc: function (B) { return { lines: [line('ROC 12 %', B.c.map(function (c, i) { return i >= 12 ? 100 * (c / B.c[i - 12] - 1) : null; }), COL[9])], levels: [0] }; } },
    { id: 'ao', name: 'Awesome Oscillator', short: 'Awesome Osc.', group: 'pane',
      calc: function (B) { var md = B.h.map(function (h, i) { return (h + B.l[i]) / 2; }), ao = map2(sma(md, 5), sma(md, 34), function (a, b) { return a - b; });
        return { hist: [{ n: 'AO', d: ao, rising: true, op: 0.6 }], levels: [0] }; } },
    { id: 'aroon', name: 'Aroon (25)', short: 'Aroon', group: 'pane',
      calc: function (B) { var n = 25, up = nulls(B.c.length), dn = nulls(B.c.length);
        for (var i = n; i < B.c.length; i++) { var hi = -Infinity, lo = Infinity, hiI = 0, loI = 0; for (var j = 0; j <= n; j++) { var k = i - j; if (B.h[k] > hi) { hi = B.h[k]; hiI = j; } if (B.l[k] < lo) { lo = B.l[k]; loI = j; } } up[i] = 100 * (n - hiI) / n; dn[i] = 100 * (n - loI) / n; }
        return { lines: [line('Aroon up', up, '#16a34a'), line('Aroon down', dn, '#dc2626')], levels: [30, 70], range: [0, 100] }; } },
    { id: 'hv', name: 'Historical volatility (20, annualised %)', short: 'Volatility', group: 'pane',
      calc: function (B) { var r = B.c.map(function (c, i) { return i ? Math.log(c / B.c[i - 1]) : null; }), sd = stdev(r.map(function (v) { return v == null ? 0 : v; }), 20), f = Math.sqrt(B.intra ? 252 * 26 : 252) * 100;
        return { lines: [line('HV 20', sd.map(function (v, i) { return v == null || i < 20 ? null : v * f; }), COL[8])], min0: true }; } }
  ];
  var BY = {}; LIST.forEach(function (x) { BY[x.id] = x; });

  /* ---------- technical rating (a vote like TradingView's summary, calculated here) ---------- */
  function rating(B) {
    var n = B.c.length; if (n < 60) return null;
    var c = B.c[n - 1], last = function (a) { return a[n - 1]; }, prev = function (a) { return a[n - 2]; }, ma = [], osc = [];
    [10, 20, 30, 50, 100, 200].forEach(function (k) { var s = last(sma(B.c, k)), e = last(ema(B.c, k)); [s, e].forEach(function (v) { if (v != null) ma.push(c > v ? 1 : c < v ? -1 : 0); }); });
    var hma = last(BY.hma.calc(B).lines[0].d); if (hma != null) ma.push(c > hma ? 1 : -1);
    var vw = BY.vwap.calc(B).lines; if (vw && vw[0] && last(vw[0].d) != null) ma.push(c > last(vw[0].d) ? 1 : -1);
    var ich = BY.ichimoku.calc(B).lines[1].d; if (last(ich) != null) ma.push(c > last(ich) ? 1 : -1);
    var r = rsiArr(B.c, 14); if (last(r) != null) osc.push(last(r) < 30 && last(r) > prev(r) ? 1 : last(r) > 70 && last(r) < prev(r) ? -1 : 0);
    var st = BY.stoch.calc(B).lines; if (last(st[0].d) != null) osc.push(last(st[0].d) < 20 && last(st[0].d) > last(st[1].d) ? 1 : last(st[0].d) > 80 && last(st[0].d) < last(st[1].d) ? -1 : 0);
    var cci = BY.cci.calc(B).lines[0].d; if (last(cci) != null) osc.push(last(cci) < -100 && last(cci) > prev(cci) ? 1 : last(cci) > 100 && last(cci) < prev(cci) ? -1 : 0);
    var adx = BY.adx.calc(B).lines; if (last(adx[0].d) != null) osc.push(last(adx[0].d) > 20 ? (last(adx[1].d) > last(adx[2].d) ? 1 : -1) : 0);
    var ao = BY.ao.calc(B).hist[0].d; if (last(ao) != null) osc.push(last(ao) > 0 && last(ao) > prev(ao) ? 1 : last(ao) < 0 && last(ao) < prev(ao) ? -1 : 0);
    var mom = B.c[n - 1] - B.c[n - 11], momP = B.c[n - 2] - B.c[n - 12]; osc.push(mom > momP ? 1 : mom < momP ? -1 : 0);
    var mc = BY.macd.calc(B).lines; if (last(mc[0].d) != null) osc.push(last(mc[0].d) > last(mc[1].d) ? 1 : -1);
    var sr = BY.stochrsi.calc(B).lines; if (last(sr[0].d) != null) osc.push(last(sr[0].d) < 20 && last(sr[0].d) > last(sr[1].d) ? 1 : last(sr[0].d) > 80 && last(sr[0].d) < last(sr[1].d) ? -1 : 0);
    var wr = BY.willr.calc(B).lines[0].d; if (last(wr) != null) osc.push(last(wr) < -80 && last(wr) > prev(wr) ? 1 : last(wr) > -20 && last(wr) < prev(wr) ? -1 : 0);
    function tally(a) { var b = 0, s = 0, z = 0; a.forEach(function (v) { if (v > 0) b++; else if (v < 0) s++; else z++; }); return { buy: b, sell: s, neutral: z, score: a.length ? (b - s) / a.length : 0 }; }
    function label(x) { return x > 0.5 ? 'Strong buy' : x > 0.1 ? 'Buy' : x < -0.5 ? 'Strong sell' : x < -0.1 ? 'Sell' : 'Neutral'; }
    var M = tally(ma), O = tally(osc), all = (M.score + O.score) / 2;
    return { label: label(all), score: all, ma: M, osc: O, maLabel: label(M.score), oscLabel: label(O.score) };
  }

  W.IND = { LIST: LIST, BY: BY, rating: rating, sma: sma, ema: ema };
})(window);
