(function () {
  'use strict';
  // Use the TV framebuffer as the scene viewport on density-scaled Android TVs.
  var viewport=document.querySelector('meta[name=viewport]');
  function sizeScene(){
    var width=Math.min(1920,Math.round(screen.width*window.devicePixelRatio));
    var content='width='+width+',user-scalable=no';
    if(viewport.content!==content)viewport.content=content;
  }
  sizeScene();
  window.addEventListener('resize',sizeScene);
  async function request(path, method) {
    var response=await fetch('/device/'+path,{method:method||'GET',cache:'no-store'});
    if(!response.ok)throw new Error('Действие недоступно на этом телевизоре.');
    return response.json();
  }
  window.cleanHomeDevice={
    clock:function(){return request('clock');},
    setClock:function(mode){return request('clock/'+encodeURIComponent(mode),'POST');},
    catalog:function(){return request('catalog');},
    service:function(method,params){
      if(method==='launch')return request('launch/'+encodeURIComponent(params.id),'POST');
      if(method==='getStatus')return request('network');
      return Promise.reject(new Error('Действие недоступно.'));
    },
    back:function(){request('back','POST').catch(function(){});},
    settings:function(method){return request(method,'POST');}
  };
})();
