import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const captions=JSON.parse(fs.readFileSync(path.join(root,'caption_groups.json'),'utf8'));
const audio=JSON.parse(fs.readFileSync(path.join(root,'audio_meta.json'),'utf8'));
// Removing the inter-caption end clamp must make this fail on fast continuous speech.
test('aligned caption phrases never share a time window',()=>{
 const overlap=captions.filter((c,i)=>i>0&&c.start<captions[i-1].end);
 assert.equal(overlap.length,0,`${overlap.length} adjacent phrases overlap`);
});
test('every caption is positive and stays inside the 175-second film',()=>{
 for(const c of captions){assert.ok(c.end>c.start);assert.ok(c.start>=0&&c.end<=175);}
});
test('all eight measured narration files fit their chapter windows',()=>{
 assert.equal(audio.chapters.length,8);
 for(const c of audio.chapters)assert.ok(c.offset+c.voice_duration<=c.start+c.duration,`chapter ${c.id} overruns`);
});
