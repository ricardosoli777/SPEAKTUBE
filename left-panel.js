/* SpeakTube panel host: independent close control and versioned frame. */
(()=>{
 const key='__speakTubePanelController',revision='robot-20261110-v4';
 if(globalThis[key]?.revision===revision)return;
 globalThis[key]?.dispose();
 document.getElementById('speaktube-panel-host')?.remove();
 let host=null,frame=null,frameObserver=null;
 function close(){frameObserver?.disconnect();frameObserver=null;host?.remove();host=null;frame=null;document.removeEventListener('keydown',escape)}
 function escape(event){if(event.key==='Escape')close()}
 function receive(event){
  if(!frame||event.source!==frame.contentWindow||event.origin!==new URL(chrome.runtime.getURL('/')).origin)return;
  if(event.data?.type==='speaktube-close-panel')close();
 }
 function open(){
  if(host?.isConnected){close();return}
  close();
  host=document.createElement('div');host.id='speaktube-panel-host';
  host.style.cssText='all:initial!important;position:fixed!important;right:0!important;top:0!important;width:min(420px,100vw)!important;height:100dvh!important;z-index:2147483647!important;display:block!important;';
  const shadow=host.attachShadow({mode:'open'});
  frame=document.createElement('iframe');frame.src=chrome.runtime.getURL('popup.html')+'?ui='+revision;frame.title='SpeakTube';frame.allow='autoplay';
  frame.style.cssText='width:100%;height:100%;border:0;background:#101319;box-shadow:-12px 0 48px #0006;';
  const button=document.createElement('button');button.type='button';button.textContent='×';button.title='Fechar SpeakTube';button.setAttribute('aria-label','Fechar SpeakTube');
  button.style.cssText='position:absolute;right:12px;top:10px;width:32px;height:32px;border:1px solid #64748b;border-radius:8px;background:#101319;color:white;font:24px sans-serif;cursor:pointer;z-index:2;';
  button.addEventListener('click',close);
  shadow.append(frame,button);document.documentElement.append(host);
  // An empty srcdoc overrides src and leaves the extension panel blank.
  const panelFrame=frame;
  const restoreSource=()=>{if(panelFrame.hasAttribute('srcdoc'))panelFrame.removeAttribute('srcdoc')};
  frameObserver=new MutationObserver(restoreSource);frameObserver.observe(panelFrame,{attributes:true,attributeFilter:['srcdoc']});restoreSource();
  document.addEventListener('keydown',escape);
 }
 function message(message,sender,respond){
  if(sender.id!==chrome.runtime.id)return;
  if(message.question==='toggle_left_panel'){open();respond({open:!!host})}
  if(message.question==='close_left_panel'){close();respond({open:false})}
 }
 chrome.runtime.onMessage.addListener(message);window.addEventListener('message',receive);
 globalThis[key]={revision,dispose(){close();window.removeEventListener('message',receive);chrome.runtime.onMessage.removeListener(message)}};
})();
