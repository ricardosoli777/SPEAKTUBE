/* Local-only timing diagnostics. No subtitle text or audio is recorded. */
(function(root){
 function createDiagnostics(publish=()=>{}){
  const events=[],counts={},started=Date.now();let state={},sequence=0;
  function render(){publish({version:1,started,at:Date.now(),counts:{...counts},state:{...state},events:events.slice()})}
  return {
   record(type,data={}){counts[type]=(counts[type]||0)+1;events.push({sequence:++sequence,at:Date.now(),type,...data});if(events.length>200)events.shift();render()},
   update(data){Object.assign(state,data);render()},
   snapshot(){return {started,counts:{...counts},state:{...state},events:events.slice()}}
  };
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={createDiagnostics};return}
 let element=null;
 root.SpeakTubeDiagnostics=createDiagnostics(data=>{
  if(!document.documentElement)return;
  if(!element?.isConnected){element=document.getElementById('speaktube-diagnostics')||document.createElement('div');element.id='speaktube-diagnostics';element.hidden=true;if(!element.isConnected)document.documentElement.append(element)}
  element.textContent=JSON.stringify(data);
 });
 root.SpeakTubeDiagnostics.record('session-start');
})(globalThis);
