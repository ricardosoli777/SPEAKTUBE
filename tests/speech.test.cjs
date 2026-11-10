const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const helpers = require('../speech-improvements.js');
const cue = (time,text,dDurationMs=1000) => ({time,text,dDurationMs});
test('groups complete phrases, preserving source and duration',()=>{
 const source=[cue(0,'Uma frase'),cue(1000,'completa.'),cue(2000,'Outra.')];
 const result=helpers.groupCaptions(source);
 assert.equal(result.length,2);assert.equal(result[0].text,'Uma frase completa.');assert.equal(result[0].dDurationMs,2000);assert.equal(source[0].text,'Uma frase');
});
test('respects long pauses, punctuation, size and grouping time limits',()=>{
 for(const source of [[cue(0,'Fim.'),cue(1000,'Novo')],[cue(0,'a'),cue(3000,'b')],[cue(0,'a'.repeat(210)),cue(1000,'b'.repeat(20))],[cue(0,'a',7000),cue(7000,'b')]])assert.equal(helpers.groupCaptions(source).length,2);
 assert.deepEqual(helpers.groupCaptions([cue(NaN,'invalid'),cue(0,' ')]),[]);
});
test('seek before first, between cues and past the end',()=>{
 const data=[cue(1000,'a'),cue(2000,'b')];assert.equal(helpers.captionIndex(data,0),0);assert.equal(helpers.captionIndex(data,1500),0);assert.equal(helpers.captionIndex(data,999999),1);
});
class Video extends EventTarget{volume=.8;paused=false;muted=false;}
test('audio restores after end, pause and media replacement',()=>{
 for(const event of [null,'pause','emptied']){const video=new Video(),audio=helpers.createAudioControl();audio.start(video);assert.equal(video.volume,.2);if(event)video.dispatchEvent(new Event(event));else audio.restore();assert.equal(video.volume,.8);audio.restore();assert.equal(video.volume,.8)}
});
test('audio respects manual volume, muted video and configured level',()=>{
 const video=new Video(),audio=helpers.createAudioControl();audio.start(video,0);assert.equal(video.volume,0);video.volume=.4;audio.restore();assert.equal(video.volume,.4);video.muted=true;audio.start(video);assert.equal(video.volume,.4);video.muted=false;audio.start(video,1);assert.equal(video.volume,.4);audio.restore();assert.equal(video.volume,.4);
});
test('voice selection separates Brazil and Portugal without silent fallback',()=>{
 const voices=[{lang:'en-US',name:'English'},{lang:'pt-BR',name:'Brasil'},{lang:'pt-PT',name:'Portugal'}];
 assert.equal(helpers.selectVoice(voices,0,'pt-BR',true).name,'Brasil');assert.equal(helpers.selectVoice(voices,0,'pt-PT',true).name,'Portugal');assert.equal(helpers.selectVoice(voices.slice(0,2),0,'pt-PT',true),undefined);assert.equal(helpers.selectVoice(voices,0,'pt-PT',false).name,'English');assert.equal(helpers.selectVoice([],0,'pt',true),undefined);
 assert.equal(helpers.voiceLanguage('pt','pt-PT'),'pt-PT');assert.equal(helpers.voiceLanguage('en','pt-BR'),'en');
});
test('speech rates remain finite, bounded and change gradually',()=>{
 for(const letters of [0,1,1000])for(const available of [0,1000]){const rate=helpers.speechRate({letters,available,base:1,maximum:1.4});assert.ok(Number.isFinite(rate));assert.ok(rate>=1&&rate<=1.4)}
 assert.equal(helpers.speechRate({letters:1000,available:1,base:1,maximum:2,previous:1}),1.15);
});
function playerFixture(){
 const source=fs.readFileSync(require.resolve('../webpage.bundle.hdh2cnbfpdin.js'),'utf8');
 const start=source.indexOf('m=(window.addEventListener');const end=source.indexOf(',n=()=>setTimeout',start);
 const video=new Video();let time=0,rate=1.5;
 const player={querySelector:()=>video,getMediaReferenceTime:()=>time,getPlaybackRate:()=>rate,setPlaybackRate:value=>rate=value,getVideoData:()=>({title:'Test'}),getAudioTrack:()=>({captionTracks:[]})};
 const spoken=[];const speech={pending:false,speaking:false,getVoices:()=>[{lang:'pt-BR',voiceURI:'test',name:'Test'}],speak(item){spoken.push(item);this.pending=true},cancel(){this.pending=false;this.speaking=false},pause(){},resume(){}};
 const context={URL,AbortController,console,setTimeout,clearTimeout,Date,Math,Number,Promise,YSSSpeechImprovements:helpers,document:{URL:'https://www.youtube.com/watch?v=test',querySelector:()=>player},window:{addEventListener(){}},YSSVoiceEngine:speech,YSSUtterance:class{constructor(text){this.text=text}},chrome:{runtime:{sendMessage(id,message,options,callback){callback?.({})}}}};
 vm.createContext(context);
 vm.runInContext('let e="pt",r={init(){},webPageUpdate(){},UILangUpdate(){}},l=()=>{},t=()=>{};l.group=()=>{};l.groupEnd=()=>{};let '+source.slice(start,end)+';globalThis.fixture={m,_,g,a};',context);
 const {m,_,g,a}=context.fixture;_.tts=[cue(0,'Uma frase.'),cue(2000,'Outra frase.')];g.state.playerState=1;g.options.speaking_control="voice";m.page=context.document.URL;
 return {m,_,g,a,video,speech,spoken,context,setTime:value=>time=value,getRate:()=>rate,setRate:value=>rate=value};
}
test('actual player queues one utterance, sets correct language and restores original speed',()=>{
 const f=playerFixture();f.m.speak();f.m.speak();assert.equal(f.spoken.length,1);const item=f.spoken[0];assert.equal(item.lang,'pt-BR');f.speech.pending=false;f.speech.speaking=true;item.onstart();assert.equal(f.video.volume,.2);f.speech.speaking=false;item.onend();assert.equal(f.video.volume,.8);assert.equal(f.m.index,1);assert.equal(f.getRate(),1.5);assert.equal(f.m.speakStabilizer.tmp.utter,null);
});
test('cancelled utterance callbacks cannot alter a newer utterance or its volume',()=>{
 const f=playerFixture();f.m.speak();const old=f.spoken[0];old.onstart();f.m.speakCancel();assert.equal(f.video.volume,.8);f.m.speak();const current=f.spoken[1];current.onstart();old.onend();old.onerror({});assert.equal(f.video.volume,.2);assert.equal(f.m.index,0);f.m.speakCancel();
});
test('actual player rewinds safely after completion and missing voices do not crash',()=>{
 const f=playerFixture();f.m.index=2;f.setTime(3);f.m.rewind();assert.equal(f.m.index,1);f.speech.getVoices=()=>[];assert.doesNotThrow(()=>f.m.speak());assert.equal(f.spoken.length,0);f.m.speakCancel();
});
function backgroundFixture(migrated=true){
 const handlers={},store=migrated?{speechImprovements:{natural_sync_v1:true}}:{},tabs=new Map([[1,{url:'https://www.youtube.com/watch?v=a'}],[2,{url:'https://www.youtube.com/watch?v=b'}]]);
 const chrome={i18n:{getUILanguage:()=> 'pt-BR'},storage:{sync:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,store[key]]))},async set(data){Object.assign(store,data)}},onChanged:{addListener(fn){handlers.changed=fn}}},webRequest:{onBeforeRequest:{addListener(fn){handlers.request=fn}}},tabs:{async create(details){handlers.createdTab=details;return details},async get(id){return tabs.get(id)},async query(){return [{id:1}]},onRemoved:{addListener(fn){handlers.removed=fn}}},action:{onClicked:{addListener(fn){handlers.clicked=fn}},async setBadgeText(){},async setBadgeBackgroundColor(){}},sidePanel:{async setPanelBehavior(value){handlers.behavior=value}},runtime:{id:'test',async getPlatformInfo(){return {os:'win'}},getURL:path=>'chrome-extension://test/'+path,onInstalled:{addListener(fn){handlers.installed=fn}},onMessageExternal:{addListener(fn){handlers.external=fn}},onMessage:{addListener(fn){handlers.internal=fn}}}};
 const context={chrome,URL,Date,Map,Number,Object,Promise};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../sw.bundle.hdh2cnbfpdin.js'),'utf8'),context);
 async function message(data,id=1){return await new Promise(resolve=>handlers.external(data,{url:tabs.get(id).url,tab:{id}},resolve))}
 return {handlers,store,tabs,message,chrome,context};
}
test('background isolates captions per tab AND video, rejects foreign origins',async()=>{
 const f=backgroundFixture();f.handlers.request({tabId:1,url:'https://www.youtube.com/api/timedtext?lang=en'});f.handlers.request({tabId:2,url:'https://www.youtube.com/api/timedtext?lang=es'});await new Promise(resolve=>setImmediate(resolve));
 assert.match((await f.message({timedtext:true,videoId:'a'},1)).timedtext,/lang=en/);assert.match((await f.message({timedtext:true,videoId:'b'},2)).timedtext,/lang=es/);assert.equal((await f.message({timedtext:true,videoId:'new'},1)).timedtext,null);
 assert.equal(f.handlers.external({}, {url:'https://evil.example',tab:{id:1}},()=>{throw Error('unexpected')}),false);f.handlers.removed(1);assert.equal((await f.message({timedtext:true,videoId:'a'},1)).timedtext,null);
 assert.equal(typeof f.handlers.clicked,'function');
});
test('background validates rates and retains options updates from other clients',async()=>{
 const f=backgroundFixture();f.store.options={pitch:1.1,rate:1,max_rate:1.4};const response=await f.message({update:{rate:99,volume:-4,voices_map:{test:75}}});assert.equal(response.options.rate,2);assert.equal(response.options.max_rate,2);assert.equal(response.options.volume,0);assert.equal(response.options.pitch,1.1);assert.equal(f.store.options.voices_map.test,75);
});

test('user playback speed changes during narration are preserved',()=>{const f=playerFixture();f.m.speak();f.spoken[0].onstart();f.setRate(2);f.spoken[0].onend();assert.equal(f.getRate(),2);f.m.speakCancel()});

test('toolbar recovers panel in an already open tab and preserves toggling',async()=>{
 const f=backgroundFixture(),calls=[];let installed=false,open=false;
 f.chrome.tabs.sendMessage=async(id,message)=>{calls.push(message.question);if(!installed)throw Error('Receiving end does not exist');open=!open;return {open}};
 f.chrome.scripting={async executeScript(details){assert.equal(details.target.tabId,1);assert.deepEqual(Array.from(details.files),['left-panel.js']);assert.equal(details.world,'ISOLATED');calls.push('inject');installed=true}};
 await f.handlers.clicked({id:1,url:'https://www.youtube.com/watch?v=a'});assert.equal(open,true);assert.deepEqual(calls,['toggle_left_panel','inject','toggle_left_panel']);
 await f.handlers.clicked({id:1,url:'https://www.youtube.com/watch?v=a'});assert.equal(open,false);assert.equal(calls.filter(x=>x==='inject').length,1);
 await f.handlers.clicked({id:2,url:'https://example.com'});assert.equal(calls.length,4);
});
test('panel reinjection is idempotent and close works independently of extension messaging',()=>{
 const listeners=[],children=[],windowListeners={};let shadow,observedFrame,observeFrame,disconnected=false;
 const document={createElement(){return {style:{},isConnected:false,contentWindow:{},setAttribute(){},hasAttribute(name){return Object.hasOwn(this,name)},removeAttribute(name){delete this[name]},addEventListener(type,fn){this[type]=fn},attachShadow(){shadow={append(...items){this.items=items}};return shadow},remove(){this.isConnected=false;const index=children.indexOf(this);if(index>=0)children.splice(index,1)}}},getElementById(id){return children.find(x=>x.id===id)},documentElement:{append(host){host.isConnected=true;children.push(host)}},addEventListener(){},removeEventListener(){}};
 const context={URL,document,MutationObserver:class{constructor(fn){observeFrame=fn}observe(frame){observedFrame=frame}disconnect(){disconnected=true}},window:{addEventListener(type,fn){windowListeners[type]=fn},removeEventListener(type){delete windowListeners[type]}},chrome:{runtime:{id:'test',async getPlatformInfo(){return {os:'win'}},getURL:path=>'chrome-extension://test/'+path.replace(/^\//,''),onMessage:{addListener(fn){listeners.push(fn)},removeListener(fn){listeners.splice(listeners.indexOf(fn),1)}}}}};vm.createContext(context);
 const source=fs.readFileSync(require.resolve('../left-panel.js'),'utf8');vm.runInContext(source,context);vm.runInContext(source,context);assert.equal(listeners.length,1);
 let response;const toggle=()=>listeners[0]({question:'toggle_left_panel'},{id:'test'},value=>response=value);
 toggle();assert.equal(response.open,true);assert.match(children[0].style.cssText,/right:0!important/);assert.match(shadow.items[0].src,/ui=robot-/);
 assert.equal(observedFrame,shadow.items[0]);observedFrame.srcdoc='';observeFrame();assert.equal(Object.hasOwn(observedFrame,'srcdoc'),false);
 shadow.items[1].click();assert.equal(children.length,0);assert.equal(disconnected,true);
 toggle();const frame=shadow.items[0];windowListeners.message({source:{},origin:'chrome-extension://test',data:{type:'speaktube-close-panel'}});assert.equal(children.length,1);
 windowListeners.message({source:frame.contentWindow,origin:new URL('chrome-extension://test/').origin,data:{type:'speaktube-close-panel'}});assert.equal(children.length,0);
});

test('natural synchronization slows dense phrases gently and recovers gradually',()=>{
 const next=helpers.naturalPlayback({normal:1,current:1,remainingSpeech:5000,remainingVideo:2000});assert.equal(next,.95);
 const recovery=helpers.naturalPlayback({normal:1,current:.7});assert.equal(recovery,.725);
 for(const speech of [0,1,10000,Infinity,NaN]){const rate=helpers.naturalPlayback({normal:1,current:.8,remainingSpeech:speech,remainingVideo:0});assert.ok(Number.isFinite(rate));assert.ok(rate>=.65&&rate<=1)}
});
test('automatic mode caps voice rate, slows video, preserves manual speed and restores on cancel',()=>{
 const f=playerFixture();f.g.options.speaking_control='auto';f.g.options.rate=2;f.m.speak();const value=f.spoken[0];assert.equal(value.rate,1.08);
 value.onstart({duration:6000});assert.ok(f.getRate()<1.5);assert.ok(f.getRate()>=1.5*.65);
 f.setRate(1.25);f.m.syncNaturalPlayback();f.m.syncNaturalPlayback();assert.equal(f.getRate(),1.25);f.m.speakCancel();assert.equal(f.getRate(),1.25);
});

test('natural mode activates once and keeps later manual synchronization choices',async()=>{
 const f=backgroundFixture(false);await f.message({});assert.equal(f.store.options.speaking_control,'auto');assert.equal(f.store.options.rate,1);assert.equal(f.store.speechImprovements.natural_sync_v1,true);
 f.store.options.speaking_control='voice';f.handlers.changed({options:{}},'sync');assert.equal((await f.message({})).options.speaking_control,'voice');
});

test('automatic mode uses smooth native media rates and restores after cancellation',()=>{
 const f=playerFixture();f.video.playbackRate=1.5;f.g.options.speaking_control='auto';f.m.speak();const value=f.spoken[0];value.onstart({duration:6000});const slowed=f.video.playbackRate;
 assert.ok(slowed<1.5);assert.equal(f.video.preservesPitch,true);value.onend();assert.equal(f.video.playbackRate,slowed);
 f.m.syncNaturalPlayback();assert.ok(f.video.playbackRate>slowed);assert.ok(f.video.playbackRate<=slowed+.026);f.m.speakCancel();assert.equal(f.video.playbackRate,1.5);
});

test('leaving automatic mode restores the selected video speed',()=>{
 const f=playerFixture();f.video.playbackRate=1.5;f.g.options.speaking_control='auto';f.m.speak();f.spoken[0].onstart({duration:6000});assert.ok(f.video.playbackRate<1.5);
 f.g.options.speaking_control='voice';assert.equal(f.video.playbackRate,1.5);assert.equal(f.m.speakStabilizer.tmp.utter,null);
});



function captionDiscoveryFixture({enabled=false,captured=true,nativeToggle=false}={}){
 const source=fs.readFileSync(require.resolve('../webpage.bundle.hdh2cnbfpdin.js'),'utf8');
 const fastTimeout=(callback,ms)=>{if(ms===400||ms===1200){queueMicrotask(callback);return 0}return setTimeout(callback,ms)};
 const context={URL,Promise,setTimeout:fastTimeout,clearTimeout,document:{URL:'https://www.youtube.com/watch?v=test'},window:{}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('const getUrlX ='),source.indexOf('const _clearString ='))+';globalThis.discover=getUrlX;',context);
 let clicks=0,toggles=0;const order=[];
 const control={disabled:false,getAttribute:()=>String(enabled),click(){enabled=true;clicks++;order.push('enable')}};
 const player={getAppState:()=>5,isSubtitlesOn:()=>enabled,querySelector:()=>control,getPlayerResponse:()=>({captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'en',baseUrl:'https://www.youtube.com/api/timedtext?v=test&lang=en'}]}}})};
 if(nativeToggle)player.toggleSubtitles=()=>{enabled=!enabled;toggles++;order.push('toggle')};
 const m={getPlayer:()=>player};
 return {player,m,run:()=>context.discover(m,{options:{translate_lang:'pt',enable:1}},{sendSW(message,callback){order.push('request');const available=typeof captured==='function'?captured(toggles):captured;callback({timedtext:available?'https://www.youtube.com/api/timedtext?v=test&lang=en&playback=ready':null})}}),getClicks:()=>clicks,getToggles:()=>toggles,order};
}

test('caption discovery enables native captions before selecting the captured playback URL',async()=>{
 const f=captionDiscoveryFixture(),url=new URL(await f.run());assert.equal(f.getClicks(),1);assert.deepEqual(f.order,['enable','request']);assert.equal(url.searchParams.get('playback'),'ready');assert.equal(url.searchParams.get('tlang'),'pt');assert.equal(url.searchParams.get('fmt'),'json3');
});

test('caption discovery never substitutes the direct track URL for a missing native capture',async()=>{
 const f=captionDiscoveryFixture({enabled:true,captured:false});assert.equal(await f.run(),'');assert.equal(f.getClicks(),0);assert.equal(f.order.length,8);
});

test('caption discovery waits for the native player to be ready',async()=>{
 const f=captionDiscoveryFixture();let reads=0;f.player.getAppState=()=>++reads===1?0:5;assert.ok(await f.run());assert.equal(reads,2);assert.deepEqual(f.order,['enable','request']);
});

test('native caption refresh runs once per video and restores enabled captions',async()=>{
 const f=captionDiscoveryFixture({enabled:true,captured:toggles=>toggles===2,nativeToggle:true});assert.ok(await f.run());assert.equal(f.getToggles(),2);assert.equal(f.player.isSubtitlesOn(),true);await f.run();assert.equal(f.getToggles(),2);
 const missing=captionDiscoveryFixture({enabled:true,captured:false,nativeToggle:true});assert.equal(await missing.run(),'');await missing.run();assert.equal(missing.getToggles(),2);assert.equal(missing.player.isSubtitlesOn(),true);
});










test('native caption capture remains valid beyond two minutes',async()=>{
 const f=backgroundFixture();f.handlers.request({tabId:1,url:'https://www.youtube.com/api/timedtext?v=a&lang=en'});await new Promise(resolve=>setImmediate(resolve));
 const later=Date.now()+600000;f.context.Date={now:()=>later};assert.match((await f.message({timedtext:true,videoId:'a'},1)).timedtext,/lang=en/);
});

test('caption capture rejects expired signed URLs and requests from the previous video',async()=>{
 const f=backgroundFixture();f.handlers.request({tabId:1,url:'https://www.youtube.com/api/timedtext?v=a&lang=en&expire=1'});await new Promise(resolve=>setImmediate(resolve));assert.equal((await f.message({timedtext:true,videoId:'a'},1)).timedtext,null);
 f.handlers.request({tabId:1,url:'https://www.youtube.com/api/timedtext?v=old&lang=en'});await new Promise(resolve=>setImmediate(resolve));assert.equal((await f.message({timedtext:true,videoId:'a'},1)).timedtext,null);
});

test('automatic narration preserves delayed cues and explicit seeking still repositions them',()=>{
 const f=playerFixture();f.g.options.speaking_control='auto';f._.tts=[cue(0,'First.'),cue(2000,'Second.'),cue(4000,'Third.')];f.setTime(10);f.m.speak();assert.equal(f.spoken[0].text,'First.');assert.equal(f.m.index,0);f.m.speakCancel();f.m.rewind();assert.equal(f.m.index,2);f.m.speakCancel();
});


test('native caption refresh can use the visible caption state when the private state API is absent',async()=>{
 const f=captionDiscoveryFixture({enabled:true,captured:toggles=>toggles===2,nativeToggle:true});delete f.player.isSubtitlesOn;assert.ok(await f.run());assert.equal(f.getToggles(),2);
});


test('empty captions do not trigger another load on subsequent ticks',async()=>{
 const f=playerFixture();let attempts=0;f.m.page='';f._.init=async()=>{attempts++;return []};
 for(let i=0;i<20;i++)await f.m.init();assert.equal(attempts,1);assert.equal(f.a.badge,'No CC');
});

test('HTTP failures including 429 do not schedule automatic retries',async()=>{
 for(const status of [429,500]){const f=playerFixture();let attempts=0;f.m.page='';f._.init=async()=>{attempts++;throw Object.assign(Error('HTTP '+status),{status})};
 await f.m.init();f.context.Date={now:()=>Date.now()+3600000};for(let i=0;i<20;i++)await f.m.init();assert.equal(attempts,1);assert.equal(f.a.badge,status===429?'CCLimit':'Error');}
});

test('an explicit reset can start a new caption load after failure',async()=>{
 const f=playerFixture();let attempts=0;f.m.page='';f._.init=async()=>{attempts++;return attempts===1?[]:[cue(0,'Recovered.')]};
 await f.m.init();await f.m.init();assert.equal(attempts,1);f.m.reset();await f.m.init();assert.equal(attempts,2);assert.equal(f.spoken.length,1);f.m.speakCancel();
});


function addNetworkFixture(f,fetch){Object.assign(f.context,{fetch,AbortController,setTimeout,clearTimeout});}

test('voice companion starts once when the local voice connection is unavailable',async()=>{
 const f=backgroundFixture();let calls=0,starts=0;
 addNetworkFixture(f,async()=>{calls++;if(calls===1)throw Error('offline');return {ok:true,json:async()=>({voices:[{voiceURI:'test'}]})}});
 f.chrome.runtime.sendNativeMessage=(name,message,callback)=>{assert.equal(name,'com.speaktube.voice');assert.equal(message.command,'start');starts++;callback({ok:true,running:true})};
 const result=await f.message({question:'edge_voices'});assert.equal(starts,1);assert.equal(calls,2);assert.equal(result.voices.length,1);
});

test('upstream speech errors do not restart a working voice service',async()=>{
 const f=backgroundFixture();let starts=0;addNetworkFixture(f,async()=>({ok:false,status:502,json:async()=>({error:'Speech unavailable'})}));
 f.chrome.runtime.sendNativeMessage=()=>starts++;
 const result=await f.message({question:'edge_synthesize',text:'Test',voice:'pt-BR-FranciscaNeural'});assert.equal(result.error,'Speech unavailable');assert.equal(starts,0);
});

test('missing native companion returns an installation explanation without retry loops',async()=>{
 const f=backgroundFixture();let starts=0,calls=0;addNetworkFixture(f,async()=>{calls++;throw Error('offline')});
 f.chrome.runtime.sendNativeMessage=(name,message,callback)=>{starts++;f.chrome.runtime.lastError={message:'host not found'};callback();delete f.chrome.runtime.lastError};
 const result=await f.message({question:'edge_voices'});assert.match(result.error,/Configurar voz/);assert.equal(starts,1);assert.equal(calls,1);
});

test('installation and updates never register an automatic onboarding tab',()=>{
 const f=backgroundFixture();assert.equal(f.handlers.installed,undefined);assert.equal(f.handlers.createdTab,undefined);
});

test('untrusted senders cannot invoke native companion controls',()=>{
 const f=backgroundFixture();let called=false;const result=f.handlers.internal({question:'voice_service_start'},{id:'other'},()=>called=true);assert.equal(result,false);assert.equal(called,false);
});


test('platform discovery returns the actual Chrome platform to the page',async()=>{
 const f=backgroundFixture();f.chrome.runtime.getPlatformInfo=async()=>({os:'mac'});const result=await f.message({question:'speech_platform'});assert.equal(result.os,'mac');
});

test('Mac voice setup does not try to contact the Windows native host',async()=>{
 const f=backgroundFixture();f.chrome.runtime.getPlatformInfo=async()=>({os:'mac'});let nativeCalls=0;f.chrome.runtime.sendNativeMessage=()=>nativeCalls++;
 const result=await new Promise(resolve=>f.handlers.internal({question:'voice_service_status'},{id:'test'},resolve));assert.equal(result.nativeVoices,true);assert.equal(result.requiresInstaller,false);assert.equal(nativeCalls,0);
});

test('manual compatible Edge server is recognized without requiring a new installer',async()=>{
 const f=backgroundFixture();addNetworkFixture(f,async()=>({ok:true,json:async()=>({engine:'edge-tts',extension_id:'test'})}));let nativeCalls=0;f.chrome.runtime.sendNativeMessage=()=>nativeCalls++;
 const result=await new Promise(resolve=>f.handlers.internal({question:'voice_service_status'},{id:'test'},resolve));assert.equal(result.running,true);assert.equal(result.requiresInstaller,false);assert.equal(nativeCalls,0);
});
