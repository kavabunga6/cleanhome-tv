const {chromium} = require('playwright');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=> {
 const browser=await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE_PATH});
 try {
 for (const [width,height] of [[1920,1080],[1280,720]]) {
 const page=await browser.newPage({viewport:{width,height}});let errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/webOSTV.js',route=>route.fulfill({contentType:'application/javascript',body:`
 window.opens=[];window.webOS={service:{request:(uri,o)=>{let a=['com.lampa.tv','youtube.leanback.v4','netflix','com.webos.app.browser','ivi','rutube','vkvideo','com.webos.app.hdmi1','test.app'];setTimeout(()=>{
 if(o.method==='getStatus')return o.onSuccess({wired:{state:'connected'}});
 if(o.method==='launch'){window.opens.push(o.parameters.id);return o.onSuccess({returnValue:true})}
 o.onSuccess({returnValue:true,exist:a.includes(o.parameters.appId)})},2);return {cancel(){}}}}};`}));
 await page.goto(require('node:url').pathToFileURL(process.env.CLEANHOME_SCENE_ENTRY || path.join(__dirname,'../build/package/app/index.html')).href);
 await page.locator('#shelf .tile').filter({hasText:'Lampa'}).waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.ok(await page.locator('#shelf .tile').count()>5); await page.getByRole('button',{name:'Lampa',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#hero').innerText(),'YouTube');
 await page.keyboard.press('Enter');await page.waitForFunction(()=>window.opens.includes('youtube.leanback.v4'));
 await page.locator('#settings').click();
 const gridOptions=page.getByRole('button',{name:'Сетка главного экрана',exact:true});
 await gridOptions.click();
 const columns=()=>page.locator('#shelf').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(/\s+/).length);
 const originalCols=await columns();
 await page.keyboard.press('ArrowLeft');assert.equal(await columns(),originalCols-1);
 await page.keyboard.press('Escape');assert.equal(await columns(),originalCols);
 await gridOptions.click();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
 await page.reload();assert.equal(await columns(),originalCols+1);
 await page.locator('#settings').click();await gridOptions.click();
 await page.getByRole('button',{name:'Авто',exact:true}).click();await page.getByRole('button',{name:'Готово',exact:true}).click();
 assert.equal(await columns(),originalCols);
 await page.getByRole('button',{name:'Обои',exact:true}).click();
 const coords=await page.locator('.swatch').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().top));
 assert.ok(Math.abs(coords[0]-coords[1])<=1&&Math.abs(coords[3]-coords[5])<=1);
 await page.getByRole('button',{name:'Дюны'}).click();await page.reload();
 await page.waitForFunction(()=>document.querySelector('#wall').style.backgroundImage.includes('03-dunes'));
 await page.locator('#library').click();await page.getByRole('button',{name:'Добавить по ID'}).click();
 await page.getByLabel('Идентификатор приложения webOS').fill('test.app');await page.getByLabel('Название приложения').fill('Гости');await page.getByRole('button',{name:'Добавить',exact:true}).click();
 await page.locator('#items button').filter({hasText:'Гости'}).waitFor();await page.keyboard.press('Escape');
 assert.ok((await page.locator('#shelf').innerText()).includes('Гости'));
 await page.locator('#library').click();
 const visibleIds=()=>page.locator('#items .library-app').evaluateAll(els=>els.map(el=>el.dataset.id));
 const before=await visibleIds();
 await page.locator('#library-order').click();await page.keyboard.press('Enter');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 let arranged=await visibleIds();assert.equal(arranged[3],before[0]);
 const second=arranged[1];await page.locator('#sort-grid button').nth(1).click();await page.locator('#sort-grid button').nth(5).click();
 arranged=await visibleIds();assert.equal(arranged[5],second);
 await page.getByRole('button',{name:'Готово',exact:true}).click();assert.deepEqual(await visibleIds(),arranged);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#shelf [data-id]').length>5);
 await page.locator('#library').click();assert.deepEqual(await visibleIds(),arranged);
 const shelf=await page.locator('#shelf [data-id]').evaluateAll(els=>els.map(el=>el.dataset.id));assert.deepEqual(shelf,arranged.filter(id=>shelf.includes(id)));
 await page.locator('#library-order').click();await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');assert.deepEqual(await visibleIds(),arranged);
 await page.keyboard.press('Escape');
 await page.locator('#library').click();
 const appIds=await visibleIds(), src=page.locator('#items .library-app').first(), b=await src.boundingBox();
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
 await page.mouse.move(b.x+b.width/2+35,b.y+b.height/2,{steps:5});
 await page.locator('.drag-ghost').waitFor();
 const dest=await page.locator('#sort-grid .library-app').nth(4).boundingBox();
 await page.mouse.move(dest.x+dest.width/2,dest.y+dest.height/2,{steps:8});await page.mouse.up();
 assert.equal((await visibleIds())[4],appIds[0]);assert.equal(await page.locator('.drag-ghost').count(),0);
 assert.equal(await page.locator('#sort-grid [aria-pressed=true]').count(),0);
 await page.keyboard.press('Escape');assert.deepEqual(await visibleIds(),appIds);
 await page.mouse.move(0,0);
 const opened=await page.evaluate(()=>window.opens.length);
 await page.locator('.library-app').first().focus();
 await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.down('Enter');
 await page.keyboard.up('Enter');await page.getByRole('button',{name:'Открыть',exact:true}).waitFor();
 await page.evaluate(()=>document.activeElement.click());
 await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>window.opens.length),opened);
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Открыть');
 await page.keyboard.press('Enter');await page.waitForFunction(n=>window.opens.length===n+1,opened);
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.locator('#inputs').click();await page.getByRole('button',{name:'HDMI 1'}).click();await page.waitForFunction(()=>window.opens.includes('com.webos.app.hdmi1'));await page.keyboard.press('Escape');
 await page.locator('#shelf .tile').first().hover();
 assert.deepEqual(errors,[]);await page.close();console.log(width+'x'+height+' PASS');
 }
 } finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});