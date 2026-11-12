/* Scrolling voice waveform: each moment of narration becomes a bar that runs from right to left.
   Real samples arrive from the page (Edge TTS) or from the panel's own preview; native voices
   cannot be sampled, so they get a synthetic speech-like rhythm. */
(()=>{
 const canvas=document.getElementById('waveform');if(!canvas)return;
 const ctx=canvas.getContext('2d'),box=canvas.closest('.now-playing'),COLUMNS=72,STEP_MS=34,STALE_MS=700;
 const history=new Array(COLUMNS).fill(0);
 let speaking=false,samples=null,lastSamples=0,lastStep=0,smooth=0,syntheticLevel=0,frame=0,tick=0;
 const accent=()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#7ce6c4';
 function fit(){const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.max(1,Math.round(rect.height*ratio))}
 function nextLevel(now){
  if(samples&&now-lastSamples<STALE_MS){
   let sum=0;for(let i=0;i<samples.length;i++){const v=(samples[i]-128)/128;sum+=v*v}
   return Math.min(1,Math.sqrt(sum/samples.length)*4.2);
  }
  if(speaking&&!samples){ // syllable-like pulses with short pauses
   tick++;if(tick%3===0)syntheticLevel=Math.random()<.12?.08:.35+Math.random()*.6;
   return syntheticLevel;
  }
  return 0;
 }
 function draw(now){
  frame=0;
  if(speaking&&samples&&now-lastSamples>=STALE_MS)speaking=false; // real stream stopped without an end event
  if(now-lastStep>=STEP_MS){
   lastStep=now;const target=nextLevel(now);
   smooth+=(target-smooth)*(target>smooth?.7:.35);
   history.push(smooth);history.shift();
  }
  const {width,height}=canvas,mid=height/2,ratio=window.devicePixelRatio||1,gap=width/COLUMNS;
  ctx.clearRect(0,0,width,height);ctx.strokeStyle=accent();ctx.lineCap='round';ctx.lineWidth=Math.max(2*ratio,gap*.55);
  for(let i=0;i<COLUMNS;i++){
   const age=i/(COLUMNS-1),h=Math.max(ratio*1.5,history[i]*(height-4*ratio)),x=gap*(i+.5);
   ctx.globalAlpha=.25+.75*age;ctx.beginPath();ctx.moveTo(x,mid-h/2);ctx.lineTo(x,mid+h/2);ctx.stroke();
  }
  ctx.globalAlpha=1;
  box?.classList.toggle('speaking',speaking);
  if(speaking||history.some(v=>v>.01))frame=requestAnimationFrame(draw);
  else{smooth=0;history.fill(0);ctx.clearRect(0,0,width,height);ctx.globalAlpha=.4;ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(width,mid);ctx.stroke();ctx.globalAlpha=1}
 }
 function update(isSpeaking,data){
  speaking=!!isSpeaking;samples=data&&data.length?data:null;if(samples)lastSamples=performance.now();
  if(!frame)frame=requestAnimationFrame(draw);
 }
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.data?.type!=='speaktube-activity')return;
  update(event.data.speaking,Array.isArray(event.data.samples)?event.data.samples:null);
 });
 window.YSSVoiceActivity?.addEventListener('activity',event=>update(event.speaking,event.samples));
 window.addEventListener('resize',()=>{fit();if(!frame)frame=requestAnimationFrame(draw)});
 fit();frame=requestAnimationFrame(draw);
})();
