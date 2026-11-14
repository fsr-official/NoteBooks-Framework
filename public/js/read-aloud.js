(function (global) {
  'use strict';

  const GREEK_NAMES = new Map([
    ['Α', 'capital Alpha'], ['Β', 'capital Beta'], ['Γ', 'capital Gamma'], ['Δ', 'capital Delta'],
    ['Ε', 'capital Epsilon'], ['Ζ', 'capital Zeta'], ['Η', 'capital Eta'], ['Θ', 'capital Theta'],
    ['Ι', 'capital Iota'], ['Κ', 'capital Kappa'], ['Λ', 'capital Lambda'], ['Μ', 'capital Mu'],
    ['Ν', 'capital Nu'], ['Ξ', 'capital Xi'], ['Ο', 'capital Omicron'], ['Π', 'capital Pi'],
    ['Ρ', 'capital Rho'], ['Σ', 'capital Sigma'], ['Τ', 'capital Tau'], ['Υ', 'capital Upsilon'],
    ['Φ', 'capital Phi'], ['Χ', 'capital Chi'], ['Ψ', 'capital Psi'], ['Ω', 'capital Omega'],
    ['α', 'alpha'], ['β', 'beta'], ['γ', 'gamma'], ['δ', 'delta'], ['ε', 'epsilon'],
    ['ζ', 'zeta'], ['η', 'eta'], ['θ', 'theta'], ['ι', 'iota'], ['κ', 'kappa'],
    ['λ', 'lambda'], ['μ', 'mu'], ['ν', 'nu'], ['ξ', 'xi'], ['ο', 'omicron'],
    ['π', 'pi'], ['ρ', 'rho'], ['ς', 'final sigma'], ['σ', 'sigma'], ['τ', 'tau'],
    ['υ', 'upsilon'], ['φ', 'phi'], ['χ', 'chi'], ['ψ', 'psi'], ['ω', 'omega']
  ]);
  const LATIN_NAMES = {
    a: 'ay', b: 'bee', c: 'see', d: 'dee', e: 'ee', f: 'eff', g: 'jee',
    h: 'aitch', i: 'eye', j: 'jay', k: 'kay', l: 'ell', m: 'em', n: 'en',
    o: 'oh', p: 'pee', q: 'cue', r: 'are', s: 'ess', t: 'tee', u: 'you',
    v: 'vee', w: 'double you', x: 'ex', y: 'why', z: 'zee'
  };
  const GREEK_COMMANDS = {};
  GREEK_NAMES.forEach((name, letter) => {
    const key = name.replace(/^capital /, '').toLowerCase();
    GREEK_COMMANDS[name.startsWith('capital ') ? key[0].toUpperCase() + key.slice(1) : key] = letter;
  });
  const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION',
    'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'LI', 'MAIN',
    'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL'
  ]);
  const SKIP_SELECTOR = [
    'script', 'style', 'svg', 'button', 'input', 'textarea', 'select', '[aria-hidden="true"]',
    '[hidden]', '.speech-controls', '.obsidian-mermaid', '.tikz-source', '.desmos-block',
    '.desmos3d-block', '.content-update-notice'
  ].join(',');
  const controllers = new Set();
  let activeController = null;
  let controllerId = 0;
  const getPreference = (key, fallback = '') => {
    try {
      return global.localStorage?.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  };
  const setPreference = (key, value) => {
    try {
      global.localStorage?.setItem(key, value);
    } catch {
      return;
    }
  };
  const isGreekLetter = (character) => /\p{Script=Greek}/u.test(character);
  const greekName = (character) => {
    const direct = GREEK_NAMES.get(character);
    if (direct) return direct;
    const base = character.normalize('NFD').replace(/\p{M}/gu, '');
    return GREEK_NAMES.get(base) || GREEK_NAMES.get(base.toUpperCase());
  };

  function transformGreekText(value, inMath) {
    const characters = Array.from(String(value || ''));
    const greekRuns = [];
    for (let index = 0; index < characters.length;) {
      if (!isGreekLetter(characters[index])) {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < characters.length && isGreekLetter(characters[end])) end += 1;
      greekRuns.push({ start: index, end });
      index = end;
    }

    let sourceOffset = 0;
    return characters.map((character, index) => {
      const run = greekRuns.find((item) => index >= item.start && index < item.end);
      const start = sourceOffset;
      sourceOffset += character.length;
      const end = sourceOffset;
      const spoken = run && (inMath || run.end - run.start === 1)
        ? `${inMath && index > run.start ? ' ' : ''}${greekName(character)}`
        : character;
      return { text: spoken, start, end };
    });
  }

  function normalizeGreekText(value, inMath) {
    return transformGreekText(value, inMath).map((part) => part.text).join('');
  }

  function mathToSpeech(source) {
    let text = String(source || '')
      .replace(/\\(?:left|right|displaystyle|textstyle)\b/g, '')
      .replace(/\\(?:mathrm|mathbf|mathit|operatorname|text)\{([^{}]*)\}/g, '$1')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, ' fraction $1 over $2 ')
      .replace(/\\sqrt\{([^{}]+)\}/g, ' square root of $1 ')
      .replace(/\\(varepsilon|vartheta|varpi|varrho|varsigma|varphi|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega)\b/g, (_match, name) => {
        const variantNames = { varepsilon: 'epsilon', vartheta: 'theta', varpi: 'pi', varrho: 'rho', varsigma: 'sigma', varphi: 'phi' };
        const letter = GREEK_COMMANDS[name] || GREEK_COMMANDS[variantNames[name]];
        return letter ? GREEK_NAMES.get(letter) : name;
      })
      .replace(/\\(?:times|cdot)\b/g, ' times ')
      .replace(/\\(?:div)\b/g, ' divided by ')
      .replace(/\\(?:pm)\b/g, ' plus or minus ')
      .replace(/\\(?:leq?|le)\b/g, ' less than or equal to ')
      .replace(/\\(?:geq?|ge)\b/g, ' greater than or equal to ')
      .replace(/\\neq\b/g, ' not equal to ')
      .replace(/\\infty\b/g, ' infinity ')
      .replace(/\\sum\b/g, ' sum ')
      .replace(/\\int\b/g, ' integral ')
      .replace(/\\([A-Za-z]+)\b/g, '$1')
      .replace(/([A-Za-z0-9])\^\{?2\}?/g, '$1 squared')
      .replace(/([A-Za-z0-9])\^\{?3\}?/g, '$1 cubed')
      .replace(/\^/g, ' to the power of ')
      .replace(/_/g, ' sub ')
      .replace(/[{}\\()[\]]/g, ' ')
      .replace(/[=]/g, ' equals ')
      .replace(/[+]/g, ' plus ')
      .replace(/-/g, ' minus ')
      .replace(/[*·]/g, ' times ')
      .replace(/[/]/g, ' over ')
      .replace(/[<>]/g, (symbol) => symbol === '<' ? ' less than ' : ' greater than ')
      .replace(/\p{Script=Greek}+/gu, (letters) => Array.from(letters, (letter) => greekName(letter) || letter).join(' '))
      .replace(/\b([A-Za-z])\b/g, (letter) => {
        const name = LATIN_NAMES[letter.toLowerCase()];
        return name ? `${letter === letter.toUpperCase() ? 'capital ' : ''}${name}` : letter;
      })
      .replace(/\s+/g, ' ')
      .trim();
    return text;
  }

  function appendMapped(text, source, output, ranges) {
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (/\s/.test(character)) {
        if (!output.value || output.value.endsWith(' ')) continue;
        output.value += ' ';
        ranges.push(source);
      } else {
        output.value += character;
        ranges.push(source);
      }
    }
  }

  function buildSpeechModel(root) {
    const output = { value: '' };
    const ranges = [];
    const separator = () => {
      if (output.value && !output.value.endsWith(' ')) {
        output.value += ' ';
        ranges.push(null);
      }
    };

    const visit = (node, inMath = false) => {
      if (node.nodeType === 3) {
        const value = node.nodeValue || '';
        transformGreekText(value, inMath).forEach((part) => {
          appendMapped(part.text, { node, start: part.start, end: part.end }, output, ranges);
        });
        return;
      }
      if (node.nodeType !== 1) return;
      const element = node;
      if (element.matches?.(SKIP_SELECTOR)) return;
      if (element.hasAttribute?.('data-math')) {
        separator();
        const spoken = mathToSpeech(element.getAttribute('data-math'));
        appendMapped(spoken, { element }, output, ranges);
        separator();
        return;
      }
      const isBlock = BLOCK_TAGS.has(element.tagName);
      if (isBlock) separator();
      if (element.tagName === 'IMG') {
        const alt = element.getAttribute('alt');
        if (alt) appendMapped(`Image: ${alt}`, { element }, output, ranges);
      } else {
        for (const child of element.childNodes) visit(child, inMath || element.classList?.contains('math'));
      }
      if (isBlock) separator();
    };
    visit(root);

    const text = output.value.trim();
    const leadingOffset = output.value.length - output.value.trimStart().length;
    const trimmedRanges = ranges.slice(leadingOffset, leadingOffset + text.length);
    const words = [];
    const wordPattern = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
    for (const match of text.matchAll(wordPattern)) {
      words.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    }
    return { text, ranges: trimmedRanges, words };
  }

  function makeChunks(text) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      while (/\s/.test(text[start] || '')) start += 1;
      if (start >= text.length) break;
      const limit = Math.min(text.length, start + 280);
      let end = limit;
      if (limit < text.length) {
        const boundary = text.slice(start, limit).search(/[.!?;:\n](?:\s|$)/);
        const lastSpace = text.lastIndexOf(' ', limit);
        if (boundary >= 0) end = start + boundary + 1;
        else if (lastSpace > start) end = lastSpace;
      }
      if (end <= start) end = Math.min(text.length, start + 280);
      while (end < text.length && /\s/.test(text[end])) end += 1;
      chunks.push({ start, end, text: text.slice(start, end).trim() });
      start = end;
    }
    return chunks;
  }

  function rankVoices(voices, preferredLanguage) {
    const language = String(preferredLanguage || '').toLowerCase();
    const baseLanguage = language.split('-')[0];
    const qualityHints = /\b(natural|neural|premium|enhanced)\b/i;
    return [...voices].sort((a, b) => {
      const score = (voice) => {
        const voiceLanguage = String(voice.lang || '').toLowerCase();
        const name = String(voice.name || '');
        let value = 0;
        if (voiceLanguage === language) value += 100;
        else if (baseLanguage && voiceLanguage.split('-')[0] === baseLanguage) value += 70;
        if (qualityHints.test(name)) value += 20;
        if (/\bonline\b/i.test(name)) value += 5;
        if (/\bgoogle\b/i.test(name)) value += 2;
        if (voice.default) value += 1;
        return value;
      };
      return score(b) - score(a) || String(a.name).localeCompare(String(b.name));
    });
  }

  function rangeForWord(model, word) {
    const start = model.ranges[word.start];
    const end = model.ranges[Math.max(word.start, word.end - 1)];
    if (!start || !end) return null;
    const range = document.createRange();
    if (start.element || end.element) {
      const element = start.element || end.element;
      range.selectNodeContents(element);
      return range;
    }
    try {
      range.setStart(start.node, start.start);
      range.setEnd(end.node, end.end);
      return range;
    } catch {
      return null;
    }
  }

  function createController(toolbar, content) {
    controllerId += 1;
    const highlightName = 'notebooks-speech-word';
    const controls = document.createElement('div');
    controls.className = 'read-aloud-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Read aloud controls');

    const previous = document.createElement('button');
    previous.type = 'button';
    previous.textContent = '← Word';
    previous.setAttribute('aria-label', 'Go back one word');
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'read-aloud-play';
    play.textContent = '▶ Listen';
    play.setAttribute('aria-label', 'Read this note aloud');
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = 'Word →';
    next.setAttribute('aria-label', 'Go forward one word');
    const rateLabel = document.createElement('label');
    rateLabel.className = 'read-aloud-rate';
    rateLabel.textContent = 'Pace';
    const rate = document.createElement('input');
    rate.type = 'range';
    rate.min = '0.75';
    rate.max = '1.25';
    rate.step = '0.05';
    rate.value = getPreference('notebooks-read-aloud-rate', '1');
    rate.setAttribute('aria-label', 'Speech pace');
    const rateValue = document.createElement('span');
    rateValue.textContent = `${Number(rate.value).toFixed(2)}×`;
    rateLabel.append(rate, rateValue);

    const voiceLabel = document.createElement('label');
    voiceLabel.className = 'read-aloud-voice';
    voiceLabel.textContent = 'Voice';
    const voiceSelect = document.createElement('select');
    voiceSelect.setAttribute('aria-label', 'Speech voice; natural and neural voices are recommended when available');
    voiceLabel.appendChild(voiceSelect);

    const status = document.createElement('span');
    status.className = 'read-aloud-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    controls.append(previous, play, next, rateLabel, voiceLabel, status);
    toolbar.after(controls);

    const synth = global.speechSynthesis;
    const supported = Boolean(synth && typeof global.SpeechSynthesisUtterance === 'function');
    const model = buildSpeechModel(content);
    const chunks = makeChunks(model.text);
    let currentWord = -1;
    let active = false;
    let destroyed = false;
    let activeBlock = null;
    let utteranceId = 0;

    if (!supported) {
      play.disabled = true;
      status.textContent = 'Read aloud is not supported by this browser.';
    } else {
      status.textContent = 'Press Listen to begin. Use ←/→ to move a word; Escape stops. Voice quality depends on your device; choose a Natural/Neural voice if available.';
    }

    function populateVoices() {
      if (!supported) return;
      const savedVoice = getPreference('notebooks-read-aloud-voice');
      const selectedVoice = voiceSelect.value || savedVoice;
      const language = document.documentElement.lang || global.navigator?.language || 'en-US';
      const voices = rankVoices(synth.getVoices(), language);
      voiceSelect.replaceChildren();
      voices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = voice.voiceURI;
        option.textContent = `${index === 0 ? 'Recommended · ' : ''}${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
      });
      if ([...voiceSelect.options].some((option) => option.value === selectedVoice)) {
        voiceSelect.value = selectedVoice;
      } else if (voices.length) {
        voiceSelect.value = voices[0].voiceURI;
        setPreference('notebooks-read-aloud-voice', voiceSelect.value);
      } else {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Device default';
        voiceSelect.appendChild(defaultOption);
      }
    }

    function clearHighlight() {
      if (global.CSS?.highlights) global.CSS.highlights.delete(highlightName);
      if (activeBlock) activeBlock.classList.remove('speech-reading-block');
      activeBlock = null;
    }

    function highlightWord(index) {
      const word = model.words[index];
      if (!word) return;
      currentWord = index;
      const range = rangeForWord(model, word);
      clearHighlight();
      if (range && global.CSS?.highlights && typeof global.Highlight === 'function') {
        global.CSS.highlights.set(highlightName, new global.Highlight(range));
      }
      const mapped = model.ranges[word.start];
      const element = mapped?.element || mapped?.node?.parentElement;
      const block = element?.closest?.('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th') || element;
      if (block) {
        activeBlock = block;
        activeBlock.classList.add('speech-reading-block');
        const rootRect = content.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();
        if (blockRect.top < rootRect.top || blockRect.bottom > rootRect.bottom) {
          block.scrollIntoView({ block: 'center', behavior: global.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }
      }
    }

    function nearestWord(position) {
      const exact = model.words.findIndex((word) => position >= word.start && position < word.end);
      if (exact >= 0) return exact;
      const nextWord = model.words.findIndex((word) => word.start >= position);
      return nextWord >= 0 ? nextWord : model.words.length - 1;
    }

    function findChunk(position) {
      const exact = chunks.find((chunk) => position >= chunk.start && position < chunk.end);
      return exact || chunks[chunks.length - 1];
    }

    function stopReading(announce = true) {
      utteranceId += 1;
      if (activeController === controller) {
        synth?.cancel();
        activeController = null;
      }
      active = false;
      play.textContent = '▶ Listen';
      play.setAttribute('aria-label', 'Read this note aloud');
      clearHighlight();
      if (announce && supported) status.textContent = 'Reading stopped.';
    }

    function speakFrom(position) {
      if (!supported || !model.words.length) {
        status.textContent = model.words.length ? 'Read aloud is not supported by this browser.' : 'There is no readable text in this note.';
        return;
      }
      if (activeController && activeController !== controller) activeController.stop(false);
      activeController = controller;
      synth.cancel();
      const startWord = Math.max(0, Math.min(model.words.length - 1, position));
      currentWord = startWord;
      const chunk = findChunk(model.words[startWord].start);
      const speechOffset = model.words[startWord].start;
      const utterance = new global.SpeechSynthesisUtterance(model.text.slice(speechOffset, chunk.end));
      const selectedVoice = synth.getVoices().find((voice) => voice.voiceURI === voiceSelect.value);
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.lang = selectedVoice?.lang || document.documentElement.lang || global.navigator?.language || 'en-US';
      utterance.rate = Number(rate.value);
      utterance.pitch = 1;
      const thisUtterance = ++utteranceId;
      active = true;
      play.textContent = '⏸ Pause';
      play.setAttribute('aria-label', 'Pause reading aloud');
      status.textContent = `Reading word ${startWord + 1} of ${model.words.length}. Use the left and right arrow keys to move one word; Escape stops.`;
      highlightWord(startWord);
      utterance.onboundary = (event) => {
        if (thisUtterance !== utteranceId || !active) return;
        if (Number.isFinite(event.charIndex)) highlightWord(nearestWord(speechOffset + event.charIndex));
      };
      utterance.onend = () => {
        if (thisUtterance !== utteranceId || !active) return;
        const nextPosition = nearestWord(chunk.end);
        if (nextPosition > startWord && nextPosition < model.words.length) {
          speakFrom(nextPosition);
          return;
        }
        active = false;
        activeController = null;
        play.textContent = '▶ Listen';
        play.setAttribute('aria-label', 'Read this note aloud');
        clearHighlight();
        status.textContent = 'Finished listening.';
      };
      utterance.onerror = (event) => {
        if (thisUtterance !== utteranceId || event.error === 'canceled' || event.error === 'interrupted') return;
        active = false;
        activeController = null;
        play.textContent = '▶ Listen';
        status.textContent = `Speech could not continue: ${event.error || 'unknown error'}.`;
      };
      synth.speak(utterance);
    }

    const controller = {
      stop: stopReading,
      populateVoices,
      destroy() {
        if (destroyed) return;
        stopReading(false);
        destroyed = true;
        controllers.delete(controller);
        controls.remove();
      },
      setVisible(visible) {
        controls.hidden = !visible;
        if (!visible && active) stopReading(false);
      }
    };
    controllers.add(controller);
    controls.__readAloudController = controller;
    content.__readAloudController = controller;

    play.addEventListener('click', () => {
      if (!supported) return;
      if (active && synth.paused) {
        synth.resume();
        play.textContent = '⏸ Pause';
        play.setAttribute('aria-label', 'Pause reading aloud');
        status.textContent = 'Reading resumed.';
      } else if (active) {
        synth.pause();
        play.textContent = '▶ Resume';
        play.setAttribute('aria-label', 'Resume reading aloud');
        status.textContent = 'Reading paused. Use the arrow keys to move one word.';
      } else {
        speakFrom(currentWord >= 0 && currentWord < model.words.length - 1 ? currentWord : 0);
      }
    });
    previous.addEventListener('click', () => speakFrom(Math.max(0, currentWord - 1)));
    next.addEventListener('click', () => speakFrom(Math.min(model.words.length - 1, currentWord + 1)));
    rate.addEventListener('input', () => {
      rateValue.textContent = `${Number(rate.value).toFixed(2)}×`;
      setPreference('notebooks-read-aloud-rate', rate.value);
      if (active) speakFrom(Math.max(0, currentWord));
    });
    voiceSelect.addEventListener('change', () => {
      setPreference('notebooks-read-aloud-voice', voiceSelect.value);
      if (active) speakFrom(Math.max(0, currentWord));
    });
    content.tabIndex = content.tabIndex >= 0 ? content.tabIndex : 0;
    content.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Space Escape');
    const onKeyboard = (event) => {
      if (activeController !== controller) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (!content.contains(target) && !controls.contains(target)) return;
      if (target?.closest?.('input, select, textarea, a, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        speakFrom(Math.max(0, currentWord - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        speakFrom(Math.min(model.words.length - 1, currentWord + 1));
      } else if (event.key === ' ' && active && content.contains(target) && !target?.closest?.('button')) {
        event.preventDefault();
        if (synth.paused) {
          synth.resume();
          play.textContent = '⏸ Pause';
        } else {
          synth.pause();
          play.textContent = '▶ Resume';
        }
      } else if (event.key === 'Escape' && active) {
        event.preventDefault();
        stopReading();
      }
    };
    document.addEventListener('keydown', onKeyboard);
    controller.destroy = (() => {
      const destroy = controller.destroy.bind(controller);
      return () => {
        document.removeEventListener('keydown', onKeyboard);
        destroy();
      };
    })();
    populateVoices();
    return controller;
  }

  function attach(toolbar, content) {
    return createController(toolbar, content);
  }

  function destroyIn(root) {
    root?.querySelectorAll?.('.read-aloud-controls').forEach((element) => element.__readAloudController?.destroy());
    root?.__readAloudController?.destroy?.();
  }

  global.speechSynthesis?.addEventListener?.('voiceschanged', () => {
    controllers.forEach((controller) => controller.populateVoices?.());
  });
  global.NoteBooksReadAloud = { attach, destroyIn, mathToSpeech, normalizeGreekText, rankVoices };
})(window);
