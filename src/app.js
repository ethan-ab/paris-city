/* Paris Food Money Matrix — map, list, filters, nearby independents, suggestions. Vanilla JS + MapLibre GL. */
(() => {
'use strict';

const CATS = {
  pe:   {label:'PE-backed',   c:'--pe',   cs:'--pe-soft',   shape:'sq'},
  vc:   {label:'VC-backed',   c:'--vc',   cs:'--vc-soft',   shape:'dia'},
  corp: {label:'Corporate',   c:'--corp', cs:'--corp-soft', shape:'ring'},
  ind:  {label:'Independent', c:'--ind',  cs:'--ind-soft',  shape:'dot'},
};
const ORDER = {pe:0, vc:1, corp:2, ind:3};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const css = v => `var(${v})`;
const shapeCls = C => ({sq:'sq', ring:'ring', dia:'dia'}[C.shape] || '');
const isMobile = () => innerWidth <= 820;
const meters = (a, b) => {
  const R = 6371000, r = Math.PI / 180, dl = (b[0]-a[0])*r, dg = (b[1]-a[1])*r;
  const h = Math.sin(dl/2)**2 + Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dg/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const slug = n => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
PLACES.forEach((p, i) => { p.i = i; p._s = fold([p.n, p.a, p.area, p.o, p.cu, p.k].join(' ')); });

/* ---------- hand-drawn monuments; each drawing's base sits on its real location ---------- */
const F = c => `style="fill:var(--${c})"`;
const thin = 'stroke="var(--ink)" stroke-width=".55" opacity=".5" fill="none"';
const LM = [
  {id:'eiffel', name:'Tour Eiffel', ll:[48.8584,2.2945], svg:() =>
    `<path class="ink" fill="none" d="M0 -48V-60"/>`+
    `<path class="ink" ${F('marigold')} d="M-15 0Q-7.5 -14 -4.4 -30L-2.2 -46H2.2L4.4 -30Q7.5 -14 15 0H9Q5.5 -9 0 -9Q-5.5 -9 -9 0Z"/>`+
    `<path class="ink" ${F('marigold')} d="M-10 -16H10V-19.5H-10Z"/><path class="ink" ${F('marigold')} d="M-5.6 -30H5.6V-32.5H-5.6Z"/>`+
    `<path class="ink" ${F('white')} d="M-2.2 -46H2.2V-49H-2.2Z"/><path ${thin} d="M-6 -19.5L4 -30M6 -19.5L-4 -30M-2.8 -32.5L1.6 -44M2.8 -32.5L-1.6 -44"/>`},
  {id:'arc', name:'Arc de Triomphe', ll:[48.8738,2.2950], svg:() =>
    `<path class="ink" ${F('cloud')} d="M-14 0V-24H14V0H5V-10A5 5 0 0 0 -5 -10V0Z"/>`+
    `<path class="ink" ${F('marigold')} d="M-15.5 -24V-30H15.5V-24Z"/><path ${thin} d="M-14 -18H-5M5 -18H14M-11 -5V-14M11 -5V-14"/>`},
  {id:'louvre', name:'Louvre', ll:[48.8610,2.3358], svg:() =>
    `<path class="ink" ${F('peri')} d="M-17 0L0 -19L17 0Z"/><path ${thin} d="M-8.5 0L0 -19L8.5 0M-12.5 -5H12.5M-8 -10H8M-3.6 -15H3.6"/>`},
  {id:'notredame', name:'Notre-Dame', ll:[48.8530,2.3499], svg:() =>
    `<path class="ink" ${F('stone')} d="M-1.7 -22L0 -44L1.7 -22Z"/>`+
    `<path class="ink" ${F('cloud')} d="M-15 0V-31H-6V0Z"/><path class="ink" ${F('cloud')} d="M6 0V-31H15V0Z"/>`+
    `<path class="ink" ${F('white')} d="M-6 0V-22H6V0Z"/><circle class="ink" ${F('peri')} cx="0" cy="-14.5" r="3.4"/>`+
    `<path class="ink" ${F('marigold')} d="M-3 0V-5A3 3 0 0 1 3 -5V0Z"/><path ${thin} d="M-12.5 -27V-18M-8.5 -27V-18M8.5 -27V-18M12.5 -27V-18"/>`},
  {id:'pantheon', name:'Panthéon', ll:[48.8462,2.3464], svg:() =>
    `<path class="ink" ${F('marigold')} d="M-16 0V-12H16V0Z"/><path ${thin} d="M-12 0V-12M-6 0V-12M0 0V-12M6 0V-12M12 0V-12"/>`+
    `<path class="ink" ${F('white')} d="M-16 -12L0 -17.5L16 -12Z"/><path class="ink" ${F('white')} d="M-8 -17.5V-26H8V-17.5Z"/>`+
    `<path class="ink" ${F('mint')} d="M-8 -26A8 8 0 0 1 8 -26Z"/><path class="ink" ${F('white')} d="M-1.5 -34V-38H1.5V-34Z"/>`},
  {id:'sacrecoeur', name:'Sacré-Cœur', ll:[48.8867,2.3431], svg:() =>
    `<path class="ink" ${F('white')} d="M-16 0V-10H16V0Z"/>`+
    `<path class="ink" ${F('white')} d="M-15 -10V-13Q-15 -19 -11.5 -20Q-8 -19 -8 -13V-10Z"/><path class="ink" ${F('white')} d="M8 -10V-13Q8 -19 11.5 -20Q15 -19 15 -13V-10Z"/>`+
    `<path class="ink" ${F('white')} d="M-8 -10V-14Q-8 -27 0 -29Q8 -27 8 -14V-10Z"/><path class="ink" ${F('white')} d="M-1.5 -29V-33H1.5V-29Z"/>`+
    `<path class="ink" fill="none" d="M0 -33V-37"/><path class="ink" ${F('marigold')} d="M-3 0V-5A3 3 0 0 1 3 -5V0Z"/>`},
  {id:'montparnasse', name:'Tour Montparnasse', ll:[48.8421,2.3219], svg:() =>
    `<path class="ink" ${F('stone')} d="M-7 0V-50H7V0Z"/><path stroke="var(--white)" stroke-width=".6" opacity=".7" fill="none" d="M-3.5 -48V-2M0 -48V-2M3.5 -48V-2M-7 -38H7M-7 -26H7M-7 -14H7"/>`},
  {id:'pompidou', name:'Centre Pompidou', ll:[48.8607,2.3522], svg:() =>
    `<path class="ink" ${F('white')} d="M-20 0V-22H20V0Z"/><path ${thin} d="M-20 -11H20M-10 0V-22M0 0V-22M10 0V-22"/>`+
    `<path d="M-16 0V-26" stroke="var(--peri)" stroke-width="3"/><path d="M-11 0V-26" stroke="var(--mint)" stroke-width="3"/>`+
    `<path d="M15 0V-26" stroke="var(--marigold)" stroke-width="3"/><path d="M-19 -3L13 -21" stroke="var(--papaya)" stroke-width="2.2" stroke-linecap="round"/>`},
  {id:'opera', name:'Opéra Garnier', ll:[48.8720,2.3316], svg:() =>
    `<path class="ink" ${F('marigold')} d="M-18 0V-14H18V0Z"/><path ${thin} d="M-13 0V-8M-7 0V-8M-1 0V-8M5 0V-8M11 0V-8M-18 -10H18"/>`+
    `<path class="ink" ${F('mint')} d="M-10 -14Q0 -25 10 -14Z"/><circle class="ink" ${F('marigold')} cx="-16" cy="-16.5" r="1.8"/><circle class="ink" ${F('marigold')} cx="16" cy="-16.5" r="1.8"/>`+
    `<path class="ink" fill="none" d="M0 -21V-26"/>`},
  {id:'moulin', name:'Moulin Rouge', ll:[48.8841,2.3322], svg:() =>
    `<path class="ink" ${F('papaya-soft')} d="M-10 0V-13H10V0Z"/><path class="ink" ${F('papaya')} d="M-4 -13V-24H4V-13Z"/>`+
    `<path class="ink" fill="none" stroke-width="1.6" d="M-9 -33L9 -15M9 -33L-9 -15"/><circle cx="0" cy="-24" r="1.6" ${F('ink')}/>`},
  {id:'bastille', name:'Colonne de Juillet', ll:[48.8532,2.3692], svg:() =>
    `<path class="ink" ${F('white')} d="M-6 0V-6H6V0Z"/><path class="ink" ${F('mint')} d="M-1.8 -6V-38H1.8V-6Z"/><path class="ink" ${F('white')} d="M-3 -38V-40H3V-38Z"/>`+
    `<path class="ink" ${F('marigold')} d="M0 -40L-1.6 -46L0 -44.5L2.4 -47Z"/>`},
];

/* ---------- torn-paper skyline in the header ---------- */
(function skyline(){
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const torn = (x, y, w, h) => { let d = `M${x} ${y + rnd()*3}`;
    for (let i = 6; i <= w; i += 6) d += `L${x+i} ${(y + rnd()*3.5).toFixed(1)}`;
    for (let i = w; i >= 0; i -= 6) d += `L${x+i} ${(y + h - rnd()*3.5).toFixed(1)}`;
    return d + 'Z'; };
  let o = `<path d="${torn(14,20,230,82)}" ${F('peri-soft')} transform="rotate(-1.4 130 60)"/>`+
          `<path d="${torn(222,12,204,88)}" ${F('marigold')} opacity=".85" transform="rotate(1.6 324 56)"/>`+
          `<circle cx="398" cy="36" r="12" ${F('papaya-soft')}/>`+
          `<path d="${torn(-6,108,452,26)}" ${F('mint')}/>`;
  const row = [['eiffel',30,1.7],['arc',82,1.55],['louvre',130,1.3],['notredame',180,1.55],['pantheon',230,1.45],
               ['sacrecoeur',282,1.6],['montparnasse',320,1.3],['pompidou',360,1.2],['moulin',412,1.5]];
  row.forEach(([id, x, k]) => { const m = LM.find(l => l.id === id); o += `<g transform="translate(${x} 112) scale(${k})">${m.svg()}</g>`; });
  o += `<path d="M-6 112.5H446" stroke="var(--ink)" stroke-width="1.1"/>`;
  $('skyline').innerHTML = o;
})();

/* ---------- state ---------- */
const active = new Set(Object.keys(CATS));
let query = '', fArea = '', fCu = '', selected = null, nearIds = [];
const visible = p => active.has(p.c) && (!fArea || p.area === fArea) && (!fCu || p.k === fCu) && (!query || p._s.includes(query));
const priceHtml = n => n ? `<span class="price">${'€'.repeat(n)}<s>${'€'.repeat(4-n)}</s></span>` : '';

/* ---------- map: MapLibre + OpenFreeMap vector tiles, restyled to the paper palette ---------- */
const PAL = {land:'#FBEEDF', park:'#CFEBD5', wood:'#D9EFDC', water:'#C5D5F6', road:'#FFFFFF', casing:'#EADBC9', rail:'#E2D3C1',
  bldg:'#F3E5D3', label:'#6F6A64', hood:'#A39B92', waterLabel:'#6F86BC', pe:'#FF4500', vc:'#0087FF', corp:'#9C968F', ind:'#030302'};
function paper(style){
  style.layers = style.layers.filter(l => !/^(boundary|highway-shield|road_shield|airport|label_country|label_state|label_city)/.test(l.id) && l.source !== 'ne2_shaded');
  delete style.sources.ne2_shaded;
  style.layers = style.layers.map(l => {
    const p = l.paint = l.paint || {}, id = l.id;
    if (id === 'background') p['background-color'] = PAL.land;
    else if (id === 'park') { p['fill-color'] = PAL.park; p['fill-opacity'] = 1; }
    else if (id.startsWith('landcover')) { p['fill-color'] = PAL.wood; p['fill-opacity'] = .7; }
    else if (id === 'landuse_residential') p['fill-opacity'] = 0;
    else if (id === 'water') p['fill-color'] = PAL.water;
    else if (id === 'waterway') p['line-color'] = PAL.water;
    else if (id === 'building') return {id:'building-3d', type:'fill-extrusion', source:'openmaptiles', 'source-layer':'building', minzoom:13,
      paint:{'fill-extrusion-color':PAL.bldg, 'fill-extrusion-opacity':.9,
        'fill-extrusion-height':['interpolate',['linear'],['zoom'],13,0,14.5,['coalesce',['get','render_height'],8]],
        'fill-extrusion-base':['coalesce',['get','render_min_height'],0]}};
    else if (l.type === 'line' && l['source-layer'] === 'transportation') p['line-color'] = /casing/.test(id) ? PAL.casing : /rail/.test(id) ? PAL.rail : PAL.road;
    else if (l.type === 'fill' && l['source-layer'] === 'transportation') p['fill-color'] = PAL.road;
    else if (l.type === 'symbol') {
      p['text-color'] = /water/.test(id) ? PAL.waterLabel : id === 'label_other' ? PAL.hood : PAL.label;
      p['text-halo-color'] = PAL.land; p['text-halo-width'] = 1.4; p['text-halo-blur'] = 0;
    }
    return l;
  });
  return style;
}
/* pin icons drawn once on a canvas at 2x */
function icon(kind){
  const r = 2, S = 18, c = document.createElement('canvas'); c.width = c.height = S*r;
  const g = c.getContext('2d'); g.scale(r, r); g.translate(S/2, S/2); g.lineJoin = 'round'; g.strokeStyle = '#fff';
  const rr = (x, y, w, h, rad) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, rad); else g.rect(x, y, w, h); };
  if (kind === 'pe')   { g.lineWidth = 1.8; g.fillStyle = PAL.pe; rr(-6.5,-6.5,13,13,1.5); g.fill(); g.stroke(); }
  if (kind === 'vc')   { g.rotate(Math.PI/4); g.lineWidth = 1.6; g.fillStyle = PAL.vc; rr(-4.8,-4.8,9.6,9.6,1); g.fill(); g.stroke(); }
  if (kind === 'corp') { g.beginPath(); g.arc(0,0,5.2,0,7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2.2; g.strokeStyle = PAL.corp; g.beginPath(); g.arc(0,0,3.9,0,7); g.stroke(); }
  if (kind === 'ind')  { g.beginPath(); g.arc(0,0,4.4,0,7); g.fillStyle = PAL.ind; g.fill(); g.lineWidth = 1.4; g.stroke(); }
  return {width:S*r, height:S*r, data:new Uint8Array(g.getImageData(0,0,S*r,S*r).data.buffer)};
}
const START = () => isMobile() ? {center:[2.3430,48.8590], zoom:12.4, pitch:35, bearing:-8} : {center:[2.3330,48.8600], zoom:12.9, pitch:42, bearing:-10};
const map = new maplibregl.Map({container:'map',
  style:{version:8, sources:{}, layers:[{id:'bg', type:'background', paint:{'background-color':PAL.land}}]},
  ...START(), minZoom:10, maxZoom:18.5, maxPitch:60, maxBounds:[[2.05,48.72],[2.62,48.99]], attributionControl:{compact:true}});
map.touchZoomRotate.disableRotation();
map.once('idle', () => { const a = document.querySelector('.maplibregl-ctrl-attrib'); a && a.classList.remove('maplibregl-compact-show'); });
let ready = false;
const fc = () => ({type:'FeatureCollection', features:PLACES.map(p => ({type:'Feature', id:p.i,
  geometry:{type:'Point', coordinates:[p.ll[1], p.ll[0]]}, properties:{i:p.i, c:p.c, o:3-ORDER[p.c], v:visible(p)?1:0}}))});
/* Offline basemap (self-contained build): water, parks and main roads baked in by scripts/basemap.py */
function offlineStyle(B){
  const src = k => ({type:'geojson', data:B[k]});
  /* road width by class, interpolated on zoom (zoom must be the outer expression) */
  const byClass = (mw, pr, se, other) => ['interpolate',['exponential',1.6],['zoom'],
    10,['match',['get','r'],['motorway','trunk'],mw[0],'primary',pr[0],'secondary',se[0],other[0]],
    16,['match',['get','r'],['motorway','trunk'],mw[1],'primary',pr[1],'secondary',se[1],other[1]]];
  const w = (a, b) => ['interpolate',['exponential',1.6],['zoom'],10,a,16,b];
  return {version:8, sources:{water:src('water'), park:src('park'), wood:src('wood'), road:src('road'), rail:src('rail')}, layers:[
    {id:'background', type:'background', paint:{'background-color':PAL.land}},
    {id:'wood', type:'fill', source:'wood', paint:{'fill-color':PAL.wood, 'fill-opacity':.8}},
    {id:'park', type:'fill', source:'park', paint:{'fill-color':PAL.park}},
    {id:'water', type:'fill', source:'water', paint:{'fill-color':PAL.water}},
    {id:'rail', type:'line', source:'rail', paint:{'line-color':PAL.rail, 'line-width':w(.4,1.6)}},
    {id:'road-casing', type:'line', source:'road', layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':PAL.casing, 'line-width':byClass([2.4,16],[2,14],[1.5,12],[.8,9])}},
    {id:'road', type:'line', source:'road', layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':PAL.road, 'line-width':byClass([1.6,13],[1.3,11],[1,9],[.4,6.5])}},
  ]};
}
const styleReady = window.BASEMAP ? Promise.resolve(null) : fetch('https://tiles.openfreemap.org/styles/positron').then(r => r.json());
styleReady.then(st => {
  map.once('style.load', () => { if (ready) return;
    ['pe','vc','corp','ind'].forEach(k => map.addImage('pin-'+k, icon(k), {pixelRatio:2}));
    map.addSource('places', {type:'geojson', data:fc()});
    const col = ['match',['get','c'],'pe',PAL.pe,'vc',PAL.vc,'corp',PAL.corp,PAL.ind];
    map.addLayer({id:'halo-near', type:'circle', source:'places', filter:['in',['get','i'],['literal',[]]],
      paint:{'circle-radius':13, 'circle-color':col, 'circle-opacity':.16, 'circle-pitch-alignment':'map'}});
    map.addLayer({id:'halo-on', type:'circle', source:'places', filter:['==',['get','i'],-1],
      paint:{'circle-radius':18, 'circle-color':col, 'circle-opacity':.25, 'circle-stroke-width':1.5, 'circle-stroke-color':col, 'circle-stroke-opacity':.5}});
    map.addLayer({id:'pins', type:'symbol', source:'places',
      layout:{'icon-image':['concat','pin-',['get','c']], 'icon-allow-overlap':true, 'icon-ignore-placement':true,
        'symbol-sort-key':['+',['get','o'],['*',['get','v'],10]], 'icon-size':['interpolate',['linear'],['zoom'],10,.7,13,.95,16,1.25,18,1.5]},
      paint:{'icon-opacity':['case',['==',['get','v'],1],1,.12]}});
    ready = true; render();
    const h = decodeURIComponent(location.hash.slice(1)); const hp = h && PLACES.find(p => slug(p.n) === h);
    if (hp) select(hp.i, true); else if (selected !== null) select(selected, false, true);
  });
  map.setStyle(st ? paper(st) : offlineStyle(window.BASEMAP), {diff:false});
}).catch(() => { $('map').insertAdjacentHTML('beforeend', '<p style="position:absolute;inset:auto 16px 16px;font:13px var(--sans);color:var(--graphite)">Map tiles didn\'t load. The list still works.</p>'); });

/* monuments as markers, scaled with zoom */
LM.forEach(m => {
  const box = document.createElement('div');
  box.innerHTML = `<svg class="lmk" viewBox="-40 -62 80 74" width="80" height="74">${m.svg()}<text y="9">${esc(m.name)}</text></svg>`;
  box.style.pointerEvents = 'none';
  m.el = box.firstChild;
  m.mk = new maplibregl.Marker({element:box, anchor:'bottom', pitchAlignment:'viewport', rotationAlignment:'viewport'}).setLngLat([m.ll[1], m.ll[0]]).addTo(map);
});
function sizeLandmarks(){
  const z = map.getZoom(), s = Math.max(.55, Math.min(1.6, .95 * Math.pow(1.45, z - 13)));
  LM.forEach(m => { m.el.setAttribute('width', 80*s); m.el.setAttribute('height', 74*s); m.mk.setOffset([0, 12*s]); m.el.style.opacity = z < 11.2 ? 0 : 1; });
}
map.on('zoom', sizeLandmarks); sizeLandmarks();

/* forgiving taps: nearest visible pin within a finger-sized box */
const coarse = matchMedia('(pointer:coarse)').matches;
function pinAt(pt, R){
  if (!ready) return null;
  const fs = map.queryRenderedFeatures([[pt.x-R, pt.y-R], [pt.x+R, pt.y+R]], {layers:['pins']}).filter(f => f.properties.v === 1);
  let best = null, bd = 1e9;
  fs.forEach(f => { const q = map.project(f.geometry.coordinates), d = (q.x-pt.x)**2 + (q.y-pt.y)**2 - (f.properties.c === 'pe' ? 4 : 0); if (d < bd) { bd = d; best = f; } });
  return best ? PLACES[best.properties.i] : null;
}
map.on('click', e => { const p = pinAt(e.point, coarse ? 22 : 13); if (p) select(p.i, false); else if (selected !== null) select(null); });
map.on('mousemove', e => { map.getCanvas().style.cursor = pinAt(e.point, 10) ? 'pointer' : ''; });
$('zin').onclick = () => map.zoomIn({duration:350});
$('zout').onclick = () => map.zoomOut({duration:350});
$('zreset').onclick = () => { select(null); map.flyTo({...START(), padding:{top:0,right:0,bottom:0,left:0}, duration:1100}); };

/* ---------- independent alternatives nearby: same food type first, then closest ---------- */
function alternatives(p){
  const pool = PLACES.filter(q => q.c === 'ind' && q !== p).map(q => ({q, m:meters(p.ll, q.ll)}));
  const same = pool.filter(x => x.q.k === p.k && x.m < 2500).sort((a, b) => a.m - b.m);
  const any = [...pool].sort((a, b) => a.m - b.m);
  const out = same.slice(0, 2);
  for (const x of any) { if (out.length >= 3) break; if (!out.includes(x)) out.push(x); }
  return out.sort((a, b) => a.m - b.m);
}
const walk = m => m < 1200 ? `${Math.max(1, Math.round(m/80))} min walk` : `${(m/1000).toFixed(1)} km`;

/* ---------- detail card ---------- */
let card = null;
const wrap = $('mapwrap');
function showCard(p){
  card && card.remove();
  const C = CATS[p.c];
  card = document.createElement('div'); card.className = 'card';
  card.style.setProperty('--c', css(C.c)); card.style.setProperty('--cs', css(C.cs));
  const host = (() => { try { return new URL(p.src).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const alts = p.c !== 'ind' ? alternatives(p) : [];
  nearIds = alts.map(a => a.q.i);
  card.innerHTML = `<button class="x" aria-label="Close">×</button>
    <span class="tag"><i class="dot ${shapeCls(C)}"></i>${C.label}</span>
    <h2>${esc(p.n)}</h2><div class="area">${esc([p.cu, p.a].filter(Boolean).join(' · '))} ${priceHtml(p.pr)}</div>
    <dl>${p.o ? `<dt>${p.c === 'ind' ? 'Owned by' : 'Backer'}</dt><dd>${esc(p.o)}</dd>` : ''}${p.y ? `<dt>Since</dt><dd>${esc(p.y)}</dd>` : ''}</dl>
    ${p.note ? `<p>${esc(p.note)}</p>` : ''}
    ${/^https?:\/\//i.test(p.src || '') ? `<a class="src" target="_blank" rel="noopener" href="${esc(p.src)}">Source: ${esc(host)} ↗</a>` : ''}
    ${alts.length ? `<div class="alts"><h3>Independent nearby</h3>${alts.map(a => `<button class="alt" data-i="${a.q.i}"><div><b>${esc(a.q.n)}</b><br><span>${esc(a.q.cu || '')}</span></div><i>${walk(a.m)}</i></button>`).join('')}</div>` : ''}`;
  card.querySelector('.x').onclick = () => select(null);
  card.querySelectorAll('.alt').forEach(b => b.onclick = () => select(+b.dataset.i, true));
  wrap.appendChild(card);
}
function highlight(){
  if (!ready) return;
  map.setFilter('halo-on', ['==', ['get','i'], selected === null ? -1 : selected]);
  map.setFilter('halo-near', ['in', ['get','i'], ['literal', selected === null ? [] : nearIds]]);
}
function select(i, fromList, silent){
  selected = i;
  try { history.replaceState(null, '', i === null ? location.pathname : '#' + slug(PLACES[i].n)); } catch {}
  document.querySelectorAll('.row.on').forEach(r => r.classList.remove('on'));
  if (i === null) { card && card.remove(); card = null; nearIds = []; highlight(); return; }
  const p = PLACES[i]; p.row && p.row.classList.add('on');
  const mobile = isMobile();
  showCard(p); highlight(); if (silent) return;
  const ll = [p.ll[1], p.ll[0]], z = map.getZoom(), zoom = fromList ? Math.max(z, 15.6) : Math.max(z, 14);
  if (mobile) {
    map.flyTo({center:ll, zoom, padding:{top:20, bottom:card.offsetHeight + 20, left:0, right:0}, duration:fromList ? 1300 : 700, essential:true});
  } else {
    const pad = {top:0, bottom:0, left:0, right:card.offsetWidth + 82}, sx = map.project(ll).x, W = map.getContainer().clientWidth;
    if (fromList || sx > W - pad.right - 30 || zoom !== z) map.flyTo({center:ll, zoom, padding:pad, duration:fromList ? 1400 : 700, essential:true});
  }
  if (fromList && mobile) wrap.scrollIntoView({behavior:'smooth', block:'start'});
  if (!fromList && !mobile && p.row) p.row.scrollIntoView({block:'nearest', behavior:'smooth'});
}

/* ---------- rail: stats, filters, list ---------- */
const listEl = $('list');
const counts = Object.fromEntries(Object.keys(CATS).map(k => [k, PLACES.filter(p => p.c === k).length]));
const stats = [...document.querySelectorAll('.stat')];
stats.forEach(b => b.onclick = () => {
  const g = b.dataset.g.split(','), all = Object.keys(CATS);
  const isolated = active.size === g.length && g.every(k => active.has(k));
  active.clear(); (isolated ? all : g).forEach(k => active.add(k)); render();
});
$('legend').innerHTML = Object.values(CATS).map(C => `<span><i class="dot ${shapeCls(C)}" style="--c:${css(C.c)}"></i>${C.label}</span>`).join('');
['pe','vc','corp','ind'].forEach(k => { const i = document.createElement('i'); i.style.background = css(CATS[k].c); i.style.flexGrow = counts[k]; i.title = `${CATS[k].label}: ${counts[k]}`; $('bar').appendChild(i); });
$('nPe').textContent = counts.pe; $('nInd').textContent = counts.ind; $('nOther').textContent = counts.corp + counts.vc;

const arrNum = a => parseInt(a, 10) || 99;
const fill = (id, key, vals) => { const s = $(id); vals.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = `${v} (${PLACES.filter(p => p[key] === v).length})`; s.appendChild(o); }); };
fill('fArea', 'area', [...new Set(PLACES.map(p => p.area).filter(Boolean))].sort((a, b) => arrNum(a) - arrNum(b) || a.localeCompare(b)));
fill('fCu', 'k', [...new Set(PLACES.map(p => p.k).filter(Boolean))].sort((a, b) => a.localeCompare(b)));

const groups = {};
[...PLACES].sort((a, b) => (ORDER[a.c] - ORDER[b.c]) || a.n.localeCompare(b.n, 'fr')).forEach(p => {
  const C = CATS[p.c];
  if (!groups[p.c]) { const h = document.createElement('div'); h.className = 'grp'; h.style.setProperty('--c', css(C.c)); h.innerHTML = `${C.label}<span></span>`; listEl.appendChild(h); groups[p.c] = h; }
  const r = document.createElement('div'); r.className = 'row'; r.tabIndex = 0; r.setAttribute('role', 'option');
  r.style.setProperty('--c', css(C.c));
  r.innerHTML = `<i class="dot ${shapeCls(C)}"></i><div><b>${esc(p.n)}</b><span>${esc([p.cu, p.area].filter(Boolean).join(' · '))}${p.o && p.c !== 'ind' ? ' · ' + esc(p.o) : ''}</span></div>${priceHtml(p.pr)}`;
  r.onclick = () => select(p.i, true);
  r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.i, true); } };
  p.row = r; listEl.appendChild(r);
});
const emptyEl = document.createElement('div'); emptyEl.className = 'empty'; emptyEl.hidden = true;
emptyEl.innerHTML = 'Nothing matches. <a href="#" id="emptySuggest" style="color:var(--azure)">Suggest it</a> or try another search.';
listEl.appendChild(emptyEl);
const foot = document.createElement('div'); foot.className = 'foot';
foot.innerHTML = `Ownership as reported publicly${CHECKED ? ', checked ' + esc(CHECKED) : ''}. Chain branches are placed from OpenStreetMap. "PE-backed" includes significant minority stakes and investment funds that own a business outright. Ownership changes fast; each card links its source. Inspired by the <a href="https://london-food-money-matrix.vercel.app" target="_blank" rel="noopener">London Food Money Matrix</a>.`;
listEl.appendChild(foot);

function render(){
  stats.forEach(b => b.setAttribute('aria-pressed', b.dataset.g.split(',').some(k => active.has(k))));
  let n = 0, pe = 0; const per = {};
  PLACES.forEach(p => { const v = visible(p); p.row.hidden = !v; if (v) { n++; if (p.c === 'pe') pe++; per[p.c] = (per[p.c] || 0) + 1; } });
  Object.entries(groups).forEach(([k, h]) => { h.hidden = !per[k]; h.querySelector('span').textContent = per[k] || 0; });
  emptyEl.hidden = n > 0;
  $('count').textContent = n === PLACES.length ? `${n} PLACES` : `${n} OF ${PLACES.length} PLACES · ${pe} PE-BACKED`;
  if (selected !== null && !visible(PLACES[selected])) select(null);
  if (ready) map.getSource('places').setData(fc());
}
$('q').addEventListener('input', e => { query = fold(e.target.value.trim()); render(); });
$('fArea').addEventListener('change', e => { fArea = e.target.value; render(); });
$('fCu').addEventListener('change', e => { fCu = e.target.value; render(); });

/* ---------- suggest a place ---------- */
const modal = $('modal'), sgForm = $('sgForm'), sgBodyHTML = $('sgBody').innerHTML;
let lastFocus = null;
function openSuggest(prefill){
  lastFocus = document.activeElement; $('sgBody').innerHTML = sgBodyHTML; modal.hidden = false;
  const n = $('sgName'); if (prefill) n.value = prefill; n.focus();
}
function closeSuggest(){ modal.hidden = true; lastFocus && lastFocus.focus && lastFocus.focus(); }
$('suggest').onclick = () => openSuggest(query && !PLACES.some(visible) ? $('q').value.trim() : '');
$('sgClose').onclick = closeSuggest;
modal.addEventListener('click', e => { if (e.target === modal) closeSuggest(); });
addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!modal.hidden) closeSuggest(); else select(null); });
$('emptySuggest').onclick = e => { e.preventDefault(); openSuggest($('q').value.trim()); };
function thanks(name){
  $('sgBody').innerHTML = `<div class="done"><b>Merci</b><p class="sub">We'll check who owns ${esc(name)} and add it to the map if it holds up.</p><button class="go" type="button" id="sgAgain">Suggest another</button></div>`;
  $('sgAgain').onclick = () => openSuggest('');
}
sgForm.addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(sgForm), msg = $('sgMsg'), go = $('sgGo');
  if (f.get('website')) return; // honeypot
  const row = {};
  ['name','location','owner_hint','source_url','note','contact'].forEach(k => { const v = (f.get(k) || '').trim(); if (v) row[k] = v; });
  if (!row.name || row.name.length < 2) { msg.className = 'msg err'; msg.textContent = 'Add the name of the place.'; return; }
  if (row.source_url && !/^https?:\/\//i.test(row.source_url)) { msg.className = 'msg err'; msg.textContent = 'Source link should start with https://'; return; }
  if (!SUGGEST.url) {
    const body = Object.entries(row).map(([k, v]) => `**${k.replace('_', ' ')}**: ${v}`).join('\n\n');
    const href = `${SUGGEST.issues}?labels=suggestion&title=${encodeURIComponent('Suggest: ' + row.name)}&body=${encodeURIComponent(body)}`;
    $('sgBody').innerHTML = `<div class="done"><b>Almost there</b><p class="sub">Suggestions are reviewed on GitHub. Open the pre-filled form and press Submit, and we'll fact-check ${esc(row.name)}.</p><a class="go" style="display:block;text-decoration:none" target="_blank" rel="noopener" href="${esc(href)}">Open the pre-filled suggestion ↗</a></div>`;
    return;
  }
  go.disabled = true; msg.className = 'msg'; msg.textContent = 'Sending…';
  try {
    const r = await fetch(SUGGEST.url + '/rest/v1/submissions', {method:'POST',
      headers:{'apikey':SUGGEST.key, 'Authorization':'Bearer ' + SUGGEST.key, 'Content-Type':'application/json', 'Prefer':'return=minimal'},
      body:JSON.stringify(row)});
    if (!r.ok) throw new Error(r.status);
    thanks(row.name);
  } catch { go.disabled = false; msg.className = 'msg err'; msg.textContent = "Couldn't send that. Try again in a moment."; }
});

render();

/* Read-only hooks for the end-to-end tests (tests/*.spec.js). */
window.__pfmm = {map, places:PLACES, isReady:() => ready, selected:() => selected, nearIds:() => nearIds.slice()};
})();
