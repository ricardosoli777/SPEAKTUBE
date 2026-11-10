/* Additional settings use their own key, preserving legacy popup writes. */
(async () => {
  const pt = navigator.language.startsWith('pt');
  const labels = pt ? {
    title: 'Melhorias de narração', group: 'Agrupar legendas em frases', voice: 'Escolher voz pelo idioma',
    duck: 'Reduzir áudio original durante a fala', level: 'Volume original durante a fala',
    loading: 'Carregando…', saved: 'Salvo', error: 'Não foi possível salvar. Tente novamente.',
    status: 'Estado', idle: 'Abra um vídeo do YouTube', retry: 'Recarregue o vídeo para aplicar o agrupamento.'
  } : {
    title: 'Narration improvements', group: 'Group captions into sentences', voice: 'Choose voice by language',
    duck: 'Lower original audio during narration', level: 'Original volume during narration',
    loading: 'Loading…', saved: 'Saved', error: 'Could not save. Please try again.',
    status: 'Status', idle: 'Open a YouTube video', retry: 'Reload the video to apply sentence grouping.'
  };
  const panel = document.createElement('fieldset'); panel.className = 'speech-improvements';
  const legend = document.createElement('legend'); legend.textContent = labels.title; panel.append(legend);
  const saveState = document.createElement('p'); saveState.setAttribute('role', 'status'); saveState.textContent = labels.loading;
  const fields = {};
  for (const [key, text] of [['group_sentences', labels.group], ['auto_voice', labels.voice], ['duck_audio', labels.duck]]) {
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.id = 'improvement_' + key; input.disabled = true;
    label.append(input, document.createTextNode(' ' + text)); panel.append(label); fields[key] = input;
  }
  const levelLabel = document.createElement('label'), level = document.createElement('input'), output = document.createElement('output');
  level.type = 'range'; level.min = '0'; level.max = '100'; level.step = '5'; level.id = 'original_audio_level'; level.disabled = true;
  levelLabel.htmlFor = level.id; levelLabel.textContent = labels.level; levelLabel.append(output);
  panel.append(levelLabel, level);
  const hint = document.createElement('small'); hint.textContent = labels.retry; panel.append(hint, saveState);
  const status = document.createElement('p'); status.setAttribute('aria-live', 'polite'); panel.append(status);
  document.querySelector('#wrapper').append(panel);
  let settings = { group_sentences: true, auto_voice: true, duck_audio: true, original_volume: .25 };
  function render() {
    for (const [key, input] of Object.entries(fields)) { input.checked = settings[key]; input.disabled = false; }
    level.value = Math.round(settings.original_volume * 100); level.disabled = !settings.duck_audio;
    output.textContent = ' ' + level.value + '%';
  }
  try { const data = await chrome.storage.sync.get('speechImprovements'); Object.assign(settings, data.speechImprovements); render(); saveState.textContent = ''; }
  catch { saveState.textContent = labels.error; }
  // Serialize writes so moving the slider cannot let older saves win.
  let queue = Promise.resolve();
  function save() {
    const snapshot = { ...settings };
    queue = queue.catch(() => {}).then(() => chrome.storage.sync.set({ speechImprovements: snapshot }));
    queue.then(() => { saveState.textContent = labels.saved; }, () => { saveState.textContent = labels.error; });
  }
  for (const [key, input] of Object.entries(fields)) input.addEventListener('change', () => { settings[key] = input.checked; render(); save(); });
  level.addEventListener('input', () => { output.textContent = ' ' + level.value + '%'; });
  level.addEventListener('change', () => { settings.original_volume = Number(level.value) / 100; save(); });
  async function refresh() {
    try {
      const response = await chrome.runtime.sendMessage({ question: 'now_playing' });
      const names = pt ? { Idle: labels.idle, Loading: 'Buscando legendas', 'No CC': 'Vídeo sem legendas disponíveis', Voice: 'Aguardando uma voz disponível', Error: 'Falha ao carregar legendas', Ready: 'Pronto', Speak: 'Narrando', End: 'Legendas concluídas', Off: 'Desligado', On: 'Ligado' } : {};
      status.textContent = labels.status + ': ' + (names[response?.status] || response?.status || labels.idle);
    } catch { status.textContent = labels.status + ': ' + labels.error; }
  }
  await refresh(); setInterval(refresh, 1500);
})();
