/* Minimal local-only SPA for itta! object identification game */
(() => {
  /** State management (URL-param based, no backend) */
  const DEFAULT_GAME = {
    playerAName: '',
    playerBName: '',
    playerAScore: 0,
    playerBScore: 0,
    currentTurn: 'A', // A selects -> B guesses, then swap
    targetLabel: '',
    targetConfidence: 0,
    isActive: false,
    winner: '',
  };

  const WIN_POINTS = 5;
  const TURN_SECONDS = 120; // 2 minutes
  const MIN_SCORE = 0.6; // Only show objects > 60%

  let game = { ...DEFAULT_GAME };
  let detectorModel = null;
  let mediaStream = null;
  let timerInterval = null;
  let secondsLeft = TURN_SECONDS;
  let activeRAF = 0;
  let liveDetectInterval = null;
  let liveDetectInProgress = false;
  let roundAwarded = false;
  const translateCache = new Map();
  const inflightTranslate = new Map();

  // Offline Swedish translations for COCO-SSD labels
  const COCO_SV = {
    person: 'person',
    bicycle: 'cykel',
    car: 'bil',
    motorcycle: 'motorcykel',
    airplane: 'flygplan',
    bus: 'buss',
    train: 'tåg',
    truck: 'lastbil',
    boat: 'båt',
    'traffic light': 'trafikljus',
    'fire hydrant': 'brandpost',
    'stop sign': 'stoppskylt',
    'parking meter': 'parkeringsautomat',
    bench: 'bänk',
    bird: 'fågel',
    cat: 'katt',
    dog: 'hund',
    horse: 'häst',
    sheep: 'får',
    cow: 'ko',
    elephant: 'elefant',
    bear: 'björn',
    zebra: 'zebra',
    giraffe: 'giraff',
    backpack: 'ryggsäck',
    umbrella: 'paraply',
    handbag: 'handväska',
    tie: 'slips',
    suitcase: 'resväska',
    frisbee: 'frisbee',
    skis: 'skidor',
    snowboard: 'snowboard',
    'sports ball': 'boll',
    kite: 'drake',
    'baseball bat': 'basebollträ',
    'baseball glove': 'basebollhandske',
    skateboard: 'skateboard',
    surfboard: 'surfbräda',
    'tennis racket': 'tennisracket',
    bottle: 'flaska',
    'wine glass': 'vinglas',
    cup: 'kopp',
    fork: 'gaffel',
    knife: 'kniv',
    spoon: 'sked',
    bowl: 'skål',
    banana: 'banan',
    apple: 'äpple',
    sandwich: 'smörgås',
    orange: 'apelsin',
    broccoli: 'broccoli',
    carrot: 'morot',
    'hot dog': 'varmkorv',
    pizza: 'pizza',
    donut: 'munk',
    cake: 'tårta',
    chair: 'stol',
    couch: 'soffa',
    'potted plant': 'krukväxt',
    bed: 'säng',
    'dining table': 'matbord',
    toilet: 'toalett',
    tv: 'tv',
    laptop: 'laptop',
    mouse: 'mus',
    remote: 'fjärrkontroll',
    keyboard: 'tangentbord',
    'cell phone': 'mobiltelefon',
    microwave: 'mikrovågsugn',
    oven: 'ugn',
    toaster: 'brödrost',
    sink: 'diskho',
    refrigerator: 'kylskåp',
    book: 'bok',
    clock: 'klocka',
    vase: 'vas',
    scissors: 'sax',
    'teddy bear': 'nallebjörn',
    'hair drier': 'hårtork',
    toothbrush: 'tandborste',
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const scoreBar = $('#scoreBar');
  const screens = {
    home: $('#screen-home'),
    detect: $('#screen-detect'),
    wait: $('#screen-wait'),
    play: $('#screen-play'),
    win: $('#screen-win'),
  };

  function setScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function encodeStateToURL(next) {
    const url = new URL(location.href);
    const params = url.searchParams;
    params.set('pa', next.playerAName || '');
    params.set('pb', next.playerBName || '');
    params.set('sa', String(next.playerAScore || 0));
    params.set('sb', String(next.playerBScore || 0));
    params.set('t', next.currentTurn || 'A');
    params.set('lbl', next.targetLabel || '');
    params.set('cf', String(next.targetConfidence || 0));
    params.set('act', next.isActive ? '1' : '0');
    params.set('w', next.winner || '');
    history.replaceState({}, '', url);
  }

  function decodeStateFromURL() {
    const url = new URL(location.href);
    const p = url.searchParams;
    const parsed = {
      playerAName: p.get('pa') || '',
      playerBName: p.get('pb') || '',
      playerAScore: parseInt(p.get('sa') || '0', 10) || 0,
      playerBScore: parseInt(p.get('sb') || '0', 10) || 0,
      currentTurn: (p.get('t') || 'A') === 'B' ? 'B' : 'A',
      targetLabel: p.get('lbl') || '',
      targetConfidence: parseFloat(p.get('cf') || '0') || 0,
      isActive: p.get('act') === '1',
      winner: p.get('w') || '',
    };
    return { ...DEFAULT_GAME, ...parsed };
  }

  function updateScoreBar() {
    const aName = game.playerAName || 'Spelare A';
    const bName = game.playerBName || 'Spelare B';
    const active = game.isActive ? (game.currentTurn === 'A' ? 'B' : 'A') : '';
    const aClass = active === 'A' ? 'badge active' : 'badge';
    const bClass = active === 'B' ? 'badge active' : 'badge';
    scoreBar.innerHTML = `
      <span class="${aClass}">${aName}<span class="vs"> ${game.playerAScore}<\/span><\/span>
      <span class="vs">vs<\/span>
      <span class="${bClass}"><span class="vs">${game.playerBScore} <\/span>${bName}<\/span>
    `;
  }

  function cancelRAF() {
    if (activeRAF) {
      cancelAnimationFrame(activeRAF);
      activeRAF = 0;
    }
  }

  function stopLiveDetect() {
    if (liveDetectInterval) {
      clearInterval(liveDetectInterval);
      liveDetectInterval = null;
    }
    liveDetectInProgress = false;
  }

  function stopCamera() {
    cancelRAF();
    stopLiveDetect();
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
  }

  async function startCamera(videoEl, facingMode = 'environment') {
    stopCamera();
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
    videoEl.srcObject = mediaStream;
    await videoEl.play();
  }

  async function loadModel() {
    if (!detectorModel) {
      detectorModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    }
    return detectorModel;
  }

  async function translateLabelToSv(label) {
    try {
      const key = (label || '').trim().toLowerCase();
      if (!key) return Promise.resolve(label);
      if (translateCache.has(key)) return Promise.resolve(translateCache.get(key));
      if (COCO_SV[key]) {
        const mapped = COCO_SV[key];
        translateCache.set(key, mapped);
        return Promise.resolve(mapped);
      }
      if (inflightTranslate.has(key)) return inflightTranslate.get(key);
      const p = fetch('https://libretranslate.com/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: key, source: 'en', target: 'sv', format: 'text' }),
      }).then(r => r.json()).then(j => {
        const out = (j && j.translatedText) ? j.translatedText : label;
        translateCache.set(key, out);
        inflightTranslate.delete(key);
        return out;
      }).catch(() => {
        inflightTranslate.delete(key);
        return label;
      });
      inflightTranslate.set(key, p);
      return p;
    } catch {
      return Promise.resolve(label);
    }
  }

  async function shareLink(text) {
    const url = location.href;
    const full = `${text} ${url}`.trim();
    if (navigator.share) {
      navigator.share({ title: 'itta! utmaning', text, url }).catch(() => {});
      return;
    }
    // Fallback preference: SMS -> WhatsApp -> Clipboard
    const sms = `sms:?&body=${encodeURIComponent(full)}`;
    const opened = window.open(sms, '_blank');
    if (!opened) {
      const wa = `https://wa.me/?text=${encodeURIComponent(full)}`;
      const openedWa = window.open(wa, '_blank');
      if (!openedWa && navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(full); alert('Länk kopierad. Klistra in i valfri app.'); } catch {}
      }
    }
  }

  function resetTimer(seconds = TURN_SECONDS) {
    clearInterval(timerInterval);
    secondsLeft = seconds;
    $('#play-timer')?.replaceChildren(document.createTextNode(formatTime(secondsLeft)));
  }

  function startTimer(onExpire) {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      secondsLeft -= 1;
      const el = $('#play-timer');
      if (el) el.textContent = formatTime(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(timerInterval);
        onExpire?.();
      }
    }, 1000);
  }

  function formatTime(total) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function checkWinner() {
    if (game.playerAScore >= WIN_POINTS) return 'A';
    if (game.playerBScore >= WIN_POINTS) return 'B';
    return '';
  }

  function showFeedbackPlusOne() {
    const node = document.createElement('div');
    node.className = 'feedback';
    node.innerHTML = '👍 <span class="plus">+1<\/span>';
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 3000);
  }

  function renderHome() {
    updateScoreBar();
    setScreen('home');
    const hasActive = game.isActive;
    screens.home.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'col card';

    const title = document.createElement('h2');
    title.textContent = 'Starta eller gå med i spel';
    wrap.appendChild(title);

    const nameRow = document.createElement('div');
    nameRow.className = 'col';

    const nameA = document.createElement('input');
    nameA.placeholder = 'Ditt namn';
    nameA.value = game.playerAName || '';
    nameA.autocapitalize = 'words';
    nameA.autocomplete = 'name';

    const nameB = document.createElement('input');
    nameB.placeholder = 'Motspelarens namn (om du startar)';
    nameB.value = game.playerBName || '';

    nameRow.appendChild(nameA);
    nameRow.appendChild(nameB);
    wrap.appendChild(nameRow);

    const startBtn = document.createElement('button');
    startBtn.className = 'primary';
    startBtn.textContent = 'Starta nytt spel';
    startBtn.onclick = () => {
      game = {
        ...game,
        playerAName: nameA.value.trim() || 'Spelare A',
        playerBName: nameB.value.trim() || 'Spelare B',
        playerAScore: 0,
        playerBScore: 0,
        currentTurn: 'A',
        targetLabel: '',
        targetConfidence: 0,
        isActive: true,
        winner: '',
      };
      encodeStateToURL(game);
      renderDetect();
    };

    const joinBtn = document.createElement('button');
    joinBtn.className = 'ghost';
    joinBtn.textContent = hasActive ? 'Fortsätt' : 'Gå med i spel via länk';
    joinBtn.onclick = () => {
      if (!hasActive) {
        // Ask for your name if link has other player
        game.playerBName = nameA.value.trim() || game.playerBName || 'Spelare B';
        game.playerAName = game.playerAName || 'Spelare A';
        game.isActive = true;
        encodeStateToURL(game);
      }
      if (game.targetLabel) renderPlay(); else renderDetect();
    };

    wrap.appendChild(startBtn);
    wrap.appendChild(joinBtn);
    screens.home.appendChild(wrap);
  }

  function renderDetect() {
    updateScoreBar();
    setScreen('detect');
    stopCamera();
    screens.detect.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'col';
    const instruction = document.createElement('div');
    instruction.className = 'pill';
    instruction.textContent = 'Fotografera ett objekt att utmana motspelaren med';
    container.appendChild(instruction);

    const vw = document.createElement('div');
    vw.className = 'video-wrap';
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    const overlay = document.createElement('div');
    overlay.className = 'overlay boxes';
    vw.appendChild(video);
    vw.appendChild(canvas);
    vw.appendChild(overlay);
    container.appendChild(vw);

    const actions = document.createElement('div');
    actions.className = 'footer-actions';
    const snap = document.createElement('button');
    snap.className = 'primary';
    snap.textContent = 'Ta bild';
    actions.appendChild(snap);
    container.appendChild(actions);

    screens.detect.appendChild(container);

    // Live camera only (no canvas painting until capture)
    const ctx = canvas.getContext('2d');

    const drawInteractiveBoxes = (preds, onPick) => {
      overlay.classList.add('interactive');
      overlay.innerHTML = '';
      const scaleX = overlay.clientWidth && canvas.width ? overlay.clientWidth / canvas.width : 1;
      const scaleY = overlay.clientHeight && canvas.height ? overlay.clientHeight / canvas.height : 1;
      preds.forEach((p) => {
        const [x, y, w, h] = p.bbox;
        const b = document.createElement('div');
        b.className = 'box';
        b.style.left = `${x * scaleX}px`;
        b.style.top = `${y * scaleY}px`;
        b.style.width = `${w * scaleX}px`;
        b.style.height = `${h * scaleY}px`;
        const lab = document.createElement('label');
        lab.textContent = `${(p.class || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`;
        translateLabelToSv(p.class).then(sv => { lab.textContent = `${(sv || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`; }).catch(() => {});
        lab.onclick = (e) => { e.stopPropagation(); onPick(p); };
        b.appendChild(lab);
        overlay.appendChild(b);
      });
    };

    const drawLiveBoxes = (preds) => {
      overlay.classList.remove('interactive');
      overlay.innerHTML = '';
      const vwRect = vw.getBoundingClientRect();
      const scaleX = vwRect.width && video.videoWidth ? vwRect.width / video.videoWidth : 1;
      const scaleY = vwRect.height && video.videoHeight ? vwRect.height / video.videoHeight : 1;
      const list = (preds || []).filter(p => p.score > MIN_SCORE);
      list.forEach((p) => {
        const [x, y, w, h] = p.bbox;
        const b = document.createElement('div');
        b.className = 'box';
        b.style.left = `${x * scaleX}px`;
        b.style.top = `${y * scaleY}px`;
        b.style.width = `${w * scaleX}px`;
        b.style.height = `${h * scaleY}px`;
        const lab = document.createElement('label');
        lab.textContent = `${(p.class || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`;
        translateLabelToSv(p.class).then(sv => { lab.textContent = `${(sv || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`; }).catch(() => {});
        lab.onclick = async (e) => {
          e.stopPropagation();
          try {
            stopLiveDetect();
            await loadModel();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            video.style.display = 'none';
            canvas.style.display = 'block';
            stopCamera();
            game.targetLabel = p.class;
            game.targetConfidence = p.score;
            game.isActive = true;
            game.winner = '';
            encodeStateToURL(game);
            const sv = await translateLabelToSv(game.targetLabel);
            const text = `${game.playerAName} utmanar ${game.playerBName} att hitta: ${(sv || '').toUpperCase()}. Ställning ${game.playerAScore}-${game.playerBScore}.`;
            await shareLink(text);
            renderWait();
          } catch (err) {
            console.error(err);
          }
        };
        b.appendChild(lab);
        overlay.appendChild(b);
      });
    };

    startCamera(video).then(loadModel).then(() => {
      // Throttled live detection overlay (no interaction)
      stopLiveDetect();
      liveDetectInterval = setInterval(async () => {
        if (liveDetectInProgress) return;
        if (!detectorModel) return;
        if (video.readyState < 2) return;
        try {
          liveDetectInProgress = true;
          const preds = await detectorModel.detect(video);
          drawLiveBoxes(preds || []);
        } catch (e) {
          // ignore transient errors
        } finally {
          liveDetectInProgress = false;
        }
      }, 600);
    }).catch(err => {
      console.error(err);
      alert('Kunde inte starta kamera. Ge kameratillstånd och försök igen.');
      setScreen('home');
    });

    snap.onclick = async () => {
      try {
        stopLiveDetect();
        const model = await loadModel();
        // Freeze frame: draw current video to canvas, then hide video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        video.style.display = 'none';
        canvas.style.display = 'block';
        const allPreds = await model.detect(canvas);
        const preds = (allPreds || []).filter(p => p.score > MIN_SCORE);
        // Stop camera after capture
        stopCamera();
        if (!preds.length) {
          alert('Inga objekt över 60% hittades. Försök igen.');
          return;
        }
        drawInteractiveBoxes(preds, async (p) => {
          game.targetLabel = p.class;
          game.targetConfidence = p.score;
          game.isActive = true;
          game.winner = '';
          encodeStateToURL(game);
          const sv = await translateLabelToSv(game.targetLabel);
          const text = `${game.playerAName} utmanar ${game.playerBName} att hitta: ${(sv || '').toUpperCase()}. Ställning ${game.playerAScore}-${game.playerBScore}.`;
          await shareLink(text);
          renderWait();
        });
        // Fallback list
        const chooser = document.createElement('div');
        chooser.className = 'card col';
        const title = document.createElement('div');
        title.textContent = 'Eller välj i listan';
        chooser.appendChild(title);
        const grid = document.createElement('div');
        grid.className = 'grid';
        preds.slice(0, 6).forEach((p) => {
          const btn = document.createElement('button');
          btn.textContent = `${(p.class || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`;
          translateLabelToSv(p.class).then(sv => { btn.textContent = `${(sv || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`; }).catch(() => {});
          btn.onclick = async () => {
            game.targetLabel = p.class;
            game.targetConfidence = p.score;
            game.isActive = true;
            game.winner = '';
            encodeStateToURL(game);
            const sv = await translateLabelToSv(game.targetLabel);
            const text = `${game.playerAName} utmanar ${game.playerBName} att hitta: ${(sv || '').toUpperCase()}. Ställning ${game.playerAScore}-${game.playerBScore}.`;
            await shareLink(text);
            renderWait();
          };
          grid.appendChild(btn);
        });
        chooser.appendChild(grid);
        screens.detect.appendChild(chooser);
      } catch (e) {
        console.error(e);
        alert('Det gick inte att analysera bilden.');
      }
    };
  }

  function renderWait() {
    updateScoreBar();
    setScreen('wait');
    stopCamera();
    screens.wait.innerHTML = '';
    const c = document.createElement('div');
    c.className = 'center card';
    const info = document.createElement('div');
    info.innerHTML = `<div>Delad utmaning: <span class="name">${(game.targetLabel || '-').toUpperCase()}<\/span><\/div>`;
    // Update with Swedish translation if available
    translateLabelToSv(game.targetLabel).then(sv => {
      const span = info.querySelector('.name');
      if (span && sv) span.textContent = (sv || '').toUpperCase();
    }).catch(() => {});
    const tip = document.createElement('div');
    tip.className = 'hint';
    tip.textContent = 'Väntar på motspelaren. Dela länken om du inte gjort det.';
    const back = document.createElement('button');
    back.className = 'ghost';
    back.textContent = 'Till startsidan';
    back.onclick = () => renderHome();
    c.appendChild(info);
    c.appendChild(tip);
    c.appendChild(back);
    screens.wait.appendChild(c);
  }

  function finishRound(success) {
    // currentTurn represents the current selector (who chose the target)
    // The guesser is the other player and earns points on success.
    if (game.currentTurn === 'A') {
      game.currentTurn = 'B'; // Next, B selects
    } else {
      game.currentTurn = 'A'; // Next, A selects
    }
    game.targetLabel = '';
    game.targetConfidence = 0;
    roundAwarded = false;
    const w = checkWinner();
    game.winner = w;
    encodeStateToURL(game);
    if (w) {
      renderWin();
    } else {
      renderDetect(); // Next selector picks a new target
    }
  }

  function renderPlay() {
    updateScoreBar();
    setScreen('play');
    stopCamera();
    screens.play.innerHTML = '';
    roundAwarded = false;
    const container = document.createElement('div');
    container.className = 'col';
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.innerHTML = `<span>Hitta: <span class="name">${(game.targetLabel || '').toUpperCase()}<\/span><\/span>`;
    // Update with Swedish translation if available
    translateLabelToSv(game.targetLabel).then(sv => {
      const span = pill.querySelector('.name');
      if (span && sv) span.textContent = (sv || '').toUpperCase();
    }).catch(() => {});
    container.appendChild(pill);

    const vw = document.createElement('div');
    vw.className = 'video-wrap';
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    const overlay = document.createElement('div');
    overlay.className = 'overlay boxes';
    vw.appendChild(video);
    vw.appendChild(canvas);
    vw.appendChild(overlay);
    container.appendChild(vw);

    const actions = document.createElement('div');
    actions.className = 'footer-actions';
    const timer = document.createElement('div');
    timer.className = 'pill timer';
    timer.id = 'play-timer';
    timer.textContent = formatTime(TURN_SECONDS);
    const snap = document.createElement('button');
    snap.className = 'primary';
    snap.textContent = 'Ta bild';
    const giveUp = document.createElement('button');
    giveUp.className = 'ghost';
    giveUp.textContent = 'Ge upp';
    actions.appendChild(timer);
    actions.appendChild(snap);
    actions.appendChild(giveUp);
    container.appendChild(actions);

    screens.play.appendChild(container);

    const ctx = canvas.getContext('2d');

    // Live video only (no canvas drawing until capture)
    const drawLiveBoxes = (preds) => {
      overlay.classList.remove('interactive');
      overlay.innerHTML = '';
      const vwRect = vw.getBoundingClientRect();
      const scaleX = vwRect.width && video.videoWidth ? vwRect.width / video.videoWidth : 1;
      const scaleY = vwRect.height && video.videoHeight ? vwRect.height / video.videoHeight : 1;
      const list = (preds || []).filter(p => p.score > MIN_SCORE);
      list.forEach((p) => {
        const [x, y, w, h] = p.bbox;
        const b = document.createElement('div');
        b.className = 'box';
        b.style.left = `${x * scaleX}px`;
        b.style.top = `${y * scaleY}px`;
        b.style.width = `${w * scaleX}px`;
        b.style.height = `${h * scaleY}px`;
        const lab = document.createElement('label');
        lab.textContent = `${(p.class || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`;
        translateLabelToSv(p.class).then(sv => { lab.textContent = `${(sv || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`; }).catch(() => {});
        b.appendChild(lab);
        overlay.appendChild(b);
      });
    };

    startCamera(video).then(loadModel).then(() => {
      resetTimer();
      startTimer(() => {
        stopCamera();
        finishRound(false);
      });
      // Throttled live detection overlay during play
      stopLiveDetect();
      liveDetectInterval = setInterval(async () => {
        if (liveDetectInProgress) return;
        if (!detectorModel) return;
        if (video.readyState < 2) return;
        try {
          liveDetectInProgress = true;
          const preds = await detectorModel.detect(video);
          drawLiveBoxes(preds || []);
        } catch (e) {
          // ignore transient detection errors
        } finally {
          liveDetectInProgress = false;
        }
      }, 600);
    }).catch(err => {
      console.error(err);
      alert('Kunde inte starta kamera. Ge kameratillstånd och försök igen.');
      setScreen('home');
    });

    giveUp.onclick = () => {
      clearInterval(timerInterval);
      stopCamera();
      finishRound(false);
    };

    const drawInteractiveBoxes = (preds, onPick) => {
      overlay.classList.add('interactive');
      overlay.innerHTML = '';
      const scaleX = overlay.clientWidth && canvas.width ? overlay.clientWidth / canvas.width : 1;
      const scaleY = overlay.clientHeight && canvas.height ? overlay.clientHeight / canvas.height : 1;
      preds.forEach((p) => {
        const [x, y, w, h] = p.bbox;
        const b = document.createElement('div');
        b.className = 'box';
        b.style.left = `${x * scaleX}px`;
        b.style.top = `${y * scaleY}px`;
        b.style.width = `${w * scaleX}px`;
        b.style.height = `${h * scaleY}px`;
        const lab = document.createElement('label');
        lab.textContent = `${(p.class || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`;
        translateLabelToSv(p.class).then(sv => { lab.textContent = `${(sv || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`; }).catch(() => {});
        lab.onclick = (e) => { e.stopPropagation(); onPick(p); };
        b.appendChild(lab);
        overlay.appendChild(b);
      });
    };
    snap.onclick = async () => {
      try {
        stopLiveDetect();
        const model = await loadModel();
        // Freeze: draw current video frame to canvas, then hide video to show still
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        video.style.display = 'none';
        canvas.style.display = 'block';
        const allPreds = await model.detect(canvas);
        const preds = (allPreds || []).filter(p => p.score > MIN_SCORE);
        // Stop camera after capture so overlays don't double up
        stopCamera();
        if (!preds.length) {
          alert('Inga objekt över 60% hittades. Försök igen.');
          return;
        }
        const awardOnce = (success) => {
          if (roundAwarded) return;
          roundAwarded = true;
          if (success) {
            if (game.currentTurn === 'A') game.playerBScore += 1; else game.playerAScore += 1;
            updateScoreBar();
            showFeedbackPlusOne();
          }
          finishRound(success);
        };
        drawInteractiveBoxes(preds, (p) => {
          const success = p.class.toLowerCase() === (game.targetLabel||'').toLowerCase();
          clearInterval(timerInterval);
          awardOnce(success);
        });
        // Fallback list
        const chooser = document.createElement('div');
        chooser.className = 'card col';
        const title = document.createElement('div');
        title.textContent = 'Eller välj i listan';
        chooser.appendChild(title);
        const grid = document.createElement('div');
        grid.className = 'grid';
        preds.slice(0, 6).forEach((p) => {
          const btn = document.createElement('button');
          btn.textContent = `${(p.class || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`;
          translateLabelToSv(p.class).then(sv => { btn.textContent = `${(sv || '').toUpperCase()} ${(p.score*100).toFixed(0)}%`; }).catch(() => {});
          btn.onclick = () => {
            const success = p.class.toLowerCase() === (game.targetLabel||'').toLowerCase();
            clearInterval(timerInterval);
            awardOnce(success);
          };
          grid.appendChild(btn);
        });
        chooser.appendChild(grid);
        screens.play.appendChild(chooser);
      } catch (e) {
        console.error(e);
        alert('Det gick inte att analysera bilden.');
      }
    };
  }

  function renderWin() {
    updateScoreBar();
    setScreen('win');
    stopCamera();
    screens.win.innerHTML = '';
    const c = document.createElement('div');
    c.className = 'center card';
    const who = game.winner === 'A' ? game.playerAName : game.playerBName;
    const msg = document.createElement('h2');
    msg.textContent = `${who} vann!`;
    const again = document.createElement('button');
    again.className = 'primary';
    again.textContent = 'Spela igen';
    again.onclick = () => {
      const pa = game.playerAName || 'Spelare A';
      const pb = game.playerBName || 'Spelare B';
      game = { ...DEFAULT_GAME, playerAName: pa, playerBName: pb };
      encodeStateToURL(game);
      renderHome();
    };
    c.appendChild(msg);
    c.appendChild(again);
    screens.win.appendChild(c);
  }

  function route() {
    game = decodeStateFromURL();
    updateScoreBar();
    if (!game.isActive) {
      renderHome();
      return;
    }
    if (game.winner) {
      renderWin();
      return;
    }
    if (game.targetLabel) {
      renderPlay();
      return;
    }
    renderDetect();
  }

  window.addEventListener('popstate', route);
  window.addEventListener('load', () => {
    // Hydrate from URL and render
    route();
  });
})();

