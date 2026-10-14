/* Sound for the student screens, all made live with the Web Audio API (no audio files, so it works offline):
     music  five chill original tunes, each a different style with its own instruments, rhythm, tempo and key:
              dawn  a music-box lullaby (bell arpeggios over a soft pad, no drums)
              drift lo-fi hip-hop (electric piano, swung beat, vinyl crackle)
              dusk  ambient pads (slow, wide, no beat)
              rain  bossa nova (nylon guitar, walking bass, brushes and shaker)
              porch ukulele strum-along (strummed chords, shaker, a whistling tune)
            each screen alternates between two of them
     blip   the short "text box" chirp heard while a card types itself out
     click  the playful pop on a tap
     stairs, chime  little game jingles
   Nothing is saved except the student's own mute choice; all of it stops when they mute. */
(function () {
  'use strict';

  var ctx = null, master = null, warm = null, musicBus = null, sfxBus = null, echo = null, noiseBuf = null, pulse25 = null, pulse50 = null;
  var timer = 0, nextT = 0, step = 0, playing = false, muted = false, clicks = 0, foot = false;
  try { muted = localStorage.getItem('lampara_music') === '0'; } catch (e) { /* default: sound on */ }   // a student who muted music elsewhere hears nothing here either

  // ---- the tunes. Notes are semitones above C4. Each is four bars of eight eighth-notes, played twice with two melody phrases.
  //      chords: four notes each. roots: the bass note of each bar. melody: null is a rest.
  var CH = {   // chord voicings
    Fmaj7: [-7, -3, 0, 4], Em7: [-8, -5, -1, 2], Dm7: [-10, -7, -3, 0], Dm9: [-7, -3, 0, 4], Cmaj7: [-8, -5, -1, 4], Am9: [0, 4, 7, 11],
    Am7: [-3, 0, 4, 7], G7: [-5, -1, 2, 5], G6: [-5, -1, 2, 4],
    C: [0, 4, 7, 12], Am: [-3, 0, 4, 9], F: [-7, -3, 0, 5], G: [-5, -1, 2, 7]   // plain four-string shapes for the ukulele
  };
  var TRACKS = {
    dawn: {   // music-box lullaby: C, Em7, Fmaj7, G6
      style: 'bells', bpm: 66, key: 0, warm: 5200, chords: [CH.Cmaj7, CH.Em7, CH.Fmaj7, CH.G6], roots: [-24, -20, -19, -17], melody: null
    },
    drift: {  // lo-fi hip-hop, a tone lower: Cmaj7, Am9, Dm7, G7
      style: 'lofi', bpm: 78, key: -2, warm: 2300, chords: [CH.Cmaj7, CH.Am9, CH.Dm7, CH.G7], roots: [-24, -15, -22, -17],
      melody: [
        [[null, 19, null, null, 24, null, 23, null], [null, null, 21, null, 19, null, null, 16], [null, 17, null, null, 21, null, null, null], [null, null, 19, null, 23, null, 19, null]],
        [[24, null, null, 23, null, 19, null, null], [null, 21, null, null, 24, null, 21, null], [null, null, 17, 21, null, null, 24, null], [null, 23, null, 19, null, null, 14, null]]]
    },
    dusk: {   // ambient pads, low and slow: Am7, Fmaj7, Cmaj7, Em7
      style: 'pad', bpm: 54, key: -4, warm: 1500, chords: [CH.Am7, CH.Fmaj7, CH.Cmaj7, CH.Em7], roots: [-15, -19, -12, -20],
      melody: [
        [[null, null, null, null, 19, null, null, null], [null, null, 17, null, null, null, null, null], [null, null, null, null, 16, null, null, null], [null, null, 23, null, null, null, null, null]],
        [[null, null, 21, null, null, null, null, null], [null, null, null, null, 24, null, null, null], [null, null, null, null, null, null, 19, null], [null, 16, null, null, null, null, null, null]]]
    },
    rain: {   // bossa nova, a tone up: Dm7, G7, Cmaj7, Fmaj7
      style: 'bossa', bpm: 100, key: 2, warm: 3600, chords: [CH.Dm7, CH.G7, CH.Cmaj7, CH.Fmaj7], roots: [-22, -17, -24, -19],
      melody: [
        [[17, null, null, 21, null, 19, 17, null], [19, null, 23, null, null, 19, null, 17], [16, null, null, 19, null, 24, null, 23], [21, null, 17, null, null, 21, null, null]],
        [[14, null, 17, 21, null, null, 24, null], [23, null, 19, null, 17, 19, null, null], [24, null, 23, 19, null, 16, null, null], [17, 21, null, null, 24, 21, null, 17]]]
    },
    porch: {  // ukulele strum-along, bright: C, Am, F, G (a fifth up)
      style: 'folk', bpm: 92, key: 7, warm: 4800, chords: [CH.C, CH.Am, CH.F, CH.G], roots: [-24, -15, -19, -17],
      melody: [
        [[16, null, 19, 19, null, 21, 19, 16], [21, null, 24, 21, null, 19, 16, null], [17, null, 21, 21, null, 24, 21, 17], [19, null, 23, 19, 14, null, 19, null]],
        [[24, null, 19, 19, 21, null, 19, 16], [21, 24, null, 21, 19, null, 16, null], [17, 21, null, 24, 21, 17, null, 21], [23, 19, null, 23, 26, null, 23, 19]]]
    }
  };
  // Where each kind of screen draws its music from. A pool alternates, so the same screen does not always open with the same tune.
  var POOLS = { tour: ['dawn', 'drift'], start: ['drift', 'porch'], pick: ['drift', 'dusk'], where: ['porch', 'dusk'], shop: ['rain', 'dawn'], route: ['dusk', 'rain'] };
  function pick(kind) {
    var pool = POOLS[kind]; if (!pool) return TRACKS[kind] ? kind : 'dawn';
    var last = null, key = 'lampara_track_' + kind;
    try { last = localStorage.getItem(key); } catch (e) { /* no memory of the last one */ }
    var next = pool[(pool.indexOf(last) + 1) % pool.length];
    try { localStorage.setItem(key, next); } catch (e) { /* ignore */ }
    return next;
  }
  var cur = TRACKS.dawn, EIGHTH = 60 / cur.bpm / 2;
  function hz(semi) { return 261.63 * Math.pow(2, (semi + (cur.key || 0)) / 12); }

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      // everything goes through a gentle limiter, so it can be loud on a small speaker without crackling
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = 1; master.connect(comp);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.26;
      warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 3000; warm.Q.value = 0.4;   // takes the edge off: soft, a little lo-fi
      musicBus.connect(warm); warm.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.24; sfxBus.connect(master);
      echo = ctx.createDelay(1); echo.delayTime.value = EIGHTH * 3;                 // dotted-eighth echo
      var fb = ctx.createGain(), wet = ctx.createGain(), dark = ctx.createBiquadFilter();
      fb.gain.value = 0.34; wet.gain.value = 0.5; dark.type = 'lowpass'; dark.frequency.value = 1800;
      echo.connect(dark); dark.connect(fb); fb.connect(echo); dark.connect(wet); wet.connect(musicBus);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      pulse25 = pulse(0.25); pulse50 = pulse(0.5);
      return true;
    } catch (e) { ctx = null; return false; }
  }
  // A pulse wave with the given duty cycle: used only for the little game sound effects.
  function pulse(duty) {
    var n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (var k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(re, im);
  }
  function voice(wave, freq, t, dur, vol, bus, sendEcho, attack) {
    var o = ctx.createOscillator(), g = ctx.createGain(), a = attack || 0.012;
    if (typeof wave === 'string') o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); if (sendEcho) g.connect(echo);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(t, dur, vol, type, freq, bus) {
    var s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || musicBus); s.start(t); s.stop(t + dur + 0.02);
  }
  function tick(t, vol, bus) { noise(t, 0.04, vol, 'highpass', bus ? 7000 : 2600, bus); }   // music hats sit lower so the warm filter still lets them through
  function kick(t, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.13);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.22);
  }
  // Soft electric piano: a sine with a fast-fading bell overtone, so each note blooms and settles.
  function keys(freq, t, dur, vol) {
    voice('sine', freq, t, dur, vol, musicBus, true, 0.02);
    voice('triangle', freq * 2.004, t, dur * 0.45, vol * 0.3, musicBus, false, 0.01);
  }

  // The five styles. Each gets the time of this eighth-note, which one it is in the bar, the bar's chord and bass note.
  function bass(f, t, dur, vol) { voice('sine', f, t, dur, vol, musicBus, false, 0.02); voice('triangle', f * 2, t, dur * 0.75, vol * 0.6, musicBus, false, 0.02); voice('sine', f * 4, t, dur * 0.4, vol * 0.18, musicBus, false, 0.02); }
  var STYLE = {
    bells: function (t, beat, bar, ph, E, chord) {           // bell arpeggios over a soft pad
      var f = hz(chord[[0, 1, 2, 3, 2, 1, 2, 3][beat]] + 12);
      voice('sine', f, t, E * 5, 0.34, musicBus, true, 0.004); voice('sine', f * 3, t, E * 0.6, 0.07, musicBus, true, 0.003);
      if (beat === 0) { chord.forEach(function (n) { voice('triangle', hz(n), t, E * 8, 0.11, musicBus, false, 0.7); }); bass(hz(cur.roots[bar]), t, E * 8, 0.55); }
    },
    lofi: function (t, beat, bar, ph, E, chord) {            // electric piano, swung beat, crackle
      if (beat === 0) chord.forEach(function (n, i) { keys(hz(n), t + i * 0.012, E * 5.5, 0.3); });
      else if (beat === 3 || beat === 6) chord.slice(1).forEach(function (n, i) { keys(hz(n), t + i * 0.012, E * 2.2, 0.17); });
      if (beat === 0 || beat === 5) { bass(hz(cur.roots[bar]), t, E * 3.2, 0.95); kick(t, 0.8); }
      if (beat === 2 || beat === 6) noise(t, 0.11, 0.3, 'bandpass', 1700);
      tick(t, beat % 2 === 0 ? 0.1 : 0.05);
      if (Math.random() < 0.18) noise(t + Math.random() * E, 0.012, 0.05, 'highpass', 2200);      // vinyl crackle
      var m = cur.melody[ph][bar][beat];
      if (m !== null) { var mf = hz(m); voice('sine', mf, t, E * 3, 0.42, musicBus, true, 0.01); voice('sine', mf * 3, t, E * 0.7, 0.1, musicBus, true, 0.005); }
    },
    pad: function (t, beat, bar, ph, E, chord) {             // slow wide pads, no beat
      if (beat === 0) {
        chord.forEach(function (n) { var f = hz(n); voice('sawtooth', f * 1.005, t, E * 8.4, 0.085, musicBus, true, 1.4); voice('sawtooth', f * 0.995, t, E * 8.4, 0.085, musicBus, false, 1.4); voice('sine', f * 2, t, E * 8.4, 0.05, musicBus, true, 2); });
        bass(hz(cur.roots[bar]), t, E * 8.2, 0.7);
      }
      var m = cur.melody[ph][bar][beat];
      if (m !== null) { var mf = hz(m); voice('sine', mf, t, E * 6, 0.4, musicBus, true, 0.04); voice('sine', mf * 2, t, E * 3, 0.1, musicBus, true, 0.04); }
    },
    bossa: function (t, beat, bar, ph, E, chord) {           // nylon guitar, walking bass, brushes
      if (beat === 0 || beat === 3 || beat === 6) chord.forEach(function (n, i) { pluck(hz(n), t + i * 0.01, E * 1.7, 0.26); });
      if (beat === 0) bass(hz(cur.roots[bar]), t, E * 3.4, 0.85); if (beat === 4) bass(hz(cur.roots[bar] + 7), t, E * 3.4, 0.7);
      if (beat % 2 === 0) kick(t, 0.28);
      if (beat === 3 || beat === 6) noise(t, 0.03, 0.22, 'bandpass', 2600);                                // cross-stick
      noise(t, 0.05, beat % 2 === 0 ? 0.1 : 0.17, 'bandpass', 4800);                                      // shaker
      var m = cur.melody[ph][bar][beat];
      if (m !== null) { var mf = hz(m); voice('sine', mf, t, E * 2.4, 0.38, musicBus, true, 0.035); voice('sine', mf * 2, t, E * 1.2, 0.06, musicBus, false, 0.035); }
    },
    folk: function (t, beat, bar, ph, E, chord) {            // ukulele strums, shaker, a whistled tune
      var down = beat === 0 || beat === 2 || beat === 6, up = beat === 3 || beat === 5 || beat === 7;
      if (down) chord.forEach(function (n, i) { uke(hz(n), t + i * 0.016, E * 1.6, 0.3); });
      if (up) chord.slice().reverse().forEach(function (n, i) { uke(hz(n), t + i * 0.012, E * 1.1, 0.17); });
      if (beat === 0 || beat === 4) bass(hz(cur.roots[bar]), t, E * 2.6, 0.7);
      if (beat % 2 === 1) noise(t, 0.05, 0.15, 'bandpass', 5200);                                         // shaker on the off-beats
      var m = cur.melody[ph][bar][beat];
      if (m !== null) { var mf = hz(m); voice('sine', mf, t, E * 1.8, 0.4, musicBus, true, 0.04); voice('sine', mf * 2.01, t, E * 1.2, 0.07, musicBus, false, 0.04); }
    }
  };
  // a short, plucked note (nylon guitar and ukulele): a triangle with a quick-fading octave
  function pluck(freq, t, dur, vol) { voice('triangle', freq, t, dur, vol, musicBus, false, 0.003); voice('sine', freq * 2, t, dur * 0.5, vol * 0.3, musicBus, false, 0.003); }
  function uke(freq, t, dur, vol) {   // brighter and shorter than the guitar: a buzzy square layer and a tiny pick click
    voice('triangle', freq, t, dur * 0.8, vol, musicBus, false, 0.002); voice('square', freq, t, dur * 0.35, vol * 0.1, musicBus, false, 0.002); noise(t, 0.012, vol * 0.5, 'bandpass', 3200);
  }

  function schedule() {
    while (nextT < ctx.currentTime + 0.5) {
      var bar = Math.floor(step / 8) % 4, beat = step % 8, ph = Math.floor(step / 32) % 2, E = EIGHTH;
      var t = nextT + (cur.style === 'lofi' && beat % 2 === 1 ? E * 0.2 : 0);          // lo-fi leans late on the off-beats
      STYLE[cur.style](t, beat, bar, ph, E, cur.chords[bar]);
      nextT += EIGHTH; step++;
    }
  }

  window.LamparaAudio = {
    play: function (name) {
      if (muted || !ensure()) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
        if (playing) return;
        var which = pick(name || 'tour'); cur = TRACKS[which] || TRACKS.dawn; EIGHTH = 60 / cur.bpm / 2;
        try { document.documentElement.setAttribute('data-music', which); } catch (e) { /* ignore */ }
        if (warm) warm.frequency.setValueAtTime(cur.warm || 3000, ctx.currentTime);
        if (echo) echo.delayTime.value = EIGHTH * 3;
        playing = true; nextT = ctx.currentTime + 0.08; step = 0;
        timer = setInterval(schedule, 120);
      } catch (e) { /* no sound on this phone */ }
    },
    stop: function () {
      playing = false; clearInterval(timer); timer = 0;
      try { if (ctx) ctx.suspend(); } catch (e) { /* ignore */ }
    },
    // One chirp per typed letter; the pitch wanders a little so it sounds like speech, not a buzzer.
    blip: function (ch) {
      if (muted || !ctx || ctx.state !== 'running') return;
      var code = ch ? ch.charCodeAt(0) : 0, freq = 520 + (code % 6) * 55;
      voice(pulse50, freq, ctx.currentTime, 0.05, 0.9, sfxBus, false);
    },
    // One soft footstep: a hushed scuff and a low thud, alternating a touch in pitch left and right. Kept apart from the music.
    step: function () {
      if (muted || !ensure() || ctx.state !== 'running') return;
      var t = ctx.currentTime + 0.003; foot = !foot;
      noise(t, 0.055, 1.1, 'bandpass', foot ? 640 : 760, sfxBus);
      voice('sine', foot ? 112 : 98, t, 0.08, 0.9, sfxBus, false, 0.003);
    },
    // A short two-part "pop" for taps; the pitch steps up a little each time so a run of taps sounds playful, not like a buzzer.
    click: function () {
      if (muted || !ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      var t = ctx.currentTime + 0.005, f = [784, 880, 988, 1175][clicks++ % 4];
      voice(pulse50, f, t, 0.06, 1, sfxBus, false);
      voice(pulse25, f * 1.5, t + 0.035, 0.07, 0.7, sfxBus, false);
    },
    // The student's saved choice (this phone only), shared by every page that plays music.
    enabled: function () { try { return localStorage.getItem('lampara_music') !== '0'; } catch (e) { return true; } },
    setEnabled: function (on) { try { localStorage.setItem('lampara_music', on ? '1' : '0'); } catch (e) { /* not remembered */ } },
    // One switch for everything (music, blips, jingles): a muted page stays silent, whatever asks for sound.
    mute: function (on) { muted = !!on; if (muted) window.LamparaAudio.stop(); },
    // Climbing steps: seven quick notes going up, for the "Take the stairs" card.
    stairs: function () {
      if (muted || !ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      var t = ctx.currentTime + 0.02;
      [392, 440, 494, 523.25, 587.33, 659.25, 783.99].forEach(function (f, i) { voice(pulse50, f, t + i * 0.07, 0.1, 1, sfxBus, false); tick(t + i * 0.07, 0.3, sfxBus); });
    },
    chime: function () {
      if (muted || !ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      var t = ctx.currentTime + 0.02;
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { voice(pulse25, f, t + i * 0.08, 0.16, 1, sfxBus, false); });
    }
  };
})();
