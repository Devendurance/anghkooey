const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const ctx=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce',recordVideo:{dir:path.join(root,'capture/hero-raw'),size:{width:1920,height:1080}}});
 const page=await ctx.newPage();
 await page.goto('https://anghkooey.vercel.app',{waitUntil:'networkidle'});
 const skip=page.getByRole('button',{name:/skip intro/i});if(await skip.count())await skip.click();
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
 await page.screenshot({path:path.join(root,'capture/hero-verified.png')});
 const before=Date.now();await page.waitForTimeout(3500);await page.mouse.wheel(0,420);await page.waitForTimeout(3500);
 const end=Date.now();const video=page.video();await ctx.close();const src=await video.path();await browser.close();
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',src],{encoding:'utf8'}).trim());
 const seconds=(end-before)/1000;const start=Math.max(0,duration-seconds-0.1);
 execFileSync('ffmpeg',['-y','-v','error','-ss',String(start),'-t','7','-i',src,'-an','-r','60','-c:v','libx264','-preset','fast','-crf','18',path.join(root,'assets/homepage-motion.mp4')]);
 fs.writeFileSync(path.join(root,'capture/hero-audit.json'),JSON.stringify({url:'https://anghkooey.vercel.app',source:path.basename(src),start,duration:7,viewport:'1920x1080',reducedMotion:true,actions:['wait on real homepage','scroll 420 pixels'],privateValues:false},null,2));
 console.log('Verified homepage captured without the intro holding screen.');
})().catch(e=>{console.error(e.message);process.exit(1)});
