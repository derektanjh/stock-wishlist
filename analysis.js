/* Stock Wishlist analysis shared by the page and the daily screener (scripts/screener.mjs).
   Needs indicators.js (window.IND) and the formatting helpers fp(), pct() and esc() at call time. */
function reg(v){ // least squares on ln(price) vs trading-day index
  var n=v.length,sx=0,sy=0,sxx=0,sxy=0,i,y=v.map(Math.log);
  for(i=0;i<n;i++){sx+=i;sy+=y[i];sxx+=i*i;sxy+=i*y[i]}
  var d=n*sxx-sx*sx;if(n<3||!d)return null;
  var b=(n*sxy-sx*sy)/d,a=(sy-b*sx)/n,ss=0,st=0,my=sy/n;
  for(i=0;i<n;i++){var r=y[i]-(a+b*i);ss+=r*r;st+=(y[i]-my)*(y[i]-my)}
  var s=Math.sqrt(ss/Math.max(1,n-2));
  return {a:a,b:b,s:s,r2:st?1-ss/st:0,at:function(i){return Math.exp(a+b*i)}};
}

function barsOf(rows,intra){var B={t:[],o:[],h:[],l:[],c:[],v:[],intra:!!intra};rows.forEach(function(r){var c=r[1];B.t.push(r[0]);B.c.push(c);B.o.push(r[2]!=null?r[2]:c);B.h.push(r[3]!=null?Math.max(r[3],c):c);B.l.push(r[4]!=null?Math.min(r[4],c):c);B.v.push(r[5]||0)});return B}

/* ---------- short-term and long-term outlook (calculated here from daily prices; not advice) ---------- */
var HCACHE={};
function horizons(A){
  var key=A.s.symbol+'|'+A.c.length+'|'+A.last;if(HCACHE[key])return HCACHE[key];
  var B=barsOf(A.c,false),n=B.c.length,c=B.c[n-1],L=function(a){return a[n-1]},P=function(a,k){return a[n-1-(k||1)]};
  function line(id,i){return IND.BY[id].calc(B).lines[i||0].d}
  function grade(xs){var sc=xs.length?xs.reduce(function(a,x){return a+x.v},0)/xs.length:0;
    return {score:sc,label:sc>0.5?'Strong buy':sc>0.15?'Buy':sc<-0.5?'Strong sell':sc<-0.15?'Sell':'Neutral',k:sc>0.15?'buy':sc<-0.15?'down':'watch',checks:xs}}
  var S=[],Lg=[];
  if(n>=35){
    var r=line('rsi');if(L(r)!=null){var rv=L(r),up=rv>P(r);
      S.push(rv<30?{v:1,t:'RSI '+rv.toFixed(0)+': oversold, often bounces from here'}:rv>70?{v:-1,t:'RSI '+rv.toFixed(0)+': overbought, prone to pull back'}:rv>=50&&up?{v:1,t:'RSI '+rv.toFixed(0)+' and rising: momentum building'}:rv<50&&!up?{v:-1,t:'RSI '+rv.toFixed(0)+' and falling: momentum fading'}:{v:0,t:'RSI '+rv.toFixed(0)+': neutral'})}
    var mc=IND.BY.macd.calc(B),m=mc.lines[0].d,sg=mc.lines[1].d,hh=mc.hist[0].d;if(L(m)!=null&&L(sg)!=null){
      var cross=[1,2,3].some(function(k){return (P(m,k)-P(sg,k))*(L(m)-L(sg))<0});
      S.push(L(m)>L(sg)&&L(hh)>=P(hh)?{v:1,t:cross?'MACD just crossed above its signal line':'MACD above its signal line and strengthening'}:L(m)<L(sg)&&L(hh)<=P(hh)?{v:-1,t:cross?'MACD just crossed below its signal line':'MACD below its signal line and weakening'}:{v:0,t:'MACD flattening near its signal line'})}
    var st=IND.BY.stoch.calc(B).lines,k=L(st[0].d),d=L(st[1].d);if(k!=null&&d!=null)
      S.push(k<20&&k>d?{v:1,t:'Stochastic turning up from oversold'}:k>80&&k<d?{v:-1,t:'Stochastic turning down from overbought'}:k<20?{v:0,t:'Stochastic oversold, not turned up yet'}:k>80?{v:0,t:'Stochastic overbought, still rising'}:{v:0,t:'Stochastic in the middle ('+k.toFixed(0)+')'});
    var e9=L(IND.ema(B.c,9)),e21=L(IND.ema(B.c,21));if(e9!=null&&e21!=null)
      S.push(c>e9&&c>e21&&e9>e21?{v:1,t:'Above its 9- and 21-day averages, which point up'}:c<e9&&c<e21&&e9<e21?{v:-1,t:'Below its 9- and 21-day averages, which point down'}:{v:0,t:'Mixed against its 9- and 21-day averages'});
    var bb=IND.BY.bb.calc(B).lines,bu=L(bb[0].d),bl=L(bb[2].d);if(bu!=null)
      S.push(c<bl?{v:1,t:'Below the lower Bollinger band: stretched down, bounce likely'}:c>bu?{v:-1,t:'Above the upper Bollinger band: stretched up'}:{v:0,t:'Inside its Bollinger bands'});
    var su=IND.BY.supertrend.calc(B).lines;if(L(su[0].d)!=null||L(su[1].d)!=null)
      S.push(L(su[0].d)!=null?{v:1,t:'Supertrend is up'}:{v:-1,t:'Supertrend is down'});
  }
  if(n>=60){
    var s200=L(IND.sma(B.c,200)),s50=L(IND.sma(B.c,50));
    if(s200!=null){Lg.push(c>s200?{v:1,t:'Above its 200-day average ('+pct(c/s200-1,0)+')'}:{v:-1,t:'Below its 200-day average ('+pct(c/s200-1,0)+')'});
      Lg.push(s50>s200?{v:1,t:'Golden cross: 50-day average above the 200-day'}:{v:-1,t:'Death cross: 50-day average below the 200-day'});
      var s200a=IND.sma(B.c,200),old=P(s200a,20);if(old!=null)Lg.push(s200>old?{v:1,t:'200-day average is rising'}:{v:-1,t:'200-day average is falling'})}
    else if(s50!=null)Lg.push(c>s50?{v:1,t:'Above its 50-day average (under 200 days of history)'}:{v:-1,t:'Below its 50-day average (under 200 days of history)'});
    var y=B.c.slice(-252),f=y.length>=120?reg(y):null;if(f){var ann=Math.exp(f.b*252)-1;
      Lg.push(ann>=0.1&&f.r2>=0.3?{v:1,t:'1-year trendline rising '+pct(ann,0)+' a year'}:ann<=-0.1&&f.r2>=0.3?{v:-1,t:'1-year trendline falling '+pct(ann,0)+' a year'}:{v:0,t:'1-year trend mostly sideways ('+pct(ann,0)+'/yr)'})}
    var ic=IND.BY.ichimoku.calc(B).lines,sa=L(ic[3].d),sb=L(ic[4].d);if(sa!=null&&sb!=null)
      Lg.push(c>Math.max(sa,sb)?{v:1,t:'Above the Ichimoku cloud'}:c<Math.min(sa,sb)?{v:-1,t:'Below the Ichimoku cloud'}:{v:0,t:'Inside the Ichimoku cloud (undecided)'});
    var ax=IND.BY.adx.calc(B).lines,adx=L(ax[0].d);if(adx!=null)
      Lg.push(adx>=25?(L(ax[1].d)>L(ax[2].d)?{v:1,t:'Strong uptrend (ADX '+adx.toFixed(0)+')'}:{v:-1,t:'Strong downtrend (ADX '+adx.toFixed(0)+')'}):{v:0,t:'No strong trend (ADX '+adx.toFixed(0)+')'});
    var hi=Math.max.apply(null,B.h.slice(-252)),dd=c/hi-1;
    Lg.push(dd>-0.1?{v:1,t:'Near its 52-week high ('+pct(dd,0)+')'}:dd<-0.35?{v:-1,t:'Far below its 52-week high ('+pct(dd,0)+')'}:{v:0,t:pct(dd,0)+' from its 52-week high'});
    if(A.tgt)Lg.push(c<=A.tgt?{v:1,t:'At or under your target of '+fp(A.tgt)}:{v:0,t:'Needs a '+pct(1-A.tgt/c,0).replace('+','')+' drop to reach your target of '+fp(A.tgt)});
  }
  var gs=grade(S),gl=grade(Lg),SAY={
    s:{'Strong buy':'Momentum and timing look good for buying now.','Buy':'Leaning positive for the next few weeks.','Neutral':'No clear short-term edge, so no rush.','Sell':'Short-term momentum is weak; waiting may get a better price.','Strong sell':'Short-term momentum is clearly negative; better to wait.'},
    l:{'Strong buy':'A strong, healthy long-term uptrend.','Buy':'The long-term trend is positive.','Neutral':'The long-term trend is mixed or sideways.','Sell':'The long-term trend is weakening.','Strong sell':'In a long-term downtrend; riskier to hold.'}};
  gs.say=SAY.s[gs.label];gl.say=SAY.l[gl.label];
  var tip=gl.k==='buy'&&gs.k==='buy'?'Trend and timing agree: both point up.':gl.k==='buy'&&gs.k==='down'?'Good long-term trend, poor timing: consider waiting for the dip to finish, or buying in small parts.':gl.k==='buy'?'Healthy long-term trend; short-term timing is neutral.':gl.k==='down'&&gs.k==='buy'?'A short-term bounce inside a long-term downtrend: be careful chasing it.':gl.k==='down'?'The long-term trend is down; most investors wait for it to turn first.':gs.k==='buy'?'Short-term momentum is up, but the long-term trend hasn\'t confirmed yet.':'No strong signal either way right now.';
  return HCACHE[key]={short:gs,long:gl,tip:tip,ok:S.length>0||Lg.length>0};
}

/* ---------- swing trade plan (1-4 weeks), from daily prices; maths on past prices, not advice ---------- */
var SWCACHE={};
function swingPlan(A){
  var key=A.s.symbol+'|'+A.c.length+'|'+A.last+'|'+(A.tgt||'');if(SWCACHE[key])return SWCACHE[key];
  var B=barsOf(A.c,false),n=B.c.length;if(n<60)return SWCACHE[key]={none:true,why:'Needs at least 60 days of prices.'};
  var tr=B.h.map(function(h,i){var l=B.l[i];if(!i)return h-l;var pc=B.c[i-1];return Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc))});
  var atrA=IND.BY.atr.calc(B).lines[0].d,e21=IND.ema(B.c,21),s50=IND.sma(B.c,50),s200=IND.sma(B.c,200),rsiA=IND.BY.rsi.calc(B).lines[0].d,vavg=IND.sma(B.v,20);
  var hasVol=B.v.some(function(v){return v>0});
  function hiPrev(i,k){var m=-Infinity;for(var j=Math.max(0,i-k);j<i;j++)m=Math.max(m,B.h[j]);return m}
  function loLast(i,k){var m=Infinity;for(var j=Math.max(0,i-k+1);j<=i;j++)m=Math.min(m,B.l[j]);return m}
  function trendUp(i){var s=s50[i]!=null?s50:e21;return s[i]!=null&&s[i-10]!=null&&B.c[i]>s[i]&&s[i]>s[i-10]}
  function setupAt(i){
    if(i<25||atrA[i]==null||rsiA[i]==null||rsiA[i-1]==null)return null;
    var c=B.c[i],up=trendUp(i),above200=s200[i]==null||c>s200[i];
    if(up&&c>hiPrev(i,20)&&(!hasVol||!vavg[i]||B.v[i]>1.3*vavg[i]))return {type:'breakout',name:'Breakout above the 20-day high'+(hasVol?' on strong volume':''),grade:above200?'A':'B'};
    if(up&&e21[i]!=null&&Math.abs(c-e21[i])<=0.75*atrA[i]&&rsiA[i]>=38&&rsiA[i]<=58&&rsiA[i]>rsiA[i-1]&&c>B.c[i-1])return {type:'pullback',name:'Pullback to the 21-day average, turning up',grade:above200?'A':'B'};
    if(s200[i]!=null&&c>s200[i]&&rsiA[i-1]<30&&rsiA[i]>rsiA[i-1])return {type:'bounce',name:'Oversold bounce above the 200-day average',grade:'C'};
    return null;
  }
  function levels(i,entry){ // stop under the recent swing low, sized by volatility; targets by risk multiple and resistance
    var a=atrA[i],stop=Math.max(loLast(i,10)-0.25*a,entry-2.5*a);if(entry-stop<a)stop=entry-a;
    var R=entry-stop,res=hiPrev(i+1,60),t1=res>entry+1*R&&res<entry+3*R?res:entry+1.5*R,t2=Math.max(entry+3*R,t1+R);
    return {entry:entry,stop:stop,t1:t1,t2:t2,R:R,atr:a};
  }
  // backtest the same rules on this stock's history: enter at the close, stop or Target 1 within 20 trading days
  var bt={n:0,win:0,loss:0,time:0,ret:0},i=30;
  while(i<n-1){var su=setupAt(i);if(!su){i++;continue}
    var L=levels(i,B.c[i]),out=null,j;
    for(j=i+1;j<=Math.min(n-1,i+20);j++){if(B.l[j]<=L.stop){out=['loss',L.stop];break}if(B.h[j]>=L.t1){out=['win',L.t1];break}}
    if(!out){if(j>n-1&&i+20>n-1)break;out=['time',B.c[Math.min(n-1,i+20)]];j=Math.min(n-1,i+20)}
    bt.n++;bt[out[0]]++;bt.ret+=out[1]/B.c[i]-1;i=j+1}
  bt.avg=bt.n?bt.ret/bt.n:null;bt.winRate=bt.n?bt.win/bt.n:null;
  // today
  var t=n-1,c=B.c[t],a=atrA[t],su=setupAt(t),P={atr:a,atrPct:a/c,move2w:a*Math.sqrt(10)/c,bt:bt,e21:e21[t],up:trendUp(t),hiBreak:hiPrev(t+1,20)};
  if(su){var L0=levels(t,c);P.action='Buy setup';P.k=su.grade==='C'?'watch':'buy';P.setup=su;P.plan=L0;P.say=su.name+' · grade '+su.grade+(su.grade==='C'?' (against the bigger trend, riskier)':'')+'.'}
  else if(P.up&&e21[t]!=null){
    if(c>e21[t]+2*a){P.action='Extended, wait';P.k='watch';P.say='Up '+pct(c/e21[t]-1,0)+' over its 21-day average: chasing here is risky. Wait for a pullback.'}
    else{P.action='Wait for pullback';P.k='watch';P.say='Uptrend, but no entry signal today. The buy zone is near the 21-day average.'}
    var zl=e21[t]-0.5*a,zh=e21[t]+0.5*a,zm=(zl+zh)/2;P.zone=[zl,zh];P.plan=levels(t,zm);P.plan.entry=zm;P.planned=true;
    if(c<zl){P.action='Wait for turn-up';P.say='Already pulled back below the buy zone. Wait for a day that closes higher (often the entry signal) rather than catching it while it falls.'}
  }else{P.action='No setup';P.k='down';P.say='The trend isn\'t up, so there\'s no swing buy. Watch for a close above '+fp(P.hiBreak)+' (20-day high)'+(hasVol?' on strong volume':'')+'.'}
  if(P.plan){var p=P.plan;P.plan.rr1=(p.t1-p.entry)/p.R;P.plan.rr2=(p.t2-p.entry)/p.R;P.trail=e21[t]}
  return SWCACHE[key]=P;
}
