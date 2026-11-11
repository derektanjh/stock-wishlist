/* Offline + slow-line support for Stock Wishlist.
   Pages and data: try the network first, fall back to the saved copy if the line is slow or down.
   Icons, styles, scripts: show the saved copy instantly and refresh it in the background. */
var CACHE='stocks-v1';
var SHELL=['./','index.html','portal.css','portal.js','stocks.json','prices.json','stocks-icon.svg','stocks-icon-180.png','stocks-icon-192.png','stocks-icon-512.png','manifest.webmanifest'];
var WAIT=3500; // ms to wait for the network before using the saved copy

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return Promise.all(SHELL.map(function(u){return c.add(new Request(u,{cache:'reload'})).catch(function(){})}))}).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}));
});

function keyOf(req){var u=new URL(req.url);u.search='';return u.href} // data.json?123 -> data.json
function put(req,res){if(res&&res.ok){var cp=res.clone();caches.open(CACHE).then(function(c){c.put(keyOf(req),cp)})}return res}
function fromCache(req){return caches.open(CACHE).then(function(c){return c.match(keyOf(req)).then(function(r){return r||c.match(keyOf(req),{ignoreSearch:true})})})}

function networkFirst(req){
  return new Promise(function(resolve){
    var done=false,net=fetch(req).then(function(r){return put(req,r)});
    var t=setTimeout(function(){fromCache(req).then(function(c){if(c&&!done){done=true;resolve(c)}})},WAIT);
    net.then(function(r){if(!done){done=true;clearTimeout(t);resolve(r)}}).catch(function(){
      clearTimeout(t);fromCache(req).then(function(c){if(!done){done=true;resolve(c||Response.error())}})});
  });
}
function staleWhileRevalidate(req){
  return fromCache(req).then(function(c){
    var net=fetch(req).then(function(r){return put(req,r)}).catch(function(){return c||Response.error()});
    return c||net;
  });
}

self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;
  var u=new URL(req.url);
  if(u.origin===location.origin){
    var p=u.pathname;
    if(req.mode==='navigate'||/\.(html|json)$/.test(p)||p.endsWith('/'))e.respondWith(networkFirst(req));
    else e.respondWith(staleWhileRevalidate(req));
    return;
  }
  // everything else (Google Sheet, GitHub API) goes straight to the network
});
