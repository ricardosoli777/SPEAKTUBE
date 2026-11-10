const test=require('node:test'),assert=require('node:assert/strict');
const {createDiagnostics}=require('../diagnostics.js');
test('local timing diagnostics publish bounded events and persistent counters',()=>{
 let published;const d=createDiagnostics(data=>published=data);d.update({index:2,videoMs:3000});
 for(let i=0;i<250;i++)d.record('cue-end',{index:i});
 assert.equal(published.events.length,200);assert.equal(published.counts['cue-end'],250);assert.equal(published.state.videoMs,3000);
 const snap=d.snapshot();snap.counts['cue-end']=0;assert.equal(d.snapshot().counts['cue-end'],250);
});

test('browser diagnostics use an inert hidden element under Trusted Types',()=>{
 const fs=require('node:fs'),vm=require('node:vm');let attached;
 const document={documentElement:{append(element){attached=element;element.isConnected=true}},getElementById(){return attached},createElement(tag){assert.equal(tag,'div');return {isConnected:false,textContent:''}}};
 const context={document,Date};vm.createContext(context);
 vm.runInContext(fs.readFileSync(require.resolve('../diagnostics.js'),'utf8'),context);
 assert.equal(attached.hidden,true);assert.equal(JSON.parse(attached.textContent).counts['session-start'],1);
 context.SpeakTubeDiagnostics.record('cue-start',{index:3});assert.equal(JSON.parse(attached.textContent).counts['cue-start'],1);
});
