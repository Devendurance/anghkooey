import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const report=path.join(root,'verification/recovery.json');
const deadline=Date.now()+30*60*1000;
while(!fs.existsSync(report)){if(Date.now()>deadline)throw new Error('Recovery did not finish within 30 minutes. Preserved frames are untouched.');await new Promise(r=>setTimeout(r,3000));}
const r=spawnSync(process.execPath,[path.join(root,'scripts/deliver.mjs'),process.argv[2]],{stdio:'inherit'});if(r.status!==0)throw new Error('Final delivery encode failed.');
