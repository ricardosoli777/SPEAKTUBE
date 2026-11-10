const test=require('node:test'),assert=require('node:assert/strict');
const {createNativeSpeech,createPlatformSpeech,EdgeUtterance}=require('../edge-voice-engine.js');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class NativeUtterance{constructor(text){this.text=text}}
class NativeFixture extends EventTarget{
 voices=[{voiceURI:'native-pt',name:'Voz do sistema',lang:'pt-BR',localService:true}];spoken=[];cancelled=0;pauses=0;resumes=0;
 getVoices(){return this.voices}speak(item){this.spoken.push(item)}cancel(){this.cancelled++}pause(){this.pauses++}resume(){this.resumes++}
}
function utterance(voice){const item=new EdgeUtterance('Uma frase.');item.voice=voice;return item}

test('native voice preserves voice identity, language, rate, volume and events',async()=>{
 const synth=new NativeFixture(),engine=createNativeSpeech(synth,NativeUtterance);await engine.refresh();
 const item=utterance(engine.getVoices()[0]);item.rate=1.08;item.volume=0;let started=0,ended=0;item.onstart=()=>started++;item.onend=()=>ended++;
 engine.speak(item);assert.equal(engine.pending,true);const native=synth.spoken[0];assert.equal(native.voice,synth.voices[0]);assert.equal(native.lang,'pt-BR');assert.equal(native.volume,0);assert.equal(native.rate,1.08);
 native.onstart();assert.equal(engine.speaking,true);assert.equal(started,1);engine.pause();engine.resume();assert.equal(synth.pauses,1);assert.equal(synth.resumes,1);native.onend({elapsedTime:1});assert.equal(engine.speaking,false);assert.equal(ended,1);
});

test('cancelled native callbacks cannot modify the next utterance',()=>{
 const synth=new NativeFixture(),engine=createNativeSpeech(synth,NativeUtterance);let ended=0;
 const first=utterance(synth.voices[0]);first.onend=()=>ended++;engine.speak(first);const oldEnd=synth.spoken[0].onend;
 engine.cancel();engine.speak(utterance(synth.voices[0]));synth.spoken[1].onstart();oldEnd({elapsedTime:2});assert.equal(engine.speaking,true);assert.equal(ended,0);
});

test('native voice discovery responds to voices that load later',async()=>{
 const synth=new NativeFixture();synth.voices=[];const engine=createNativeSpeech(synth,NativeUtterance);await engine.refresh();assert.equal(engine.getVoices().length,0);
 synth.voices=[{voiceURI:'later',lang:'pt-BR'}];let updates=0;engine.addEventListener('voiceschanged',()=>updates++);synth.dispatchEvent(new Event('voiceschanged'));await flush();assert.equal(engine.getVoices().length,1);assert.equal(updates,1);
});

test('Mac selects native voices without any Edge TTS or installer request',async()=>{
 const synth=new NativeFixture(),calls=[];
 const engine=createPlatformSpeech({synthesis:synth,Utterance:NativeUtterance,platformHint:'Win32',request:async message=>{calls.push(message.question);if(message.question==='speech_platform')return {os:'mac'};throw Error('Edge must not be requested on Mac')}});
 await engine.ready;assert.equal(engine.platform,'mac');assert.equal(engine.backend,'native');assert.equal(engine.isEdge,false);
 await engine.speak(utterance(engine.getVoices()[0]));assert.equal(synth.spoken.length,1);await engine.refresh();assert.deepEqual(calls,['speech_platform']);engine.cancel();
});

test('Windows without Edge TTS can use system voices',async()=>{
 const synth=new NativeFixture(),calls=[];const engine=createPlatformSpeech({synthesis:synth,Utterance:NativeUtterance,request:async message=>{calls.push(message.question);return message.question==='speech_platform'?{os:'win'}:{error:'not installed'}}});
 await engine.ready;assert.equal(engine.platform,'win');assert.equal(engine.backend,'native');assert.equal(engine.getVoices().length,1);await engine.speak(utterance(engine.getVoices()[0]));assert.equal(synth.spoken.length,1);assert.deepEqual(calls,['speech_platform','edge_voices']);engine.cancel();
});

test('Windows with an available Edge catalog prefers neural voices',async()=>{
 const synth=new NativeFixture(),edgeVoice={voiceURI:'edge-pt',lang:'pt-BR'};
 const engine=createPlatformSpeech({synthesis:synth,Utterance:NativeUtterance,request:async m=>m.question==='speech_platform'?{os:'win'}:{voices:[edgeVoice]}});
 await engine.ready;assert.equal(engine.backend,'edge');assert.equal(engine.isEdge,true);assert.equal(engine.getVoices()[0].voiceURI,'edge-pt');assert.equal(synth.spoken.length,0);
});

test('native narration is not interrupted when Edge TTS becomes available',async()=>{
 const synth=new NativeFixture();let edgeReady=false;
 const engine=createPlatformSpeech({synthesis:synth,Utterance:NativeUtterance,request:async m=>m.question==='speech_platform'?{os:'win'}:edgeReady?{voices:[{voiceURI:'edge-pt',lang:'pt-BR'}]}:{error:'not installed'}});
 await engine.ready;await engine.speak(utterance(engine.getVoices()[0]));synth.spoken[0].onstart();edgeReady=true;await engine.refresh();assert.equal(engine.backend,'native');assert.equal(synth.cancelled,0);
 synth.spoken[0].onend({elapsedTime:1});assert.equal(engine.getVoices()[0].voiceURI,'edge-pt');assert.equal(engine.backend,'edge');
});

test('cancellation during platform discovery prevents late native speech',async()=>{
 let resolve;const synth=new NativeFixture();const engine=createPlatformSpeech({synthesis:synth,Utterance:NativeUtterance,request:()=>new Promise(r=>resolve=r)});
 const pending=engine.speak(utterance(synth.voices[0]));engine.cancel();resolve({os:'mac'});await pending;assert.equal(synth.spoken.length,0);
});

test('missing native support reports an error instead of attempting Edge on Mac',async()=>{
 const calls=[];const engine=createPlatformSpeech({request:async m=>{calls.push(m.question);return {os:'mac'}}});await engine.ready;
 let error;const item=utterance(null);item.onerror=e=>error=e.error;await engine.speak(item);assert.equal(error,'native-unavailable');assert.deepEqual(calls,['speech_platform']);
});
