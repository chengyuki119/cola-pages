(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var lang = (window.YK && window.YK.lang) || 'en';
  var zh = lang === 'zh';
  var t = function (z, e) { return zh ? z : e; };
  var els = {
    location: $('fwt-location-state'), place: $('fwt-place'), placeForm: $('fwt-place-form'), region: $('fwt-region'), radius: $('fwt-radius'), locate: $('fwt-retry-location'),
    error: $('fwt-error'), categoryStatus: $('fwt-category-status'), categories: $('fwt-categories'), search: $('fwt-search-again'), canvas: $('fwt-wheel'), spin: $('fwt-spin'), wheelHint: $('fwt-wheel-hint'), result: $('fwt-result'), spinStatus: $('fwt-spin-status'),
    results: $('fwt-results-section'), resultTitle: $('fwt-results-title'), resultSummary: $('fwt-results-summary'), filters: $('fwt-filters'), limitNote: $('fwt-limit-note'), list: $('fwt-rest-list'), map: $('fwt-map'), attribution: $('fwt-attribution'), back: $('fwt-back-categories')
  };
  var ctx = els.canvas.getContext('2d');
  var REST_TYPES = ['restaurant','cafe','bakery','ice_cream_shop','meal_takeaway'];
  var CATEGORIES = {
    sushi: { zh:'寿司', en:'Sushi', types:['sushi_restaurant'], order:10 }, ramen:{ zh:'拉面', en:'Ramen', types:['ramen_restaurant'], order:20 },
    japanese: { zh:'日料', en:'Japanese Food', types:['japanese_restaurant'], order:30 }, chinese:{ zh:'中餐', en:'Chinese Food', types:['chinese_restaurant'], order:40 },
    korean:{ zh:'韩餐', en:'Korean Food', types:['korean_restaurant'], order:50 }, thai:{ zh:'泰餐', en:'Thai Food', types:['thai_restaurant'], order:60 }, vietnamese:{ zh:'越南菜', en:'Vietnamese Food', types:['vietnamese_restaurant'], order:70 },
    mexican:{ zh:'墨西哥菜', en:'Mexican Food', types:['mexican_restaurant'], order:80 }, italian:{ zh:'意餐', en:'Italian Food', types:['italian_restaurant'], order:90 }, indian:{ zh:'印度菜', en:'Indian Food', types:['indian_restaurant'], order:100 },
    seafood:{ zh:'海鲜', en:'Seafood', types:['seafood_restaurant'], order:110 }, barbecue:{ zh:'烧烤', en:'BBQ', types:['barbecue_restaurant'], order:120 }, steak:{ zh:'牛排', en:'Steakhouse', types:['steak_house'], order:130 },
    pizza:{ zh:'披萨', en:'Pizza', types:['pizza_restaurant'], order:140 }, burger:{ zh:'汉堡', en:'Burger', types:['hamburger_restaurant'], order:150 }, sandwich:{ zh:'三明治', en:'Sandwich', types:['sandwich_shop'], order:160 },
    cafe:{ zh:'咖啡馆', en:'Cafe', types:['cafe','coffee_shop'], order:170 }, bakery:{ zh:'面包店', en:'Bakery', types:['bakery'], order:180 }, dessert:{ zh:'甜品', en:'Dessert', types:['dessert_shop'], order:190 },
    ice_cream:{ zh:'冰淇淋', en:'Ice Cream', types:['ice_cream_shop'], order:200 }, fast_food:{ zh:'快餐', en:'Fast Food', types:['fast_food_restaurant','meal_takeaway'], order:210 }, vegetarian:{ zh:'素食', en:'Vegetarian', types:['vegetarian_restaurant','vegan_restaurant'], order:220 },
    hot_pot:{ zh:'火锅', en:'Hot Pot', types:[], order:230 }, bubble_tea:{ zh:'奶茶', en:'Bubble Tea', types:[], order:240 },
    other_restaurant:{ zh:'其他餐厅', en:'Other Restaurants', types:['restaurant'], order:999 }
  };
  var TYPE_TO_CATEGORY = {};
  Object.keys(CATEGORIES).forEach(function (k) { CATEGORIES[k].types.forEach(function (typ) { if (typ !== 'restaurant') TYPE_TO_CATEGORY[typ] = k; }); });
  var PALETTE = ['#F5BDD1','#FAE1EA','#F8D1DF','#FFF0F5','#EFC0D3','#FCEAF1','#F3C8D8','#FFE8F0','#EAB6CB','#FBE5EC'];
  var STATE = { loc:null, locationLabel:'', region:'', cfg:null, adapter:null, provider:'', maps:null, places:null, categories:[], broad:[], restaurants:[], selected:null, selectedId:null, rotation:0, spinning:false, busy:false, geoBusy:false, generation:0, cache:Object.create(null), filters:{rating:0,price:'',open:false,subtype:''}, sort:'distance', view:'list', reachedLimit:false, pendingCategory:'' };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  function setError(message) { els.error.textContent = message || ''; els.error.hidden = !message; }
  function showError(message) { setError(message); }
  function normAngle(a) { var tau = Math.PI * 2; return ((a % tau) + tau) % tau; }
  function haversine(a,b) { var rad=Math.PI/180, dlat=(b.latitude-a.latitude)*rad, dlng=(b.longitude-a.longitude)*rad, h=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlng/2)**2; return 6371*2*Math.asin(Math.sqrt(h)); }
  function currentRadius() { return Math.max(1,Math.min(20,Number(els.radius.value)||5)); }
  function regionSelection() { return els.region.value || 'auto'; }

  /* Simplified mainland border used only for map-provider selection; Taiwan is handled separately. */
  var CN_POLY = [[73.5,39.5],[74.2,36.8],[77.5,35.5],[79.2,32.5],[80.4,28.2],[84.5,27.5],[87.5,27.8],[91.0,27.0],[93.8,28.0],[96.2,28.1],[97.5,25.8],[98.8,24.0],[100.6,21.7],[103.0,22.0],[105.3,21.6],[107.5,21.5],[109.5,20.2],[110.6,18.2],[112.8,21.3],[115.0,22.3],[117.4,23.4],[119.5,25.3],[121.8,27.5],[123.2,30.0],[121.8,34.5],[122.5,38.0],[124.4,39.8],[127.2,41.2],[130.5,42.4],[134.7,48.3],[130.0,48.9],[127.5,50.2],[124.0,53.1],[120.1,52.4],[119.2,49.8],[117.0,47.8],[113.0,46.0],[109.4,45.0],[105.2,43.0],[100.0,42.0],[96.0,42.3],[93.0,44.0],[89.0,46.0],[85.0,48.0],[81.0,46.0],[77.5,44.0],[74.0,42.5]];
  function insidePoly(lon,lat,poly) { var inside=false; for(var i=0,j=poly.length-1;i<poly.length;j=i++){var xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1],inter=((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi+0.000000001)+xi);if(inter)inside=!inside;} return inside; }
  function guessRegion(lat,lng) {
    if (lat>=21.4&&lat<=25.6&&lng>=119.2&&lng<=122.3) return 'TW';
    if (insidePoly(lng,lat,CN_POLY)) return 'CN';
    return 'OTHER';
  }
  function effectiveRegion() { var selected=regionSelection(); return selected==='auto'?(STATE.loc?guessRegion(STATE.loc.latitude,STATE.loc.longitude):'OTHER'):selected; }
  function setRegionFromCode(code) { var supported=['US','CA','JP','TW','CN']; els.region.value=supported.indexOf(code)>-1?code:'OTHER'; }
  function invalidateForNewLocation() {
    STATE.generation++; STATE.categories=[]; STATE.broad=[]; STATE.restaurants=[]; STATE.selected=null; STATE.selectedId=null; STATE.filters={rating:0,price:'',open:false,subtype:''}; STATE.reachedLimit=false;
    els.results.hidden=true; els.result.hidden=true; els.result.textContent=''; els.spin.disabled=true; els.spin.textContent=t('开始抽选','Spin'); els.spinStatus.textContent=''; els.limitNote.hidden=true; renderCategories(); drawWheel(); renderFilters(); renderList([]);
  }
  function friendlyGeoError(e) {
    if (!navigator.geolocation) return t('此浏览器不支持定位。请手动输入城市、地址或地点。','This browser does not support geolocation. Enter a city, address, or place instead.');
    if (e && e.code===1) return t('你暂时没有允许定位。请允许浏览器使用位置，或手动输入一个地点。','Location permission was denied. Allow location access or enter a place manually.');
    if (e && e.code===3) return t('定位超时。请重试，或手动输入一个地点。','Location request timed out. Try again or enter a place manually.');
    return t('暂时无法获取你的位置。请允许定位，或者手动输入一个地点。','We could not get your location. Allow location access or enter a place manually.');
  }
  function requestLocation() {
    if (!navigator.geolocation) { els.location.textContent=friendlyGeoError(); setError(''); return; }
    if (STATE.geoBusy) return;
    STATE.geoBusy=true; setError(''); els.location.textContent=t('正在获取你的位置……','Getting your location…'); els.locate.disabled=true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      STATE.geoBusy=false; els.locate.disabled=false;
      var lat=Number(pos.coords.latitude),lng=Number(pos.coords.longitude);
      if (!isFinite(lat)||!isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) { els.location.textContent=friendlyGeoError(); setError(''); return; }
      STATE.cache=Object.create(null); STATE.loc={latitude:lat,longitude:lng}; STATE.locationLabel=t('当前位置','Current location');
      if (regionSelection()==='auto') els.region.value='auto';
      invalidateForNewLocation();
      runInitialSearch(t('当前位置','Current location'));
    }, function (e) { STATE.geoBusy=false; els.locate.disabled=false; STATE.loc=null; invalidateForNewLocation(); els.location.textContent=friendlyGeoError(e); els.categoryStatus.textContent=t('请允许定位或手动输入地点后再搜索。','Allow location or enter a place before searching.'); setError(''); }, { enableHighAccuracy:true, timeout:15000, maximumAge:60000 });
  }

  function ensureConfig() {
    if (STATE.cfg) return Promise.resolve(STATE.cfg);
    if (!window.FoodieMapEngine || !window.FoodieMapEngine.fetchConfig) return Promise.reject(new Error(t('Foodie Map 地图配置不可用。','Foodie Map configuration is unavailable.')));
    return window.FoodieMapEngine.fetchConfig().then(function(cfg){STATE.cfg=cfg||{};return STATE.cfg;});
  }
  function teardownMap() { if(STATE.adapter){try{STATE.adapter.destroy();}catch(e){} STATE.adapter=null;} STATE.provider=''; }
  function buildMap(region, center) {
    var E=window.FoodieMapEngine;
    if(!E) return Promise.reject(new Error(t('Foodie Map 地图引擎未加载。','Foodie Map map engine did not load.')));
    return ensureConfig().then(function(cfg){
      var engine=E.pickEngine(region,cfg);
      if(region==='CN'&&(!cfg.amap_key||!cfg.amap_security)) throw new Error(t('中国大陆附近搜索尚不可用：Foodie Map 的高德 Web JS Key 与安全密钥还没有配置。请选择其他地区或等待管理员配置高德。','Nearby search in Mainland China is unavailable because the Foodie Map AMap Web JS key and security code are not configured.'));
      if(region!=='CN'&&!cfg.google_key) throw new Error(t('Google Maps 尚未配置，无法搜索当前地区。','Google Maps is not configured for this region.'));
      if(engine==='leaflet'&&region!=='CN') throw new Error(t('当前地区没有可用的地图服务。','No map service is available for this region.'));
      if(STATE.adapter&&STATE.provider===engine){STATE.adapter.setView(center.latitude,center.longitude,zoomForRadius(currentRadius()));STATE.adapter.setUserLoc(center.latitude,center.longitude);return STATE.adapter;}
      teardownMap();
      return E.load({el:els.map,center:[center.latitude,center.longitude],zoom:zoomForRadius(currentRadius()),country:region,cfg:cfg}).then(function(adapter){
        STATE.adapter=adapter;STATE.provider=adapter.name;adapter.setUserLoc(center.latitude,center.longitude);
        els.attribution.textContent=adapter.name==='google'?'Google Maps':adapter.name==='amap'?'高德地图 AMap · GCJ-02':'© OpenStreetMap contributors';
        return adapter;
      });
    });
  }
  function zoomForRadius(km){return km<=1?15:km<=3?14:km<=5?13:km<=10?12:11;}
  function googleLibrary() {
    if(STATE.places) return Promise.resolve(STATE.places);
    if(!window.google||!google.maps||!google.maps.importLibrary) return Promise.reject(new Error(t('Google Maps JavaScript API 没有成功加载。','Google Maps JavaScript API did not load.')));
    return google.maps.importLibrary('places').then(function(x){STATE.places=x;return x;});
  }
  function geocoderLibrary() {
    if(!window.google||!google.maps||!google.maps.importLibrary) return Promise.reject(new Error(t('Google Maps JavaScript API 没有成功加载。','Google Maps JavaScript API did not load.')));
    return google.maps.importLibrary('geocoding').then(function(x){return x.Geocoder;});
  }
  function resolveGoogleAddressComponents(components) { var cc='';(components||[]).forEach(function(c){if((c.types||[]).indexOf('country')!==-1)cc=c.shortText||c.short_name||'';});return cc.toUpperCase(); }
  function currentPositionLabel(rows, fallback) {
    if (STATE.locationLabel && STATE.locationLabel !== t('当前位置','Current location')) return STATE.locationLabel;
    var p=(rows||[]).filter(function(x){return x.formattedAddress;}).sort(function(a,b){return haversine(STATE.loc,a)-haversine(STATE.loc,b);})[0];
    if(p){var parts=p.formattedAddress.split(/[,，]/).map(function(x){return x.trim();}).filter(Boolean),area=parts.slice(-3,-1).join(', ')||parts.slice(-2).join(', ');if(area)return t('附近区域：'+area,'Nearby area: '+area);}
    return fallback || t('当前位置','Current location');
  }
  function categoryKeyGoogle(place) {
    var types=[];if(place.primaryType)types.push(place.primaryType);(place.types||[]).forEach(function(x){if(types.indexOf(x)<0)types.push(x);});
    for(var i=0;i<types.length;i++)if(TYPE_TO_CATEGORY[types[i]])return TYPE_TO_CATEGORY[types[i]];
    if(types.indexOf('cafe')>=0||types.indexOf('coffee_shop')>=0)return 'cafe';
    if(types.indexOf('bakery')>=0)return 'bakery';if(types.indexOf('ice_cream_shop')>=0)return 'ice_cream';
    if(types.indexOf('restaurant')>=0||types.indexOf('meal_takeaway')>=0)return 'other_restaurant';
    return '';
  }
  function normalizeGoogle(place,catOverride) {
    var loc=place.location,lat=loc&&(typeof loc.lat==='function'?loc.lat():loc.lat),lng=loc&&(typeof loc.lng==='function'?loc.lng():loc.lng);
    if(lat==null||lng==null)return null;
    var primary=place.primaryType||'', key=catOverride||categoryKeyGoogle(place);if(!key)return null;
    var price=place.priceLevel||'';var priceMap={PRICE_LEVEL_INEXPENSIVE:1,PRICE_LEVEL_MODERATE:2,PRICE_LEVEL_EXPENSIVE:3,PRICE_LEVEL_VERY_EXPENSIVE:4};
    return {id:place.id||('g-'+lat+'-'+lng),name:(place.displayName&&place.displayName.text)||'',category:key,primaryType:primary,types:place.types||[],latitude:Number(lat),longitude:Number(lng),formattedAddress:place.formattedAddress||'',rating:place.rating==null?null:Number(place.rating),userRatingCount:place.userRatingCount==null?null:Number(place.userRatingCount),priceLevel:priceMap[price]||null,openNow:place.currentOpeningHours&&typeof place.currentOpeningHours.openNow==='boolean'?place.currentOpeningHours.openNow:null,phone:place.nationalPhoneNumber||'',website:place.websiteURI||'',mapsUrl:place.googleMapsURI||'',placeId:place.id||'',source:'google'};
  }
  function googleNearby(center,radius,types) {
    return googleLibrary().then(function(P){
      var request={fields:['id','displayName','location','primaryType','types','formattedAddress','rating','userRatingCount','priceLevel','currentOpeningHours','nationalPhoneNumber','websiteURI','googleMapsURI'],locationRestriction:{center:{lat:center.latitude,lng:center.longitude},radius:radius*1000},maxResultCount:20,rankPreference:'DISTANCE',language:zh?'zh-CN':'en'};
      if(types&&types.length)request.includedPrimaryTypes=types;else request.includedTypes=REST_TYPES;
      return P.Place.searchNearby(request).then(function(res){return (res.places||[]).map(function(x){return normalizeGoogle(x,types?null:null);}).filter(Boolean);});
    });
  }

  function amapPlugin() { return new Promise(function(resolve,reject){if(!window.AMap)return reject(new Error('AMap SDK unavailable'));window.AMap.plugin(['AMap.PlaceSearch','AMap.Geocoder'],function(){if(!AMap.PlaceSearch)return reject(new Error('AMap.PlaceSearch unavailable'));resolve();});}); }
  function amapPointToWgs(loc) {
    var lng,lat;if(Array.isArray(loc)){lng=Number(loc[0]);lat=Number(loc[1]);}else if(loc&&typeof loc.getLng==='function'){lng=Number(loc.getLng());lat=Number(loc.getLat());}else if(loc&&loc.lng!=null){lng=Number(loc.lng);lat=Number(loc.lat);}else if(typeof loc==='string'){var a=loc.split(',');lng=Number(a[0]);lat=Number(a[1]);}
    if(!isFinite(lat)||!isFinite(lng))return null;
    var w=window.FoodieCoord.gcj2wgs(lat,lng);return {latitude:w[0],longitude:w[1]};
  }
  function categoryKeyAmap(poi) {
    var raw=[poi.type,poi.typecode,poi.name].filter(Boolean).join(' ').toLowerCase();
    var rules=[['hot_pot',/火锅/],['sushi',/寿司/],['ramen',/拉面|面馆/],['bubble_tea',/奶茶|茶饮/],['ice_cream',/冰淇淋|雪糕/],['bakery',/面包|烘焙/],['dessert',/甜品|甜点|蛋糕|甜食/],['cafe',/咖啡/],['korean',/韩餐|韩国料理|韩式/],['japanese',/日本料理|日料|日式/],['chinese',/中餐|中国菜|川菜|粤菜|湘菜|火锅/],['thai',/泰国菜|泰餐/],['vietnamese',/越南菜/],['mexican',/墨西哥/],['seafood',/海鲜/],['steak',/牛排|扒房/],['pizza',/披萨|比萨/],['burger',/汉堡/],['sandwich',/三明治/],['barbecue',/烧烤|烤肉/],['fast_food',/快餐|小吃/],['vegetarian',/素食|斋/]];
    for(var i=0;i<rules.length;i++)if(rules[i][1].test(raw))return rules[i][0];
    if(/火锅|hot pot/i.test(raw))return 'hot_pot';if(/奶茶|茶饮|bubble tea/i.test(raw))return 'bubble_tea';
    return /餐饮|餐厅|饭店|restaurant|food/i.test(raw)?'other_restaurant':'';
  }
  function normalizeAmap(poi,catOverride) {
    var point=amapPointToWgs(poi.location);if(!point)return null;var key=catOverride||categoryKeyAmap(poi);if(!key)return null;
    return {id:poi.id||poi.pname+'-'+poi.name+'-'+point.latitude+'-'+point.longitude,name:poi.name||poi.pname||'',category:key,primaryType:poi.type||'',types:poi.typecode?[poi.typecode]:[],latitude:point.latitude,longitude:point.longitude,formattedAddress:[poi.pname,poi.cityname,poi.adname,poi.address].filter(Boolean).join(' '),rating:null,userRatingCount:null,priceLevel:null,openNow:null,phone:poi.tel||'',website:poi.website||'',mapsUrl:'',placeId:poi.id||'',source:'amap'};
  }
  function amapNearbyAll(center,radius) {
    return amapPlugin().then(function(){
      var ps=new AMap.PlaceSearch({type:'餐饮服务',pageSize:50,pageIndex:1,extensions:'base'});
      function page(i,acc,total) { ps.setPageIndex(i);return new Promise(function(resolve,reject){ps.searchNearBy('餐饮',[window.FoodieCoord.wgs2gcj(center.latitude,center.longitude)[1],window.FoodieCoord.wgs2gcj(center.latitude,center.longitude)[0]],radius*1000,function(status,res){if(status!=='complete'||!res||!res.poiList)return reject(new Error(res&&res.info||'AMap POI search failed'));var raw=res.poiList.pois||[],all=acc.concat(raw),count=Number(res.poiList.count)||all.length;var pages=Math.ceil(count/50);if(i<pages&&i<100)page(i+1,all,count).then(resolve,reject);else resolve({rows:all,total:count,limited:pages>100});});}); }
      return page(1,[],0).then(function(r){return {rows:r.rows.map(function(x){return normalizeAmap(x);}).filter(Boolean),total:r.total,limited:r.limited};});
    });
  }
  function amapNearbyCategory(center,radius,cat) {
    return amapPlugin().then(function(){
      var ps=new AMap.PlaceSearch({type:'餐饮服务',pageSize:50,pageIndex:1,extensions:'base'});var gcj=window.FoodieCoord.wgs2gcj(center.latitude,center.longitude);
      function page(i,acc,total){ps.setPageIndex(i);return new Promise(function(resolve,reject){ps.searchNearBy(cat.zh,[gcj[1],gcj[0]],radius*1000,function(status,res){if(status!=='complete'||!res||!res.poiList)return reject(new Error(res&&res.info||'AMap POI search failed'));var raw=res.poiList.pois||[],all=acc.concat(raw),count=Number(res.poiList.count)||all.length,pages=Math.ceil(count/50);if(i<pages&&i<100)page(i+1,all,count).then(resolve,reject);else resolve({rows:all,total:count,limited:pages>100});});});}
      return page(1,[],0).then(function(r){return {rows:r.rows.map(function(x){return normalizeAmap(x,cat.id);}).filter(Boolean),total:r.total,limited:r.limited};});
    });
  }
  function runProviderSearch(center,radius,region,cat) {
    var key=[region,center.latitude.toFixed(4),center.longitude.toFixed(4),radius,cat&&cat.id||'all'].join('|'),cached=STATE.cache[key];
    if(cached&&Date.now()-cached.time<180000)return Promise.resolve(cached.value);
    return ensureConfig().then(function(cfg){
      if(region==='CN'){
        if(!cfg.amap_key||!cfg.amap_security)throw new Error(t('中国大陆附近搜索尚不可用：Foodie Map 的高德 Web JS Key 与安全密钥还没有配置。','Nearby search in Mainland China is unavailable because the Foodie Map AMap Web JS key and security code are not configured.'));
        return buildMap(region,center).then(function(){return cat?amapNearbyCategory(center,radius,cat):amapNearbyAll(center,radius);});
      }
      if(!cfg.google_key)throw new Error(t('Google Maps 尚未配置，无法搜索当前地区。','Google Maps is not configured for this region.'));
      return buildMap(region,center).then(function(){return googleNearby(center,radius,cat?cat.types:null).then(function(rows){return {rows:rows,total:rows.length,limited:rows.length>=20};});});
    }).then(function(value){STATE.cache[key]={time:Date.now(),value:value};return value;});
  }
  function makeCategories(rows) {
    var counts=Object.create(null),typeLists=Object.create(null);
    (rows||[]).forEach(function(r){if(!r.category)return;counts[r.category]=(counts[r.category]||0)+1;if(!typeLists[r.category])typeLists[r.category]=[];(r.types||[]).forEach(function(x){if(typeLists[r.category].indexOf(x)<0&&TYPE_TO_CATEGORY[x]===r.category)typeLists[r.category].push(x);});if(r.primaryType&&TYPE_TO_CATEGORY[r.primaryType]===r.category&&typeLists[r.category].indexOf(r.primaryType)<0)typeLists[r.category].push(r.primaryType);});
    return Object.keys(counts).map(function(id){var base=CATEGORIES[id]||CATEGORIES.other_restaurant;return {id:id,zh:base.zh,en:base.en,types:typeLists[id].length?typeLists[id]:base.types,count:counts[id],order:base.order||999};}).sort(function(a,b){return a.order-b.order||a.en.localeCompare(b.en);});
  }
  function renderCategories() {
    if(!STATE.categories.length){els.categories.innerHTML='<div class="fd-empty">'+esc(t('获取位置后会显示附近实际存在的美食类型。','Real nearby food categories will appear after location is available.'))+'</div>';return;}
    els.categories.innerHTML=STATE.categories.map(function(c){return '<button type="button" class="fwt-cat'+(STATE.selected&&STATE.selected.id===c.id?' on':'')+'" data-category="'+esc(c.id)+'"><span>'+esc(zh?c.zh:c.en)+'</span><small class="fwt-cat-count">'+c.count+'</small></button>';}).join('');
    els.categories.querySelectorAll('[data-category]').forEach(function(b){b.addEventListener('click',function(){var c=STATE.categories.filter(function(x){return x.id===b.dataset.category;})[0];if(c)selectCategory(c,false);});});
  }
  function drawWheel() {
    var n=STATE.categories.length,w=els.canvas.width,cx=w/2,cy=w/2,r=w*.46;ctx.clearRect(0,0,w,w);
    if(!n){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=5;ctx.strokeStyle='#f6c5d7';ctx.stroke();ctx.fillStyle='#b98598';ctx.font='600 26px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t('获取附近美食后生成转盘','The wheel appears after nearby food loads'),cx,cy,w*.74);return;}
    var step=2*Math.PI/n;ctx.save();ctx.translate(cx,cy);ctx.rotate(STATE.rotation);
    STATE.categories.forEach(function(c,i){var a=-Math.PI/2+i*step,b=a+step,mid=(a+b)/2;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,a,b);ctx.closePath();ctx.fillStyle=PALETTE[i%PALETTE.length];ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.stroke();ctx.save();ctx.rotate(mid);ctx.translate(0,-r*.67);ctx.rotate(Math.PI/2);var text=zh?c.zh:c.en,maxW=Math.max(30,r*step*.72),font=22;ctx.textAlign='center';ctx.textBaseline='middle';while(font>12){ctx.font='600 '+font+'px sans-serif';if(ctx.measureText(text).width<=maxW)break;font--;}ctx.fillStyle='#65515d';var label=text;while(ctx.measureText(label).width>maxW&&label.length>3)label=label.slice(0,-1);if(label!==text)label=label.slice(0,-1)+'…';ctx.fillText(label,0,0,maxW);ctx.font='600 13px sans-serif';ctx.fillStyle='#8d6f7d';ctx.fillText(String(c.count),0,20,maxW);ctx.restore();});ctx.restore();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.lineWidth=5;ctx.strokeStyle='#f6c5d7';ctx.stroke();
  }
  function cryptoIndex(n) {
    if(!(window.crypto&&window.crypto.getRandomValues))return Math.floor(Math.random()*n);
    var span=4294967296,limit=span-(span%n),buf=new Uint32Array(1),value;do{window.crypto.getRandomValues(buf);value=buf[0];}while(value>=limit);return value%n;
  }
  function spin() {
    if(STATE.spinning||!STATE.categories.length)return;
    if(STATE.categories.length===1){els.spinStatus.textContent=t('附近只有一种可用类型，直接为你查找。','Only one food type is available nearby. Showing it now.');selectCategory(STATE.categories[0],true);return;}
    var i=cryptoIndex(STATE.categories.length),cat=STATE.categories[i],step=2*Math.PI/STATE.categories.length,target=normAngle(-((i+.5)*step)),delta=normAngle(target-normAngle(STATE.rotation)),from=STATE.rotation,to=from+Math.PI*2*(6+cryptoIndex(3))+delta,start=performance.now(),duration=5200;
    STATE.spinning=true;STATE.selected=null;STATE.selectedId=null;els.results.hidden=true;els.result.hidden=true;els.spin.disabled=true;els.spin.textContent=t('旋转中…','Spinning…');els.spinStatus.textContent='';renderCategories();
    function frame(now){var p=Math.min(1,(now-start)/duration),ease=p*p*(3-2*p);STATE.rotation=from+(to-from)*ease;drawWheel();if(p<1){requestAnimationFrame(frame);return;}STATE.rotation=to;drawWheel();STATE.spinning=false;els.spin.disabled=false;els.spin.textContent=t('再抽一次','Spin Again');els.result.textContent=t('今天吃：','Today\'s Pick: ')+(zh?cat.zh:cat.en);els.result.hidden=false;selectCategory(cat,true);}
    requestAnimationFrame(frame);
  }

  function showLoading() { els.categoryStatus.textContent=t('正在寻找附近的美食……','Searching for nearby food…');els.categories.innerHTML='<div class="fd-empty">'+esc(t('正在搜索附近餐厅，请稍候……','Searching nearby restaurants…'))+'</div>';els.spin.disabled=true;els.spinStatus.textContent=''; }
  function categorySearchStatus(result) { var n=result.rows.length;els.categoryStatus.textContent=t('已找到 '+STATE.categories.length+' 种美食类型（地图服务返回 '+n+' 家附近餐厅）','Found '+STATE.categories.length+' food categories ('+n+' nearby restaurants returned by the map service)'); }
  function locationLabel(rows,fallback){return currentPositionLabel(rows,fallback);}
  function runInitialSearch(fallbackLabel) {
    if(!STATE.loc)return;
    var generation=++STATE.generation,region=effectiveRegion(),radius=currentRadius();STATE.region=region;invalidateForNewLocation();STATE.generation=generation;showLoading();els.location.textContent=t('已定位到你附近，正在搜索美食……','Location found. Searching nearby food…');setError('');
    runProviderSearch(STATE.loc,radius,region,null).then(function(result){if(generation!==STATE.generation)return;STATE.broad=result.rows.map(function(r){r.distanceKm=haversine(STATE.loc,r);return r;}).filter(function(r){return r.distanceKm<=radius+0.05;});STATE.reachedLimit=!!result.limited;STATE.categories=makeCategories(STATE.broad);els.location.textContent=t('已定位到：','Located near: ')+locationLabel(result.rows,fallbackLabel);categorySearchStatus({rows:STATE.broad});renderCategories();drawWheel();els.spin.disabled=!STATE.categories.length;els.spin.textContent=STATE.categories.length===1?t('查看这一类型','View This Type'):t('开始抽选','Spin');if(result.limited)showLimit(t('Google Places 的附近搜索单次最多返回 20 家；以下数量和分类只代表本次 API 返回结果，不代表范围内全部餐厅。','Google Places Nearby Search returns at most 20 places per request. These counts reflect the returned results, not every restaurant in the radius.'));else els.limitNote.hidden=true;if(!STATE.categories.length)showError(t('附近暂时没有找到餐厅，请扩大搜索半径或手动搜索其他地点。','No nearby restaurants were returned. Expand the radius or search another place.'));else setError('');STATE.adapter&&STATE.adapter.setUserLoc(STATE.loc.latitude,STATE.loc.longitude);var pending=STATE.pendingCategory;STATE.pendingCategory='';if(pending){var selected=STATE.categories.filter(function(c){return c.id===pending;})[0];if(selected)selectCategory(selected,false);}}).catch(function(e){if(generation!==STATE.generation)return;STATE.categories=[];STATE.broad=[];renderCategories();drawWheel();els.spin.disabled=true;els.location.textContent=t('已定位到附近位置，但搜索没有完成。','Location found, but nearby search did not complete.');els.categoryStatus.textContent=t('附近美食搜索失败。','Nearby food search failed.');showError(e&&e.message?e.message:t('地图搜索失败，请重试。','Map search failed. Please retry.'));});
  }
  function showLimit(text){els.limitNote.textContent=text;els.limitNote.hidden=false;}

  function selectCategory(cat,fromSpin) {
    if(!STATE.loc||!cat)return;
    STATE.selected=cat;STATE.selectedId=null;STATE.filters={rating:0,price:'',open:false,subtype:''};STATE.results=els.results;els.results.hidden=false;els.resultTitle.textContent=t('今天吃：','Today\'s Pick: ')+(zh?cat.zh:cat.en);els.resultSummary.textContent=t('正在搜索 '+cat.zh+' 附近餐厅……','Searching nearby '+cat.en+' restaurants…');els.list.innerHTML='<div class="fd-empty">'+esc(t('正在搜索附近餐厅……','Searching nearby restaurants…'))+'</div>';els.filters.innerHTML='';els.results.scrollIntoView({behavior:'smooth',block:'start'});renderCategories();
    var gen=++STATE.generation,region=STATE.region||effectiveRegion(),radius=currentRadius();
    runProviderSearch(STATE.loc,radius,region,cat).then(function(out){if(gen!==STATE.generation)return;STATE.restaurants=out.rows.map(function(r){r.distanceKm=haversine(STATE.loc,r);return r;}).filter(function(r){return r.distanceKm<=radius+0.05;}).sort(function(a,b){return a.distanceKm-b.distanceKm;});STATE.reachedLimit=!!out.limited;els.resultSummary.textContent=t('当前 '+radius+' 公里范围 · 已找到 '+STATE.restaurants.length+' 家返回结果','Within '+radius+' km · '+STATE.restaurants.length+' results returned');if(out.limited){showLimit(region==='CN'?t('高德 POI 返回结果已达到分页上限；页面显示目前取得的记录。','AMap POI pagination reached its limit; showing the results retrieved so far.'):t('Google Places 的附近搜索单次最多返回 20 家；这是 API 返回结果，不代表范围内全部餐厅。','Google Places Nearby Search returns at most 20 places per request; these are returned results, not every restaurant in the radius.'));}else els.limitNote.hidden=true;renderFilters();renderList(filteredRows());updateMarkers();if(!STATE.restaurants.length){showError(t('附近暂时没有找到这个类型的餐厅，可以扩大搜索范围。','No restaurants of this type were returned nearby. Try expanding the radius.'));}else setError('');if(STATE.adapter)STATE.adapter.setView(STATE.loc.latitude,STATE.loc.longitude,zoomForRadius(radius));}).catch(function(e){if(gen!==STATE.generation)return;STATE.restaurants=[];renderList([]);showError(e&&e.message?e.message:t('餐厅搜索失败，请重试。','Restaurant search failed. Please retry.'));});
  }
  function priceValue(r){return r.priceLevel||null;}
  function filteredRows(){var rows=STATE.restaurants.filter(function(r){if(STATE.filters.rating&&(!r.rating||r.rating<STATE.filters.rating))return false;if(STATE.filters.price&&String(priceValue(r))!==STATE.filters.price)return false;if(STATE.filters.open&&r.openNow!==true)return false;if(STATE.filters.subtype&&STATE.filters.subtype!==String(r.primaryType||''))return false;return true;});rows.sort(function(a,b){if(STATE.sort==='rating')return (b.rating||0)-(a.rating||0);if(STATE.sort==='reviews')return (b.userRatingCount||0)-(a.userRatingCount||0);return a.distanceKm-b.distanceKm;});return rows;}
  function renderFilters(){var rows=STATE.restaurants,html='';var rated=rows.some(function(r){return r.rating!=null;});if(rated)html+='<label class="fwt-filter-select"><span class="sr-only">'+esc(t('最低评分','Minimum Rating'))+'</span><select id="fwt-rating"><option value="0">'+esc(t('全部评分','Any Rating'))+'</option><option value="3.5">3.5+</option><option value="4">4.0+</option><option value="4.5">4.5+</option></select></label>';
    var prices=rows.map(priceValue).filter(function(x){return !!x;}).filter(function(x,i,a){return a.indexOf(x)===i;}).sort();if(prices.length>1)html+='<label class="fwt-filter-select"><span class="sr-only">'+esc(t('价格','Price'))+'</span><select id="fwt-price"><option value="">'+esc(t('全部价格','Any Price'))+'</option>'+prices.map(function(p){return '<option value="'+p+'">'+esc('$'.repeat(p))+'</option>';}).join('')+'</select></label>';
    if(rows.some(function(r){return r.openNow!==null;}))html+='<button type="button" class="fwt-filter-chip" id="fwt-open">'+esc(t('现在营业','Open Now'))+'</button>';
    var types=rows.map(function(r){return r.primaryType;}).filter(function(x){return x;}).filter(function(x,i,a){return a.indexOf(x)===i;});if(types.length>1)html+='<label class="fwt-filter-select"><span class="sr-only">'+esc(t('餐厅类型','Restaurant Type'))+'</span><select id="fwt-subtype"><option value="">'+esc(t('全部类型','All Types'))+'</option>'+types.map(function(x){return '<option value="'+esc(x)+'">'+esc(typeLabel(x))+'</option>';}).join('')+'</select></label>';
    var sortOpts='<label class="fwt-filter-select"><span class="sr-only">'+esc(t('排序','Sort'))+'</span><select id="fwt-sort"><option value="distance">'+esc(t('距离最近','Nearest'))+'</option>'+(rated?'<option value="rating">'+esc(t('评分最高','Highest Rated'))+'</option>':'')+(rows.some(function(r){return r.userRatingCount!=null;})?'<option value="reviews">'+esc(t('评论最多','Most Reviews'))+'</option>':'')+'</select></label>';
    els.filters.innerHTML=html+sortOpts;
    var rating=$('fwt-rating'),price=$('fwt-price'),open=$('fwt-open'),sub=$('fwt-subtype'),sort=$('fwt-sort');if(rating)rating.value=STATE.filters.rating||'0';if(price)price.value=STATE.filters.price||'';if(sort)sort.value=STATE.sort;
    if(rating)rating.onchange=function(){STATE.filters.rating=Number(this.value)||0;renderList(filteredRows());updateMarkers();};if(price)price.onchange=function(){STATE.filters.price=this.value;renderList(filteredRows());updateMarkers();};if(open){open.classList.toggle('on',STATE.filters.open);open.onclick=function(){STATE.filters.open=!STATE.filters.open;renderFilters();renderList(filteredRows());updateMarkers();};}if(sub)sub.onchange=function(){STATE.filters.subtype=this.value;renderList(filteredRows());updateMarkers();};if(sort)sort.onchange=function(){STATE.sort=this.value;renderList(filteredRows());updateMarkers();};
  }
  function typeLabel(type){for(var k in CATEGORIES)if(CATEGORIES[k].types.indexOf(type)>-1)return zh?CATEGORIES[k].zh:CATEGORIES[k].en;return type.replace(/_/g,' ').replace(/\b\w/g,function(x){return x.toUpperCase();});}
  function directionsUrl(r){if(r.source==='amap'){var g=window.FoodieCoord.wgs2gcj(r.latitude,r.longitude);return 'https://uri.amap.com/navigation?to='+g[1].toFixed(6)+','+g[0].toFixed(6)+','+encodeURIComponent(r.name)+'&mode=car&coordinate=gaode&callnative=1';}return r.mapsUrl||('https://www.google.com/maps/dir/?api=1&destination='+r.latitude+','+r.longitude+(r.placeId?'&destination_place_id='+encodeURIComponent(r.placeId):''));}
  function renderList(rows){if(!rows.length){els.list.innerHTML='<div class="fd-empty">'+esc(t('没有符合当前筛选的餐厅。','No restaurants match the current filters.'))+'</div>';return;}els.list.innerHTML=rows.map(function(r){var rating=r.rating!=null?'★ '+r.rating.toFixed(1)+(r.userRatingCount!=null?' ('+r.userRatingCount+')':''):'';var price=r.priceLevel?'$'.repeat(r.priceLevel):'';var open=r.openNow===true?t('营业中','Open now'):r.openNow===false?t('目前休息','Closed now'):'';var phone=r.phone?'<a href="tel:'+esc(r.phone)+'">'+esc(t('电话','Call'))+'</a>':'';var website=r.website?'<a href="'+esc(r.website)+'" target="_blank" rel="noopener">'+esc(t('官网','Website'))+'</a>':'';return '<article class="fwt-rest-card'+(STATE.selectedId===r.id?' selected':'')+'" data-rest="'+esc(r.id)+'" tabindex="0"><div class="fwt-rest-name">'+esc(r.name)+'</div><div class="fwt-rest-meta">'+(rating?'<span>'+esc(rating)+'</span>':'')+(price?'<span>'+esc(price)+'</span>':'')+'<span>'+r.distanceKm.toFixed(1)+' km</span>'+(open?'<span>'+esc(open)+'</span>':'')+'<span>'+esc(zh?(CATEGORIES[r.category]||CATEGORIES.other_restaurant).zh:(CATEGORIES[r.category]||CATEGORIES.other_restaurant).en)+'</span></div>'+(r.formattedAddress?'<div class="fwt-rest-address">'+esc(r.formattedAddress)+'</div>':'')+'<div class="fwt-rest-links">'+(r.mapsUrl&&r.source==='google'?'<a href="'+esc(r.mapsUrl)+'" target="_blank" rel="noopener">'+esc(t('查看地图','View Map'))+'</a>':'')+'<a href="'+esc(directionsUrl(r))+'" target="_blank" rel="noopener">'+esc(t('导航','Directions'))+'</a>'+phone+website+'</div></article>';}).join('');els.list.querySelectorAll('[data-rest]').forEach(function(card){card.addEventListener('click',function(e){if(e.target.closest('a'))return;selectRestaurant(card.dataset.rest);});card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();selectRestaurant(card.dataset.rest);}});});}
  function popupHtml(r){return '<div style="font-family:inherit;max-width:230px;color:#65515d"><b>'+esc(r.name)+'</b>'+(r.formattedAddress?'<div style="margin-top:4px">'+esc(r.formattedAddress)+'</div>':'')+'<div style="margin-top:5px">'+r.distanceKm.toFixed(1)+' km</div></div>';}
  function updateMarkers(){if(!STATE.adapter)return;var rows=filteredRows();try{STATE.adapter.clearMarkers();STATE.adapter.setUserLoc(STATE.loc.latitude,STATE.loc.longitude);STATE.adapter.addMarkers(rows.map(function(r){return Object.assign({},r,{name:r.name});}),{onMarkerClick:function(r){STATE.selectedId=r.id;renderList(filteredRows());},popHtml:popupHtml});}catch(e){console.warn('[FoodieToday] markers',e);}}
  function selectRestaurant(id){STATE.selectedId=id;renderList(filteredRows());var r=STATE.restaurants.filter(function(x){return x.id===id;})[0];if(!r||!STATE.adapter)return;STATE.adapter.flyTo(r.latitude,r.longitude,Math.max(STATE.adapter.getZoom()||0,15));try{STATE.adapter.openPopup(r,popupHtml(r));}catch(e){}if(STATE.view==='map'&&window.innerWidth<=800){var mapToggle=document.querySelector('.fwt-view-btn[data-view="map"]');if(mapToggle)mapToggle.click();}}
  function setView(view){STATE.view=view;var list=els.list.closest('.fwt-map-list');list.dataset.view=view;document.querySelectorAll('.fwt-view-btn').forEach(function(b){b.classList.toggle('active',b.dataset.view===view);});if(view==='map'&&STATE.adapter&&STATE.adapter.map&&STATE.provider==='leaflet')setTimeout(function(){try{STATE.adapter.map.invalidateSize();}catch(e){}},80);}

  function geocodeManual(text) {
    var region=regionSelection();if(region==='auto')region='OTHER';
    if(region==='CN')return ensureConfig().then(function(cfg){if(!cfg.amap_key||!cfg.amap_security)throw new Error(t('中国大陆地点搜索尚不可用：尚未配置高德 Web JS Key 和安全密钥。','Mainland China place search is unavailable because the AMap Web JS key and security code are not configured.'));return buildMap('CN',{latitude:0,longitude:0}).then(amapPlugin).then(function(){return new Promise(function(resolve,reject){var g=new AMap.Geocoder();g.getLocation(text,function(status,res){if(status==='complete'&&res.geocodes&&res.geocodes[0]){var x=res.geocodes[0],p=amapPointToWgs(x.location);resolve({loc:p,label:x.formattedAddress||text,region:'CN'});}else reject(new Error(t('高德没有找到这个地点。','AMap could not find that place.')));});});});});
    return buildMap('OTHER',{latitude:0,longitude:0}).then(function(){return geocoderLibrary();}).then(function(Geocoder){return new Promise(function(resolve,reject){new Geocoder().geocode({address:text}).then(function(res){var first=(res.results||[])[0];if(!first)return reject(new Error(t('没有找到这个地点，请补充城市或地区。','Place not found. Add a city or region.')));var p=first.geometry.location,cc=resolveGoogleAddressComponents(first.address_components);resolve({loc:{latitude:p.lat(),longitude:p.lng()},label:first.formatted_address||text,region:cc||'OTHER'});}).catch(function(){reject(new Error(t('地点搜索服务不可用，请稍后重试。','Place search is unavailable. Please try again later.')));});});});
  }
  function submitPlace(e){e.preventDefault();var text=els.place.value.trim();if(!text){els.place.focus();return;}STATE.cache=Object.create(null);STATE.loc=null;STATE.locationLabel='';invalidateForNewLocation();var gen=++STATE.generation;setError('');els.location.textContent=t('正在搜索地点……','Searching for place…');els.categoryStatus.textContent=t('正在定位这个地点……','Finding this place…');geocodeManual(text).then(function(r){if(gen!==STATE.generation)return;STATE.loc=r.loc;STATE.locationLabel=r.label;setRegionFromCode(regionSelection()==='auto'?r.region:(regionSelection()==='OTHER'?r.region:regionSelection()));els.location.textContent=t('已定位到：','Located at: ')+r.label;STATE.region=effectiveRegion();runInitialSearch(r.label);}).catch(function(err){if(gen!==STATE.generation)return;els.location.textContent=t('无法定位这个地点。','Could not locate this place.');showError(err.message);});}
  $('fwt-spin').addEventListener('click',spin);
  els.search.addEventListener('click',function(){if(STATE.loc)runInitialSearch(t('当前位置','Current location'));else requestLocation();});
  els.locate.addEventListener('click',requestLocation);
  els.placeForm.addEventListener('submit',submitPlace);
  els.radius.addEventListener('change',function(){if(STATE.loc){STATE.pendingCategory=STATE.selected&&STATE.selected.id;invalidateForNewLocation();runInitialSearch(STATE.locationLabel||t('当前位置','Current location'));}});
  els.region.addEventListener('change',function(){if(STATE.loc){STATE.region=effectiveRegion();STATE.pendingCategory=STATE.selected&&STATE.selected.id;invalidateForNewLocation();runInitialSearch(STATE.locationLabel||t('当前位置','Current location'));}});
  els.back.addEventListener('click',function(){els.results.hidden=true;STATE.selected=null;renderCategories();});
  document.querySelectorAll('.fwt-view-btn').forEach(function(b){b.addEventListener('click',function(){setView(b.dataset.view);});});
  document.querySelectorAll('.fwt-map-list').forEach(function(x){x.dataset.view='list';});
  window.addEventListener('resize',drawWheel);
  drawWheel();
  requestLocation();
})();
