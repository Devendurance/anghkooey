import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const temp=process.argv[2];if(!temp)throw new Error('Pass the preserved HyperFrames work directory.');
const cache=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx');
let producer,producerDir;for(const folder of fs.readdirSync(cache)){const base=path.join(cache,folder,'node_modules/hyperframes');try{const p=JSON.parse(fs.readFileSync(path.join(base,'package.json')));if(p.version!=='0.8.143')continue;const entry=fs.readdirSync(path.join(base,'dist')).find(x=>/^src-.*\.js$/.test(x));producerDir=path.join(base,'dist');producer=await import(pathToFileURL(path.join(producerDir,entry)).href);break;}catch{}}
if(!producer?.createCaptureSession)throw new Error('Pinned HyperFrames capture API unavailable.');
const out=path.join(root,'verification/recovery-frames');fs.mkdirSync(out,{recursive:true});
for(const folder of ['captured-frames','capture-attempt-0/worker-0','capture-attempt-0/worker-1'])for(const file of fs.readdirSync(path.join(temp,folder))){if(!/^frame_\d{6}\.jpg$/.test(file))continue;const target=path.join(out,file);if(!fs.existsSync(target))fs.linkSync(path.join(temp,folder,file),target);}
const missing=[];for(let i=0;i<10500;i++)if(!fs.existsSync(path.join(out,`frame_${String(i).padStart(6,'0')}.jpg`)))missing.push(i);
console.log('Preserved frames:',10500-missing.length,'Missing:',missing.length);
const config=producer.resolveConfig({chromePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',forceScreenshot:true,useDrawElement:false,enableBrowserPool:false,frameDataUriCacheBytesLimitMb:64});
const compiled=path.join(temp,'compiled');
const frameDir=path.join(compiled,'__hyperframes_video_frames/s04-after-video');
const lookup={frameDirs:()=>[],getActiveFramePayloads:time=>{const map=new Map();if(time>=70&&time<84){const n=Math.min(293,Math.floor((time-70)*0.35*60));map.set('s04-after-video',{frameIndex:n,framePath:path.join(frameDir,`frame_${String(n).padStart(5,'0')}.jpg`)});}return map;}};
const pipelineFile=fs.readdirSync(producerDir).find(x=>x.startsWith('chunk-6XMFEICO'));
const pipelineSource=fs.readFileSync(path.join(producerDir,pipelineFile),'utf8');
const shimFunction=pipelineSource.slice(pipelineSource.indexOf('function buildVirtualTimeShim('),pipelineSource.indexOf('var VIRTUAL_TIME_SHIM ='));
const shim=Function(shimFunction+';return buildVirtualTimeShim({seedRandomFromFrame:false});')();
const server=await producer.createFileServer({projectDir:root,compiledDir:compiled,fps:{num:60,den:1},stripEmbeddedRuntime:false,preHeadScripts:[shim,'window.__timelines = window.__timelines || {};']});
const groups=[missing.filter(x=>x<5250),missing.filter(x=>x>=5250)];
try{await Promise.all(groups.map(async(frames,worker)=>{if(!frames.length)return;const injector=producer.createVideoFrameInjector(lookup,config);const session=await producer.createCaptureSession(server.url,out,{width:1920,height:1080,format:'jpg',quality:95,fps:{num:60,den:1}},injector,config);try{await producer.initializeSession(session);for(let n=0;n<frames.length;n++){const i=frames[n];await producer.captureFrame(session,i,i/60);if(n%120===0)console.log(`Worker ${worker}: ${n}/${frames.length}, film frame ${i}`);}}finally{await producer.closeCaptureSession(session);}}));}finally{await server.close();}
const count=fs.readdirSync(out).filter(x=>/^frame_\d{6}\.jpg$/.test(x)).length;if(count!==10500)throw new Error(`Incomplete recovery: ${count}`);
fs.writeFileSync(path.join(root,'verification/recovery.json'),JSON.stringify({frames:count,fps:60,width:1920,height:1080,retained:10500-missing.length,recaptured:missing.length,engine:'HyperFrames 0.8.143 native capture API'},null,2));console.log('RECOVERY_COMPLETE: 10500 authentic HyperFrames frames.');
