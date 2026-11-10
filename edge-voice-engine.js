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

 function createNativeSpeech(synthesis,Utterance){
  let active=null,generation=0,voices=[];
  const events=new EventTarget();
  const engine={isEdge:false,pending:false,speaking:false,paused:false,lastError:'',
   getVoices(){voices=synthesis?.getVoices?.()||[];return voices},
   addEventListener:(...args)=>events.addEventListener(...args),
   async refresh(){voices=engine.getVoices();engine.lastError=voices.length?'':'Nenhuma voz do sistema disponivel neste idioma. Verifique as vozes instaladas no sistema.';events.dispatchEvent(new Event('voiceschanged'));return voices},
   prefetch(){return Promise.resolve(null)},
   speak(item){
    engine.cancel();const token=++generation;
    if(!synthesis||!Utterance){engine.lastError='Vozes do sistema indisponiveis neste navegador.';item.onerror?.({error:'native-unavailable',message:engine.lastError});return}
    try{
     const utterance=new Utterance(item.text);active=utterance;
     const voice=engine.getVoices().find(v=>v===item.voice||v.voiceURI===item.voice?.voiceURI);
     if(item.voice&&!voice)throw Error('A voz selecionada nao esta disponivel no sistema.');
     if(voice)utterance.voice=voice;
     utterance.lang=voice?.lang||item.lang||'';utterance.rate=Math.max(.1,Math.min(2,Number(item.rate)||1));
     utterance.pitch=Math.max(0,Math.min(2,Number(item.pitch)||1));utterance.volume=Math.max(0,Math.min(1,Number(item.volume)||0));
     engine.pending=true;
     const finish=()=>{active=null;engine.pending=false;engine.speaking=false;engine.paused=false};
     utterance.onstart=()=>{if(token!==generation)return;engine.pending=false;engine.speaking=true;item.onstart?.({duration:null})};
     utterance.onend=e=>{if(token!==generation)return;finish();item.onend?.({elapsedTime:e.elapsedTime})};
     utterance.onerror=e=>{if(token!==generation)return;finish();engine.lastError=e.error==='not-allowed'?'Clique no video ou na previa para permitir a voz.':('Falha na voz do sistema: '+e.error);item.onerror?.({error:e.error,message:engine.lastError})};
     synthesis.speak(utterance);
    }catch(error){engine.cancel();engine.lastError=error.message;item.onerror?.({error:'native-unavailable',message:error.message})}
   },
   cancel(){generation++;if(active)active.onstart=active.onend=active.onerror=null;if(active||engine.pending||engine.speaking)synthesis?.cancel();active=null;engine.pending=false;engine.speaking=false;engine.paused=false},
   pause(){synthesis?.pause();engine.paused=true},resume(){synthesis?.resume();engine.paused=false}
  };
  synthesis?.addEventListener?.('voiceschanged',()=>engine.refresh());
  return engine;
 }
 function platformName(value){const name=String(value||'').toLowerCase();return name.startsWith('mac')?'mac':name.startsWith('win')?'win':name.includes('linux')?'linux':''}
 function createPlatformSpeech({request,synthesis,Utterance,platformHint='',makeAudio}){
  const events=new EventTarget(),native=createNativeSpeech(synthesis,Utterance);
  let os='',delegate=null,edge=null,preferred=null,loading=null,lastCheck=0,platformError='',generation=0,waiting=false;
  const emit=()=>events.dispatchEvent(new Event('voiceschanged'));
  const select=candidate=>{if(delegate!==candidate&&(delegate?.pending||delegate?.speaking)){preferred=candidate;return}delegate=candidate;preferred=null;emit()};
  const apply=()=>{if(preferred&&!delegate?.pending&&!delegate?.speaking)select(preferred)};
  native.addEventListener('voiceschanged',()=>{if(delegate===native)emit()});
  const engine={
   get platform(){return os},get backend(){apply();return delegate?.isEdge?'edge':delegate?'native':'loading'},
   get isEdge(){return !!delegate?.isEdge},get pending(){return waiting||!!delegate?.pending},get speaking(){return !!delegate?.speaking},get paused(){return !!delegate?.paused},
   get lastError(){return platformError||delegate?.lastError||''},
   addEventListener:(...args)=>events.addEventListener(...args),
   getVoices(){apply();if(os==='win'&&Date.now()-lastCheck>60000&&!engine.pending&&!engine.speaking)engine.refresh();return delegate?.getVoices()||[]},
   async refresh(){
    if(loading)return loading;
    lastCheck=Date.now();
    loading=(async()=>{
     try{
      if(!os){let result;try{result=await request({question:'speech_platform'})}catch(error){if(contextInvalid(error))throw error}os=platformName(result?.os)||platformName(platformHint)||'other'}
      platformError='';
      if(os==='win'){
       if(!edge){edge=createEdgeSpeech(request,makeAudio);edge.addEventListener('voiceschanged',()=>{if(delegate===edge)emit()})}
       await edge.refresh();
       if(edge.getVoices().length){select(edge);return}
      }
      await native.refresh();select(native);
     }catch(error){platformError=error.message;emit()}
    })();
    try{await loading}finally{loading=null}
   },
   prefetch(item){apply();return delegate?.prefetch(item)||Promise.resolve(null)},
   async speak(item){const token=++generation;waiting=true;await engine.ready;waiting=false;if(token!==generation)return;apply();if(!delegate){item.onerror?.({error:'native-unavailable',message:engine.lastError});return}return delegate.speak(item)},
   cancel(){generation++;waiting=false;delegate?.cancel()},pause(){delegate?.pause()},resume(){delegate?.resume()}
  };
  engine.ready=engine.refresh();return engine;
 }
 class EdgeUtterance{constructor(text){this.text=text;this.rate=1;this.pitch=1;this.volume=1;this.voice=null}}
 if(typeof module!=='undefined'&&module.exports){module.exports={createEdgeSpeech,createNativeSpeech,createPlatformSpeech,platformName,EdgeUtterance,contextInvalid};return}
 root.YSSUtterance=EdgeUtterance;
 const extensionId='dlnpomclnceomfiplgjkfendkdncfdkf';
 const request=message=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Edge TTS timeout')),40000);
  const callback=response=>{clearTimeout(timer);if(chrome.runtime.lastError)reject(Error(chrome.runtime.lastError.message));else resolve(response||{error:'Edge TTS unavailable'})};
  try{if(location.protocol==='chrome-extension:')chrome.runtime.sendMessage(message,callback);else chrome.runtime.sendMessage(extensionId,message,{},callback)}catch(error){clearTimeout(timer);reject(error)}
 });
 root.YSSVoiceEngine=createPlatformSpeech({request,synthesis:root.speechSynthesis,Utterance:root.SpeechSynthesisUtterance,platformHint:root.navigator?.userAgentData?.platform||root.navigator?.platform});
})(globalThis);
