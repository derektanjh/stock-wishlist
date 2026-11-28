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

/* ---------- professional swing toolkit: market, relative strength, trend template, squeeze, volume, exits, score ----------
   MKT comes from market.json (written by the daily screener): SPY/QQQ daily bars, breadth and the RS distribution. */
var MKT=null,PROCACHE={};
function setMarket(m){MKT=m&&m.spy?m:null;PROCACHE={}}
function rocN(c,k){var n=c.length;return n>k?c[n-1]/c[n-1-k]-1:null}
function rsRaw(c){ // weighted performance like IBD's RS: last quarter counts double
  var a=rocN(c,63);if(a==null)return null;var b=rocN(c,126),d=rocN(c,189),e=rocN(c,252);b=b==null?a:b;d=d==null?b:d;e=e==null?d:e;
  return 0.4*a+0.2*b+0.2*d+0.2*e}
function rsRating(raw){if(raw==null||!MKT||!MKT.rsDist||!MKT.rsDist.length)return null;var D=MKT.rsDist,lo=0,hi=D.length;
  while(lo<hi){var mid=(lo+hi)>>1;if(D[mid]<raw)lo=mid+1;else hi=mid}return Math.max(1,Math.min(99,Math.round(lo/D.length*100)))}
function idxTrend(rows,name){var B=barsOf(rows,false),c=B.c,n=c.length,s50=IND.sma(c,50),s200=IND.sma(c,200),l=c[n-1];
  return {name:name,last:l,d1:l/c[n-2]-1,a50:s50[n-1]!=null?l/s50[n-1]-1:null,a200:s200[n-1]!=null?l/s200[n-1]-1:null,up50:s50[n-1]!=null&&s50[n-11]!=null&&s50[n-1]>s50[n-11]}}
function marketRegime(){
  if(!MKT)return null;var S=idxTrend(MKT.spy,'SPY'),Q=MKT.qqq?idxTrend(MKT.qqq,'QQQ'):null,pts=0,max=0;
  [S,Q].forEach(function(x){if(!x)return;max+=3;if(x.a50>0)pts++;if(x.a200>0)pts++;if(x.up50)pts++});
  var br=MKT.breadth&&MKT.breadth.a50;if(br!=null){max+=2;if(br>=0.6)pts+=2;else if(br>=0.45)pts++}
  var f=max?pts/max:0.5,k=f>=0.75?'on':f>=0.45?'mixed':'off';
  return {k:k,score:f,label:k==='on'?'Risk-on':k==='mixed'?'Mixed: be selective':'Risk-off: defensive',
    say:k==='on'?'Indexes are in uptrends: the best backdrop for swing buys.':k==='mixed'?'Indexes are mixed: take only the best setups, with smaller size.':'Indexes are in downtrends: most swing buys fail here. Consider waiting or trading small.',
    spy:S,qqq:Q,breadth:MKT.breadth,session:MKT.session}}
function trendTemplate(B,rs){ // the 'trend template' popularised by Mark Minervini
  var c=B.c,n=c.length,l=c[n-1],s50=IND.sma(c,50),s150=IND.sma(c,150),s200=IND.sma(c,200),a=s50[n-1],b=s150[n-1],d=s200[n-1];
  if(d==null||b==null)return {n:0,of:0,checks:[],na:true};
  var hi=Math.max.apply(null,B.h.slice(-252)),lo=Math.min.apply(null,B.l.slice(-252)),d22=s200[n-23],R=[];
  R.push({ok:l>b&&l>d,t:'Price above the 150- and 200-day averages'});
  R.push({ok:b>d,t:'150-day average above the 200-day'});
  R.push({ok:d22!=null&&d>d22,t:'200-day average rising for at least a month'});
  R.push({ok:a>b&&a>d,t:'50-day average above the 150- and 200-day'});
  R.push({ok:l>a,t:'Price above the 50-day average'});
  R.push({ok:l>=lo*1.3,t:'At least 30% above the 52-week low ('+pct(l/lo-1,0)+')'});
  R.push({ok:l>=hi*0.75,t:'Within 25% of the 52-week high ('+pct(l/hi-1,0)+')'});
  if(rs!=null)R.push({ok:rs>=70,t:'Relative strength rating 70 or higher ('+rs+')'});
  return {n:R.filter(function(x){return x.ok}).length,of:R.length,checks:R}}
function squeezeOf(B){ // Bollinger Bands inside Keltner Channels = volatility squeeze (energy building before a move)
  var c=B.c,n=c.length,m=IND.sma(c,20),e=IND.ema(c,20),tr=B.h.map(function(h,i){var l=B.l[i];if(!i)return h-l;var pc=c[i-1];return Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc))}),atr=IND.sma(tr,20);
  function on(i){if(m[i]==null||atr[i]==null||e[i]==null)return false;var s=0;for(var j=0;j<20;j++)s+=Math.pow(c[i-j]-m[i],2);var sd=Math.sqrt(s/20);
    return m[i]+2*sd<e[i]+1.5*atr[i]&&m[i]-2*sd>e[i]-1.5*atr[i]}
  var days=0;for(var i=n-1;i>=0&&on(i);i--)days++;
  var fired=!on(n-1)&&(on(n-2)||on(n-3)||on(n-4))&&c[n-1]>m[n-1];
  var a10=IND.sma(tr,10)[n-1],a50=IND.sma(tr,50)[n-1],ratio=a10&&a50?a10/a50:null;
  var hh=Math.max.apply(null,B.h.slice(-10)),ll=Math.min.apply(null,B.l.slice(-10)),rng=(hh-ll)/c[n-1];
  var tight=ratio!=null&&ratio<0.75&&rng<0.08;
  return {on:days>0,days:days,fired:fired,ratio:ratio,range10:rng,tight:tight,
    t:fired?'Squeeze just fired upward: a volatility breakout is under way':days?'In a squeeze for '+days+' day'+(days>1?'s':'')+': volatility is compressed, a bigger move often follows':tight?'Tight 10-day range ('+(rng*100).toFixed(1)+'%) with volatility contracting':'No squeeze: volatility is normal'}}
function volumeOf(B,P){
  var v=B.v,n=v.length;if(!v.some(function(x){return x>0}))return {na:true,t:'No volume data'};
  var avg=IND.sma(v,20),a=avg[n-2]||avg[n-1],rv=a?v[n-1]/a:null,rec=(v[n-1]+v[n-2]+v[n-3])/3,dry=a?rec/a:null;
  var up=0,dn=0;for(var i=Math.max(1,n-50);i<n;i++){if(B.c[i]>B.c[i-1])up+=v[i];else if(B.c[i]<B.c[i-1])dn+=v[i]}var ud=dn?up/dn:null;
  var type=P&&P.setup?P.setup.type:null,ok=null,t;
  if(type==='breakout'){ok=rv>=1.5;t='Breakout volume '+rv.toFixed(1)+'× average'+(ok?': buyers in control':' (weak; pros want 1.5× or more)')}
  else if(P&&(P.action==='Wait for pullback'||P.action==='Wait for turn-up'||type==='pullback')){ok=dry<0.85;t='Pullback volume '+dry.toFixed(2)+'× average'+(ok?', drying up: sellers are quiet':' (heavy; sellers still active)')}
  else t='Last session '+(rv!=null?rv.toFixed(1):'–')+'× average volume';
  return {rv:rv,dry:dry,ud:ud,ok:ok,t:t,acc:ud!=null?(ud>=1.2?'Accumulation: up-day volume '+ud.toFixed(2)+'× down-day volume (50 days)':ud<=0.8?'Distribution: down-day volume outweighs up-day volume ('+ud.toFixed(2)+'×)':'Up/down volume balanced ('+ud.toFixed(2)+'×)'):null}}
function addTradingDays(iso,k){var d=new Date(iso+'T12:00:00Z');while(k>0){d=new Date(d.getTime()+86400000);var w=d.getUTCDay();if(w&&w<6)k--}return d.toISOString().slice(0,10)}
function proAnalysis(A){
  var key=A.s.symbol+'|'+A.c.length+'|'+A.last+'|'+(MKT?MKT.session:'');if(PROCACHE[key])return PROCACHE[key];
  var P=swingPlan(A);if(P.none)return PROCACHE[key]={none:true};
  var B=barsOf(A.c,false),n=B.c.length,c=B.c[n-1],raw=rsRaw(B.c),rs=rsRating(raw),reg=marketRegime();
  // RS line: the stock divided by SPY; near its 52-week high = leading the market
  var rsLine=null;if(MKT){var sp={};MKT.spy.forEach(function(r){sp[r[0]]=r[1]});var L=[];A.c.forEach(function(r){if(sp[r[0]])L.push(r[1]/sp[r[0]])});
    if(L.length>60){var last=L[L.length-1],mx=Math.max.apply(null,L.slice(-252));rsLine={near:last>=mx*0.97,pct:last/mx-1,chg3m:L.length>63?last/L[L.length-64]-1:null}}}
  var tt=trendTemplate(B,rs),sq=squeezeOf(B),vol=volumeOf(B,P),rsiA=IND.BY.rsi.calc(B).lines[0].d,mh=IND.BY.macd.calc(B).hist[0].d;
  var atr=P.atr,hh=Math.max.apply(null,B.h.slice(-22)),chand=hh-3*atr,e21=P.e21,trail=Math.max(chand,e21!=null?e21:-Infinity);
  // Swing Score: weighted checklist (parts missing data are left out and the rest rescaled)
  var parts=[];
  if(reg)parts.push({k:'Market',v:reg.score*15,max:15,t:reg.label});
  if(rs!=null)parts.push({k:'Relative strength',v:rs/99*20,max:20,t:'RS '+rs+(rsLine&&rsLine.near?', RS line near high':'')});
  if(!tt.na)parts.push({k:'Trend template',v:tt.n/tt.of*20,max:20,t:tt.n+'/'+tt.of});
  var sv={'Buy setup':P.setup?({A:15,B:11,C:6})[P.setup.grade]:8,'Wait for turn-up':7,'Wait for pullback':6,'Extended, wait':3,'No setup':0}[P.action]||0;
  if(sq.fired)sv=Math.min(15,sv+3);else if((sq.on||sq.tight)&&P.up)sv=Math.min(15,sv+2);
  parts.push({k:'Setup & timing',v:sv,max:15,t:P.action+(P.setup?' ('+P.setup.grade+')':'')+(sq.fired?', squeeze fired':sq.on?', in squeeze':'')});
  if(!vol.na){var vv=vol.ok===true?8:vol.ok===false?2:4;if(vol.ud>=1.2)vv+=2;else if(vol.ud<=0.8)vv-=2;parts.push({k:'Volume',v:Math.max(0,Math.min(10,vv)),max:10,t:vol.ok===true?'confirming':vol.ok===false?'not confirming':'neutral'})}
  var r=rsiA[n-1],mm=0;if(r!=null){if(r>=40&&r<=68&&r>rsiA[n-2])mm+=5;else if(r>=40&&r<=70)mm+=2.5}if(mh[n-1]!=null&&mh[n-1]>mh[n-2])mm+=5;
  parts.push({k:'Momentum',v:mm,max:10,t:'RSI '+(r!=null?r.toFixed(0):'–')+(mh[n-1]>mh[n-2]?', MACD rising':', MACD falling')});
  var rr=P.plan?P.plan.rr1:null;parts.push({k:'Reward/risk',v:rr==null?0:rr>=2?10:rr>=1.5?7:rr>=1?4:0,max:10,t:rr==null?'no plan':rr.toFixed(1)+' to Target 1'});
  var got=0,mx2=0;parts.forEach(function(p){got+=p.v;mx2+=p.max});var score=Math.round(mx2?got/mx2*100:0);
  var label=score>=75?'Strong':score>=60?'Good':score>=45?'Average':'Weak';
  return PROCACHE[key]={plan:P,rsRaw:raw,rs:rs,rsLine:rsLine,tt:tt,sq:sq,vol:vol,regime:reg,score:score,label:label,parts:parts,
    k:score>=60?'buy':score>=45?'watch':'down',trail:{chand:chand,e21:e21,stop:trail},timeStop:addTradingDays(B.t[n-1],15)}}
function positionSize(entry,stop,acct,riskPct,maxPct){
  if(!(entry>stop)||!(acct>0)||!(riskPct>0))return null;var risk=acct*riskPct/100,per=entry-stop,sh=Math.floor(risk/per),cap=Math.floor(acct*(maxPct||25)/100/entry),capped=sh>cap;
  sh=Math.min(sh,cap);return {shares:sh,value:sh*entry,pctAcct:sh*entry/acct,risk:sh*per,capped:capped}}
