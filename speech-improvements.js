/* Readable speech helpers; loaded before the original player bundle. */
(function (root) {
  function groupCaptions(captions) {
    const result = [];
    for (const caption of captions) {
      if (!Number.isFinite(caption.time) || !caption.text?.trim()) continue;
      const next = { ...caption, text: caption.text.trim() };
      const previous = result[result.length - 1];
      const end = previous && previous.time + (previous.dDurationMs || 0);
      if (previous && !/[.!?。！？]["'”’)]*$/.test(previous.text)
          && next.time >= previous.time && next.time - end <= 700
          && next.time - previous.time <= 6000
          && previous.text.length + next.text.length + 1 <= 220) {
        previous.text += ' ' + next.text;
        previous.dDurationMs = Math.max(end, next.time + (next.dDurationMs || 0)) - previous.time;
      } else result.push(next);
    }
    return result;
  }
  function captionIndex(captions, time) {
    let low = 0, high = captions.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (captions[mid].time <= time) low = mid + 1;
      else high = mid;
    }
    return Math.max(0, low - 1);
  }
  function createAudioControl() {
    let video = null, original = 1, reduced = 1;
    function restore() {
      if (!video) return;
      const target = video;
      video = null;
      target.removeEventListener('pause', restore);
      target.removeEventListener('emptied', restore);
      // Preserve volume adjustments made by the viewer during narration.
      if (Math.abs(target.volume - reduced) < 0.001) target.volume = original;
    }
    return {
      start(target, factor = 0.25) {
        restore();
        if (!target || target.paused || target.muted) return;
        video = target;
        original = target.volume;
        reduced = original * Math.min(1, Math.max(0, Number.isFinite(Number(factor)) ? Number(factor) : 0.25));
        target.volume = reduced;
        target.addEventListener('pause', restore);
        target.addEventListener('emptied', restore);
      }, restore
    };
  }

  function selectVoice(voices, index, language, automatic) {
    const selected = voices[Number(index)];
    if (!automatic && selected) return selected;
    const wanted = String(language || '').toLowerCase().replace('_', '-');
    if (automatic && /^pt-/.test(wanted)) return voices.find(v => v.lang.toLowerCase() === wanted && v.default) || voices.find(v => v.lang.toLowerCase() === wanted);
    return voices.find(v => v.lang.toLowerCase() === wanted)
      || voices.find(v => v.lang.toLowerCase().split('-')[0] === wanted.split('-')[0])
      || selected || voices.find(v => v.default) || voices[0];
  }
  function speechRate({ base = 1, maximum = 1.4, letters = 0, msLetter = 88,
      available = 1000, delay = 0, previous }) {
    base = Math.max(0.1, Number(base) || 1);
    maximum = Math.max(base, Number(maximum) || base);
    const duration = Math.max(1, letters * (Number(msLetter) || 88));
    const desired = Math.max(base, Math.min(maximum, duration / Math.max(250, available - Math.max(0, delay))));
    return Number(Math.max(base, Math.min(maximum, Number.isFinite(previous)
      ? Math.max(previous - 0.15, Math.min(previous + 0.15, desired)) : desired)).toFixed(2));
  }
  function naturalPlayback({normal = 1, current = normal, remainingSpeech = 0, remainingVideo = 0}) {
    normal = Math.max(.25, Math.min(2, Number(normal) || 1));
    current = Math.max(.25, Math.min(2, Number(current) || normal));
    const speech = Math.max(0, Number(remainingSpeech) || 0);
    const room = Math.max(0, Number(remainingVideo) || 0);
    // Small dead band and gradual steps avoid jumping between phrases.
    const target = speech > 200 ? Math.max(normal * .65, Math.min(normal, room / (speech + 120))) : normal;
    const next = Math.abs(target-current) < .025 ? current : current + Math.max(-.05, Math.min(.025, target-current));
    return Number(Math.max(normal * .65, Math.min(normal, next)).toFixed(3));
  }
  function voiceLanguage(language, locale) {
    return String(language).toLowerCase().split('-')[0] === 'pt' ? (locale === 'pt-PT' ? 'pt-PT' : 'pt-BR') : language;
  }
  const api = { groupCaptions, captionIndex, createAudioControl, selectVoice, speechRate, naturalPlayback, voiceLanguage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YSSSpeechImprovements = api;
})(globalThis);
