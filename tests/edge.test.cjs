const test=require('node:test'),assert=require('node:assert/strict');
const {createEdgeSpeech,EdgeUtterance}=require('../edge-voice-engine.js');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class AudioFixture{constructor(){this.volume=1;this.playbackRate=1}async play(){this.onplaying?.()}pause(){}removeAttribute(){}}
function item(){const value=new EdgeUtterance('Olá');value.voice={voiceURI:'pt-BR-FranciscaNeural'};return value}
test('Edge engine caches prefetched speech and applies volume/rate',async()=>{
 let requests=0,audio;const engine=createEdgeSpeech(async()=>{requests++;return {audio:Buffer.from('ID3audio').toString('base64')}},()=>audio=new AudioFixture());
 const value=item();value.volume=.4;value.rate=1.2;let started=0,ended=0;value.onstart=()=>started++;value.onend=()=>ended++;
 await engine.prefetch(value);await engine.speak(value);assert.equal(requests,1);assert.equal(audio.volume,.4);assert.equal(audio.playbackRate,1.2);assert.equal(started,1);audio.onended();assert.equal(ended,1);assert.equal(engine.speaking,false);
});
test('cancel during Edge synthesis prevents late playback',async()=>{
 let finish,plays=0;const engine=createEdgeSpeech(()=>new Promise(resolve=>finish=resolve),()=>{plays++;return new AudioFixture()});const pending=engine.speak(item());engine.cancel();finish({audio:Buffer.from('ID3').toString('base64')});await pending;assert.equal(plays,0);assert.equal(engine.pending,false);
});
test('Edge outages surface an error without fallback to native speech',async()=>{
 const engine=createEdgeSpeech(async()=>({error:'offline'}));const value=item();let error;value.onerror=e=>error=e.error;await engine.speak(value);assert.equal(error,'edge-unavailable');assert.equal(engine.pending,false);
});
test('voice catalog updates emit a voiceschanged event',async()=>{
 const engine=createEdgeSpeech(async()=>({voices:[{voiceURI:'pt-PT-RaquelNeural',lang:'pt-PT'}]}));let events=0;engine.addEventListener('voiceschanged',()=>events++);await engine.refresh();assert.equal(engine.getVoices()[0].voiceURI,'pt-PT-RaquelNeural');assert.equal(events,1);
});

test('invalidated extension context is distinguished from Edge service outage',async()=>{
 const engine=createEdgeSpeech(async()=>{throw Error('Extension context invalidated.')});
 const value=item();let error;value.onerror=e=>error=e.error;await engine.speak(value);
 assert.equal(error,'extension-reloaded');assert.equal(engine.pending,false);
});


test('audio playback failures expose the media error and clear playback state',async()=>{
 let audio,error;const engine=createEdgeSpeech(async()=>({audio:Buffer.from('ID3audio').toString('base64')}),()=>audio=new AudioFixture());const value=item();value.onerror=e=>error=e;
 await engine.speak(value);audio.error={code:4};audio.onerror();assert.equal(error.error,'audio-playback');assert.match(error.message,/4/);assert.equal(engine.speaking,false);assert.equal(engine.pending,false);
});

test('voice activity events fire when narration starts and ends without Web Audio',async()=>{
 const {activity}=require('../edge-voice-engine.js'),seen=[];activity.addEventListener('activity',e=>seen.push(e.speaking));
 let audio;const engine=createEdgeSpeech(async()=>({audio:Buffer.from('ID3audio').toString('base64')}),()=>audio=new AudioFixture());
 await engine.speak(item());audio.onended();assert.deepEqual(seen.slice(-2),[true,false]);
});
