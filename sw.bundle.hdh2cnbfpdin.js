/* Background service: tab-scoped captions and validated synchronized options. */
const language = (chrome.i18n.getUILanguage() || 'en').split('-')[0];
const defaults = { enable: 1, speech_voice: 0, translate_lang: language, rate: 1,
  max_rate: 1.12, volume: 1, pitch: 1, speaking_control: 'auto',
  custom_translate_lang: { name: '', code: '' }, ui_lang: language, voices_map: {} };
const improvements = { group_sentences: true, auto_voice: true, duck_audio: true, original_volume: 0.25, voice_locale: "pt-BR" };
let options = { ...defaults, ...improvements };
const captions = new Map(), states = new Map();
function isYouTube(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'www.youtube.com'; }
  catch { return false; }
}
function normalize(raw = {}) {
  const result = { ...defaults, ...raw };
  for (const [key, min, max] of [['rate', .1, 2], ['max_rate', .1, 2], ['volume', 0, 1], ['pitch', 0, 2], ['speech_voice', 0, 10000]]) {
    const value = Number(result[key]);
    result[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : defaults[key];
  }
  result.max_rate = Math.max(result.rate, result.max_rate);
  result.speech_voice = Math.floor(result.speech_voice);
  result.enable = result.enable ? 1 : 0;
  result.speaking_control = ['auto','video','voice'].includes(result.speaking_control) ? result.speaking_control : 'auto';
  for (const key of ['translate_lang', 'ui_lang']) {
    if (typeof result[key] !== 'string' || !/^[a-zA-Z-]{2,20}$/.test(result[key])) result[key] = defaults[key];
  }
  if (!result.voices_map || typeof result.voices_map !== 'object') result.voices_map = {};
  if (!result.custom_translate_lang || typeof result.custom_translate_lang !== 'object') result.custom_translate_lang = { ...defaults.custom_translate_lang };
  return result;
}
async function load() {
  const data = await chrome.storage.sync.get(['options', 'speechImprovements']);
  if(!data.speechImprovements?.natural_sync_v1){
    data.options={...data.options,rate:1,max_rate:1.12,pitch:1,speaking_control:'auto'};
    data.speechImprovements={...data.speechImprovements,natural_sync_v1:true};
    await chrome.storage.sync.set({options:data.options,speechImprovements:data.speechImprovements});
  }
  const extra = { ...improvements, ...data.speechImprovements };
  for (const key of ['group_sentences', 'auto_voice', 'duck_audio']) extra[key] = extra[key] !== false;
  const level = Number(extra.original_volume);
  extra.original_volume = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : .25;
  extra.voice_locale = extra.voice_locale === "pt-PT" ? "pt-PT" : "pt-BR";
  options = { ...normalize(data.options), ...extra };
}
let ready = load().catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.options || changes.speechImprovements)) ready = load().catch(() => {});
});
chrome.webRequest.onBeforeRequest.addListener(details => {
  if (details.tabId < 0) return;
  try {
    const url = new URL(details.url);
    if (url.hostname === 'www.youtube.com' && url.pathname === '/api/timedtext')
      { const at = Date.now();
      chrome.tabs.get(details.tabId).then(tab => {
        const videoId = new URL(tab.url).searchParams.get('v');
        if(url.searchParams.has('v')&&url.searchParams.get('v')!==videoId)return;
        if (!captions.has(details.tabId) || captions.get(details.tabId).at <= at)
          captions.set(details.tabId, { url: url.href, videoId, at });
      }).catch(() => {});
    }
  } catch {}
}, { urls: ['https://www.youtube.com/api/timedtext*'] });
chrome.tabs.onRemoved.addListener(id => { captions.delete(id); states.delete(id); });
chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
  if (!isYouTube(sender.url) || !Number.isInteger(sender.tab?.id)) return false;
  const id = sender.tab.id;
  (async () => {
    await ready;
    if(['edge_voices','edge_synthesize'].includes(message.question))return await edgeRequest(message);
    if (message.timedtext !== undefined) {
      const entry = captions.get(id);
      if(!entry||entry.videoId!==message.videoId)return {timedtext:null};
      const expiry=new URL(entry.url).searchParams.get('expire');
      if(expiry&&(!Number.isFinite(Number(expiry))||Number(expiry)*1000<=Date.now())){captions.delete(id);return {timedtext:null};}
      return {timedtext:entry.url};
    }
    const state = states.get(id) || {};
    if (typeof message.badge === 'string') {
      state.status = message.badge.slice(0, 32);
      await chrome.action.setBadgeText({ tabId: id, text: state.status.slice(0, 8) });
      await chrome.action.setBadgeBackgroundColor({ tabId: id, color: state.status === 'Off' ? '#6b7280' : '#2563eb' });
    }
    if (typeof message.title === 'string') state.title = message.title.slice(0, 500);
    states.set(id, state);
    if (message.update && typeof message.update === 'object') {
      const stored = await chrome.storage.sync.get('options');
      const update = {};
      for (const key of Object.keys(defaults)) if (Object.hasOwn(message.update, key)) update[key] = message.update[key];
      await chrome.storage.sync.set({ options: normalize({ ...stored.options, ...update }) });
      await load();
    }
    return { options };
  })().then(respond, () => respond({ error: 'background-unavailable' }));
  return true;
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if(sender.id!==chrome.runtime.id)return false;
  if(['edge_voices','edge_synthesize'].includes(message.question)){edgeRequest(message).then(respond);return true}
  if(message.question==='voice_service_status'||message.question==='voice_service_start'){nativeVoice(message.question==='voice_service_start'?'start':'status').then(respond);return true}
  if(message.question==='close_panel'){if(sender.tab?.id)chrome.tabs.sendMessage(sender.tab.id,{question:'close_left_panel'}).catch(()=>{});respond({ok:true});return false}
  if(message.question!=='now_playing')return false;
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const state = states.get(tab?.id) || {};
    return { answer: 'now_playing', msg: state.title || '', status: state.status || 'Idle' };
  })().then(respond, () => respond({ answer: 'now_playing', msg: '', status: 'Error' }));
  return true;
});


const EDGE_URL='http://127.0.0.1:8766';
const NATIVE_VOICE_HOST='com.speaktube.voice';
let startingVoice=null;
function nativeVoice(command){
 return new Promise(resolve=>{
  let complete=false;
  const finish=result=>{if(complete)return;complete=true;clearTimeout(timer);resolve(result)};
  const timer=setTimeout(()=>finish({ok:false,error:'O servico de voz demorou para responder.'}),15000);
  if(typeof chrome.runtime.sendNativeMessage!=='function'){finish({ok:false,installed:false,error:'Instale o Servico de Voz pela configuracao do SpeakTube.'});return}
  try{chrome.runtime.sendNativeMessage(NATIVE_VOICE_HOST,{command},response=>{
   const error=chrome.runtime.lastError;
   if(error){finish({ok:false,installed:false,error:'Servico de Voz nao instalado ou indisponivel. Abra Configurar voz no SpeakTube.'});return}
   finish(response||{ok:false,error:'O servico de voz nao respondeu.'});
  })}catch{finish({ok:false,installed:false,error:'Abra Configurar voz no SpeakTube para instalar o servico.'})}
 });
}
function startNativeVoice(){
 if(!startingVoice)startingVoice=nativeVoice('start').finally(()=>{startingVoice=null});
 return startingVoice;
}
async function edgeRequest(message){
 const synth=message.question==='edge_synthesize';
 if(synth&&(typeof message.text!=='string'||message.text.length>1200||typeof message.voice!=='string'))return {error:'Invalid speech request'};
 const perform=async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),38000);
  try{
   const response=await fetch(EDGE_URL+(synth?'/synthesize':'/voices'),{signal:controller.signal,...(synth?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:message.text,voice:message.voice,pitch:message.pitch})}:{})});
   const data=await response.json();
   return response.ok?data:{error:data.error||('Edge TTS HTTP '+response.status)};
  }finally{clearTimeout(timer)}
 };
 try{return await perform()}catch{
  const started=await startNativeVoice();
  if(!started.ok||!started.running)return {error:started.error||'Instale o Servico de Voz pela configuracao do SpeakTube.'};
  try{return await perform()}catch{return {error:'O servico de voz iniciou, mas a conexao falhou. Abra Configurar voz.'}}
 }
}
chrome.runtime.onInstalled?.addListener(details=>{
 if(details.reason==='install')chrome.tabs.create({url:chrome.runtime.getURL('setup.html')}).catch(()=>{});
});
chrome.action.onClicked.addListener(async tab=>{
 if(!Number.isInteger(tab.id)||!isYouTube(tab.url))return;
 try{
  let response;
  try{response=await chrome.tabs.sendMessage(tab.id,{question:'toggle_left_panel'})}catch{}
  if(typeof response?.open!=='boolean'){
   await chrome.scripting.executeScript({target:{tabId:tab.id},files:['left-panel.js'],world:'ISOLATED'});
   response=await chrome.tabs.sendMessage(tab.id,{question:'toggle_left_panel'});
   if(typeof response?.open!=='boolean')throw Error('Panel did not respond');
  }
  await chrome.action.setBadgeText({tabId:tab.id,text:''});
 }catch(error){
  console.error('SpeakTube panel could not open',error);
  await chrome.action.setBadgeText({tabId:tab.id,text:'Reload'});
 }
});
