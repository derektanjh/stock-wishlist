(function(){
  'use strict';
  var d=document,w=window,body=d.body;
  var splash=d.getElementById('splash'),tpl=splash?splash.cloneNode(true):null;
  var t0=Date.now(),MIN=700,pend=0,loaded=d.readyState==='complete',hidden=false,barT=null;
  var bar=d.createElement('div');bar.id='pbar';bar.setAttribute('aria-hidden','true');bar.innerHTML='<i></i>';body.appendChild(bar);
  function updBar(){
    if(pend>0){if(!barT&&!bar.classList.contains('on')){barT=setTimeout(function(){barT=null;if(pend>0)bar.classList.add('on')},150)}}
    else{if(barT){clearTimeout(barT);barT=null}bar.classList.remove('on')}
  }
  function hide(){
    if(hidden||!splash)return;hidden=true;
    var wait=Math.max(0,MIN-(Date.now()-t0));
    setTimeout(function(){splash.classList.add('out');setTimeout(function(){if(splash.parentNode)splash.parentNode.removeChild(splash)},600)},wait);
  }
  function check(){if(loaded&&pend===0){setTimeout(function(){if(loaded&&pend===0)hide()},250)}}
  var of=w.fetch;
  if(of){w.fetch=function(){pend++;updBar();var p=of.apply(this,arguments);var done=function(){pend=Math.max(0,pend-1);updBar();check()};p.then(done,done);return p}}
  if(loaded)check();else w.addEventListener('load',function(){loaded=true;check()});
  setTimeout(hide,6000);
  function show(){
    if(!tpl||d.getElementById('splash'))return;
    var s=tpl.cloneNode(true);s.classList.remove('out');s.style.opacity='0';body.appendChild(s);
    void s.offsetWidth;s.style.opacity='';
  }
  d.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
    if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target==='_blank'||a.hasAttribute('download'))return;
    var u;try{u=new URL(a.href,location.href)}catch(x){return}
    if(u.origin!==location.origin||(u.pathname===location.pathname&&u.search===location.search))return;
    show();
  },true);
  w.addEventListener('pageshow',function(e){if(e.persisted){var s=d.getElementById('splash');if(s&&s.parentNode)s.parentNode.removeChild(s)}});
  w.portalReady=function(){hide()};
  if('serviceWorker' in navigator&&location.protocol==='https:'){w.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})}
  w.portalBusy=function(p){pend++;updBar();var done=function(){pend=Math.max(0,pend-1);updBar()};Promise.resolve(p).then(done,done);return p};
})();
