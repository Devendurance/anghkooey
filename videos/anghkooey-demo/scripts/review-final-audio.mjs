import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');const dir=path.join(root,'verification');
const audio=path.join(dir,'final-audio-review.mp3');
execFileSync('ffmpeg',['-y','-v','error','-i',path.join(root,'anghkooey-demo-FINAL-1080p60.mp4'),'-vn','-ac','1','-ar','16000','-b:a','64k',audio]);
if(!process.env.ELEVENLABS_API_KEY)throw new Error('ElevenLabs key unavailable. No value logged.');
const form=new FormData();form.set('model_id','scribe_v1');form.set('language_code','eng');form.set('tag_audio_events','false');form.set('file',new Blob([fs.readFileSync(audio)],{type:'audio/mpeg'}),'final-audio-review.mp3');
const response=await fetch('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY},body:form,signal:AbortSignal.timeout(150000)});if(!response.ok)throw new Error(`Final audio transcription HTTP ${response.status}`);
const data=await response.json();fs.writeFileSync(path.join(dir,'final-audio-transcription.json'),JSON.stringify(data,null,2));
const normalize=text=>text.toLowerCase().replace(/\bankoui\b/g,'anghkooey').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean);
const expected=normalize(JSON.parse(fs.readFileSync(path.join(root,'chapters.json'),'utf8')).map(x=>x.text).join(' '));const actual=normalize(data.text);
let row=Array.from({length:actual.length+1},(_,i)=>i);for(let i=1;i<=expected.length;i++){let next=[i];for(let j=1;j<=actual.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(expected[i-1]===actual[j-1]?0:1));row=next;}
const report={mode:'actual final encoded audio, independent ElevenLabs Scribe transcription',humanAudition:false,wordErrorRate:row.at(-1)/expected.length,expectedWords:expected.length,recognizedWords:actual.length,language:data.language_code,confidence:data.language_probability,passes:row.at(-1)/expected.length<0.08};
fs.writeFileSync(path.join(dir,'final-audio-review.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passes)process.exitCode=1;
