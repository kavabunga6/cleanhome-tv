(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var device=window.cleanHomeDevice;
  var manager = 'luna://com.webos.applicationManager';
  var known = [
    ['com.lampa.tv','Lampa','#564086'], ['lampa','Lampa','#564086'], ['lampa.tv','Lampa','#564086'],
    ['youtube.leanback.v4','YouTube','#ab1522'], ['kinopoisk','Кинопоиск','#ad460e'],
    ['vkvideo','VK Видео','#22467c'], ['rutube','RUTUBE','#333952'],
    ['ivi','Иви','#94336b'], ['netflix','Netflix','#861822'], ['amazon','Prime Video','#155974'],
    ['com.webos.app.livetv','Эфир','#21565e','logos/live-tv.svg'], ['com.webos.app.browser','Браузер','#304c79']
  ].map(function (v) { return {id:v[0], name:v[1], color:v[2], icon:v[3]}; });
  var inputs = [1,2,3,4].map(function (n) { return {id:'com.webos.app.hdmi'+n, name:'HDMI '+n}; });
  var walls = [['01-aurora','Сияние'],['02-glass-waves','Стеклянные волны'],['03-dunes','Дюны'],
    ['04-ocean-night','Ночной океан'],['05-liquid-metal','Жидкий металл'],['06-mountains-fog','Горы в тумане']];
  var pref;
  try {pref = JSON.parse(localStorage.getItem('cleanhome.scene.v1'));} catch (_) {}
  if (!pref || typeof pref !== 'object') pref = {};
  if (!Array.isArray(pref.custom)) pref.custom = [];
  if (!pref.recent || typeof pref.recent !== 'object') pref.recent = {};
  if (!walls[pref.wall]) pref.wall = 0;
  var apps = [], sources = [], selected = '', view = '', opener = null, timer, generation = 0, failures = 0, scanning = false;
  var busy = false, fpsFrame = 0, rotation;
  function save() { try {localStorage.setItem('cleanhome.scene.v1', JSON.stringify(pref));} catch (_) {say('Не удалось сохранить настройки.');} }
  function say(message) {
    clearTimeout(timer); $('notice').textContent = message; $('notice').hidden = false;
    timer = setTimeout(function () { $('notice').hidden = true; }, 4500);
  }
  function service(method, params, uri) {
    if(device)return device.service(method,params);
    return new Promise(function (resolve, reject) {
      var handle, timeout = setTimeout(function () { if (handle && handle.cancel) handle.cancel(); reject(new Error('Телевизор не ответил')); }, 4000);
      function finish(callback, value) { clearTimeout(timeout); callback(value); }
      try { handle = window.webOS.service.request(uri || manager, {method:method, parameters:params,
        onSuccess:function (v) {finish(resolve, v);}, onFailure:function (v) {finish(reject, new Error(v.errorText || 'Сервис недоступен'));}}); }
      catch (e) {finish(reject, e);}
    });
  }
  function find(id) {return apps.filter(function (a) {return a.id === id;})[0];}
  function catalog() {
    var seen = Object.create(null), list = [];
    known.forEach(function (a) {
      if (valid(a.id) && !seen[a.id]) {seen[a.id] = true; list.push(a);}
    });
    pref.custom.forEach(function (a) {if (a && valid(a.id) && !list.some(function (b) {return b.id===a.id;})) list.push(a);});
    return list;
  }
  function valid(id) {return typeof id === 'string' && /^[a-zA-Z0-9][._a-zA-Z0-9-]{0,126}$/.test(id) && id !== 'dev.cleanhome.tv.webos';}
  var defaultHidden=[];
  function order() {return Array.isArray(pref.dock) ? pref.dock : libraryIds().filter(function(id){return defaultHidden.indexOf(id)<0;});}
  function shelfTiles() {return $('shelf').querySelectorAll('button.tile');}
  function tileFor(id) {return Array.prototype.find.call(shelfTiles(),function(el){return el.dataset.id===id;});}
  var live=window.cleanHomeLive, cachedItems=null, livePass=0, previousSignature='';
  function drawLive(items) {
    var byId=new Map(catalog().map(function(a){return [a.id,a];}));
    var seen=new Set();
    apps=items.filter(function(a){return valid(a.id) && !seen.has(a.id) && seen.add(a.id);}).map(function(a){
      var fallback=byId.get(a.id);
      return {id:a.id,name:a.name,color:a.color,hash:a.hash,icon:a.icon||(fallback && fallback.icon)};
    });
    extras.forEach(function(a){if(!seen.has(a.id))apps.push(a);});
    var signature=JSON.stringify(apps.map(function(a){return [a.id,a.name,a.color,a.hash||a.icon];}));
    if(signature===previousSignature)return;
    previousSignature=signature;
    var current=document.activeElement, onShelf=$('shelf').contains(current) || current===document.body;
    var libraryId=current.dataset.id;
    renderHome(onShelf && !view);
    if(view==='library')library(libraryId);
    if(view==='sort') {cancelDrag();drawEditor(heldId || libraryId);}
  }
  var extras=[];
  async function scan(pair,quiet) {
    if(device) {
      var request=++livePass;
      try {
        var data=await device.catalog();
        if(request!==livePass)return;
        sources=data.inputs;
        if(!pref.libraryOrder && data.order.length)pref.libraryOrder=data.order;
        data.apps.forEach(function(a){if(a.recent && !pref.recent[a.id])pref.recent[a.id]=a.recent;});
        defaultHidden=data.hidden;
        drawLive(data.apps);
        if(view==='inputs')showInputs();
      } catch(e){if(!quiet)say('Не удалось загрузить каталог Android.');}
      return;
    }
    if(!live)return scanFallback();
    var pass=++livePass;
    var cached=await live.ready;
    if(pass!==livePass)return;
    if(cached && !cachedItems){cachedItems=cached;drawLive(cached);}
    if(!pair && !live.paired()){
      if(!cachedItems)return scanFallback();
      return;
    }
    try {
      var rows=await live.refresh(pair===true);
      if(pass!==livePass)return;
      // HDMI, live TV and manually added launch targets may be absent from the system strip.
      var extraTargets=inputs.concat(known.filter(function(a){return a.id==='com.webos.app.livetv';}),pref.custom.filter(function(a){return valid(a.id);}));
      var available=await Promise.all(extraTargets.map(async function(a){
        try {var reply=await service('getAppLoadStatus',{appId:a.id});return reply.exist?a:null;}catch(_){return null;}
      }));
      if(pass!==livePass)return;
      sources=available.slice(0,inputs.length).filter(Boolean);
      extras=available.slice(inputs.length).filter(Boolean);
      ++generation;scanning=false;cachedItems=rows;drawLive(rows);
      if(view==='inputs')showInputs();
    } catch(e){
      if(pass!==livePass)return;
      if(!quiet)say(e.message);
      if(!cachedItems && !apps.length)scanFallback();
      if(view==='library' && !live.paired())library();
    }
  }
  function scanFallback() {
    var pass = ++generation, all = catalog().concat(inputs), results = [], errors = 0, index = 0;
    scanning = true;
    function next() {
      if (index >= all.length || pass !== generation) return Promise.resolve();
      var item = all[index++];
      return service('getAppLoadStatus',{appId:item.id}).then(function (v) {if (v.exist === true) results.push(item.id);},
        function () {errors++;}).then(next);
    }
    return Promise.all([next(),next(),next(),next()]).then(function () {
      if (pass !== generation || cachedItems) return;
      failures = errors; scanning = false;
      apps = catalog().filter(function (a) {return results.indexOf(a.id)>=0;});
      sources = inputs.filter(function (a) {return results.indexOf(a.id)>=0;});
      var restoreShelf = $('shelf').contains(document.activeElement) || document.activeElement === document.body;
      renderHome(restoreShelf && !view);
      if (view==='library') library();
      if (view==='sort') drawEditor(heldId || document.activeElement.dataset.id);
      if (view==='inputs') showInputs();
    });
  }
  function clock() {
    if(selected && captionTime)captionTime.textContent=elapsed(selected);
    var d = new Date(); $('time').textContent = d.toLocaleTimeString('ru-RU',{hour:'2-digit', minute:'2-digit',hour12:false});
    $('date').textContent = d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
  }
  function wallpaper(index) { $('wall').style.backgroundImage = 'url("assets/'+walls[index][0]+'.jpg")'; }
  function restartWalls() {
    clearInterval(rotation); wallpaper(pref.wall);
    if (pref.rotate !== false) rotation = setInterval(function () {
      if (!document.hidden && !view) {pref.wall = (Number(pref.wall)+1+Math.floor(Math.random()*5))%6; wallpaper(pref.wall); save();}
    }, 30*60*1000);
  }
  function elapsed(id) {
    var stamp = pref.recent[id]; if (!stamp) return 'Ещё не открывали';
    var minutes = Math.max(0, Math.floor((Date.now()-stamp)/60000));
    if (!minutes) return 'Открывали только что';
    if (minutes < 60) return 'Открывали '+minutes+' мин. назад';
    return 'Открывали '+new Date(stamp).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
  }
  function button(parent, name, click, cls) {
    var el = document.createElement('button'); el.textContent=name; if (cls) el.className=cls;
    el.onclick=click; parent.appendChild(el); return el;
  }
  function appButton(parent, app, click, cls) {
    var el=button(parent,'',click,cls);
    el.setAttribute('aria-label',app.name);
    var label=document.createElement('span'); label.className='app-name'; label.textContent=app.name;
    el.appendChild(label);
    if (app.icon) {
      var img=document.createElement('img'); img.alt=''; img.className='app-icon';
      img.onload=function () {el.classList.add('has-icon');};
      img.onerror=function () {img.hidden=true;};
      el.insertBefore(img,label); img.src=app.icon;
    }
    return el;
  }
  function revealTile(shelf, tile) {
    var outer=shelf.getBoundingClientRect(), inner=tile.parentElement.getBoundingClientRect();
    var gutter=parseFloat(getComputedStyle(shelf).paddingTop);
    if (inner.top < outer.top + gutter) shelf.scrollTop -= outer.top + gutter - inner.top;
    else if (inner.bottom > outer.bottom - gutter) shelf.scrollTop += inner.bottom - outer.bottom + gutter;
  }
  var caption=document.createElement('div'), captionTitle=document.createElement('strong'), captionTime=document.createElement('span');
  caption.className='home-caption';captionTitle.id='hero';captionTime.id='recent';
  caption.appendChild(captionTitle);caption.appendChild(captionTime);
  function showCaption(tile,app) {
    selected=app.id;captionTitle.textContent=app.name;captionTime.textContent=elapsed(app.id);
    tile.parentElement.appendChild(caption);
  }
  function renderHome(focus) {
    var shelf=$('shelf'); shelf.textContent='';
    order().forEach(function (id) {
      var a=find(id); if (!a) return;
      var cell=document.createElement('div');cell.className='home-cell';shelf.appendChild(cell);
      var el=appButton(cell,a,function () {launch(a);},'tile');
      el.dataset.id=id; el.style.backgroundColor=a.color || '#384666';
      el.onfocus=function () {showCaption(el,a);
        revealTile(shelf,el);};
      el.onmouseenter=function () {if (!view) el.focus();};
    });
    $('shelf-status').hidden=!!shelf.children.length;
    if (!shelf.children.length) {
      selected='';$('shelf-status').textContent=scanning?'Проверяем приложения…':failures?'Проверка приложений завершилась с ошибкой.':'Выберите приложения для главного экрана.';
      var add=button(shelf,'В библиотеку',function () {open('library',library);},'tile');
      if (focus) add.focus();
    } else {
      var active=tileFor(selected)||shelfTiles()[0];
      if (focus) active.focus(); else showCaption(active,find(active.dataset.id));
    }
  }
  function launch(a) {
    if (busy) return; busy=true;
    service('launch',{id:a.id}).then(function () {pref.recent[a.id]=Date.now(); save(); if (selected===a.id) captionTime.textContent=elapsed(a.id);},
      function (e) {say('Не удалось открыть «'+a.name+'». '+e.message);}).then(function () {busy=false;});
  }
  function open(name, callback) {if (!view) opener=document.activeElement; view=name; callback();}
  function panel(name,title) {
    markInputTransition();
    if(gesture && gesture.ghost)cancelDrag();
    ['library-order','sort-hint'].forEach(function(id){var el=$(id);if(el)el.remove();});
    $('back').textContent='Назад';
    view=name; $('panel').hidden=false; $('home').setAttribute('aria-hidden','true');
    $('title').textContent=title; $('items').textContent=''; $('items').scrollTop=0;
    return $('items');
  }
  function close() {
    markInputTransition();cancelDrag();
    $('panel').hidden=true; $('home').removeAttribute('aria-hidden'); view='';
    var target=opener && document.contains(opener) ? opener : tileFor(selected)||$('library');
    target.focus();
  }
  function note(parent, text) {var p=document.createElement('p'); p.textContent=text; parent.appendChild(p);}
  function grid(parent) {var el=document.createElement('div'); el.className='grid'; parent.appendChild(el); return el;}
  function first(parent) {(parent.querySelector('button:not([disabled]),input')||$('back')).focus();}
  function showInputs() {
    var page=panel('inputs','Источники'), row=grid(page);
    sources.forEach(function (a) {button(row,a.name,function () {launch(a);});});
    if (!sources.length) note(page,scanning?'Проверяем входы…':'У телевизора нет доступных входов.');
    first(page);
  }
  // Only installed apps participate. New arrivals follow the saved order.
  function arrangedIds(saved) {
    var remaining=new Set(apps.map(function(a){return a.id;})), ids=[];
    (saved || []).forEach(function(id){if(remaining.delete(id))ids.push(id);});
    return ids.concat(Array.from(remaining));
  }
  function libraryIds() {return arrangedIds(pref.libraryOrder || pref.dock);}
  var editIds=null, heldId=null;
  function headerAction(text,fn) {
    var header=$('back').parentElement;
    var el=button(header,text,fn);el.id='library-order';
    header.insertBefore(el,$('back'));return el;
  }
  function editLibrary() {
    editIds=libraryIds();heldId=null;drawEditor(editIds[0]);
  }
  function finishEditor() {
    var previous=libraryIds(), sorted=arrangedIds(editIds);
    if(previous.join('|')!==sorted.join('|')) {
      pref.libraryOrder=sorted;
      if(Array.isArray(pref.dock)) {
        var members=new Set(pref.dock), visible=sorted.filter(function(id){return members.has(id);});
        var index=0, installed=new Set(sorted);
        pref.dock=pref.dock.map(function(id){return installed.has(id)?visible[index++]:id;});
      }
      save();renderHome(false);
    }
    editIds=null;heldId=null;library();if($('library-order'))$('library-order').focus();
  }
  function drawEditor(focusId) {
    var page=panel('sort','Порядок приложений'), row=grid(page);
    row.id='sort-grid';
    editIds=arrangedIds(editIds);
    if(editIds.indexOf(heldId)<0)heldId=null;
    headerAction('Готово',finishEditor);
    $('back').textContent='Отмена';
    var hint=document.createElement('p');hint.id='sort-hint';hint.setAttribute('role','status');
    page.parentElement.insertBefore(hint,page);
    editIds.forEach(function(id){
      var el=appButton(row,find(id),function(){selectPosition(el);},'library-app');
      el.dataset.id=id;
    });
    showHeld();
    var target=editTile(focusId)||row.firstElementChild||$('library-order');target.focus();
  }
  function editTile(id) {
    var row=$('sort-grid');return row && row.children[editIds.indexOf(id)];
  }
  function showHeld() {
    var row=$('sort-grid');
    Array.prototype.forEach.call(row.children,function(el){
      el.setAttribute('aria-pressed',String(el.dataset.id===heldId));
    });
    $('sort-hint').textContent=heldId
      ? 'Стрелки — переместить. OK — положить. Указателем выберите место.'
      : 'Выберите плитку кнопкой OK или перетащите указателем.';
  }
  function moveTo(target) {
    var from=editIds.indexOf(heldId), row=$('sort-grid');
    if(from<0 || target<0 || target>=editIds.length || from===target)return;
    var el=row.children[from], neighbor=row.children[target];
    row.insertBefore(el,target>from?neighbor.nextElementSibling:neighbor);
    editIds.splice(from,1);editIds.splice(target,0,heldId);
    el.focus();
  }
  function selectPosition(el) {
    var id=el.dataset.id;
    if(heldId){moveTo(editIds.indexOf(id));heldId=null;}
    else {heldId=id;el.focus();}
    showHeld();
  }
  function moveHeld(key) {
    var row=$('sort-grid'), columns=getComputedStyle(row).gridTemplateColumns.split(/\s+/).length;
    var index=editIds.indexOf(heldId);
    if(key===37 && index%columns>0)moveTo(index-1);
    if(key===39 && index%columns<columns-1)moveTo(index+1);
    if(key===38)moveTo(index-columns);
    if(key===40 && Math.floor(index/columns)<Math.floor((editIds.length-1)/columns))moveTo(Math.min(index+columns,editIds.length-1));
  }
  function library(focusId) {
    var page=panel('library','Приложения'), row=grid(page), focusTarget;
    if (!apps.length) note(page,scanning?'Проверяем приложения…': failures?'Не удалось проверить часть каталога. Повторите проверку.':'Можно добавить установленное приложение по его ID.');
    if(apps.length>1)headerAction('Изменить порядок',editLibrary);
    libraryIds().forEach(function (id) {
      var a=find(id);
      var el=appButton(row,a,function () {actions(a);},'library-app'); el.dataset.id=a.id; if (a.id===focusId) focusTarget=el;
    });
    if(live && !live.paired())button(row,'Подключить каталог LG',function () {
      say('Подтвердите подключение CleanHome на телевизоре.');scan(true);
    });
    if(!device)button(row,'Добавить по ID',customForm); button(row,'Обновить',function () {say('Проверяем приложения…');scan();});
    if (focusTarget) focusTarget.focus(); else first(page);
  }
  var actionApp;
  function actions(a) {
    actionApp=a;
    var page=panel('actions',a.name), row=grid(page), ids=order().slice(), pos=ids.indexOf(a.id);
    button(row,'Открыть',function () {launch(a);});
    button(row,pos<0?'На полку':'Убрать с полки',function () {
      if (pos<0) ids.push(a.id); else ids.splice(pos,1);
      pref.dock=ids;save();renderHome(false);library(a.id);
    });
    first(page);
  }
  function customForm() {
    var page=panel('custom','Добавить приложение'), form=document.createElement('form');form.className='form';page.appendChild(form);
    function field(caption, max) {var label=document.createElement('label'); label.textContent=caption; var el=document.createElement('input'); el.maxLength=max; el.required=true;label.appendChild(el);form.appendChild(label);return el;}
    var id=field('Идентификатор приложения webOS',127), title=field('Название на полке',80);
    var submit=button(form,'Добавить'); submit.type='submit';
    form.onsubmit=function (e) {e.preventDefault(); var key=id.value.trim(), name=title.value.trim();
      if (!valid(key)||!name) {say('Проверьте идентификатор и название.');return;}
      if (submit.disabled) return;submit.disabled=true;
      service('getAppLoadStatus',{appId:key}).then(function (v) {
        if (view!=='custom' || !page.contains(form)) return;
        if (!v.exist) {say('Приложение с таким ID не установлено.');return;}
        if (!catalog().some(function (a) {return a.id===key;})) pref.custom.push({id:key,name:name});
        var ids=order().slice();if (ids.indexOf(key)<0) ids.push(key); pref.dock=ids;save();library();scan();
      },function (err) {say(err.message);}).then(function () {submit.disabled=false;});
    }; first(page);
  }
  function network() {
    service('getStatus',{},'luna://com.palm.connectionmanager').then(function (v) {
      var label = v.wifi && v.wifi.state==='connected' ? v.wifi.ssid || 'Wi-Fi' :
        v.wired && v.wired.state==='connected' ? 'Ethernet' : '';
      $('network').textContent=label; $('network').hidden=!label;
    },function () { $('network').hidden=true; });
  }
  function settings() {
    var page=panel('settings','Настройки'), row=grid(page);
    var preview=document.createElement('div'); preview.className='preview';
    preview.style.backgroundImage='linear-gradient(0deg,#080a13be,transparent),url("assets/'+walls[pref.wall][0]+'.jpg")';
    var time=document.createElement('span');time.textContent=$('time').textContent;preview.appendChild(time);
    var hero=document.createElement('strong');hero.textContent=selected?captionTitle.textContent:'Ваша полка';preview.appendChild(hero);
    var dock=document.createElement('div');dock.className='mini';
    var columns=homeColumns();
    dock.style.gridTemplateColumns='repeat('+columns+',minmax(0,1fr))';
    order().slice(0,columns*2).forEach(function (id) {var a=find(id);if(a){var tile=document.createElement('i');tile.style.backgroundColor=a.color || '#384666';tile.textContent=a.name;dock.appendChild(tile);}});
    preview.appendChild(dock);page.insertBefore(preview,row);
    button(row,'Обои',wallPicker);
    var rotate=button(row,rotationLabel(),function () {pref.rotate=pref.rotate===false;save();restartWalls();rotate.textContent=rotationLabel();});
    var meter=button(row,fpsLabel(),function () {pref.fps=!pref.fps;save();meter.textContent=fpsLabel();updateMeter();});
    button(row,'Настроить полку',library);
    if(device)button(row,'Дополнительно · Android',function(){device.settings();});
    first(page);
  }
  function rotationLabel() {return 'Смена обоев · '+(pref.rotate===false?'выкл.':'30 мин');}
  function fpsLabel() {return 'Счётчик кадров · '+(pref.fps?'вкл.':'выкл.');}
  function updateMeter() {
    var el=$('fps');cancelAnimationFrame(fpsFrame);if (el) el.parentNode.removeChild(el);
    if (!pref.fps || document.hidden) return;
    el=document.createElement('output');el.id='fps';document.body.appendChild(el);
    var start=performance.now(), count=0;
    function frame(now) {count++; if (now-start>=1000) {el.textContent=Math.round(count*1000/(now-start))+' FPS';start=now;count=0;}fpsFrame=requestAnimationFrame(frame);}
    fpsFrame=requestAnimationFrame(frame);
  }
  function wallPicker() {
    var page=panel('walls','Обои'),row=grid(page);
    walls.forEach(function (w,i) {
      var el=button(row,w[1],function () {pref.wall=i;save();restartWalls();close();});
      var img=document.createElement('img');img.className='swatch';img.alt='';img.src='assets/'+w[0]+'.jpg';el.insertBefore(img,el.firstChild);
      el.setAttribute('aria-pressed',String(i===pref.wall));if(i===pref.wall) el.className='chosen';
    });row.children[pref.wall].focus();
  }
  function back() {
    if(view==='sort'){cancelDrag();editIds=null;heldId=null;library();if($('library-order'))$('library-order').focus();}
    else if(view==='walls') settings(); else if(view==='actions') library(actionApp.id); else if(view==='custom') library(); else if(view) close();
    else if(device)device.back();
    else if (window.webOS && window.webOS.platformBack) window.webOS.platformBack(); else window.close();
  }
  function homeColumns() {
    return getComputedStyle($('shelf')).gridTemplateColumns.trim().split(/\s+/).length;
  }
  function navigateHomeTile(cur,key) {
    var tiles=shelfTiles(), index=Array.prototype.indexOf.call(tiles,cur);
    var cols=homeColumns(), col=index%cols, dest=index;
    if(key===38 && index<cols) {
      var center=cur.getBoundingClientRect().left+cur.offsetWidth/2, nearest, distance=Infinity;
      document.querySelectorAll('#home nav button').forEach(function(el){
        var rect=el.getBoundingClientRect(), diff=Math.abs(rect.left+rect.width/2-center);
        if(diff<distance){nearest=el;distance=diff;}
      });
      if(nearest)nearest.focus();
      return;
    }
    if(key===37 && col>0)dest=index-1;
    if(key===39 && col<cols-1 && index+1<tiles.length)dest=index+1;
    if(key===38)dest=index-cols;
    if(key===40 && Math.floor(index/cols)<Math.floor((tiles.length-1)/cols))dest=Math.min(index+cols,tiles.length-1);
    if(dest!==index)tiles[dest].focus();
  }
  function navigate(key) {
    var root=view?$('panel'):$('home'), cur=document.activeElement;
    if(!view && $('shelf').contains(cur)){navigateHomeTile(cur,key);return;}
    if(!view && key===40 && cur.closest('#home nav')){
      (tileFor(selected)||shelfTiles()[0]).focus();return;
    }
    var all=Array.prototype.slice.call(root.querySelectorAll('button:not([disabled]),input'));
    if (all.indexOf(cur)<0) {first(root);return;}
    var rect=cur.getBoundingClientRect(), dx=key===37?-1:key===39?1:0, dy=key===38?-1:key===40?1:0, best, limit=Infinity;
    all.forEach(function (el) {if(el===cur) return; var r=el.getBoundingClientRect();
      var x=r.left+r.width/2-rect.left-rect.width/2, y=r.top+r.height/2-rect.top-rect.height/2;
      var forward=x*dx+y*dy, cross=Math.abs(dx?y:x);if(forward<2) return;
      var score=forward+cross*5;if(score<limit){limit=score;best=el;}
    }); if(best) best.focus();
  }
  var gesture=null, scrollFrame=0;
  function clearDrag() {
    cancelAnimationFrame(scrollFrame);scrollFrame=0;
    if(!gesture)return;
    if(gesture.ghost)gesture.ghost.remove();
    if(gesture.over)gesture.over.classList.remove('drop-place');
    if(gesture.source)gesture.source.classList.remove('drag-source');
    document.body.classList.remove('dragging');
    gesture=null;
  }
  function armDrag(el,x,y) {
    clearDrag();
    if(!el || !el.matches('.library-app[data-id]') || (view!=='library' && view!=='sort'))return;
    gesture={id:el.dataset.id,x:x,y:y,cx:x,cy:y,source:el,over:null,ghost:null};
  }
  function updateDropTarget() {
    var g=gesture, hit=document.elementFromPoint(g.cx,g.cy);
    var over=hit && hit.closest('#sort-grid .library-app[data-id]');
    if(g.over===over)return;
    if(g.over)g.over.classList.remove('drop-place');
    g.over=over;
    if(over && over!==g.source)over.classList.add('drop-place');
  }
  function scrollDrag() {
    scrollFrame=0;
    if(!gesture || !gesture.ghost)return;
    var page=$('items'), b=page.getBoundingClientRect(), x=gesture.cx,y=gesture.cy;
    var edge=Math.min(b.height/5,window.innerHeight*.065);
    if(x<b.left || x>b.right || y<b.top || y>b.bottom)return;
    var speed=y<b.top+edge ? -(b.top+edge-y)/edge : y>b.bottom-edge ? (y-b.bottom+edge)/edge : 0;
    if(!speed)return;
    var before=page.scrollTop;
    page.scrollTop+=Math.sign(speed)*Math.ceil(Math.abs(speed)*edge*.18);
    if(page.scrollTop!==before){updateDropTarget();scrollFrame=requestAnimationFrame(scrollDrag);}
  }
  function moveDrag(x,y) {
    if(!gesture)return false;
    var g=gesture;
    if(!g.ghost) {
      if(!document.contains(g.source)){clearDrag();return false;}
      if(Math.hypot(x-g.x,y-g.y)<Math.max(8,window.innerWidth*.006))return false;
      var bounds=g.source.getBoundingClientRect();
      g.dx=Math.max(0,Math.min(bounds.width,g.x-bounds.left));
      g.dy=Math.max(0,Math.min(bounds.height,g.y-bounds.top));
      var ghost=g.source.cloneNode(true);
      ghost.removeAttribute('data-id');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;
      ghost.classList.add('drag-ghost');
      ghost.style.width=bounds.width+'px';ghost.style.height=bounds.height+'px';
      if(view==='library') {
        editIds=libraryIds();heldId=null;drawEditor(g.id);
      }
      g.source=editTile(g.id);
      if(!g.source){clearDrag();return true;}
      heldId=g.id;showHeld();g.source.classList.add('drag-source');
      g.ghost=ghost;document.body.appendChild(ghost);document.body.classList.add('dragging');
    }
    g.cx=x;g.cy=y;
    g.ghost.style.transform='translate3d('+(x-g.dx)+'px,'+(y-g.dy)+'px,0)';
    updateDropTarget();
    if(!scrollFrame)scrollFrame=requestAnimationFrame(scrollDrag);
    return true;
  }
  function releaseDrag(x,y) {
    if(!gesture)return false;
    var g=gesture;
    if(!g.ghost){clearDrag();return false;}
    if(typeof x==='number'){g.cx=x;g.cy=y;updateDropTarget();}
    var dest=g.over && g.over.dataset.id;
    if(view==='sort' && dest)moveTo(editIds.indexOf(dest));
    clearDrag();heldId=null;
    if(view==='sort')showHeld();
    return true;
  }
  function cancelDrag() {
    var active=gesture && gesture.ghost;
    clearDrag();if(active && view==='sort'){heldId=null;showHeld();}
  }
  var markInputTransition=installRemoteInput({
    arm:armDrag,move:moveDrag,release:releaseDrag,cancel:cancelDrag,armed:function(){return !!gesture;}
  });
  document.addEventListener('mouseover',function (e) {
    if(gesture && gesture.ghost)return;
    var el=e.target.closest && e.target.closest('button');
    if (el && !el.disabled && !el.closest('[hidden]') && el!==document.activeElement) el.focus();
  });
  document.addEventListener('keydown',function (e) {
    var key=e.keyCode;
    if (key===461||key===27) {e.preventDefault();back();return;}
    if (e.target.tagName==='INPUT' && (key===37||key===39||key===13)) return;
    if (key>=37 && key<=40){e.preventDefault();if(view==='sort' && heldId)moveHeld(key);else navigate(key);}
    if(key===9 && view){var root=$('panel'), controls=root.querySelectorAll('button:not([disabled]),input');var i=e.shiftKey?0:controls.length-1;
      if(e.target===controls[i]){e.preventDefault();controls[e.shiftKey?controls.length-1:0].focus();}}
  });
  $('back').onclick=back;$('inputs').onclick=function () {open('inputs',showInputs);};
  $('library').onclick=function () {open('library',library);};$('settings').onclick=function () {open('settings',settings);};
  if(device)window.cleanHomeCommand=function(command){
    if(command==='refresh'){network();scan(false,true);return;}
    if(command==='back'){back();return;}
    if(command==='home'){if(view)close();var firstTile=shelfTiles()[0];if(firstTile)firstTile.focus();return;}
    if(command==='inputs')open('inputs',showInputs);
    if(command==='library')open('library',library);
    if(command==='settings')open('settings',settings);
    if(command==='sort')open('sort',editLibrary);
  };
  network();clock();setInterval(clock,15000);restartWalls();updateMeter();renderHome(false);scan();
  setInterval(function(){if(!document.hidden && live && live.paired())scan(false,true);},30000);
  document.addEventListener('visibilitychange',function () {updateMeter();if(!document.hidden){network();clock();scan();}});
})();