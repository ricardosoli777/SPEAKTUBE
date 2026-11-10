/* First-run voice installation and explicit verification. No page data is read. */
(()=>{
 const $=id=>document.getElementById(id);let activeAudio=null;
 function status(text,state=''){ $('status').textContent=text;$('status').dataset.state=state; }
 function busy(value){for(const id of ['check','start','preview'])$(id).disabled=value}
 async function request(message){
  if(!globalThis.chrome?.runtime?.sendMessage)throw Error('Esta e uma previa. Abra esta configuracao pela extensao instalada.');
  return await chrome.runtime.sendMessage(message);
 }
 async function check(){
  busy(true);status('Verificando a instalacao...');
  try{const result=await request({question:'voice_service_status'});
   if(!result?.installed){status('O Servico de Voz ainda nao esta conectado. Baixe e execute o instalador; depois clique em Verificar instalacao.','error');return}
   status(result.running?'Tudo pronto: o servico esta instalado e ativo. Voce pode testar a voz.':'Instalacao encontrada. Clique em Iniciar servico para prepara-lo.',result.running?'ok':'');
  }catch(error){status(error.message,'error')}finally{busy(false)}
 }
 $('check').addEventListener('click',check);
 $('start').addEventListener('click',async()=>{
  busy(true);status('Iniciando o Servico de Voz...');
  try{const result=await request({question:'voice_service_start'});if(!result?.ok||!result.running)throw Error(result?.error||'Nao foi possivel iniciar o servico.');status('Servico de voz ativo. Clique em Ouvir frase de teste.','ok')}
  catch(error){status(error.message,'error')}finally{busy(false)}
 });
 $('preview').addEventListener('click',async()=>{
  busy(true);status('Gerando a frase de teste...');
  try{const result=await request({question:'edge_synthesize',text:'Ola! O SpeakTube esta pronto para narrar seus videos.',voice:'pt-BR-FranciscaNeural',pitch:0});if(result?.error||!result?.audio)throw Error(result?.error||'A voz nao retornou audio.');
   if(activeAudio){activeAudio.pause();activeAudio=null}
   const bytes=Uint8Array.from(atob(result.audio),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));const audio=new Audio(url);activeAudio=audio;
   const release=()=>{URL.revokeObjectURL(url);if(activeAudio===audio)activeAudio=null;busy(false)};
   audio.onended=()=>{release();status('Teste concluido. Abra um video com legendas no YouTube.','ok')};audio.onerror=()=>{release();status('O audio foi gerado, mas nao pode ser reproduzido.','error')};
   await audio.play();status('Reproduzindo a voz do SpeakTube...','ok');
  }catch(error){status(error.message,'error');busy(false)}
 });
 window.addEventListener('pagehide',()=>activeAudio?.pause());check();
})();
