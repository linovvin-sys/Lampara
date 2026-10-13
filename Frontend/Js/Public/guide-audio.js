/* Sound for the AR guide tutorial, all made live with the Web Audio API (no audio files, so it works offline):
     music  a slow, chill pixel-game loop (soft pulse arpeggio, round bass, tiny hi-hat, a little echo)
     blip   the short "text box" chirp heard while a card types itself out
     chime  a three-note jingle for an unlocked achievement
   Original tune. Nothing is saved; everything stops when the tour ends. */
(function () {
  'use strict';

  var ctx = null, master = null, musicBus = null, sfxBus = null, echo = null, noiseBuf = null, pulse25 = null, pulse50 = null;
  var timer = 0, nextT = 0, step = 0, playing = false;

  var BPM = 84, EIGHTH = 60 / BPM / 2;
  // Semitones above C4. Four bars: Cmaj7, Am7, Fmaj7, G6.
  var CHORDS = [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 4]];
  var ROOTS = [-12, -15, -19, -17];
  var ARP = [0, 1, 2, 3, 2, 1, 2, 3];
  var MELODY = [   // two 4-bar phrases, 8 eighth-notes a bar; null is a rest
    [[16, null, 19, null, 21, 19, 16, null], [14, null, 16, null, 12, null, 9, null], [12, null, 16, 19, 17, null, 16, null], [14, null, 19, null, 16, 14, 12, null]],
    [[19, null, 16, null, 14, 16, 19, null], [21, null, 19, null, 16, null, 14, null], [17, null, 16, 12, 14, null, 12, null], [11, null, 14, null, 19, null, null, null]]
  ];
  function hz(semi) { return 261.63 * Math.pow(2, semi / 12); }

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.05; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.05; sfxBus.connect(master);
      echo = ctx.createDelay(1); echo.delayTime.value = EIGHTH * 3;                 // dotted-eighth echo
      var fb = ctx.createGain(), wet = ctx.createGain(); fb.gain.value = 0.28; wet.gain.value = 0.45;
      echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(musicBus);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      pulse25 = pulse(0.25); pulse50 = pulse(0.5);
      return true;
    } catch (e) { ctx = null; return false; }
  }
  // A pulse wave with the given duty cycle: the thin, reedy "pixel console" voice.
  function pulse(duty) {
    var n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (var k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(re, im);
  }
  function voice(wave, freq, t, dur, vol, bus, sendEcho) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    if (typeof wave === 'string') o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); if (sendEcho) g.connect(echo);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function tick(t, vol) {
    var s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f); f.connect(g); g.connect(musicBus); s.start(t); s.stop(t + 0.05);
  }

  function schedule() {
    while (nextT < ctx.currentTime + 0.5) {
      var bar = Math.floor(step / 8) % 4, beat = step % 8, phrase = Math.floor(step / 32) % 2;
      var chord = CHORDS[bar], t = nextT;
      voice(pulse25, hz(chord[ARP[beat]] + 12), t, EIGHTH * 1.6, 0.34, musicBus, true);          // soft arpeggio
      if (beat === 0 || beat === 4) voice('triangle', hz(ROOTS[bar]), t, EIGHTH * 3.4, 0.95, musicBus, false);   // round bass
      var m = MELODY[phrase][bar][beat];
      if (m !== null) voice(pulse50, hz(m), t, EIGHTH * 1.8, 0.26, musicBus, true);              // tune
      if (beat % 2 === 1) tick(t, 0.16);                                                         // tiny hi-hat
      nextT += EIGHTH; step++;
    }
  }

  window.LamparaAudio = {
    play: function () {
      if (!ensure()) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
        if (playing) return;
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
      if (!ctx || ctx.state !== 'running') return;
      var code = ch ? ch.charCodeAt(0) : 0, freq = 520 + (code % 6) * 55;
      voice(pulse50, freq, ctx.currentTime, 0.05, 0.9, sfxBus, false);
    },
    chime: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      var t = ctx.currentTime + 0.02;
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { voice(pulse25, f, t + i * 0.08, 0.16, 1, sfxBus, false); });
    }
  };
})();
