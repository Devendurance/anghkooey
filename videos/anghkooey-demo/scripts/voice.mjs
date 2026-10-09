import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const chapters=JSON.parse(await fs.readFile(path.join(root,'chapters.json'),'utf8'));
const out=path.join(root,'audio');await fs.mkdir(out,{recursive:true});
const key=process.env.ELEVENLABS_API_KEY;
if(!key)throw new Error('ELEVENLABS_API_KEY missing. No key value was logged.');
const voice='JBFqnCBsd6RMkjVDRZzb';
const result=[];
for(const c of chapters){
 const audio=path.join(out,`${c.id}-voice.mp3`),alignment=path.join(out,`${c.id}-alignment.json`);
 let data;
 try{data=JSON.parse(await fs.readFile(alignment,'utf8'));await fs.access(audio);}catch{
  let r;
  for(let attempt=0;attempt<5;attempt++){
  if(attempt)await new Promise(resolve=>setTimeout(resolve,20000*attempt));
  r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,{
   method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},
   body:JSON.stringify({text:c.text,model_id:'eleven_multilingual_v2',voice_settings:{stability:0.68,similarity_boost:0.78,style:0.12,use_speaker_boost:true,speed:0.94}})
  });
  if(r.status!==429)break;
  console.log(`Rate limit for chapter ${c.id}. Waiting before retry.`);
  }
  if(!r.ok)throw new Error(`ElevenLabs TTS HTTP ${r.status} for chapter ${c.id}`);
  const j=await r.json();await fs.writeFile(audio,Buffer.from(j.audio_base64,'base64'));
  data={alignment:j.alignment,normalized_alignment:j.normalized_alignment,provider:'ElevenLabs',voice_id:voice,model:'eleven_multilingual_v2',text:c.text};
  await fs.writeFile(alignment,JSON.stringify(data,null,2));
 }
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',audio],{encoding:'utf8'}).trim());
 const a=data.alignment??data.normalized_alignment; const words=[];let w='',st=0,en=0;
 for(let i=0;i<a.characters.length;i++){
  const ch=a.characters[i];if(/\s/.test(ch)){if(w){words.push({word:w,start:st,end:en});w='';}}
  else{if(!w)st=a.character_start_times_seconds[i];w+=ch;en=a.character_end_times_seconds[i];}
 }
 if(w)words.push({word:w,start:st,end:en});
 const offset=c.start+(c.id==='07'?0:0.35);const groups=[];let group=[];
 for(const item of words){group.push(item);if(group.length>=7||/[.!?]$/.test(item.word)||group.map(x=>x.word).join(' ').length>55){groups.push(group);group=[];}}
 if(group.length)groups.push(group);
 const captions=groups.map(g=>({start:offset+g[0].start,end:Math.min(c.start+c.duration-0.12,offset+g.at(-1).end+0.14),text:g.map(x=>x.word).join(' ')}));
 // Keep the short tail hold, without allowing two phrases to occupy the caption rail together.
 for(let i=0;i<captions.length-1;i++)captions[i].end=Math.min(captions[i].end,captions[i+1].start-0.005);
 result.push({...c,path:`audio/${c.id}-voice.mp3`,voice_duration:duration,offset,words,captions});
 console.log(`Chapter ${c.id}: ${duration.toFixed(2)}s VO / ${c.duration}s window. ${words.length} aligned words.`);
 if(offset+duration>c.start+c.duration-0.1)throw new Error(`TIMING_OVERFLOW ${c.id}: measured voice exceeds its actual chapter window`);
}
await fs.writeFile(path.join(root,'audio_meta.json'),JSON.stringify({provider:'ElevenLabs',voice:'George - Warm, Captivating Storyteller',voice_id:voice,chapters:result,total_duration_s:175},null,2));
const captions=result.flatMap(c=>c.captions);await fs.writeFile(path.join(root,'caption_groups.json'),JSON.stringify(captions,null,2));
const stamp=t=>{let n=Math.round(t*1000);let h=Math.floor(n/3600000);n%=3600000;let m=Math.floor(n/60000);n%=60000;let s=Math.floor(n/1000);n%=1000;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(n).padStart(3,'0')}`};
await fs.writeFile(path.join(root,'captions.srt'),captions.map((g,i)=>`${i+1}\n${stamp(g.start)} --> ${stamp(g.end)}\n${g.text}\n`).join('\n'));
console.log('Voice and final-audio captions written.');
