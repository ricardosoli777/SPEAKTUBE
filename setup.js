/* Optional voice setup. Never opens automatically on installation. */
(()=>{
 const $=id=>document.getElementById(id);let utterance=null;
 function status(text,state=''){ $('status').textContent=text;$('status').dataset.state=state; }
 function busy(value){for(const id of ['check','start','preview'])$(id).disabled=value}
 async function request(message){return await chrome.runtime.sendMessage(message)}
 function platformUI(){
  const windows=YSSVoiceEngine.platform==='win';
  for(const id of ['download','start','install-step-list','service-components'])$(id).hidden=!windows;
  if(!windows){$('platform-intro').textContent='O SpeakTube usa as vozes disponiveis no seu sistema, sem instalar Edge TTS.';$('steps').textContent='Vozes do seu sistema';$('check').textContent='Atualizar vozes'}
 }
 async function check(){
  busy(true);status('Verificando as vozes disponiveis...');
  try{
   await YSSVoiceEngine.ready;await YSSVoiceEngine.refresh();platformUI();
   if(YSSVoiceEngine.platform!=='win'){
    const count=YSSVoiceEngine.getVoices().length;status(count?`${count} vozes do sistema disponiveis. Nenhum instalador e necessario.`:'Nao foram encontradas vozes. Confira as vozes de acessibilidade/fala instaladas no sistema.',count?'ok':'error');return;
   }
   const result=await request({question:'voice_service_status'});
   if(result?.running){status('Edge TTS encontrado e ativo. Voce pode testar a voz.','ok');return}
   if(result?.installed){status('Servico encontrado. Clique em Iniciar servico para usar as vozes neurais.');return}
   status('As vozes do Windows podem ser usadas agora. Para experimentar vozes neurais, baixe e execute o instalador opcional do Edge TTS.');
  }catch(error){status(error.message,'error')}finally{busy(false)}
 }
 $('check').addEventListener('click',check);
 $('start').addEventListener('click',async()=>{
  busy(true);status('Iniciando o Servico de Voz...');
  try{const result=await request({question:'voice_service_start'});if(!result?.ok||!result.running)throw Error(result?.error||'Nao foi possivel iniciar o servico.');await YSSVoiceEngine.refresh();status('Edge TTS ativo. Clique em Ouvir frase de teste.','ok')}
  catch(error){status(error.message,'error')}finally{busy(false)}
 });
 $('preview').addEventListener('click',async()=>{
  if(utterance){YSSVoiceEngine.cancel();utterance=null;busy(false);return}
  busy(true);status('Preparando a frase de teste...');
  try{
   await YSSVoiceEngine.ready;const voices=YSSVoiceEngine.getVoices();const voice=voices.find(v=>v.lang==='pt-BR')||voices.find(v=>v.lang.startsWith('pt'))||voices[0];
   if(!voice)throw Error('Nenhuma voz disponivel. Confira as vozes instaladas no sistema.');
   const item=new YSSUtterance(voice.lang.startsWith('pt')?'Ola! O SpeakTube esta pronto para narrar seus videos.':'Hello! SpeakTube is ready to read your video captions.');utterance=item;
   item.voice=voice;item.lang=voice.lang;item.rate=1;item.pitch=1;item.volume=1;
   item.onend=()=>{if(utterance!==item)return;utterance=null;busy(false);status('Teste concluido. Abra um video com legendas no YouTube.','ok')};
   item.onerror=e=>{if(utterance!==item)return;utterance=null;busy(false);status(e.message||'Nao foi possivel reproduzir a voz.','error')};
   YSSVoiceEngine.speak(item);status('Reproduzindo a voz do SpeakTube...','ok');
  }catch(error){utterance=null;status(error.message,'error');busy(false)}
 });
 window.addEventListener('pagehide',()=>YSSVoiceEngine.cancel());check();
})();
