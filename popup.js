/* Popup source: no framework, remote fonts, inline scripts or build step. */
(async () => {
 const $ = id => document.getElementById(id);
 const invalidContext=error=>/extension context invalidated/i.test(error?.message||String(error||''));
 const reloadHint=()=>pt?'A extensão foi recarregada. Atualize esta página do YouTube (F5) e abra o SpeakTube novamente.':'The extension was reloaded. Refresh this YouTube page and reopen SpeakTube.';
 const pt = navigator.language.toLowerCase().startsWith('pt');
 document.documentElement.lang = pt ? 'pt-BR' : 'en';
 const copy = {
 pt: {variant:'Variante da voz em português',variantUnavailable:'Nenhuma voz Edge TTS nesta variante. Verifique o serviço local.',customStyle:'Personalizado',add:'Adicionar',tagline:'Dê voz às suas legendas.',nowPlaying:'AGORA NO YOUTUBE',openVideo:'Abra um vídeo para começar',voiceTitle:'Sua voz, do seu jeito',language:'Idioma das legendas',voice:'Voz da narração',automatic:'Automática',voiceHint:'Vozes neurais do Edge TTS.',style:'Estilo de leitura',natural:'Natural',calm:'Calma',dynamic:'Dinâmica',deep:'Grave',styleHint:'Estilos ajustam velocidade e tom da voz escolhida.',mixTitle:'Equilibre o som',speechVolume:'Volume da narração',duck:'Destacar a narração',duckHint:'Reduz o som do vídeo enquanto a voz fala.',originalVolume:'Áudio original durante a fala',fineTune:'Ajustes finos',rate:'Velocidade',maximum:'Velocidade máxima',pitch:'Tom da voz',group:'Frases mais completas',groupHint:'Agrupa trechos curtos das legendas.',sync:'Sincronização',autoSync:'Automático — voz natural',syncHint:'No automático, a voz fica perto de 1× e o vídeo desacelera suavemente para acompanhar a fala.',speedVoice:'Acelerar a voz',slowVideo:'Desacelerar o vídeo suavemente',loading:'Carregando ajustes…',reset:'Restaurar padrão',saved:'Ajustes salvos',saving:'Salvando…',saveError:'Falha ao salvar. Tente novamente.',noVoices:'Conectando ao Edge TTS…',preview:'Ouvir prévia da voz',stop:'Parar prévia',previewError:'Não foi possível reproduzir esta voz.',sample:'Olá! Esta é uma prévia da voz que vai acompanhar seus vídeos.',manual:'Escolha uma voz ou use a seleção automática.',autoHint:'A voz acompanha o idioma das legendas.',enabled:'Ativar narração',audio:'Reduzir áudio original',groupLabel:'Agrupar legendas',styles:'Estilos de leitura',custom:'Idioma personalizado',customPrompt:'Código do idioma (ex.: pt-BR):',invalidLanguage:'Use um código válido, como pt-BR.'},
 en: {variant:'Portuguese voice variant',variantUnavailable:'This variant is not available in your browser voices. Choose another voice or variant.',customStyle:'Custom',add:'Add',tagline:'Give your subtitles a voice.',nowPlaying:'NOW ON YOUTUBE',openVideo:'Open a video to get started',voiceTitle:'Your voice, your way',language:'Subtitle language',voice:'Narration voice',automatic:'Automatic',voiceHint:'Edge TTS neural voices.',style:'Reading style',natural:'Natural',calm:'Calm',dynamic:'Dynamic',deep:'Deep',styleHint:'Styles adjust the speed and pitch of your chosen voice.',mixTitle:'Find your balance',speechVolume:'Narration volume',duck:'Bring narration forward',duckHint:'Lowers video audio while the voice speaks.',originalVolume:'Original audio during narration',fineTune:'Fine tuning',rate:'Speed',maximum:'Maximum speed',pitch:'Voice pitch',group:'More complete sentences',groupHint:'Groups short caption segments.',sync:'Synchronization',autoSync:'Automatic — natural voice',syncHint:'Automatic mode keeps speech near 1× and gently slows the video to follow narration.',speedVoice:'Speed up the voice',slowVideo:'Gently slow down the video',loading:'Loading settings…',reset:'Restore defaults',saved:'Settings saved',saving:'Saving…',saveError:'Could not save. Please try again.',noVoices:'Connecting to Edge TTS…',preview:'Preview voice',stop:'Stop preview',previewError:'Could not play this voice.',sample:'Hello! This is a preview of the voice that will accompany your videos.',manual:'Choose a voice or use automatic selection.',autoHint:'The voice follows the subtitle language.',enabled:'Enable narration',audio:'Lower original audio',groupLabel:'Group captions',styles:'Reading styles',custom:'Custom language',customPrompt:'Language code (e.g. pt-BR):',invalidLanguage:'Use a valid language code, such as pt-BR.'}
 }[pt?'pt':'en'];
 for(const element of document.querySelectorAll('[data-i18n]'))element.textContent=copy[element.dataset.i18n];
 for(const [id,key] of [['enabled','enabled'],['duck','audio'],['group','groupLabel'],['preview','preview']])$(id).setAttribute('aria-label',copy[key]);
 document.querySelector('.presets').setAttribute('aria-label',copy.styles);
 const defaults={enable:1,speech_voice:0,translate_lang:pt?'pt':'en',rate:1,max_rate:1.12,volume:1,pitch:1,speaking_control:'auto',custom_translate_lang:{name:'',code:''}};
 const extraDefaults={group_sentences:true,auto_voice:true,duck_audio:true,original_volume:.25,voice_locale:'pt-BR'};
 let options={...defaults}, extra={...extraDefaults}, voices=[], utterance=null, writeQueue=Promise.resolve(), initialized=false;
 const presets={natural:{rate:1,max_rate:1.12,pitch:1},calm:{rate:.9,max_rate:1.1,pitch:1},dynamic:{rate:1.2,max_rate:1.5,pitch:1.05},deep:{rate:1,max_rate:1.3,pitch:.8}};
 const inputs=[...document.querySelectorAll('input,select,button')].filter(input=>input.id!=='close-panel');inputs.forEach(input=>input.disabled=true);
 function save(patch={},extraPatch={}) {
  Object.assign(options,patch);Object.assign(extra,extraPatch);render();
  $('save-status').textContent=copy.saving;$('save-status').classList.remove('error');
  writeQueue=writeQueue.catch(()=>{}).then(async()=>{
   const current=await chrome.storage.sync.get(['options','speechImprovements']);
   const data={};
   if(Object.keys(patch).length)data.options={...current.options,...patch};
   if(Object.keys(extraPatch).length)data.speechImprovements={...extraDefaults,...current.speechImprovements,...extraPatch};
   await chrome.storage.sync.set(data);
  });
  const pending=writeQueue;
  pending.then(()=>{if(writeQueue===pending)$('save-status').textContent=copy.saved},()=>{if(writeQueue===pending){$('save-status').textContent=copy.saveError;$('save-status').classList.add('error')}});
 }
 const names=new Intl.DisplayNames([pt?'pt':'en'],{type:'language'});
 const codes=["af", "am", "ar", "az", "be", "bg", "bn", "bs", "ca", "ceb", "co", "cs", "cy", "da", "de", "el", "en", "eo", "es", "et", "eu", "fa", "fi", "fr", "fy", "ga", "gd", "gl", "gu", "ha", "haw", "hi", "hmn", "hr", "ht", "hu", "hy", "id", "ig", "is", "it", "iw", "ja", "jw", "ka", "kk", "km", "kn", "ko", "ku", "ky", "la", "lb", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "ne", "nl", "no", "ny", "or", "pa", "pl", "ps", "pt", "ro", "ru", "rw", "sd", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "tk", "tl", "tr", "tt", "ug", "uk", "ur", "uz", "vi", "xh", "yi", "yo", "zh", "zu"];
 for(const code of codes.map(code=>code==='iw'?'he':code).filter((code,index,array)=>array.indexOf(code)===index).sort((a,b)=>names.of(a).localeCompare(names.of(b)))) {
  const option=document.createElement('option');option.value=code;option.textContent=names.of(code);$('language').append(option);
 }
 function ensureLanguage(code){if(![...$('language').options].some(option=>option.value===code)){const option=document.createElement('option');option.value=code;option.textContent=options.custom_translate_lang?.code===code?options.custom_translate_lang.name:code;$('language').append(option)}}
 function stopPreview(){const active=utterance;utterance=null;if(active)YSSVoiceEngine.cancel();$('preview').classList.remove('playing');$('preview').setAttribute('aria-label',copy.preview)}
 function renderVoices(){
  voices=YSSVoiceEngine.getVoices();$('voice').replaceChildren();
  if(!voices.length){const option=document.createElement('option');option.textContent=copy.noVoices;$('voice').append(option)}
  voices.map((voice,index)=>({voice,index})).sort((a,b)=>a.voice.lang.localeCompare(b.voice.lang)||a.voice.name.localeCompare(b.voice.name)).forEach(({voice,index})=>{
   const option=document.createElement('option');option.value=String(index);option.textContent=voice.name+' · '+voice.lang;$('voice').append(option);
  });render();
 }
 function render(){
  $('enabled').checked=!!options.enable;ensureLanguage(options.translate_lang);$('language').value=options.translate_lang;$('portuguese-variant').hidden=!options.translate_lang.toLowerCase().startsWith('pt');$('voice-locale').value=extra.voice_locale;
  const voice=YSSSpeechImprovements.selectVoice(voices,options.speech_voice,YSSSpeechImprovements.voiceLanguage(options.translate_lang,extra.voice_locale),extra.auto_voice);
  if(voice)$('voice').value=String(voices.indexOf(voice));
  $('automatic').checked=extra.auto_voice;$('voice').disabled=!voices.length||extra.auto_voice;$('preview').disabled=!voice;
  $('voice-hint').textContent=!voices.length?(YSSVoiceEngine.lastError?(invalidContext(YSSVoiceEngine.lastError)?reloadHint():(pt?'Servico de voz indisponivel. Abra Configurar / instalar servico de voz.':'Voice service unavailable. Open voice setup.')):copy.noVoices):!voice?copy.variantUnavailable:extra.auto_voice?copy.autoHint:copy.manual;
  $('speech-volume').value=Math.round(options.volume*100);$('speech-volume-value').textContent=Math.round(options.volume*100)+'%';
  $('original-volume').value=Math.round(extra.original_volume*100);$('original-volume-value').textContent=Math.round(extra.original_volume*100)+'%';
  $('duck').checked=extra.duck_audio;$('original-volume').disabled=!extra.duck_audio;$('original-control').classList.toggle('disabled',!extra.duck_audio);
  for(const [id,key] of [['rate','rate'],['maximum','max_rate'],['pitch','pitch']]){$(id).value=options[key];$(id+'-value').textContent=Number(options[key]).toFixed(2)+(id==='pitch'?'':'×')}
  $('custom-style').textContent=Object.values(presets).some(preset=>Object.entries(preset).every(([key,value])=>Math.abs(Number(options[key])-value)<.001))?'':copy.customStyle;
  $('group').checked=extra.group_sentences;$('sync').value=options.speaking_control;
  for(const button of document.querySelectorAll('[data-preset]'))button.setAttribute('aria-pressed',String(Object.entries(presets[button.dataset.preset]).every(([key,value])=>Math.abs(Number(options[key])-value)<.001)));
 }
 try{
  const data=await chrome.storage.sync.get(['options','speechImprovements']);
  Object.assign(options,data.options);Object.assign(extra,data.speechImprovements);
  inputs.forEach(input=>input.disabled=false);initialized=true;renderVoices();$('save-status').textContent=copy.saved;
 }catch{$('save-status').textContent=copy.saveError;$('save-status').classList.add('error')}
 chrome.storage.onChanged?.addListener((changes,area)=>{if(area!=='sync'||!initialized)return;if(changes.options)Object.assign(options,changes.options.newValue);if(changes.speechImprovements)Object.assign(extra,changes.speechImprovements.newValue);render()});
 YSSVoiceEngine.addEventListener('voiceschanged',()=>{if(initialized)renderVoices()});
 $('enabled').addEventListener('change',()=>save({enable:$('enabled').checked?1:0}));
 $('language').addEventListener('change',()=>{stopPreview();save({translate_lang:$('language').value})});
 $('voice-locale').addEventListener('change',()=>{stopPreview();save({}, {voice_locale:$('voice-locale').value})});
 $('add-language').addEventListener('click',()=>{const code=$('custom-language').value.trim();if(!/^[a-zA-Z-]{2,20}$/.test(code)){$('save-status').textContent=copy.invalidLanguage;return}save({translate_lang:code,custom_translate_lang:{name:code,code}});$('custom-language').value=''});
 $('automatic').addEventListener('change',()=>{stopPreview();const automatic=$('automatic').checked;save(automatic?{}:{speech_voice:Number($('voice').value)}, {auto_voice:automatic})});
 $('voice').addEventListener('change',()=>{stopPreview();save({speech_voice:Number($('voice').value)})});
 $('duck').addEventListener('change',()=>save({}, {duck_audio:$('duck').checked}));
 $('group').addEventListener('change',()=>save({}, {group_sentences:$('group').checked}));
 $('sync').addEventListener('change',()=>save({speaking_control:$('sync').value}));
 for(const [id,key,scale,isExtra] of [['speech-volume','volume',100,false],['original-volume','original_volume',100,true],['rate','rate',1,false],['maximum','max_rate',1,false],['pitch','pitch',1,false]]){
  $(id).addEventListener('input',()=>{$(id+'-value').textContent=Number($(id).value).toFixed(scale===100?0:2)+(scale===100?'%':id==='pitch'?'':'×')});
  $(id).addEventListener('change',()=>{
   const value=Number($(id).value)/scale,patch={[key]:value};
   if(key==='rate'&&value>options.max_rate)patch.max_rate=value;
   if(key==='max_rate'&&value<options.rate)patch.rate=value;
   stopPreview();save(isExtra?{}:patch,isExtra?patch:{});
  });
 }
 document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{stopPreview();save({...presets[button.dataset.preset]})}));
 $('preview').addEventListener('click',()=>{
  if(utterance){stopPreview();return}
  const voice=YSSSpeechImprovements.selectVoice(voices,options.speech_voice,YSSSpeechImprovements.voiceLanguage(options.translate_lang,extra.voice_locale),extra.auto_voice);if(!voice)return;
  const samples={pt:copy.ptSample||'Olá! Esta é uma prévia da voz que vai acompanhar seus vídeos.',en:'Hello! This is a preview of the voice that will accompany your videos.',es:'Hola. Esta es una muestra de la voz para tus vídeos.',fr:'Bonjour. Voici un aperçu de la voix pour vos vidéos.',de:'Hallo. Dies ist eine Vorschau der Stimme für deine Videos.',it:'Ciao. Questa è una prova della voce per i tuoi video.'};
  const item=new YSSUtterance(samples[voice.lang.split('-')[0]]||copy.sample);utterance=item;
  item.voice=voice;item.lang=voice.lang;item.rate=Number(options.rate);item.pitch=Number(options.pitch);item.volume=Number(options.volume);
  item.onend=()=>{if(utterance===item)stopPreview()};item.onerror=event=>{if(utterance===item){stopPreview();$('voice-hint').textContent=event?.error==='extension-reloaded'||invalidContext(event)?reloadHint():copy.previewError+(event?.message?' '+event.message:'')}};
  $('preview').classList.add('playing');$('preview').setAttribute('aria-label',copy.stop);YSSVoiceEngine.speak(item);
 });
 $('reset').addEventListener('click',()=>{stopPreview();save({...defaults},{...extraDefaults})});
 $('close-panel').addEventListener('click',()=>{
  if(window.parent!==window)window.parent.postMessage({type:'speaktube-close-panel'},'https://www.youtube.com');
  try{stopPreview()}catch{}
  try{Promise.resolve(chrome.runtime.sendMessage({question:'close_panel'})).catch(()=>{})}catch{}
 });
 window.addEventListener('keydown',event=>{if(event.key==='Escape')$('close-panel').click()});
 window.addEventListener('pagehide',stopPreview);
 setInterval(()=>{if(!voices.length)YSSVoiceEngine.refresh()},5000);
 let refreshRunning=false;
 async function refresh(){
  if(refreshRunning)return;refreshRunning=true;
  try{
   const response=await chrome.runtime.sendMessage({question:'now_playing'});
   const statuses=pt?{Idle:'Aguardando vídeo',Loading:'Buscando legendas…','No CC':'Sem legendas disponíveis',Voice:'Verifique o Edge TTS e a voz selecionada',CCLimit:'YouTube limitou o acesso às legendas. Nenhuma nova tentativa será feita automaticamente.',Error:'Falha ao carregar legendas',Ready:'Pronto para narrar',Speak:'Narrando agora',End:'Legendas concluídas',Off:'Narração desligada',On:'Narração ativada','❚❚':'Vídeo pausado'}:{Idle:'Waiting for a video',Loading:'Loading captions…','No CC':'No captions available',Voice:'Check Edge TTS and selected voice',CCLimit:'YouTube caption request limit reached. Automatic retry is disabled.',Error:'Could not load captions',Ready:'Ready to narrate',Speak:'Narrating now',End:'Captions complete',Off:'Narration off',On:'Narration enabled','❚❚':'Video paused'};
   $('video-title').textContent=response?.msg||copy.openVideo;$('video-title').title=response?.msg||'';
   const state=response?.status||'Idle';$('playback-status').textContent=statuses[state]||state;
   $('status-dot').classList.toggle('active',state==='Speak'||state==='Ready');$('status-dot').classList.toggle('error',state==='Error');
  }catch(error){$('playback-status').textContent=invalidContext(error)?reloadHint():(pt?'Não foi possível consultar o vídeo':'Could not read video status')}finally{refreshRunning=false}
 }
 await refresh();setInterval(refresh,1500);
})();
