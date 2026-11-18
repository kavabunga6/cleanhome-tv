'use strict';
const Service = require('webos-service');
const WebSocket = require('ws');
const https = require('https');
const url = require('url');
const crypto = require('crypto');
const APP = 'dev.cleanhome.tv.webos';
const service = new Service(APP + '.catalog');
let images = new Map();
let busy = false;

function ownApp(message) {
  // LS2 may append the web-app instance after a space.
  if (String(message.sender).split(' ')[0] === APP) return true;
  message.respond({returnValue:false,errorCode:403,errorText:'Только для CleanHome.'});
  return false;
}
function digest(buffer) {return crypto.createHash('sha256').update(buffer).digest('hex');}
function failure(text,code) {const e=new Error(text); e.code=code; return e;}
function getPicture(address, fingerprint) {
  const uri = url.parse(address || '');
  if (uri.protocol !== 'https:' || uri.port !== '3001' || !/^\/resources\//.test(uri.pathname || '')) {
    return Promise.reject(new Error('Нет ресурса значка'));
  }
  // Only the resource path is used. Both connections terminate on this TV.
  return new Promise((resolve,reject) => {
    const req=https.get({hostname:'127.0.0.1',port:3001,path:uri.path,agent:false,rejectUnauthorized:false}, res=>{
      const cert=res.socket.getPeerCertificate();
      if (!cert.raw || digest(cert.raw)!==fingerprint || res.statusCode!==200) {
        res.resume();reject(new Error('Изображение недоступно'));return;
      }
      const parts=[]; let length=0;
      res.on('data',chunk=>{
        length+=chunk.length;
        if(length>1024*1024){req.destroy();reject(new Error('Значок слишком большой'));return;}
        parts.push(chunk);
      });
      res.on('aborted',()=>reject(new Error('Загрузка значка прервана')));
      res.on('error',reject);
      res.on('end',()=>{
        const b=Buffer.concat(parts);
        let type;
        if(b.slice(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) type='image/png';
        else if(b[0]===255 && b[1]===216) type='image/jpeg';
        else if(b.toString('ascii',0,3)==='GIF') type='image/gif';
        else if(b.toString('ascii',8,12)==='WEBP') type='image/webp';
        if(!type){reject(new Error('Формат значка неизвестен'));return;}
        resolve({type,bytes:b,hash:digest(b)});
      });
    });
    req.on('error',reject);req.setTimeout(3000,()=>req.destroy(new Error('Таймаут значка')));
  });
}
async function collect(points,fingerprint) {
  const seen=new Set(), rows=[], nextImages=new Map();
  const usable=points.filter(p=>{
    if (!p || !/^[\w][.\w-]{0,126}$/.test(p.id) || p.id===APP || p.visible===false || seen.has(p.id)) return false;
    seen.add(p.id);return true;
  });
  let i=0;
  async function worker() {
    while(i<usable.length) {
      const index=i++, p=usable[index];
      const row={id:p.id,name:String(p.title||p.id),color:/^#[\da-f]{6}$/i.test(p.iconColor)?p.iconColor:'#384666'};
      for(const address of [p.largeIcon,p.icon]) {
        if(!address)continue;
        try {
          const picture=await getPicture(address,fingerprint);
          nextImages.set(p.id,picture);row.hash=picture.hash;row.type=picture.type;row.size=picture.bytes.length;break;
        } catch (_) { /* Try the smaller LG icon, then retain the last good one in the UI. */ }
      }
      rows[index]=row;
    }
  }
  await Promise.all([worker(),worker(),worker(),worker()]);
  images=nextImages;
  return rows;
}
function refresh(options) {
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket('wss://127.0.0.1:3001',{rejectUnauthorized:false,perMessageDeflate:false,handshakeTimeout:5000,maxPayload:4*1024*1024});
    let fingerprint, clientKey, finished=false;
    const timer=setTimeout(()=>end(new Error('LG не ответил на запрос каталога.')),options.pair?110000:18000);
    function end(e,value) {
      if(finished)return;finished=true;clearTimeout(timer);socket.terminate();if(e)reject(e);else resolve(value);
    }
    socket.on('upgrade',res=>{const cert=res.socket.getPeerCertificate();if(cert.raw)fingerprint=digest(cert.raw);});
    socket.on('error',()=>end(new Error('Не удалось подключиться к каталогу на телевизоре.')));
    socket.on('close',()=>end(new Error('Телевизор закрыл подключение к каталогу.')));
    socket.on('open',()=>{
      if(!fingerprint || (!options.pair && fingerprint!==options.fingerprint)) {end(failure('Подтвердите подключение LG заново.',401));return;}
      const payload={pairingType:'PROMPT',manifest:{manifestVersion:1,localizedAppNames:{'':'CleanHome TV'},permissions:['READ_INSTALLED_APPS']}};
      if(!options.pair)payload['client-key']=options.key;
      socket.send(JSON.stringify({id:'register',type:'register',payload}));
    });
    socket.on('message',async raw=>{
      try {
        const msg=JSON.parse(raw),p=msg.payload||{};
        if(msg.type==='error'){end(failure('LG отклонил запрос каталога.',msg.id==='register'?401:500));return;}
        if(msg.id==='register' && p.pairingType && !options.pair){end(failure('Подтвердите подключение LG заново.',401));return;}
        if(msg.type==='registered'){
          clientKey=p['client-key']||options.key;
          if(!clientKey)throw Error('LG не выдал привязку.');
          socket.send(JSON.stringify({type:'request',id:'list',uri:'ssap://com.webos.applicationManager/listLaunchPoints'}));
        } else if(msg.id==='list' && Array.isArray(p.launchPoints)){
          const items=await collect(p.launchPoints,fingerprint);
          end(null,{items,auth:{key:clientKey,fingerprint}});
        }
      } catch(e) {end(e);}
    });
  });
}
service.register('sync',async message=>{
  if(!ownApp(message))return;
  const opts=message.payload||{};
  if(busy){message.respond({returnValue:false,errorCode:409,errorText:'Каталог уже обновляется.'});return;}
  if(opts.pair!==true && (!opts.key || !opts.fingerprint)){message.respond({returnValue:false,errorCode:401,errorText:'Нужно подтверждение LG.'});return;}
  busy=true;
  try {const data=await refresh(opts);message.respond(Object.assign({returnValue:true},data));}
  catch(e){message.respond({returnValue:false,errorCode:Number(e.code)||500,errorText:e.message});}
  finally{busy=false;}
});
service.register('icon',message=>{
  if(!ownApp(message))return;
  const p=message.payload||{}, item=images.get(p.id), offset=p.offset;
  if(!item || p.hash!==item.hash || !Number.isInteger(offset) || offset<0 || offset>=item.bytes.length){
    message.respond({returnValue:false,errorCode:404,errorText:'Версия значка недоступна.'});return;
  }
  // A multiple of three keeps base64 fragments independently joinable.
  const part=item.bytes.slice(offset,offset+18*1024);
  message.respond({returnValue:true,part:part.toString('base64'),next:offset+part.length});
});