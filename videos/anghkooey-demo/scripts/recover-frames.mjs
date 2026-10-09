import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');const temp=process.argv[2];if(!temp)throw new Error('Pass preserved HyperFrames work directory.');
const cache=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx');let dist;
for(const folder of fs.readdirSync(cache)){const base=path.join(cache,folder,'node_modules/hyperframes');try{if(JSON.parse(fs.readFileSync(path.join(base,'package.json'))).version==='0.8.143'){dist=path.join(base,'dist');break;}}catch{}}
if(!dist)throw new Error('Pinned HyperFrames package unavailable.');
const load=file=>import(pathToFileURL(path.join(dist,file)).href);
const {bundleWithLocalizedFonts}=await load('bundleWithLocalizedFonts-VH55VOAL.js');
const {serveStaticProjectHtml}=await load('chunk-5FISWJ37.js');
const {openSettledCompositionPage,seekCompositionTimeline}=await load('chunk-HMT2RPZU.js');
const out=path.join(root,'verification/recovery-frames');fs.mkdirSync(out,{recursive:true});
for(const folder of ['captured-frames','capture-attempt-0/worker-0','capture-attempt-0/worker-1'])for(const file of fs.readdirSync(path.join(temp,folder))){if(!/^frame_\d{6}\.jpg$/.test(file))continue;const target=path.join(out,file);if(!fs.existsSync(target))fs.linkSync(path.join(temp,folder,file),target);}
const missing=[];for(let i=0;i<10500;i++)if(!fs.existsSync(path.join(out,`frame_${String(i).padStart(6,'0')}.jpg`)))missing.push(i);
console.log('Preserved:',10500-missing.length,'Missing:',missing.length);
const html=await bundleWithLocalizedFonts(root);const server=await serveStaticProjectHtml(root,html);
try{await Promise.all([missing.filter(x=>x<5250),missing.filter(x=>x>=5250)].map(async(frames,worker)=>{
 if(!frames.length)return;const {browser,page,renderReadyTimedOut}=await openSettledCompositionPage(html,server.url,{renderReadyTimeoutMs:20000});
 try{if(renderReadyTimedOut)throw new Error('Snapshot renderer did not become ready.');
 const ready=await page.evaluate(()=>typeof window.__player?.renderSeek==='function');if(!ready)throw new Error('Native snapshot player unavailable.');
 for(let n=0;n<frames.length;n++){let i=frames[n];await seekCompositionTimeline(page,i/60,{exactTime:true,animationFrameSettle:'none'});await page.screenshot({path:path.join(out,`frame_${String(i).padStart(6,'0')}.jpg`),type:'jpeg',quality:95});if(n%120===0)console.log(`Worker ${worker}: ${n}/${frames.length}; frame ${i}`);}
 }finally{await browser.close();}
}));}finally{await server.close();}
const count=fs.readdirSync(out).filter(x=>/^frame_\d{6}\.jpg$/.test(x)).length;if(count!==10500)throw new Error(`Incomplete: ${count}`);
fs.writeFileSync(path.join(root,'verification/recovery.json'),JSON.stringify({frames:count,fps:60,width:1920,height:1080,retained:10500-missing.length,recaptured:missing.length,engine:'HyperFrames 0.8.143 native snapshot helpers'},null,2));console.log('RECOVERY_COMPLETE');
