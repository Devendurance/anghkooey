const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');const out=path.join(root,'capture');fs.mkdirSync(out,{recursive:true});
const audit={url:'https://anghkooey.vercel.app',steps:[],api:[]};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,recordVideo:{dir:path.join(out,'raw'),size:{width:1920,height:1080}}});
 const page=await context.newPage();page.setDefaultTimeout(18000);
 page.on('response',async r=>{if(!r.url().includes('/api/'))return;try{const b=await r.json();audit.api.push({route:new URL(r.url()).pathname,status:r.status(),saveStatus:b.saveStatus,savedBlobIds:b.savedBlobIds,memorySources:b.memorySources,totals:b.totals,error:b.error,consent:b.consent});}catch{}});
 const shot=async(name)=>{await page.screenshot({path:path.join(out,name+'.png')});audit.steps.push({name,at:Date.now()});console.log('CAPTURE',name);};
 const pause=ms=>page.waitForTimeout(ms);
 const goto=async route=>{await page.goto(audit.url+route,{waitUntil:'networkidle'});await page.evaluate(()=>{const e=document.querySelector('.mem');if(e)e.scrollTop=0;});};
 await goto('/');await pause(800);await shot('logo-reveal');await pause(4300);await shot('homepage');
 await goto('/chat');await page.locator('textarea').waitFor();await shot('guest');
 const toggle=page.locator('.chat-memory');
 if(await toggle.count())await toggle.click();else await page.getByRole('button',{name:/Memory off/i}).click();
 await shot('consent');await page.getByRole('button',{name:'Turn memory on',exact:true}).click();await pause(600);
 async function send(text,label){await page.locator('textarea').fill(text);await pause(650);await shot(label+'-input');const response=page.waitForResponse(r=>r.url().endsWith('/api/chat')&&r.request().method()==='POST',{timeout:105000});await page.getByRole('button',{name:'Send message',exact:true}).click();const r=await response;await pause(800);const body=await r.json();console.log(label,'HTTP',r.status(),'save',body.saveStatus,'sources',body.memorySources?.length??0);await shot(label);return body;}
 const save=await send('I prefer quiet hotel rooms with beautiful natural light. I avoid rooms facing busy roads because the noise affects my sleep.','save');
 audit.saveConfirmed=save.saveStatus==='confirmed';
 await page.getByRole('button',{name:/New conversation/i}).click();await pause(500);await shot('new-conversation');
 const recall=await send('What hotel atmosphere do I prefer, and why?','web-recall');audit.webRecallVerified=Array.isArray(recall.memorySources)&&recall.memorySources.length>0;
 const details=page.locator('details summary');if(await details.count()){await details.first().click();await pause(450);await shot('expanded-memory');}
 await goto('/memories');await page.locator('.mem-overview').waitFor();await shot('memories');
 await page.getByPlaceholder('e.g. room noise, spicy food, flights').fill('hotel quiet natural light');
 const sr=page.waitForResponse(r=>r.url().includes('/api/memories/search'),{timeout:60000});await page.locator('.mem-search form button[type=submit]').click();await sr;await pause(650);await page.locator('.mem-search').first().scrollIntoViewIfNeeded();await shot('memory-search');
 const correct=page.getByRole('button',{name:/Correct/i});
 if(await correct.count()){
  await correct.first().click();await pause(400);await page.locator('textarea').fill('I now prefer quiet hotel rooms with soft indirect daylight. I still avoid busy-road noise because it affects my sleep.');await shot('correction-input');
  const cr=page.waitForResponse(r=>r.url().includes('/api/memories/')&&r.request().method()==='PATCH',{timeout:105000});await page.getByRole('button',{name:'Save correction',exact:true}).click();const rr=await cr;await pause(900);const bb=await rr.json();audit.correctionConfirmed=rr.ok()&&!!bb.newBlobId;console.log('Correction HTTP',rr.status(),'confirmed',audit.correctionConfirmed,'keys',Object.keys(bb).join(','));await shot('correction-confirmed');
  await page.getByRole('group',{name:'Status',exact:true}).getByRole('button',{name:'Replaced',exact:true}).click();await page.locator('.mem-archive').scrollIntoViewIfNeeded();await pause(500);await shot('superseded');
 }
 await goto('/settings');await page.getByRole('switch').waitFor();await shot('settings-on');await page.getByRole('switch').click();await pause(500);await shot('settings-off');await page.locator('.mem-inner').evaluate(e=>e.parentElement.scrollTop=530);await pause(400);await shot('trust');
 await goto('/profile');await page.getByRole('heading',{name:'Your Anghkooey'}).waitFor();await shot('profile');
 // Never generate or record a live one-time code. Supplied linking proof is masked at preprocessing.
 await goto('/');await pause(4000);await shot('final-hero');
 const video=page.video();await page.close();await context.close();if(video){audit.rawVideo=await video.path();}
 await browser.close();fs.writeFileSync(path.join(out,'evidence-audit.json'),JSON.stringify(audit,null,2));console.log('Capture finished');
})().catch(e=>{fs.writeFileSync(path.join(out,'evidence-audit.json'),JSON.stringify({...audit,failed:String(e.message)},null,2));console.error('CAPTURE_FAILED',e.message);process.exit(1)});
