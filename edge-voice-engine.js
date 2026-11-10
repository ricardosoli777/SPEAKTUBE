/* Edge TTS playback engine shared by the page and extension panel. */
(function(root){
 function contextInvalid(error){return /extension context invalidated/i.test(error?.message||String(error||''))}
 function createEdgeSpeech(request, makeAudio = url => new Audio(url)) {
  let voices=[],active=null,generation=0,loading=null,lastRefresh=0;
  const events=new EventTarget(),cache=new Map();
  const engine={isEdge:true,pending:false,speaking:false,paused:false,lastError:'',
   getVoices(){if(!voices.length&&Date.now()-lastRefresh>5000)engine.refresh();return voices},
   addEventListener:(...args)=>events.addEventListener(...args),
   async refresh(){
    if(loading)return loading;lastRefresh=Date.now();
    loading=(async()=>{try{const response=await request({question:'edge_voices'});if(response.error)throw Error(response.error);voices=response.voices||[];engine.lastError='';events.dispatchEvent(new Event('voiceschanged'))}catch(error){engine.lastError=error.message;events.dispatchEvent(new Event('voiceschanged'))}finally{loading=null}})();
    return loading;
   },
   prefetch(item){
    if(!item?.voice?.voiceURI||!item.text)return Promise.resolve(null);
    const key=JSON.stringify([item.text,item.voice.voiceURI,Math.round(((Number(item.pitch)||1)-1)*50)]);
    if(!cache.has(key)){
     const requestedAt=Date.now();root.SpeakTubeDiagnostics?.record('synthesis-request');
     const pending=request({question:'edge_synthesize',text:item.text,voice:item.voice.voiceURI,pitch:Math.round(((Number(item.pitch)||1)-1)*50)}).then(response=>{if(response.error)throw Error(response.error);root.SpeakTubeDiagnostics?.record('synthesis-ready',{elapsedMs:Date.now()-requestedAt});return response});
     cache.set(key,pending);pending.catch(error=>{cache.delete(key);root.SpeakTubeDiagnostics?.record('synthesis-error',{elapsedMs:Date.now()-requestedAt,error:String(error.message).slice(0,160)})});
     while(cache.size>24)cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
   },
   async speak(item){
    engine.cancel();const token=++generation;engine.pending=true;
    try{
     const response=await engine.prefetch(item);if(token!==generation)return;
     if(!response?.audio)throw Error('No speech audio');
     const bytes=Uint8Array.from(atob(response.audio),c=>c.charCodeAt(0));
     const url=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
     const audio=makeAudio(url);active={audio,url,token};audio.volume=Math.max(0,Math.min(1,Number(item.volume)||0));audio.playbackRate=Math.max(.1,Math.min(2,Number(item.rate)||1));audio.preservesPitch=true;
     let started=false;
     audio.onplaying=()=>{if(token!==generation||started)return;started=true;engine.pending=false;engine.speaking=true;item.onstart?.({duration:Number.isFinite(audio.duration)?audio.duration*1000/audio.playbackRate:null})};
     audio.onended=()=>{if(token!==generation)return;engine.cancel();item.onend?.({})};
     audio.onerror=()=>{if(token!==generation)return;engine.cancel();item.onerror?.({error:'audio-playback'})};
     await audio.play();
    }catch(error){if(token===generation){engine.lastError=error.message;engine.cancel();item.onerror?.({error:contextInvalid(error)?'extension-reloaded':'edge-unavailable',message:error.message})}}
   },
   cancel(){generation++;if(active){active.audio.onplaying=active.audio.onended=active.audio.onerror=null;active.audio.pause();active.audio.removeAttribute('src');URL.revokeObjectURL(active.url);active=null}engine.pending=false;engine.speaking=false;engine.paused=false},
   pause(){active?.audio.pause();engine.paused=true},
   resume(){if(active)active.audio.play().catch(()=>{});engine.paused=false}
  };
  return engine;
 }
 class EdgeUtterance{constructor(text){this.text=text;this.rate=1;this.pitch=1;this.volume=1;this.voice=null}}
 if(typeof module!=='undefined'&&module.exports){module.exports={createEdgeSpeech,EdgeUtterance,contextInvalid};return}
 root.YSSUtterance=EdgeUtterance;
 const extensionId='dlnpomclnceomfiplgjkfendkdncfdkf';
 const request=message=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Edge TTS timeout')),40000);
  const callback=response=>{clearTimeout(timer);if(chrome.runtime.lastError)reject(Error(chrome.runtime.lastError.message));else resolve(response||{error:'Edge TTS unavailable'})};
  try{if(location.protocol==='chrome-extension:')chrome.runtime.sendMessage(message,callback);else chrome.runtime.sendMessage(extensionId,message,{},callback)}catch(error){clearTimeout(timer);reject(error)}
 });
 root.YSSVoiceEngine=createEdgeSpeech(request);
 root.YSSVoiceEngine.refresh();
})(globalThis);
