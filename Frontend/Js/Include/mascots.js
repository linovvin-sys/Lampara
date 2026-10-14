/* Lampara mascots: 12 original pixel lamp characters, plus the points and unlocks that go with them.
   Everything lives in this phone's localStorage (no account, no server), so it works offline. If storage is blocked it
   still works for the visit, it just is not remembered.
   <img data-mascot> anywhere on a page (the chat avatar) is filled with the mascot the student has equipped. */
(function () {
  'use strict';

  var KEY = 'lampara_mascots';
  var PAL = { k: '#161850', y: '#ffd100', Y: '#fff3b8', o: '#d4ab00', w: '#ffffff', b: '#2e3192', n: '#23267a', l: '#dcddf4', c: 'currentColor', h: '#2a2018', f: '#e2ab70', F: '#c18850', r: '#ff0000', R: '#9b1c1c', e: '#22c55e', a: '#f59e0b', g: '#8a8fb8', s: '#7a4b24' };

  // 16 x 16 sprites. '.' is see-through; the letters are the colours in PAL. Faces are two eyes and a mouth.
  // Rarities: a mascot with `rarity: 'mythic'` is shown with a golden frame in the shop.
  var LIST = [
    { id: 'lumi', name: 'Lumi', price: 0, blurb: 'The classic lantern. Your first buddy.', rows: [
      '......kkkk......',
      '.....k....k.....',
      '.......yy.......',
      '......yYYy......',
      '....kkkkkkkk....',
      '...kYYYYYYYYk...',
      '..kYYyyyyyyYYk..',
      '..kYykyyyykyYk..',
      '..kYykyyyykyYk..',
      '..kYyyykkyyyYk..',
      '..kYyyyyyyyyYk..',
      '...kYyyyyyyYk...',
      '....kkkkkkkk....',
      '...kbbbbbbbbk...',
      '...kkkkkkkkkk...',
      '................'] },
    { id: 'bulby', name: 'Bulby', price: 20, blurb: 'Bright idea, always on.', rows: [
      '................',
      '.....kkkkkk.....',
      '...kkYYYYYYkk...',
      '..kYYYYYYYYYYk..',
      '..kYYkYYYYkYYk..',
      '..kYYkYYYYkYYk..',
      '..kYYYYkkYYYYk..',
      '..kYYYYYYYYYYk..',
      '...kYYYYYYYYk...',
      '....kkYYYYkk....',
      '.....kyyyyk.....',
      '.....kkkkkk.....',
      '.....kgggk......',
      '.....kkkkk......',
      '......kkk.......',
      '................'] },
    { id: 'shade', name: 'Shade', price: 20, blurb: 'A cosy table lamp.', rows: [
      '................',
      '.....kkkkkk.....',
      '...kkYYYYYYkk...',
      '..kYYYYYYYYYYk..',
      '.kYYkYYYYYYkYYk.',
      '.kYYkYYYYYYkYYk.',
      '.kYYYYYkkYYYYYk.',
      '.kkkkkkkkkkkkkk.',
      '.......kk.......',
      '......kbbk......',
      '......kbbk......',
      '......kbbk......',
      '.....kbbbbk.....',
      '....kbbbbbbk....',
      '....kkkkkkkk....',
      '................'] },
    { id: 'waxy', name: 'Waxy', price: 30, blurb: 'A little candle with a big glow.', rows: [
      '.......a........',
      '......aya.......',
      '......ayya......',
      '.......kk.......',
      '.....kkwwkk.....',
      '....kwwwwwwk....',
      '....kwkwwkwk....',
      '....kwkwwkwk....',
      '....kwwkkwwk....',
      '....kwwwwwwk....',
      '....kwwwwwwk....',
      '..kkkkkkkkkkkk..',
      '..kbbbbbbbbbbk..',
      '...kbbbbbbbbk...',
      '....kkkkkkkk....',
      '................'] },
    { id: 'parol', name: 'Parol', price: 40, blurb: 'A Filipino star lantern.', rows: [
      '.......kk.......',
      '......kyyk......',
      '......kyyk......',
      '..kkkkkyykkkkk..',
      '.kyyyyyyyyyyyyk.',
      '..kyyykyykyyyk..',
      '...kyyyykkyyk...',
      '....kyyyyyyk....',
      '...kyyyyyyyyk...',
      '..kyyyykkyyyyk..',
      '..kyyyk..kyyyk..',
      '..kyyk....kyyk..',
      '..kkk..rr..kkk..',
      '......rRRr......',
      '......rRRr......',
      '.......rr.......'] },
    { id: 'farol', name: 'Farol', price: 50, blurb: 'A round paper lantern.', rows: [
      '.......kk.......',
      '.....kkkkkk.....',
      '...kkrrrrrrkk...',
      '..krrrrrrrrrrk..',
      '.krrkrrrrrrkrrk.',
      '.krrkrrrrrrkrrk.',
      '.krrrrrkkrrrrrk.',
      '.krrrrrrrrrrrrk.',
      '..krrrrrrrrrrk..',
      '...kkrrrrrrkk...',
      '.....kkkkkk.....',
      '.......yy.......',
      '......yyyy......',
      '.......yy.......',
      '.......yy.......',
      '................'] },
    { id: 'genie', name: 'Genie', price: 60, blurb: 'Rub the lamp, make a wish.', rows: [
      '.........a......',
      '........aya.....',
      '.........a......',
      '...k....kkk.....',
      '...kk..kyyyk....',
      '....kkkyyyyyk.kk',
      '.....kyyykyykk.k',
      '.....kyykyykyk.k',
      '.....kyyyyyyyk.k',
      '......kyyyyykkk.',
      '.......kyyyyk...',
      '........kkkk....',
      '.......kyyyyk...',
      '......kkkkkkkk..',
      '................',
      '................'] },
    { id: 'desk', name: 'Deskie', price: 80, blurb: 'Studies late, glows bright.', rows: [
      '................',
      '..kkkkkkkk......',
      '.kYYYYYYYYk.....',
      'kYYkYYYYkYYk....',
      'kYYkYYYYkYYk....',
      'kYYYYkkYYYYYk...',
      '.kkkkkkkkkkk....',
      '......kb........',
      '.......kb.......',
      '.......kb.......',
      '......kb........',
      '.....kb.........',
      '.....kb.........',
      '..kkkkbkkkk.....',
      '.kbbbbbbbbbk....',
      '.kkkkkkkkkkk....'] },
    { id: 'jar', name: 'Glowjar', price: 100, blurb: 'Fireflies in a jar.', rows: [
      '................',
      '....kkkkkkkk....',
      '....kbbbbbbk....',
      '....kkkkkkkk....',
      '...kllllllllk...',
      '..kllYllllllllk.',
      '..kllkllllkllk..',
      '..kllkllllkllk..',
      '..klllllkklllk..',
      '..kllllYlllllk..',
      '..kllllllllYlk..',
      '..kllllllllllk..',
      '...kllllllllk...',
      '....kkkkkkkk....',
      '................',
      '................'] },
    { id: 'post', name: 'Lampost', price: 120, blurb: 'Keeps the campus path lit.', rows: [
      '.....kkkkkk.....',
      '....kbbbbbbk....',
      '...kkkkkkkkkk...',
      '..kYYYYYYYYYYk..',
      '..kYkYYYYYYkYk..',
      '..kYkYYYYYYkYk..',
      '..kYYYYkkYYYYk..',
      '..kYYYYYYYYYYk..',
      '...kkkkkkkkkk...',
      '......kbbk......',
      '......kbbk......',
      '......kbbk......',
      '......kbbk......',
      '.....kbbbbk.....',
      '....kbbbbbbk....',
      '....kkkkkkkk....'] },
    { id: 'torch', name: 'Blaze', price: 150, blurb: 'A brave little torch.', rows: [
      '.......a........',
      '......aaa.......',
      '.....aayaa......',
      '....aayyyaa.....',
      '....ayykyyka....',
      '....ayykyyka....',
      '....ayyykkya....',
      '.....ayyyya.....',
      '......kkkk......',
      '......kssk......',
      '......kssk......',
      '......kssk......',
      '......kssk......',
      '......kssk......',
      '.......kk.......',
      '................'] },
    { id: 'beacon', name: 'Beacon', price: 200, blurb: 'A lighthouse that guides everyone home.', rows: [
      '.....kkkkkk.....',
      '....krrrrrrk....',
      '...kkkkkkkkkk...',
      '...kYYYYYYYYk...',
      '..YkYkYYYYkYkY..',
      '..YkYkYYYYkYkY..',
      '...kYYYkkYYYk...',
      '...kkkkkkkkkk...',
      '....kwwwwwwk....',
      '....krrrrrrk....',
      '....kwwwwwwk....',
      '...krrrrrrrrk...',
      '...kwwwwwwwwk...',
      '..kkkkkkkkkkkk..',
      '..kbbbbbbbbbbk..',
      '..kkkkkkkkkkkk..'] },
    { id: 'guardian', name: 'Mythic Guardian', price: 1000, rarity: 'mythic', blurb: 'A winged, flame-crowned guardian of the campus. Worth a thousand points.', pal: {"A": "#dcedbf", "B": "#9d8e62", "C": "#000000", "D": "#4b4428", "E": "#1b1614", "G": "#000009", "H": "#fffed4", "I": "#2c0000", "J": "#c7b67c", "L": "#ffe597", "M": "#eeb87c", "N": "#cd9b68", "O": "#631f03", "P": "#f5cd89", "Q": "#8c6e41", "R": "#c58453", "S": "#834d1d", "W": "#cfd3f0", "V": "#aeb4de"}, rows: [
      "................................................",
      "................................................",
      ".......................k........................",
      "......................kak..k....................",
      "....................kkaak.kak...................",
      "...................kakayakkaak..................",
      "..................kaaayyaaayak..................",
      ".................kaayyyYyyyyaak.................",
      ".................kayyyYYYyyyyak.................",
      "................kaayyyYYYyyyyaak................",
      "................kayyyyyYyyyyyyak................",
      "...........k...kkyyyyyyyyyyyyyykk...k...........",
      "..........kwk...kyyyyyyyyyyyyyyk...kwk..........",
      "....k.....kwWk...kkkkkkkkkkkkkk...kwWk.....k....",
      "...kwk....kWwk.....kAABkkAAAkk....kwwk....kwk...",
      "...kwWk...kwwwk...kBCCCCCCCDAAk..kwwwk...kwWk...",
      ".k..kwwkkkwwwwk.kkCCCEEEECCCCDAk.kWwwwkkkwwk..k.",
      "kwkkkwwwWkwwwWwkCCCGCCEGGEECCCEHkwwWwwkwWwwkkkwk",
      ".kWwkwwWwwwwWwwkCCCCCCCCCCCGCCCEHwwwWwwwwWwkwwk.",
      ".kwwwkWwwwwWwwwCCCCCCEECCCCCGCCCBwwwwWwwwwkwwwk.",
      "k.kwwWwwwwWwwwCCCIDBJLLLHHMNDCCCCAwwwwWwwwwWwk.k",
      "wkkwWwwwwWwwwwCCOBPLPLLLLPPLLDCCCCWwwwwWwwwwWkkw",
      "kwwkwwwwWwwwwWCOQNPLPLHLHHLPPQCCCCwWwwwwWwwwkWwk",
      "kwWwwwwWwwwwWwCQNNLLLLLLLLPMMRICCCwwWwwwwWwwwwWk",
      ".kwwwwWwwwwWwCGBNNPMLLLPLLPPMRQECCEwwWwwwwWwwwk.",
      ".kwwwWwwwwWwwCGQNRNPLHHHHHHHLBRQCCDwwwWwwwwWwwk.",
      "..kVWVVVVWVVVCCSBAHHHHHHHJBOISQJICDVVVVWVVVVWk..",
      "..kWVVVVWVVVVWCDDSOOJHHHROSJBJNNICVWVVVVWVVVVk..",
      "...kVVVWVVVVWVCOABBBQOHLPNQCISJBQIVVWVVVVWVVk...",
      "...kVVWVVVVWVVCBBIIDHONLRSJHLMNQQIVVVWVVVVWVk...",
      "....kWVVVVWVVVVQQSJHLIPHNPMNMLMRSOVVVVWVVVVk....",
      ".....kkVVWVVVVWSLHLPNOPHRRHLMLMRQVWVVVVWVkk.....",
      ".......kWVVVVWVVLPMLPIHHMNMHHLMRVVVWVVVVk.......",
      "........kVVVWVVVJPLHNOHHPNRLHLMNVVVVWVVk........",
      ".........kVWVVVVWVHHJQONNRMLNPPVWVVVVWk.........",
      "..........kVVVVWVVLNPJPPPLMRRPVVVWVVVk..........",
      "...........kVVWVVPMNSOSRNROSNMMVVVWVk...........",
      "...........kVWVVEBLLJOSRMPLPNNJNVVVWk...........",
      "............kVVVVIBRNNMNNPPMMJNOOSVk............",
      ".............kVVWVDOSPRRPLJLHQOSBBCk............",
      "..............kWVVVVOQJJJJNNSOQBBBCk............",
      "...............kVVVWkIOSSOSOQJBRJSEk............",
      "................kVWVkDQOSQNAJRBJBODk............",
      ".................kVEkESJSQBJJNPJDDkk............",
      "..................kk.kIJBSJLHJQDkkDDk...........",
      "..................kQkkCOBQOBBIDkkDDOk...........",
      "...................k..kkkkkkkkk..kkk............",
      "................................................"] }
  ];

  var mem = null, listeners = [], cache = {}, canvases = {};

  // Small 12 x 12 pixel icons for the game screens (same letters as the mascots).
  var ICONS = {
    star: ['............', '.....kk.....', '....kyyk....', '....kyyk....', 'kkkkkyyykkkk', 'kyyyyyyyyyyk', '.kyyyyyyyyk.', '..kyyyyyyk..', '..kyyyyyyk..', '.kyyykkyyyk.', '.kyykk.kyyk.', '.kkk....kkk.'],
    flame: ['.....a......', '....aa......', '....aaa.....', '...aaaaa....', '..aaayaaa...', '..aayyyaa...', '.aayyyyyaa..', '.aayyYyyaa..', '.aayyYyyaa..', '..aayyyaa...', '...aaaaa....', '....aaa.....'],
    tree: ['.....ee.....', '...eeeeee...', '..eeeeeeee..', '.eeeeeeeeee.', '.eeeeeeeeee.', '..eeeeeeee..', '.eeeeeeeeee.', 'eeeeeeeeeeee', '....ssss....', '....ssss....', '....ssss....', '...kkkkkk...'],
    building: ['............', '..kkkkkkkk..', '..kbbbbbbk..', '..kbwbbwbk..', '..kbbbbbbk..', '..kbwbbwbk..', '..kbbbbbbk..', '..kbwbbwbk..', '..kbbyybbk..', '..kbbyybbk..', '.kkkkkkkkkk.', '............'],
    replay: ['............', '..cc........', '..cccc......', '..cccccc....', '..cccccccc..', '..cccccccccc', '..cccccccccc', '..cccccccc..', '..cccccc....', '..cccc......', '..cc........', '............'],
    share: ['.....cc.....', '....cccc....', '...cccccc...', '..cc.cc.cc..', '.....cc.....', '.....cc.....', '.....cc.....', '.cc..cc..cc.', '.cc......cc.', '.cc......cc.', '.cccccccccc.', '............'],
    flag: ['..cc........', '..ccccccc...', '..ccccccccc.', '..ccccccc...', '..cc........', '..cc........', '..cc........', '..cc........', '..cc........', '..cc........', '.cccc.......', '............'],
    home: ['.....cc.....', '....cccc....', '...cccccc...', '..cccccccc..', '.cccccccccc.', '..cc....cc..', '..cc....cc..', '..cc.cc.cc..', '..cc.cc.cc..', '..cc.cc.cc..', '..cccccccc..', '............'],
    back: ['............', '....c.......', '...cc.......', '..ccc.......', '.cccccccccc.', '.cccccccccc.', '..ccc.......', '...cc.......', '....c.......', '............', '............', '............'],
    pin: ['....kkkk....', '...krrrrk...', '..krrrrrrk..', '..krrwwrrk..', '..krrwwrrk..', '..krrrrrrk..', '...krrrrk...', '...krrrrk...', '....krrk....', '....krrk....', '.....kk.....', '............']
  };
  function iconSvg(name, size) {
    var rows = ICONS[name]; if (!rows) return '';
    var out = '';
    rows.forEach(function (row, y) {
      var x = 0;
      while (x < row.length) { var c = row[x], x2 = x; while (x2 < row.length && row[x2] === c) x2++; if (c !== '.') out += '<rect x="' + x + '" y="' + y + '" width="' + (x2 - x) + '" height="1" fill="' + PAL[c] + '"/>'; x = x2; }
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + rows[0].length + ' ' + rows.length + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' + out + '</svg>';
  }

  // ---- Weekly quests: three picked each Monday from this list, by what the student really does ----
  // ev: the thing that counts. target: how many different ones. Progress and rewards live in the same on-phone save.
  var QUESTS = [
    { id: 'arrive2', ev: 'arrive', target: 2, pts: 20, text: 'Arrive at 2 buildings' },
    { id: 'route2', ev: 'route', target: 2, pts: 20, text: 'Finish 2 indoor routes' },
    { id: 'ask2', ev: 'ask', target: 2, pts: 10, text: 'Ask Lampara 2 questions' },
    { id: 'quiz1', ev: 'quiz', target: 1, pts: 10, text: 'Play the campus quiz' },
    { id: 'scan3', ev: 'scan', target: 3, pts: 15, text: 'Scan 3 room signs' },
    { id: 'stamp2', ev: 'orient', target: 2, pts: 20, text: 'Collect 2 orientation stamps' },
    { id: 'arrive3', ev: 'arrive', target: 3, pts: 30, text: 'Arrive at 3 buildings' },
    { id: 'route1', ev: 'route', target: 1, pts: 10, text: 'Finish an indoor route' },
    { id: 'route3', ev: 'route', target: 3, pts: 30, text: 'Finish 3 indoor routes' },
    { id: 'ask4', ev: 'ask', target: 4, pts: 20, text: 'Ask Lampara 4 questions' },
    { id: 'scan1', ev: 'scan', target: 1, pts: 5, text: 'Scan a room sign' },
    { id: 'scan5', ev: 'scan', target: 5, pts: 25, text: 'Scan 5 room signs' },
    { id: 'stamp1', ev: 'orient', target: 1, pts: 10, text: 'Collect an orientation stamp' }
  ];

  // ---- Achievements earned by using the app: each one has a test run over the saved progress after every change ----
  function nKeys(e, prefix) { var n = 0; for (var k in e) if (k.indexOf(prefix) === 0) n++; return n; }
  function nEv(s, name) { return s.c && s.c[name] ? s.c[name].length : 0; }
  function total(e) { var t = 0; for (var k in e) t += e[k]; return t; }
  var ACH = [
    { id: 'a:visit1', name: 'First Steps', about: 'Arrive at your first building', pts: 5, test: function (s) { return nKeys(s.earned, 'visit:') >= 1; } },
    { id: 'a:visit3', name: 'Getting Around', about: 'Arrive at 3 buildings', pts: 15, test: function (s) { return nKeys(s.earned, 'visit:') >= 3; } },
    { id: 'a:visit5', name: 'Campus Wanderer', about: 'Arrive at 5 buildings', pts: 25, test: function (s) { return nKeys(s.earned, 'visit:') >= 5; } },
    { id: 'a:route1', name: 'Indoor Pathfinder', about: 'Finish an indoor route', pts: 10, test: function (s) { return nKeys(s.earned, 'route:') >= 1; } },
    { id: 'a:route5', name: 'Floor Master', about: 'Finish 5 indoor routes', pts: 25, test: function (s) { return nKeys(s.earned, 'route:') >= 5; } },
    { id: 'a:route10', name: 'Route Veteran', about: 'Finish 10 indoor routes', pts: 40, test: function (s) { return nKeys(s.earned, 'route:') >= 10; } },
    { id: 'a:scan1', name: 'Sign Reader', about: 'Scan a room sign', pts: 5, test: function (s) { return nEv(s, 'scan') >= 1; } },
    { id: 'a:scan10', name: 'Sign Spotter', about: 'Scan 10 room signs', pts: 20, test: function (s) { return nEv(s, 'scan') >= 10; } },
    { id: 'a:ask5', name: 'Curious Mind', about: 'Ask Lampara 5 questions', pts: 10, test: function (s) { return nEv(s, 'ask') >= 5; } },
    { id: 'a:ask20', name: 'Question Machine', about: 'Ask Lampara 20 questions', pts: 25, test: function (s) { return nEv(s, 'ask') >= 20; } },
    { id: 'a:quiz1', name: 'Quiz Taker', about: 'Play the campus quiz', pts: 5, test: function (s) { return nEv(s, 'quiz') >= 1; } },
    { id: 'a:quiz5', name: 'Quiz Regular', about: 'Play the campus quiz on 5 days', pts: 20, test: function (s) { return nEv(s, 'quiz') >= 5; } },
    { id: 'a:stamp3', name: 'Orientation Rookie', about: 'Collect 3 orientation stamps', pts: 15, test: function (s) { return nEv(s, 'orient') >= 3; } },
    { id: 'a:quest1', name: 'Quest Starter', about: 'Finish a weekly quest', pts: 10, test: function (s) { return nKeys(s.earned, 'quest:') >= 1; } },
    { id: 'a:quest5', name: 'Quest Hunter', about: 'Finish 5 weekly quests', pts: 30, test: function (s) { return nKeys(s.earned, 'quest:') >= 5; } },
    { id: 'a:buddy', name: 'New Buddy', about: 'Get a second mascot', pts: 10, test: function (s) { return s.owned.length >= 2; } },
    { id: 'a:collector', name: 'Collector', about: 'Own 4 mascots', pts: 25, test: function (s) { return s.owned.length >= 4; } },
    { id: 'a:style', name: 'Dressed Up', about: 'Get a seasonal theme', pts: 10, test: function (s) { return (s.themes || []).length >= 1; } },
    { id: 'a:wardrobe', name: 'Wardrobe', about: 'Own every seasonal theme', pts: 40, test: function (s) { return (s.themes || []).length >= 4; } },
    { id: 'a:pts100', name: 'Pocket Change', about: 'Earn 100 points in total', pts: 10, test: function (s) { return total(s.earned) >= 100; } },
    { id: 'a:pts500', name: 'Big Saver', about: 'Earn 500 points in total', pts: 30, test: function (s) { return total(s.earned) >= 500; } },
    { id: 'a:streak14', name: 'Fortnight Fan', about: 'Open the guide 14 days in a row', pts: 50, test: function (s) { return (s.streak || 0) >= 14; } }
  ];
  var sweeping = false;
  function sweep(s) {
    if (sweeping) return;
    sweeping = true;
    ACH.forEach(function (a) { if (s.earned[a.id] === undefined && a.test(s)) { s.earned[a.id] = a.pts; toast(a.name, a.pts); } });
    sweeping = false;
  }
  function weekKey() { var d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKeyOf(d); }   // the Monday of this week
  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; }
  function weekQuests(week) { return QUESTS.slice().sort(function (a, b) { return hash(a.id + week) - hash(b.id + week); }).slice(0, 3); }

  // ---- Orientation week: the offices a new student needs, stamped when an indoor route to one is finished ----
  var TRAIL = [['registrar', 'Registrar'], ['library', 'Library'], ['clinic', 'Clinic'], ['cashier', 'Cashier'], ['guidance', 'Guidance'], ['student affairs', 'Student affairs']];

  // ---- A small pixel pop-up for points earned (queued; waits for the tutorial to finish). Works on any page that loads this file. ----
  var tq = [], showing = false, tEl = null;
  function toast(text, pts) { tq.push({ text: text, pts: pts }); pump(); }
  function pump() {
    if (showing || !tq.length) return;
    if (window.LamparaTutorial && window.LamparaTutorial.active) { setTimeout(pump, 1000); return; }
    var t = tq.shift(); showing = true;
    if (!tEl) {
      var st = document.createElement('style');
      st.textContent = '.lm-toast{position:fixed;left:0;right:0;margin-inline:auto;width:max-content;bottom:calc(max(.9rem,env(safe-area-inset-bottom)) + 5rem);z-index:2000;max-width:calc(100vw - 1.5rem);display:flex;align-items:center;gap:.45rem;padding:.55rem .9rem;background:#ffd100;color:#161850;font:700 .9rem/1.25 "Pixelify Sans","Outfit",system-ui,sans-serif;clip-path:polygon(0 4px,2px 4px,2px 2px,4px 2px,4px 0,calc(100% - 4px) 0,calc(100% - 4px) 2px,calc(100% - 2px) 2px,calc(100% - 2px) 4px,100% 4px,100% calc(100% - 4px),calc(100% - 2px) calc(100% - 4px),calc(100% - 2px) calc(100% - 2px),calc(100% - 4px) calc(100% - 2px),calc(100% - 4px) 100%,4px 100%,4px calc(100% - 2px),2px calc(100% - 2px),2px calc(100% - 4px),0 calc(100% - 4px));pointer-events:none;animation:lm-in 320ms cubic-bezier(.23,1,.32,1) both}.lm-toast[hidden]{display:none}.lm-star{flex:none;width:14px;height:14px;background:currentColor;clip-path:polygon(50% 0,62% 36%,100% 38%,70% 60%,80% 100%,50% 76%,20% 100%,30% 60%,0 38%,38% 36%)}@keyframes lm-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.lm-toast{animation:none}}';
      document.head.appendChild(st);
      tEl = document.createElement('p'); tEl.className = 'lm-toast'; tEl.setAttribute('role', 'status'); document.body.appendChild(tEl);
    }
    tEl.textContent = ''; var s = document.createElement('span'); s.className = 'lm-star'; s.setAttribute('aria-hidden', 'true'); tEl.appendChild(s);
    tEl.appendChild(document.createTextNode(t.text + ' +' + t.pts + ' pts')); tEl.hidden = false;
    if (window.LamparaAudio) window.LamparaAudio.chime();   // (it stays silent when the student has muted sound)
    setTimeout(function () { tEl.hidden = true; showing = false; setTimeout(pump, 300); }, 3600);
  }

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = mem || {};
    s.earned = s.earned || {}; s.owned = s.owned || ['lumi']; s.spent = s.spent || 0;
    if (s.owned.indexOf('lumi') < 0) s.owned.push('lumi');
    if (!get(s.eq) || s.owned.indexOf(s.eq) < 0) s.eq = 'lumi';
    return s;
  }
  // Seasonal themes: bought with points, half price while their season is on (dates are on the phone's clock).
  var THEMES = [
    { id: 'default', name: 'Lampara Night', note: 'The original look', price: 0, sw: ['#ffd100', '#2e3192'] },
    { id: 'halloween', name: 'Halloween', note: 'Pumpkins and bats', price: 200, sw: ['#ff8a1f', '#3f7d1f'], from: [10, 15], to: [11, 2] },
    { id: 'christmas', name: 'Christmas', note: 'Snow and trees', price: 200, sw: ['#ff5a5f', '#1f7a45'], from: [12, 1], to: [12, 31] },
    { id: 'newyear', name: 'New Year', note: 'Fireworks', price: 200, sw: ['#ffcf33', '#565c78'], from: [12, 26], to: [1, 7] },
    { id: 'valentine', name: 'Valentine', note: 'Floating hearts', price: 200, sw: ['#ff7aa8', '#b8325f'], from: [2, 1], to: [2, 20] }
  ];
  function themeOf(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return null; }
  function inSeason(t) {
    if (!t.from) return false;
    var d = new Date(), v = (d.getMonth() + 1) * 100 + d.getDate(), a = t.from[0] * 100 + t.from[1], b = t.to[0] * 100 + t.to[1];
    return a <= b ? v >= a && v <= b : v >= a || v <= b;
  }
  function themePrice(t) { return inSeason(t) ? Math.round(t.price / 2) : t.price; }
  function applyTheme(id) {
    id = themeOf(id) ? id : 'default';
    if (id === 'default') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem('lampara_theme', id); } catch (e) { /* not remembered */ }
  }
  function save(s) {
    sweep(s);
    mem = s;
    applyTheme(s.theme);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* not remembered after this visit */ }
    refreshImages();
    listeners.forEach(function (f) { try { f(s); } catch (e) { /* ignore */ } });
  }
  function dayKeyOf(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function dayKey(offset) { var d = new Date(); d.setDate(d.getDate() + offset); return dayKeyOf(d); }
  function get(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }

  // Sprite to SVG: one rect per run of same-coloured pixels.
  // a mascot's colours: the shared letters plus any of its own (`pal`)
  function palOf(m) { if (!m.pal) return PAL; if (!m._pal) { m._pal = {}; for (var k in PAL) m._pal[k] = PAL[k]; for (var j in m.pal) m._pal[j] = m.pal[j]; } return m._pal; }
  function svg(id, size) {
    var m = get(id) || LIST[0], key = m.id + ':' + size, P = palOf(m);
    if (cache[key]) return cache[key];
    var out = '';
    m.rows.forEach(function (row, y) {
      var x = 0;
      while (x < row.length) {
        var c = row[x], x2 = x;
        while (x2 < row.length && row[x2] === c) x2++;
        if (c !== '.') out += '<rect x="' + x + '" y="' + y + '" width="' + (x2 - x) + '" height="1" fill="' + P[c] + '"/>';
        x = x2;
      }
    });
    var n = m.rows.length;
    return (cache[key] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" role="img" aria-label="' + m.name + '">' + out + '</svg>');
  }
  function uri(id) { return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg(id, 64)); }

  function refreshImages() {
    var eq = load().eq, imgs = document.querySelectorAll('img[data-mascot]');
    for (var i = 0; i < imgs.length; i++) { var u = uri(eq); if (imgs[i].getAttribute('src') !== u) imgs[i].setAttribute('src', u); }
    var pid = eq === 'lumi' ? 'bulby' : 'lumi', ps = document.querySelectorAll('img[data-partner]');   // Valentine's running partner: another mascot
    for (var j = 0; j < ps.length; j++) { var pu = uri(pid); if (ps[j].getAttribute('src') !== pu) ps[j].setAttribute('src', pu); }
  }

  var api = {
    list: LIST,
    achievements: ACH.map(function (a) { return { id: a.id, name: a.name, about: a.about, pts: a.pts }; }),
    themes: THEMES.map(function (t) { return { id: t.id, name: t.name, note: t.note, sw: t.sw, price: themePrice(t), full: t.price, season: inSeason(t) }; }),
    themeOwned: function (id) { return id === 'default' || (load().themes || []).indexOf(id) >= 0; },
    theme: function () { return load().theme || 'default'; },
    buyTheme: function (id) {
      var s = load(), t = themeOf(id); s.themes = s.themes || [];
      if (!t || api.themeOwned(id) || api.points() < themePrice(t)) return false;
      s.spent += themePrice(t); s.themes.push(id); s.theme = id; save(s); return true;
    },
    equipTheme: function (id) { var s = load(); if (!themeOf(id) || !api.themeOwned(id)) return false; s.theme = id; save(s); return true; },
    // Owner testing only: every theme for free.
    grantThemes: function () { var s = load(); s.themes = THEMES.slice(1).map(function (t) { return t.id; }); save(s); },
    get: get,
    svg: svg,
    uri: uri,
    equipped: function () { return load().eq; },
    // Daily streak: the first visit of each calendar day (the phone's own date) earns a little more the longer the run, up to 7 days.
    // Returns null if today already counted, else { count, pts }.
    daily: function () {
      var s = load(), t = dayKey(0);
      if (s.last === t) return null;
      s.streak = s.last === dayKey(-1) ? (s.streak || 0) + 1 : 1; s.last = t;
      var pts = 5 + 2 * (Math.min(s.streak, 7) - 1);
      s.earned['day:' + t] = pts; save(s);
      return { count: s.streak, pts: pts };
    },
    // A 16 x 16 offscreen canvas of the mascot, for drawImage on a canvas (crisp when scaled with smoothing off).
    canvas: function (id) {
      var m = get(id) || LIST[0];
      if (!canvases[m.id]) { var c = document.createElement('canvas'); c.width = c.height = m.rows.length; api.draw(c.getContext('2d'), m.id, 0, 0, 1); canvases[m.id] = c; }
      return canvases[m.id];
    },
    toast: toast,
    icon: iconSvg,
    // Something the student did: counts toward this week's quests. `key` makes repeats of the same thing count once.
    event: function (name, key) {
      var s = load(), w = weekKey(), done = [];
      s.c = s.c || {}; var cl = s.c[name] = s.c[name] || [], ck = key === undefined || key === null ? String(Date.now()) : String(key);
      if (cl.indexOf(ck) < 0) { cl.push(ck); if (cl.length > 200) cl.shift(); }
      if (!s.q || s.q.week !== w) s.q = { week: w, p: {}, done: {} };
      weekQuests(w).forEach(function (t) {
        if (t.ev !== name || s.q.done[t.id]) return;
        var p = s.q.p[t.id] = s.q.p[t.id] || [], k = String(key === undefined || key === null ? p.length + ':' + Date.now() : key);
        if (p.indexOf(k) < 0) p.push(k);
        if (p.length >= t.target) { s.q.done[t.id] = 1; s.earned['quest:' + w + ':' + t.id] = t.pts; done.push(t); }
      });
      save(s);
      done.forEach(function (t) { toast('Quest done: ' + t.text, t.pts); });
    },
    // This week's three quests with how far along each is.
    quests: function () {
      var s = load(), w = weekKey(), q = s.q && s.q.week === w ? s.q : { p: {}, done: {} };
      return weekQuests(w).map(function (t) { return { id: t.id, text: t.text, target: t.target, pts: t.pts, have: Math.min(t.target, (q.p[t.id] || []).length), done: !!q.done[t.id] }; });
    },
    // The orientation offices that exist in this school's directory, and which are already stamped.
    trail: function (rooms) {
      var e = load().earned, out = [];
      TRAIL.forEach(function (t) {
        for (var i = 0; i < (rooms || []).length; i++) {
          var r = rooms[i];
          if (r.map_x !== null && r.map_x !== undefined && String(r.room_name || '').toLowerCase().indexOf(t[0]) >= 0) { out.push({ label: t[1], room: r, done: e['orient:' + t[1]] !== undefined }); return; }
        }
      });
      return out;
    },
    // An indoor route to this room just finished: stamp the matching orientation office, and the whole trail when it is complete.
    stampRoom: function (room, rooms) {
      var name = String(room && room.room_name || '').toLowerCase();
      TRAIL.forEach(function (t) {
        if (name.indexOf(t[0]) >= 0 && api.award('orient:' + t[1], 15)) { toast('Orientation stamp: ' + t[1], 15); api.event('orient', t[1]); }
      });
      var tr = api.trail(rooms);
      if (tr.length && tr.every(function (x) { return x.done; }) && api.award('orient:done', 50)) toast('Orientation Complete', 50);
    },
    today: function () { return dayKey(0); },
    // Paints a mascot onto a canvas (for the share picture).
    draw: function (cx, id, x, y, scale) {
      var mm = get(id) || LIST[0], P = palOf(mm);
      mm.rows.forEach(function (row, j) { for (var i = 0; i < row.length; i++) if (row[i] !== '.') { cx.fillStyle = P[row[i]]; cx.fillRect(x + i * scale, y + j * scale, scale, scale); } });
    },
    streak: function () { var s = load(); return s.last === dayKey(0) || s.last === dayKey(-1) ? s.streak || 0 : 0; },
    visited: function () { var n = 0, e = load().earned; for (var k in e) if (k.indexOf('visit:') === 0) n++; return n; },
    points: function () { var s = load(), t = 0; for (var k in s.earned) t += s.earned[k]; return t - s.spent; },
    has: function (id) { return load().owned.indexOf(id) >= 0; },
    earnedList: function () { return load().earned; },
    onChange: function (f) { listeners.push(f); },
    // Gives points for an achievement, once. Returns true the first time only.
    award: function (id, pts) {
      var s = load();
      if (s.earned[id] !== undefined) return false;
      s.earned[id] = pts; save(s); return true;
    },
    buy: function (id) {
      var s = load(), m = get(id);
      if (!m || s.owned.indexOf(id) >= 0 || api.points() < m.price) return false;
      s.spent += m.price; s.owned.push(id); s.eq = id; save(s); return true;
    },
    // Owner testing only: gives a mascot for free (the shop only offers this to a logged-in admin).
    grant: function (id) {
      var s = load(), m = get(id);
      if (!m) return false;
      if (s.owned.indexOf(id) < 0) s.owned.push(id);
      s.eq = id; save(s); return true;
    },
    equip: function (id) { var s = load(); if (s.owned.indexOf(id) < 0) return false; s.eq = id; save(s); return true; }
  };
  window.LamparaMascots = api;
  applyTheme(load().theme);

  // Chat avatars (and any other <img data-mascot>) follow the equipped mascot, even ones a framework draws later.
  function watch() {
    refreshImages();
    if (window.MutationObserver) new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) if (list[i].addedNodes.length) { refreshImages(); return; }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
