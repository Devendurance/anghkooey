import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),repo=path.resolve(root,'../..');
const chapters=JSON.parse(fs.readFileSync(path.join(root,'chapters.json'),'utf8'));
const audio=JSON.parse(fs.readFileSync(path.join(root,'audio_meta.json'),'utf8'));
const captions=JSON.parse(fs.readFileSync(path.join(root,'caption_groups.json'),'utf8'));
fs.mkdirSync(path.join(root,'compositions','frames'),{recursive:true});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const A='assets/',C='capture/';
const CSS=`
@font-face{font-family:Satoshi;src:url('assets/Satoshi-Variable.woff2') format('woff2');font-weight:300 900;font-display:block}
@font-face{font-family:'Cormorant Garamond';src:url('assets/Cormorant.woff2') format('woff2');font-weight:300 700;font-display:block}
*{box-sizing:border-box} .clip{position:absolute;inset:0;overflow:hidden} .ground{position:absolute;inset:0;background:#05080F}
.shot{position:absolute;inset:0;overflow:hidden}.stage{position:absolute;inset:0;overflow:hidden;opacity:0;color:#F4EEDF;font-family:Satoshi,sans-serif}
.eyebrow{position:absolute;left:112px;top:70px;margin:0;color:#D8DCFF;font-size:27px;letter-spacing:5px;text-transform:uppercase;font-weight:500}
.headline{position:absolute;left:110px;top:130px;max-width:1280px;margin:0;font-family:'Cormorant Garamond',serif;font-size:102px;font-weight:400;line-height:1.03}
.subline{position:absolute;left:112px;top:275px;margin:0;font-size:31px;line-height:1.45;color:#F4EEDF;max-width:1000px}
.hairline{position:absolute;left:112px;right:112px;top:122px;height:1px;background:#D8DCFF;opacity:.35}
.note{position:absolute;margin:0;left:114px;bottom:178px;font-size:27px;color:#D8DCFF;line-height:1.4;max-width:1100px}
.source-tag{position:absolute;margin:0;right:112px;top:78px;font-size:25px;color:#F4EEDF;letter-spacing:1px}
.lens{position:absolute;left:110px;top:305px;width:1240px;height:510px;overflow:hidden;border:1px solid rgba(216,220,255,.45);border-radius:24px;background:#10141d}
.lens-pixels{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;transform-origin:center center}
.context{position:absolute;right:122px;top:170px;width:362px;height:714px;overflow:hidden;border-radius:36px;border:1px solid rgba(216,220,255,.4);background:#0B1119}
.context video,.context img{width:100%;height:100%;object-fit:cover}
.context:after{content:'';position:absolute;inset:0;border-radius:36px;pointer-events:none;border:8px solid #0B1119}
.context-label{position:absolute;margin:0;right:123px;top:896px;width:360px;text-align:center;font-size:26px;color:#D8DCFF}
.yt-hl{--yt-hl-x:50%;--yt-hl-y:50%;--yt-hl-rx:56%;--yt-hl-ry:46%;--yt-hl-dim:.37;position:absolute;inset:0;pointer-events:none;background:rgba(5,8,15,var(--yt-hl-dim));-webkit-mask-image:radial-gradient(ellipse var(--yt-hl-rx) var(--yt-hl-ry) at var(--yt-hl-x) var(--yt-hl-y),transparent 0%,transparent 52%,black 88%);mask-image:radial-gradient(ellipse var(--yt-hl-rx) var(--yt-hl-ry) at var(--yt-hl-x) var(--yt-hl-y),transparent 0%,transparent 52%,black 88%)}
.status-marker{position:absolute;left:110px;top:238px;border:1px solid rgba(216,220,255,.55);padding:12px 20px;border-radius:30px;color:#D8DCFF;font-size:27px;letter-spacing:2px}
.web-frame{position:absolute;left:100px;top:300px;width:1720px;height:570px;overflow:hidden;border:1px solid rgba(216,220,255,.38);border-radius:24px;background:#0B1119}
.web-frame img,.web-frame video{width:100%;height:100%;object-fit:cover}
.brand-mark{position:absolute;width:460px;height:390px;object-fit:contain;left:190px;top:205px}
.brand-wordmark{position:absolute;left:135px;top:668px;width:1250px;height:152px;object-fit:contain}
.brand-orb{position:absolute;left:940px;top:185px;width:830px;height:700px;object-fit:cover;object-position:center;border-radius:50%}
.brand-tag{position:absolute;margin:0;left:170px;top:600px;font-size:35px;letter-spacing:8px;color:#D8DCFF}
.editorial{position:absolute;left:120px;top:185px;width:1510px;margin:0;font-family:'Cormorant Garamond',serif;font-weight:400;font-size:114px;line-height:1.12}
.small-copy{position:absolute;left:122px;top:675px;margin:0;font-size:34px;max-width:1100px;line-height:1.5}
.room{position:absolute;right:30px;top:50px;width:990px;height:890px;opacity:.7}
.counter{position:absolute;right:112px;bottom:210px;color:#D8DCFF;font-size:26px;letter-spacing:3px}
.archive-panel{position:absolute;right:122px;top:206px;width:405px;height:655px;border:1px solid rgba(216,220,255,.45);overflow:hidden;border-radius:24px}
.archive-panel img{width:100%;height:100%;object-fit:cover;object-position:top}
.graph{position:absolute;left:120px;top:320px;width:1680px;height:510px}
.graph-node{position:absolute;width:430px;height:145px;border:1px solid rgba(216,220,255,.4);border-radius:20px;padding:26px 30px;background:#0B1119}
.graph-node strong{display:block;font-size:34px;font-weight:500;color:#D8DCFF;line-height:1.2}
.graph-node span{display:block;margin-top:15px;font-size:26px;color:#F4EEDF}
.graph-lines{position:absolute;inset:0;width:100%;height:100%}
.code-frame{position:absolute;left:120px;top:315px;width:1680px;height:500px;border:1px solid rgba(216,220,255,.4);border-radius:22px;overflow:hidden;background:#0B1119}
.code-label{position:absolute;left:34px;top:27px;font-size:27px;color:#D8DCFF}
.code-window{position:absolute;left:0;top:100px;right:0;bottom:0;overflow:hidden}.code{position:absolute;left:36px;top:0;margin:0;font-size:30px;font-family:monospace;line-height:1.6;white-space:pre-wrap;max-width:1550px;color:#F4EEDF}
.cta-links{position:absolute;left:120px;top:790px;display:flex;gap:70px;color:#D8DCFF;font-size:32px}
.ribbon{position:absolute;right:40px;top:100px;width:880px;height:560px;object-fit:contain;opacity:.32}
.close-mark{position:absolute;left:180px;top:120px;width:330px;height:300px;object-fit:contain}
.close-wordmark{position:absolute;left:115px;top:475px;width:1440px;height:175px;object-fit:contain}
.close-thesis{position:absolute;left:120px;top:675px;font-size:43px;font-family:'Cormorant Garamond',serif;color:#F4EEDF}
`;
const lens=(id,file,style='')=>`<div class="lens" style="${style}"><img id="${id}-pixels" class="lens-pixels" src="${A+file}" alt="Authentic source recording pixels"/><div id="${id}-spot" class="yt-hl"></div></div>`;
const labels=(c,title,source)=>`<p class="eyebrow">${c}</p><div class="hairline"></div><h2 class="headline" style="font-size:80px;top:145px;max-width:1700px">${title}</h2><p class="source-tag">${source}</p>`;
let markup=[],tweens=[];
function shot(id,start,duration,content,motion=''){
 const lengths={'homepage-motion.mp4':7,'before-context.mp4':3.3,'telegram-context.mp4':3.9,'after-context.mp4':4.9,'profile-safe.mp4':4,'profile-linked.mp4':8.4};
 content=content.replace(/<video ([^>]+)>/g,(all,attrs)=>{const file=attrs.match(/src="[^"]*\/([^/]+\.mp4)"/)?.[1];const rate=Math.min(1,(lengths[file]??duration)/duration);return `<video ${attrs} class="clip" data-start="${start}" data-duration="${duration}" data-playback-rate="${rate.toFixed(6)}" data-track-index="3" data-hf-media-start-basis="local">`;});
 markup.push(`<section id="${id}" class="shot"><div id="${id}-stage" class="stage">${content}</div></section>`);
 tweens.push(`tl.fromTo('#${id}-stage',{opacity:0},{opacity:1,duration:.45,ease:'power2.out'},${start});tl.set('#${id}-stage',{opacity:0},${start+duration});${motion}`);
}
function drift(id,start,duration,from=1,to=1.025){return`tl.fromTo('#${id}-pixels',{scale:${from}},{scale:${to},duration:${duration},ease:'none'},${start});`;}
function spotlight(id,start,ys){return ys.map((y,i)=>`tl.to('#${id}-spot',{'--yt-hl-y':'${y}%','--yt-hl-x':'${i%2?54:42}%',duration:1.0,ease:'power2.inOut'},${start+i*3.2});`).join('');}
const room=`<svg class="room" viewBox="0 0 900 900" aria-hidden="true"><defs><radialGradient id="roomlight"><stop stop-color="#FFE9C2" stop-opacity=".45"/><stop offset="1" stop-color="#05080F" stop-opacity="0"/></radialGradient></defs><circle cx="390" cy="350" r="450" fill="url(#roomlight)"/><path d="M360 80H760V670H360Z M560 80V670 M360 370H760" stroke="#D8DCFF" stroke-opacity=".45" fill="none" stroke-width="3"/><path d="M210 650L760 720M160 750H840M210 550H360V735H210Z" stroke="#D8DCFF" stroke-opacity=".25" fill="none" stroke-width="2"/></svg>`;
for(const c of chapters){
 markup=[];tweens=[];
 markup.push(`<div id="s${c.id}-ground" class="clip" data-start="0" data-duration="${c.duration}" data-track-index="0"><div class="ground"></div></div>`);
 if(c.id==='01'){
  shot('s01-friction',0,9.6,room+`<p class="eyebrow">A SMALL DETAIL. AGAIN.</p><div class="hairline"></div><h1 class="editorial" style="width:1150px">The quiet room.<br/>The morning light.<br/>The story, all over again.</h1><p class="small-copy">Every new conversation asks you to start over.</p>`,`tl.fromTo('.room',{x:60,opacity:.2},{x:0,opacity:.7,duration:9.6,ease:'power2.out'},0);tl.fromTo('#s01-friction .editorial',{y:35,opacity:0},{y:0,opacity:1,duration:1.1,ease:'power3.out'},.35);`);
  shot('s01-thesis',9.6,7.4,`<p class="eyebrow">THE REASON WE BUILT THIS</p><div class="hairline"></div><h1 class="editorial" style="top:260px;font-size:127px">You shouldn't have to<br/>explain yourself twice.</h1><img class="ribbon" src="${A}cta-ribbon.webp" alt="" style="opacity:.15"/>`,`tl.fromTo('#s01-thesis .editorial',{scale:.96},{scale:1,duration:7.4,ease:'none'},9.6);`);
 }
 if(c.id==='02'){
  shot('s02-brand',0,8.8,`<p class="eyebrow">MEET ANGHKOOEY</p><div class="hairline"></div><img class="brand-mark" id="s02-logo" src="${A}folded-a.webp" alt="Official folded-A logo"/><img class="brand-orb" id="s02-orb" src="${A}brand-homepage.png" alt="Actual Anghkooey homepage orb"/><p class="brand-tag">A CONCIERGE THAT REMEMBERS</p><img class="brand-wordmark" src="${A}wordmark.webp" alt="Anghkooey wordmark"/>`,`tl.fromTo('#s02-logo',{scale:.82,opacity:0,rotation:-5},{scale:1,opacity:1,rotation:0,duration:1.5,ease:'power3.out'},0);tl.fromTo('#s02-orb',{scale:1.04},{scale:1.12,duration:8.8,ease:'none'},0);`);
  shot('s02-home',8.8,6.4,labels('ACTUAL PRODUCT','A personal AI concierge','Chromium capture')+`<div class="web-frame"><video id="s02-home-video" src="${A}homepage-motion.mp4" muted playsinline></video></div>`,`tl.fromTo('#s02-home .web-frame',{scale:.97},{scale:1.025,duration:6.4,ease:'none'},8.8);`);
  shot('s02-consent',15.2,5.8,labels('WITH YOUR PERMISSION','Remembering starts with consent','Actual Web controls')+`<div class="web-frame"><img id="s02-consent-pixels" src="${A}consent-lens.png" alt="Genuine memory consent controls, original pixels enlarged" style="object-fit:contain"/></div>`,`tl.fromTo('#s02-consent-pixels',{scale:1.02},{scale:1.05,duration:5.8,ease:'power2.inOut'},15.2);`);
 }
 if(c.id==='03'){
  shot('s03-before',0,8,labels('BEFORE · EARLIER EXCHANGE','No guessing from missing context','Recorded iMessage')+lens('s03-before','before-lens.png')+`<div class="context"><video id="s03-before-video" src="${A}before-context.mp4" muted playsinline></video></div><p class="context-label">PRE-LINK RESPONSE</p><p class="note">Question about another traveller. This does not prove an empty account.</p>`,drift('s03-before',0,8)+spotlight('s03-before',.3,[25,65]));
  shot('s03-consent',8,3,labels('TELEGRAM · PERMISSION','Memory is switched on','Original mobile pixels')+lens('s03-consent','telegram-consent.png','width:1480px;height:530px')+`<p class="note">The real YES / memory-on exchange.</p>`,drift('s03-consent',8,3));
  shot('s03-preference',11,9,labels('TELEGRAM · WHAT MATTERS','Quiet. Natural light. Away from busy roads.','Original mobile pixels')+lens('s03-preference','telegram-preference.png','top:350px;width:1360px;height:390px')+`<div class="context" style="width:290px;height:630px;top:230px"><video id="s03-telegram-video" src="${A}telegram-context.mp4" muted playsinline></video></div><p class="note">The posted preference, enlarged directly from the recording.</p>`,drift('s03-preference',11,9)+spotlight('s03-preference',11,[22,52,77]));
  shot('s03-receipt',20,7,labels('STORAGE · CONFIRMED EVIDENCE','A real Walrus Mainnet receipt','Earlier local demo capture')+lens('s03-receipt','receipt-lens.png','top:400px;width:1290px;height:320px')+`<div class="archive-panel" style="width:290px"><img src="${A}archive-receipt.png" alt="Earlier genuine confirmed memory save"/></div><p class="note">Separate recorded Web demo. Different preference and browser identity.</p>`,drift('s03-receipt',20,7));
 }
 if(c.id==='04'){
  shot('s04-link',0,5,labels('LINK · CONFIRMED','First, the identity is connected','Recorded iMessage')+lens('s04-link','linked-lens.png','top:300px;width:1370px;height:530px')+`<p class="note">The original successful merge acknowledgement.</p>`,drift('s04-link',0,5)+spotlight('s04-link',0,[24,65]));
  shot('s04-recall',5,14,labels('AFTER · LINKED IMESSAGE','The preference comes back.','Original reply')+lens('s04-recall','after-preferences.png','top:315px;width:1250px;height:515px')+`<div class="context"><video id="s04-after-video" src="${A}after-context.mp4" muted playsinline></video></div><p class="context-label">QUIET + NATURAL LIGHT</p><p class="note">These are the two preferences actually recalled in this exchange.</p>`,drift('s04-recall',5,14,1,1.035)+spotlight('s04-recall',5,[20,20,63,78]));
  shot('s04-boundary',19,7,labels('HONEST RECALL','It flags what it cannot confirm.','Original reply, no added words')+lens('s04-boundary','after-caveat.png','top:320px;width:1320px;height:490px')+`<p class="note">The reply does not claim to know the source channel.</p>`,drift('s04-boundary',19,7)+spotlight('s04-boundary',19,[20,60]));
 }
 if(c.id==='05'){
  shot('s05-code',0,10,labels('MEMORY FOLLOWS YOU','Verify through the channel.','Supplied Web recording')+`<div class="web-frame"><video id="s05-code-video" src="${A}profile-safe.mp4" muted playsinline></video></div><p class="note" style="bottom:160px">Profile’s real code-generation control. Code values are excluded.</p>`,`tl.fromTo('#s05-code .web-frame',{scale:1.02},{scale:1.10,duration:10,ease:'none'},0);`);
  shot('s05-linked',10,8,labels('PROFILE · VERIFIED','Telegram + iMessage are connected.','Original 2/2 linked status')+`<div class="web-frame"><video id="s05-linked-video" src="${A}profile-linked.mp4" muted playsinline></video></div>`,`tl.fromTo('#s05-linked .web-frame',{scale:1.0},{scale:1.12,duration:8,ease:'power2.inOut'},10);`);
  shot('s05-telegram',18,7,labels('CROSS-CHANNEL CONTEXT','The same priorities, another conversation.','Original Telegram recommendation')+lens('s05-telegram','telegram-reply-lens.png','top:300px;width:1250px;height:530px')+`<p class="note">No booking or live availability is claimed.</p>`,drift('s05-telegram',18,7)+spotlight('s05-telegram',18,[20,57]));
 }
 if(c.id==='06'){
  shot('s06-library',0,6,labels('REMEMBER, RESPONSIBLY','Review the records.','Confirmed local demo capture')+`<div class="archive-panel" style="left:110px;width:445px;height:625px;top:265px"><img id="s06-counts" src="${A}archive-counts.png" alt="Actual library with active and replaced counts"/></div><div class="lens" style="left:610px;width:1190px;height:510px;top:320px"><img id="s06-library-pixels" class="lens-pixels" src="${A}correction-lens.png" alt="Actual confirmed corrected memory search result"/></div>`,`tl.fromTo('#s06-counts',{y:-25},{y:-100,duration:6,ease:'none'},0);`+drift('s06-library',0,6));
  shot('s06-edit',6,6,labels('CORRECTION · NEW VERSION','A preference can change.','Recorded correction input')+lens('s06-edit','correction-input-text.png','top:340px;width:1240px;height:480px')+`<div class="archive-panel" style="width:365px;top:290px;height:570px"><img src="${A}archive-correction-input.png" alt="Original app context for the correction input" style="object-fit:cover;object-position:left center"/></div><p class="note">The pending input is followed by the confirmed corrected record.</p>`,drift('s06-edit',6,6));
  shot('s06-confirmed',12,6,labels('CORRECTION · CONFIRMED','New blob. Previous version replaced.','Actual confirmed app records')+lens('s06-confirmed','correction-text.png','top:355px;width:1200px;height:460px')+`<div class="archive-panel" style="width:485px;top:370px;height:310px;right:80px"><img src="${A}active-replaced-counts.png" alt="1 active record and 1 replaced record" style="object-fit:contain;object-position:center"/></div><p class="note" style="bottom:165px">Recorded new receipt: VfuxUL…R-0I. Previous: y7ZvRr…4h_U.</p>`,drift('s06-confirmed',12,6));
  shot('s06-settings',18,5,labels('CONSENT · YOUR CONTROL','Stop new saves whenever you choose.','Live Chromium capture')+`<div class="web-frame"><img id="s06-settings-pixels" src="${A}consent-off-lens.png" alt="Actual confirmed memory off state in settings" style="object-fit:contain"/></div>`,`tl.fromTo('#s06-settings-pixels',{scale:1},{scale:1.02,duration:5,ease:'none'},18);`);
 }
 if(c.id==='07'){
  const nodes=[['DeepSeek Flash','Conversation + extraction',0,0],['Memory orchestration','Consent · recall · correction',580,0],['Walrus','Durable memory blobs',1160,0],['Neon','Account + identity state',580,255],['Photon worker','Persistent message processing',0,255],['Telegram / iMessage','Verified messaging identities',1160,255]];
  const graph=`<div class="graph"><svg class="graph-lines" viewBox="0 0 1680 510" aria-hidden="true"><path id="s07-flow" d="M430 72H580 M1010 72H1160 M795 145V255 M430 328H580 M1010 328H1160" stroke="#D8DCFF" stroke-width="3" fill="none"/></svg>`+nodes.map((n,i)=>`<div class="graph-node" id="s07-node-${i}" style="left:${n[2]}px;top:${n[3]}px"><strong>${n[0]}</strong><span>${n[1]}</span></div>`).join('')+'</div>';
  shot('s07-engine',0,13,labels('THE ENGINEERING','Memory is a system, not a prompt.','Repository-derived architecture')+graph+`<p class="note" style="bottom:165px">One orchestration layer. Durable records. Verified identities.</p>`,nodes.map((_,i)=>`tl.fromTo('#s07-node-${i}',{y:20,opacity:0},{y:0,opacity:1,duration:.65,ease:'power2.out'},${.6+i*.65});`).join('')+`tl.fromTo('#s07-flow',{strokeDasharray:1600,strokeDashoffset:1600},{strokeDashoffset:0,duration:5,ease:'power2.inOut'},.8);`);
  const files=[['src/server/memwal.ts',14,24,'ESM-only SDK: dynamic import'],['src/server/deepseek.ts',56,73,'Reasoning content is never the visible answer'],['workers/photon-worker.ts',242,259,'Dedupe at the persistent messaging boundary']];
  for(let i=0;i<files.length;i++){
   const[f,lo,hi,title]=files[i];const lines=fs.readFileSync(path.join(repo,f),'utf8').split('\n').slice(lo-1,hi).map((l,k)=>`${String(lo+k).padStart(3,' ')}  ${l}`).join('\n');const start=13+i*(10/3);
   shot(`s07-code-${i}`,start,10/3,labels('ENGINEERING · REAL CODE',title,'Actual repository excerpt')+`<div class="code-frame"><p class="code-label">${f}</p><div class="code-window"><pre class="code" id="s07-code-${i}-text">${esc(lines)}</pre></div></div>`,`tl.fromTo('#s07-code-${i}-text',{y:0},{y:-120,duration:${10/3},ease:'none'},${start});`);
  }
 }
 if(c.id==='08'){
  shot('s08-close',0,13,`<img class="ribbon" id="s08-ribbon" src="${A}cta-ribbon.webp" alt=""/><img class="close-mark" id="s08-logo" src="${A}folded-a.webp" alt="Official folded-A"/><img class="close-wordmark" id="s08-wordmark" src="${A}wordmark.webp" alt="Anghkooey"/><p class="close-thesis">You shouldn't have to explain yourself twice.</p><div class="cta-links"><span>anghkooey.vercel.app</span><span>github.com/Devendurance/anghkooey</span></div>`,`tl.fromTo('#s08-logo',{scale:.93,opacity:0},{scale:1,opacity:1,duration:1.1,ease:'power3.out'},0);tl.fromTo('#s08-ribbon',{x:60,opacity:.18},{x:0,opacity:.34,duration:13,ease:'none'},0);tl.fromTo('#s08-wordmark',{y:15,opacity:0},{y:0,opacity:1,duration:1.2,ease:'power2.out'},.35);`);
 }
 const id=`s${c.id}`;
 const html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"/></head><body><template><style>${CSS}\n#${id}-root{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}</style><div id="${id}-root" data-composition-id="${id}" data-width="1920" data-height="1080" data-duration="${c.duration}">${markup.join('\n')}</div><script>(function(){const tl=gsap.timeline({paused:true});${tweens.join('\n')}window.__timelines['${id}']=tl;})();</script></template></body></html>`;
 fs.writeFileSync(path.join(root,'compositions','frames',c.id+'.html'),html);
}
const host=chapters.map(c=>`<div id="s${c.id}" class="clip" data-composition-id="s${c.id}" data-composition-src="compositions/frames/${c.id}.html" data-start="${c.start}" data-duration="${c.duration}" data-track-index="1" data-width="1920" data-height="1080"></div>`).join('\n');
const voices=audio.chapters.map(c=>`<audio id="voice-${c.id}" src="${c.path}" data-start="${c.offset}" data-duration="${c.voice_duration}" data-track-index="20" data-volume="1"></audio>`).join('\n');
const subs=captions.map((g,i)=>`<div id="cap-${i}" class="clip caption" data-start="${g.start.toFixed(3)}" data-duration="${Math.max(.05,g.end-g.start).toFixed(3)}" data-track-index="30"><span class="caption-text">${esc(g.text)}</span></div>`).join('\n');
const musicPoints=[{t:0,v:.1},{t:1,v:.24}];for(const c of audio.chapters){const start=c.offset,end=start+c.voice_duration;musicPoints.push({t:Math.max(0,start-.15),v:.12},{t:Math.min(174.5,end+.05),v:.12},{t:Math.min(174.5,end+.55),v:.25});}musicPoints.push({t:174,v:.25},{t:175,v:0});musicPoints.sort((a,b)=>a.t-b.t);const dedup=musicPoints.filter((v,i,a)=>!i||v.t>a[i-1].t);
const automation=esc(JSON.stringify({version:1,lanes:[{target:'volume',points:dedup}]}));
const fx=[65.8,101.7,128.7].map((t,i)=>`<audio id="confirmation-${i}" src="audio/original-confirmation.wav" data-start="${t}" data-duration="2" data-volume="0.25" data-track-index="22"></audio>`).join('\n');
fs.writeFileSync(path.join(root,'index.html'),`<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=1920,height=1080"/><title>Anghkooey official hackathon demo</title><script src="assets/gsap.min.js"></script><style>@font-face{font-family:Satoshi;src:url('assets/Satoshi-Variable.woff2') format('woff2');font-weight:300 900;font-display:block}body{margin:0;background:#05080F;color:#F4EEDF;overflow:hidden;font-family:Satoshi,sans-serif}#root{position:relative;width:100%;height:100%;overflow:hidden;background:#05080F}.clip{position:absolute;inset:0}.caption{z-index:100;display:flex;align-items:flex-end;justify-content:center;padding:0 125px 42px;pointer-events:none}.caption-text{color:#F4EEDF;font-size:46px;line-height:1.26;font-weight:500;text-align:center;max-width:1550px;padding:12px 26px;border-radius:14px;background:rgba(5,8,15,.96);box-shadow:0 0 0 1px rgba(216,220,255,.14)}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="175" data-fps="60">${host}\n${voices}\n<audio id="original-music" src="audio/original-piano-ambient.wav" data-start="0" data-duration="175" data-track-index="21" data-automation="${automation}"></audio>\n${fx}\n${subs}</div><script>const tl=gsap.timeline({paused:true});tl.to({}, {duration:175});window.__timelines = window.__timelines || {};window.__timelines['main']=tl;</script></body></html>`);
const board=fs.readFileSync(path.join(root,'STORYBOARD.md'),'utf8').replaceAll('- status: outline','- status: animated');fs.writeFileSync(path.join(root,'STORYBOARD.md'),board);
console.log('Eight seek-safe scene compositions, original footage, synchronized caption and audio tracks assembled.');
