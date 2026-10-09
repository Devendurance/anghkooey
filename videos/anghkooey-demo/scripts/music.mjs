import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');const sr=44100,duration=175,n=sr*duration;const left=new Float32Array(n),right=new Float32Array(n);
// Original composition: slow D minor -> Bb -> F -> C, soft additive piano and a low pad.
const chords=[[50,57,62,65],[46,53,58,62],[41,53,57,60],[48,55,60,64]];
function note(midi,start,length,amp,pan,pad=false){const hz=440*Math.pow(2,(midi-69)/12),s=Math.floor(start*sr),end=Math.min(n,s+Math.floor(length*sr));
 for(let harmonic=1;harmonic<=(pad?2:5);harmonic++){
  const step=2*Math.PI*hz*harmonic/sr,co=Math.cos(step),si=Math.sin(step);let x=1,y=0;
  const gain=amp*(pad?(harmonic===1?0.8:0.12):[0,0.64,0.16,0.075,0.035,0.012][harmonic]);
  const decay=Math.exp(-1/(sr*(pad?7:2.4/harmonic))),attack=pad?1.2:0.012;let env=1;
  for(let i=s;i<end;i++){
   const t=(i-s)/sr;let e=env*Math.min(1,t/attack)*Math.min(1,(end-i)/sr/(pad?1.6:0.35));
   const a=y*gain*e;left[i]+=a*(1-pan);right[i]+=a*pan;
   const xx=x*co-y*si;y=y*co+x*si;x=xx;env*=decay;
  }
 }
}
for(let bar=0;bar<29;bar++){const t=bar*6,chord=chords[bar%4];for(let j=0;j<4;j++)note(chord[j]+12,t+j*0.34,5.7,0.16,j%2?0.65:0.35);note(chord[0],t,6.4,0.052,0.5,true);if(bar%2===0)note(chord[3]+24,t+3.0,3,0.038,0.62);}
note(50,169,6,0.15,0.4);note(62,170,5,0.12,0.6);note(65,170.4,4.6,0.08,0.5);
// Short deterministic stereo room taps. No reference sound is reused.
for(const[delay,gain]of[[0.13,0.13],[0.29,0.095],[0.47,0.06]]){const k=Math.floor(delay*sr);for(let i=n-1;i>=k;i--){left[i]+=right[i-k]*gain;right[i]+=left[i-k]*gain;}}
const b=Buffer.alloc(44+n*4);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);
for(let i=0;i<n;i++){const fade=Math.min(1,i/sr/2,(n-i)/sr/4);b.writeInt16LE(Math.round(Math.tanh(left[i]*0.68)*fade*32767),44+i*4);b.writeInt16LE(Math.round(Math.tanh(right[i]*0.68)*fade*32767),46+i*4);}
fs.mkdirSync(path.join(root,'audio'),{recursive:true});fs.writeFileSync(path.join(root,'audio','original-piano-ambient.wav'),b);
const fxLen=sr*2,fx=Buffer.alloc(44+fxLen*4);b.copy(fx,0,0,44);fx.writeUInt32LE(fx.length-8,4);fx.writeUInt32LE(fxLen*4,40);
for(let i=0;i<fxLen;i++){let t=i/sr;let v=(Math.sin(t*2*Math.PI*660)+0.4*Math.sin(t*2*Math.PI*990))*Math.exp(-t*5)*Math.min(1,t/0.018)*0.105;let z=Math.round(v*32767);fx.writeInt16LE(z,44+i*4);fx.writeInt16LE(z,46+i*4);}fs.writeFileSync(path.join(root,'audio','original-confirmation.wav'),fx);
console.log('Original piano + ambient score and confirmation sound written, 175s, 44.1k stereo.');
