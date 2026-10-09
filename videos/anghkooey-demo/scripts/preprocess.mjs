import fs from 'node:fs';import path from 'node:path';import{execFileSync}from'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'assets');fs.mkdirSync(out,{recursive:true});
const sources={imessage:'C:/Users/USER/Downloads/Telegram Desktop/IMG_1138.MP4',telegram:'C:/Users/USER/Downloads/Telegram Desktop/IMG_1105.MP4',web:'C:/Users/USER/Downloads/export-1791549378621.mp4'};
const ff=(args)=>execFileSync('ffmpeg',['-y','-v','error',...args],{stdio:'inherit'});
function still(source,time,name,filter){ff(['-ss',String(time),'-i',sources[source],'-frames:v','1',...(filter?['-vf',filter]:[]),path.join(out,name+'.png')]);}
function clip(source,start,end,name,filter){ff(['-ss',String(start),'-i',sources[source],'-t',String(end-start),'-an','-vf',filter+',fps=60','-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p',path.join(out,name+'.mp4')]);}
// Privacy masks remove the entire fixed contact header. Linking codes are absent from the selected iMessage ranges.
clip('imessage',5.8,9.1,'before-context','drawbox=x=0:y=0:w=iw:h=338:color=black:t=fill');
clip('imessage',19.2,21.2,'linked-context','drawbox=x=0:y=0:w=iw:h=338:color=black:t=fill');
clip('imessage',21.6,26.5,'after-context','drawbox=x=0:y=0:w=iw:h=338:color=black:t=fill');
still('imessage',6,'before-lens','crop=626:234:35:1310,drawbox=x=138:y=52:w=140:h=43:color=0x222226:t=fill');
still('imessage',19.5,'linked-lens','crop=624:282:35:630');
still('imessage',23.5,'after-preferences','crop=624:270:35:864');
still('imessage',23.5,'after-durable','crop=624:235:35:1136');
still('imessage',23.5,'after-caveat','crop=624:332:35:1400');
still('telegram',16.7,'telegram-preference','crop=514:125:59:548');
clip('telegram',15.3,19.2,'telegram-context','drawbox=x=0:y=0:w=iw:h=190:color=black:t=fill');
still('telegram',0,'telegram-consent','crop=540:255:15:315');
still('telegram',143,'telegram-reply','crop=520:655:14:355');
// The supplied page scrolls after code generation. Use only the verified pre-value control range.
// Never use a fixed-position redaction across the scrolling secret-value range.
clip('web',34,38,'profile-safe','crop=1750:800:0:120');
clip('web',85,93.4,'profile-linked','crop=1750:780:80:130');
still('web',85,'profile-proof','crop=1490:760:180:165');
const repo=path.resolve(root,'../..');
const archive={
 'archive-receipt.png':'.playwright-mcp/page-2026-10-09T10-20-37-158Z.png',
 'archive-recall.png':'.playwright-mcp/page-2026-10-09T10-24-04-456Z.png',
 'archive-correction-input.png':'.playwright-mcp/page-2026-10-09T10-53-11-432Z.png',
 'archive-counts.png':'.playwright-mcp/page-2026-10-09T10-57-07-252Z.png',
 'archive-corrected.png':'.playwright-mcp/page-2026-10-09T10-58-52-416Z.png'
};for(const[name,file]of Object.entries(archive))fs.copyFileSync(path.join(repo,file),path.join(out,name));
for(const[name,filter]of[['receipt-lens','crop=366:86:12:504'],['recall-evidence','crop=366:130:12:474']])ff(['-i',path.join(out,name==='receipt-lens'?'archive-receipt.png':'archive-recall.png'),'-frames:v','1','-vf',filter,path.join(out,name+'.png')]);
ff(['-i',path.join(out,'archive-corrected.png'),'-frames:v','1','-vf','crop=330:306:15:274',path.join(out,'correction-lens.png')]);
const crop=(input,name,filter)=>ff(['-i',path.join(root,input),'-frames:v','1','-vf',filter,path.join(out,name+'.png')]);
crop('assets/correction-lens.png','correction-text','crop=290:125:20:92');
crop('assets/archive-correction-input.png','correction-input-text','crop=272:95:246:506');
crop('assets/telegram-reply.png','telegram-reply-lens','crop=520:250:0:0');
crop('assets/archive-counts.png','active-replaced-counts','crop=343:120:15:420');
crop('capture/consent.png','consent-lens','crop=770:306:574:78');
crop('capture/trust.png','consent-off-lens','crop=970:197:474:187');
// Run scripts/capture-hero.cjs to record verified homepage motion after intro, never the old blank range.
// Stage local fonts and runtime, never remote requests during a render.
fs.copyFileSync(path.join(repo,'.next/static/media/01e4147cff8141ee-s.p.3huc2loe0ie8a.woff2'),path.join(out,'Cormorant.woff2'));
console.log('Privacy-safe derivatives, archived genuine evidence, local fonts staged.');
