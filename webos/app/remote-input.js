(function () {
  'use strict';
  window.installRemoteInput=function (drag) {
    var keys=new Map(), pointer=null, released=null, clickConsumed=false, invoking=false, lastPoint=null;
    function button(node) {return node && node.closest && node.closest('button:not(:disabled)');}
    function stop(e) {e.preventDefault();e.stopImmediatePropagation();}
    function transition() {
      keys.forEach(function(k){k.stale=true;});
      if(pointer || released || keys.size)clickConsumed=true;
      if(pointer)pointer.stale=true;
    }
    function reset() {
      transition();keys.clear();pointer=null;released=null;lastPoint=null;drag.cancel();
    }
    function activate(el) {
      invoking=true;
      try {el.click();} finally {invoking=false;clickConsumed=true;}
    }
    function keyDown(e) {
      var code=e.keyCode, prior=keys.get(code);
      var ok=code===13 || code===32, target=button(e.target);
      if(prior) {
        if(prior.stale || prior.handled || code===461 || code===27)stop(e);
        return;
      }
      if(e.repeat && (ok || code===461 || code===27)){stop(e);return;}
      var press={target:target,stale:false,handled:ok && !!target,mouse:!!pointer};
      keys.set(code,press);
      if(press.handled) {
        stop(e);
        if(!pointer) {
          clickConsumed=false;
          if(lastPoint && button(document.elementFromPoint(lastPoint.x,lastPoint.y))===target)
            drag.arm(target,lastPoint.x,lastPoint.y);
        }
      }
    }
    function keyUp(e) {
      var press=keys.get(e.keyCode);
      keys.delete(e.keyCode);
      if(!press)return;
      if(!press.handled){if(press.stale)stop(e);return;}
      stop(e);
      if(press.mouse)return;
      var dropped=drag.release();
      if(!dropped && !press.stale && !clickConsumed && document.activeElement===press.target && document.contains(press.target))activate(press.target);
      clickConsumed=true;
    }
    function mouseDown(e) {
      if(e.button!==0)return;
      if(pointer){stop(e);return;}
      var held=keys.get(13)||keys.get(32);
      pointer={target:button(e.target),stale:false};
      if(held && held.handled){
        if(held.stale || clickConsumed){pointer.stale=true;return;}
        held.mouse=true;
      }
      released=null;clickConsumed=false;drag.arm(pointer.target,e.clientX,e.clientY);
    }
    function mouseUp(e) {
      if(e.button!==0)return;
      var original=pointer;pointer=null;released=original;
      var dropped=drag.release(e.clientX,e.clientY);
      if(dropped || (original && (original.stale || original.target!==button(e.target))))clickConsumed=true;
    }
    document.addEventListener('keydown',keyDown,true);
    document.addEventListener('keyup',keyUp,true);
    document.addEventListener('mousedown',mouseDown,true);
    document.addEventListener('mouseup',mouseUp,true);
    document.addEventListener('mousemove',function(e){
      lastPoint={x:e.clientX,y:e.clientY};
      if(drag.move(e.clientX,e.clientY))clickConsumed=true;
    },true);
    document.addEventListener('dragstart',function(e){if(drag.armed())e.preventDefault();},true);
    document.addEventListener('click',function(e){
      if(invoking)return;
      var owner=pointer || released;
      released=null;
      if(clickConsumed || (owner && (owner.stale || owner.target!==button(e.target)))){stop(e);return;}
      // Some TV input modes deliver the click before the corresponding keyup.
      if(owner || keys.has(13) || keys.has(32))clickConsumed=true;
    },true);
    window.addEventListener('blur',reset);
    document.addEventListener('visibilitychange',function(){if(document.hidden)reset();});
    return transition;
  };
})();