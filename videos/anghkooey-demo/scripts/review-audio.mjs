import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const dir=path.join(root,'verification');fs.mkdirSync(dir,{recursive:true});
const meta=JSON.parse(fs.readFileSync(path.join(root,'audio_meta.json'),'utf8'));
const args=['-y','-v','error'];for(const c of meta.chapters)args.push('-i',path.join(root,c.path));
const filters=meta.chapters.map((c,i)=>`[${i}:a]aresample=16000,adelay=${Math.round(c.offset*1000)}:all=1[v${i}]`);
filters.push(meta.chapters.map((_,i)=>`[v${i}]`).join('')+'amix=inputs=8:normalize=0,apad,atrim=duration=175[out]');
const file=path.join(dir,'narration-review.wav');
execFileSync('ffmpeg',[...args,'-filter_complex',filters.join(';'),'-map','[out]','-ac','1','-ar','16000',file]);
const audit={mode:'audio-only automated review',humanAudition:false,voiceProvider:'ElevenLabs',voice:'George',windowChecks:[],captionChecks:[],transcription:null};
for(const c of meta.chapters){
 const end=c.offset+c.voice_duration;
 audit.windowChecks.push({id:c.id,start:c.offset,end,chapterEnd:c.start+c.duration,withinWindow:end<=c.start+c.duration});
 const stat=spawnSync('ffmpeg',['-hide_banner','-i',path.join(root,c.path),'-af','volumedetect','-f','null','-'],{encoding:'utf8'});
 if(stat.status!==0)throw new Error(`Audio analysis failed for chapter ${c.id}`);
 audit.windowChecks.at(-1).meanVolume_dB=Number(stat.stderr.match(/mean_volume: ([\d.-]+)/)?.[1]);
 audit.windowChecks.at(-1).peak_dB=Number(stat.stderr.match(/max_volume: ([\d.-]+)/)?.[1]);
}
const caps=JSON.parse(fs.readFileSync(path.join(root,'caption_groups.json'),'utf8'));
audit.captionChecks=caps.map((c,i)=>({i,positive:c.end>c.start,inFilm:c.start>=0&&c.end<=175,overlapPrevious:i>0&&c.start<caps[i-1].end}));
if(process.env.ELEVENLABS_API_KEY){
 const form=new FormData();form.set('model_id','scribe_v1');form.set('language_code','eng');form.set('tag_audio_events','false');form.set('diarize','false');form.set('file',new Blob([fs.readFileSync(file)],{type:'audio/wav'}),'narration-review.wav');
 const response=await fetch('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY},body:form,signal:AbortSignal.timeout(150000)});
 if(response.ok){const data=await response.json();fs.writeFileSync(path.join(dir,'narration-transcription.json'),JSON.stringify(data,null,2));audit.transcription={provider:'ElevenLabs Scribe v1',language:data.language_code,confidence:data.language_probability,text:data.text};}
 else audit.transcription={error:`HTTP ${response.status}`};
}else audit.transcription={error:'ELEVENLABS_API_KEY unavailable. No value logged.'};
fs.writeFileSync(path.join(dir,'audio-review.json'),JSON.stringify(audit,null,2));
console.log('Audio-only automated review:',audit.windowChecks.every(x=>x.withinWindow)?'eight chapter windows fit':'timing issue');
console.log('Captions:',caps.length,'positive and inside film:',audit.captionChecks.every(x=>x.positive&&x.inFilm));
console.log('Transcription:',audit.transcription?.provider??audit.transcription?.error);
if(!audit.windowChecks.every(x=>x.withinWindow)||!audit.captionChecks.every(x=>x.positive&&x.inFilm))process.exitCode=1;
