(function () {
  'use strict';
  var uri='luna://dev.cleanhome.tv.webos.catalog';
  var authName='cleanhome.catalog.binding.v1';
  var auth=null,snapshot=null,pending=null,db=null;
  try {auth=JSON.parse(localStorage.getItem(authName));} catch (_) {}
  function invoke(method,parameters,ms) {
    return new Promise(function (resolve,reject) {
      var request,timer=setTimeout(function () {
        if(request && request.cancel)request.cancel();
        reject(new Error('Истекло время ожидания службы каталога.'));
      },ms);
      function fail(v) {clearTimeout(timer);var e=new Error(v.errorText||'Служба каталога недоступна.');e.code=v.errorCode;reject(e);}
      try {request=webOS.service.request(uri,{method:method,parameters:parameters,onSuccess:function(v){clearTimeout(timer);resolve(v);},onFailure:fail});}
      catch(e){clearTimeout(timer);reject(e);}
    });
  }
  var ready=new Promise(function(resolve){
    try {
      var open=indexedDB.open('cleanhome-catalog',1);
      open.onupgradeneeded=function(){open.result.createObjectStore('state');};
      open.onerror=function(){resolve(null);};
      open.onsuccess=function(){
        db=open.result;
        var get=db.transaction('state').objectStore('state').get('apps');
        get.onsuccess=function(){if(Array.isArray(get.result))snapshot=get.result;resolve(snapshot);};
        get.onerror=function(){resolve(null);};
      };
    } catch(_){resolve(null);}
  });
  async function getIcon(item) {
    var parts=[],offset=0;
    while(offset<item.size) {
      var v=await invoke('icon',{id:item.id,hash:item.hash,offset:offset},5000);
      if(!v.part || v.next<=offset || v.next>item.size)throw new Error('Некорректный значок.');
      parts.push(v.part);offset=v.next;
    }
    return 'data:'+item.type+';base64,'+parts.join('');
  }
  async function update(pair) {
    await ready;
    if(!pair && !auth)throw new Error('Подключите каталог LG в разделе «Приложения».');
    var response;
    try {response=await invoke('sync',pair?{pair:true}:auth,pair?115000:23000);}
    catch(e){if(e.code===401){auth=null;localStorage.removeItem(authName);}throw e;}
    if(!Array.isArray(response.items))throw new Error('LG не вернул каталог.');
    auth=response.auth;localStorage.setItem(authName,JSON.stringify(auth));
    var old=new Map((snapshot||[]).map(function(a){return [a.id,a];}));
    var next=new Array(response.items.length), index=0;
    async function worker() {
      while(index<next.length){
        var i=index++,item=response.items[i],cached=old.get(item.id);
        var row={id:item.id,name:item.name,color:item.color};
        if(cached && cached.icon){row.icon=cached.icon;row.hash=cached.hash;}
        if(item.hash && item.hash!==row.hash) {
          try {row.icon=await getIcon(item);row.hash=item.hash;} catch (_) { /* Retry this image on the next refresh. */ }
        }
        next[i]=row;
      }
    }
    await Promise.all([worker(),worker(),worker()]);
    var changed=!snapshot || snapshot.length!==next.length || next.some(function(a,i){
      var b=snapshot[i];return b.id!==a.id||b.name!==a.name||b.color!==a.color||b.hash!==a.hash;
    });
    snapshot=next;
    if(changed && db){try {db.transaction('state','readwrite').objectStore('state').put(next,'apps');}catch(_){}}
    return snapshot;
  }
  window.cleanHomeLive={ready:ready,paired:function(){return !!auth;},refresh:function(pair){
    if(!pending)pending=update(pair).then(function(v){pending=null;return v;},function(e){pending=null;throw e;});
    return pending;
  }};
})();