/* فكرني، app logic. Vanilla JS, no build step. Data lives on the device (localStorage). */
(function () {
  'use strict';
  var P = window.FakkarnyParser;
  var KEY = 'fakkarny:v1';

  // ================= utils =================
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  var AR = '٠١٢٣٤٥٦٧٨٩';
  function ar(n) { return String(n).replace(/\d/g, function (d) { return AR[d]; }); }
  var dk = P.dateKey, addDays = P.addDays;
  function today() { return dk(new Date()); }
  function parseDk(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function diffDays(a, b) { return Math.round((parseDk(a) - parseDk(b)) / 86400000); }
  var WD = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  var WDF = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function periodWord(h) { return h < 5 ? 'بالليل' : h < 12 ? 'الصبح' : h < 15 ? 'الضهر' : h < 18 ? 'العصر' : h < 20 ? 'المغرب' : 'بالليل'; }
  function fmtTime(t) { if (!t) return ''; var p = t.split(':'), h = +p[0], m = p[1]; return ar(h % 12 || 12) + ':' + ar(m) + ' ' + periodWord(h); }
  function dayLabel(k) {
    var d = diffDays(k, today());
    if (d === 0) return 'النهارده'; if (d === 1) return 'بكرة'; if (d === -1) return 'امبارح'; if (d === 2) return 'بعد بكرة';
    var x = parseDk(k);
    if (d > 0 && d < 7) return WDF[x.getDay()];
    return ar(x.getDate()) + ' ' + MONTHS[x.getMonth()];
  }
  function longDate(d) { return WDF[d.getDay()] + '، ' + ar(d.getDate()) + ' ' + MONTHS[d.getMonth()]; }
  function weekKey(k) { var d = parseDk(k); var back = (d.getDay() + 1) % 7; return dk(addDays(d, -back)); } // week starts Saturday
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isStandalone = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));

  // ================= state =================
  function fresh() {
    return {
      v: 1, onboarded: false,
      profile: { name: '', coach: 'sarcastic', sound: true, notif: false, hideInstall: false },
      tasks: [], goals: [], people: [], reviews: {},
      stats: { xp: 0, days: {}, best: 0, total: 0, onTime: 0, killed: 0, calls: 0, voice: 0, focus: 0, goalHits: 0, bigDone: 0, snoozes: {}, badges: [] }
    };
  }
  var S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { S = fresh(); }
  (function migrate() { var f = fresh(); for (var k in f) if (S[k] == null) S[k] = f[k]; for (var j in f.stats) if (S.stats[j] == null) S.stats[j] = f.stats[j]; for (var p in f.profile) if (S.profile[p] == null) S.profile[p] = f.profile[p]; })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }

  // ================= coach =================
  var COACHES = {
    sarcastic: { name: 'صاحبك الرخم', face: '😏', desc: 'بيتريق عليك، بس مش هيسيبك تأجّل' },
    mom: { name: 'ماما الحنينة', face: '🥰', desc: 'حنينة وبتشجعك على طول' },
    sergeant: { name: 'الشاويش', face: '🪖', desc: 'مفيش هزار معاه' }
  };
  var LINES = {
    sarcastic: {
      empty: ['النهارده فاضي؟ ولا إنت ناسي حاجة؟ دوس المايك وقول.', 'مفيش ولا حاجة متسجلة يا {name}. مش مصدقك.', 'قول اللي في دماغك قبل ما تنساه.'],
      left: ['لسه {n} مستنيينك. مش هيخلصوا لوحدهم يا باشا.', '{n} حاجات ولسه بتقلّب في الموبايل. أنا شايفك.', 'خلّص واحدة بس دلوقتي وأنا هسكت.', 'كل ما تأجّلها بتتقل عليك. خلّصها وارتاح.'],
      overdue: ['عندك {n} متأخرين. التأجيل بقى هواية ولا إيه؟', '"{task}" مستنياك من كام يوم. اعملها دلوقتي وخد ١٥ نقطة زيادة.'],
      allDone: ['خلّصت كله؟ إنت مين وعملت إيه في {name}؟', 'خلاص، اليوم خلص. نام وإنت مرتاح.'],
      done: ['أيوه كده.', 'إيه ده، إنت بتخلّص حاجات؟', 'طلعت بتعرف أهو.', 'كمّل كده يا {name}.', 'حلو. اللي بعده.'],
      snooze: ['أجّلتها تاني؟ ماشي، أنا بعدّ.', 'التأجيل مش هيخليها تختفي يا {name}.', 'ماشي، بس المرة الجاية مش هعدّيها.'],
      voice: ['تمام، كتبت {n}. يلا بقى نفّذ.', 'كتبتهم. أنا هفكّرك، والباقي عليك.'],
      ping: ['يلا يا {name}، ده وقتها.', 'جه وقتها. ومتقوليش خمس دقايق.']
    },
    mom: {
      empty: ['يومك فاضي يا حبيبي؟ قولّي ناوي على إيه وأنا أفتكرلك.', 'مفيش حاجة النهارده؟ طب اشرب مية الأول.'],
      left: ['فاضلك {n} يا قلبي. واحدة واحدة.', 'ربنا يقويك يا {name}، قربت تخلص.', 'كمّل يا حبيبي، أنا عارفة إنك تقدر.'],
      overdue: ['في {n} اتأخروا شوية. مش مشكلة، نعملهم دلوقتي؟'],
      allDone: ['ما شاء الله، خلّصت كله. أنا فخورة بيك.', 'يومك كله تمام يا حبيبي.'],
      done: ['برافو عليك يا حبيبي.', 'ربنا يباركلك.', 'شاطر يا {name}.', 'كده أنا مبسوطة منك.'],
      snooze: ['ماشي يا حبيبي، بس متنساش.', 'خد راحتك، هفكّرك تاني.'],
      voice: ['حاضر يا قلبي، كتبتلك {n} ومش هسيبك تنساهم.'],
      ping: ['يا حبيبي جه وقتها.', 'متنساش يا قلبي.']
    },
    sergeant: {
      empty: ['مفيش مهام؟ إنت مش في أجازة. دوس المايك حالًا.'],
      left: ['فاضل {n}. اتحرك يا {name}.', 'مفيش وقت للكلام. نفّذ.'],
      overdue: ['عندك {n} متأخرين. ده تقصير. صلّحه حالًا.'],
      allDone: ['كله خلص. تمام يا فندم.'],
      done: ['تمام.', 'اتنفذ.', 'كده الشغل.', 'ممتاز يا عسكري.'],
      snooze: ['تأجيل؟ هتتسجل عليك.', 'مرة واحدة بس.'],
      voice: ['اتسجل {n} أوامر. نفّذ من دلوقتي.'],
      ping: ['الوقت جه. اتحرك.']
    }
  };
  function say(key, vars) {
    var set = LINES[S.profile.coach] || LINES.sarcastic;
    var s = pick(set[key] || LINES.sarcastic[key] || ['']);
    vars = vars || {}; vars.name = S.profile.name || 'باشا';
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? (typeof vars[k] === 'number' ? ar(vars[k]) : vars[k]) : ''; });
  }
  function greet() {
    var h = new Date().getHours(), n = S.profile.name ? ' يا ' + S.profile.name : '';
    if (h >= 5 && h < 12) return 'صباح الفل' + n;
    if (h >= 12 && h < 17) return 'إزيك' + n;
    if (h >= 17 && h < 22) return 'مساء الفل' + n;
    return 'لسه صاحي' + n + '؟';
  }

  // ================= levels / xp / badges =================
  var LV = [0, 40, 100, 180, 280, 400, 550, 730, 950, 1200, 1500, 1850, 2250, 2700, 3200];
  var TITLES = ['مبتدئ', 'بيحاول', 'صاحي', 'مش بيأجّل', 'منظّم', 'ماكينة', 'قنّاص', 'وحش', 'أسطورة', 'فوق الأسطورة'];
  var FACES = ['🐣', '🐥', '🦊', '🐺', '🐯', '🦁', '🦅', '🐉', '👑', '🚀'];
  function lvlInfo(xp) {
    var i = 0; while (i < LV.length - 1 && xp >= LV[i + 1]) i++;
    var cur = LV[i], next = LV[i + 1] != null ? LV[i + 1] : cur + 600;
    if (i === LV.length - 1) { var extra = Math.floor((xp - cur) / 600); i += extra; cur += extra * 600; next = cur + 600; }
    var n = i + 1;
    return { n: n, title: TITLES[Math.min(n - 1, TITLES.length - 1)], face: FACES[Math.min(n - 1, FACES.length - 1)], cur: cur, next: next, pct: (xp - cur) / (next - cur) };
  }
  function addXP(n, x, y) {
    var before = lvlInfo(S.stats.xp).n;
    S.stats.xp = Math.max(0, S.stats.xp + n);
    if (n > 0 && x != null) floatXP('+' + ar(n) + ' XP', x, y);
    var after = lvlInfo(S.stats.xp).n;
    if (after > before) setTimeout(function () { levelUp(after); }, 700);
  }
  function logActivity(delta) {
    var k = today(); S.stats.days[k] = Math.max(0, (S.stats.days[k] || 0) + delta);
    var st = streak(); if (st > S.stats.best) S.stats.best = st;
  }
  function streak() {
    var d = new Date(), n = 0;
    if (!S.stats.days[dk(d)]) d = addDays(d, -1);
    while (S.stats.days[dk(d)]) { n++; d = addDays(d, -1); }
    return n;
  }
  var BADGES = [
    { id: 'first', e: '🌱', t: 'أول خطوة', d: 'خلّصت أول حاجة', ok: function (s) { return s.total >= 1; } },
    { id: 's3', e: '🔥', t: '٣ أيام', d: 'ستريك ٣ أيام', ok: function (s) { return s.best >= 3; } },
    { id: 's7', e: '⚡', t: 'أسبوع نار', d: 'ستريك ٧ أيام', ok: function (s) { return s.best >= 7; } },
    { id: 's30', e: '💎', t: 'شهر كامل', d: 'ستريك ٣٠ يوم', ok: function (s) { return s.best >= 30; } },
    { id: 'killer', e: '🗡️', t: 'قاتل التسويف', d: 'خلّصت ٥ حاجات متأخرة', ok: function (s) { return s.killed >= 5; } },
    { id: 'early', e: '🐓', t: 'في الميعاد', d: '١٠ مهام في وقتها', ok: function (s) { return s.onTime >= 10; } },
    { id: 'family', e: '❤️', t: 'بار بأهله', d: '٥ مكالمات للحبايب', ok: function (s) { return s.calls >= 5; } },
    { id: 'voice', e: '🎙️', t: 'صوتك مسموع', d: '١٠ مرات بالصوت', ok: function (s) { return s.voice >= 10; } },
    { id: 'focus', e: '🧘', t: 'تركيز', d: '٥ جلسات تركيز', ok: function (s) { return s.focus >= 5; } },
    { id: 'goal', e: '🎯', t: 'قنّاص أهداف', d: 'حققت هدفك ٧ مرات', ok: function (s) { return s.goalHits >= 7; } },
    { id: 'big', e: '🏔️', t: 'كسرت الكبيرة', d: 'خلّصت مهمة كبيرة', ok: function (s) { return s.bigDone >= 1; } },
    { id: 'fifty', e: '🏅', t: 'نص مية', d: '٥٠ حاجة خلصت', ok: function (s) { return s.total >= 50; } }
  ];
  function checkBadges() {
    BADGES.forEach(function (b) {
      if (S.stats.badges.indexOf(b.id) < 0 && b.ok(S.stats)) {
        S.stats.badges.push(b.id);
        setTimeout(function () { toast(b.e, 'وسام جديد: <b>' + b.t + '</b>، ' + b.d); burst(innerWidth / 2, 80, 60); sfx('badge'); }, 900);
      }
    });
  }

  // ================= tasks =================
  function occursOn(t, k) {
    if (t.repeat && t.repeat !== 'none') {
      if (!t.date || k < t.date || (t.skip && t.skip[k])) return false;
      var d = parseDk(k), s = parseDk(t.date);
      if (t.repeat === 'daily') return true;
      if (t.repeat === 'weekly') return d.getDay() === s.getDay();
      if (t.repeat === 'monthly') return d.getDate() === s.getDate();
      return false;
    }
    if (t.date) return t.date === k;
    // undated: lives on "today" until done, then on the day it was done
    if (t.doneAt) return dk(new Date(t.doneAt)) === k;
    return k === today();
  }
  function isDone(t, k) { return t.repeat && t.repeat !== 'none' ? !!(t.doneDates && t.doneDates[k]) : !!t.doneAt; }
  function timeOn(t, k) { return (t.over && t.over[k]) || t.time; }
  function isOverdue(t) { return (!t.repeat || t.repeat === 'none') && t.date && t.date < today() && !t.doneAt; }
  function overdueList() { return S.tasks.filter(isOverdue).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
  function dayTasks(k) { return S.tasks.filter(function (t) { return occursOn(t, k); }); }
  function byTime(k) { return function (a, b) { var pa = a.priority === 'high' ? 0 : 1, pb = b.priority === 'high' ? 0 : 1; if (pa !== pb) return pa - pb; var x = timeOn(a, k) || '99', y = timeOn(b, k) || '99'; return x < y ? -1 : x > y ? 1 : (a.created || 0) - (b.created || 0); }; }
  function findTask(id) { for (var i = 0; i < S.tasks.length; i++) if (S.tasks[i].id === id) return S.tasks[i]; return null; }
  function findPerson(name) {
    if (!name) return null; var n = P.normalize(name).replace(/^ب/, '');
    for (var i = 0; i < S.people.length; i++) { var p = P.normalize(S.people[i].name); if (p === n || n.indexOf(p) >= 0 || p.indexOf(n) >= 0) return S.people[i]; }
    return null;
  }

  function newTask(o) {
    return {
      id: uid(), title: o.title || 'تذكير', emoji: o.emoji || '✨', cat: o.category || o.cat || 'other',
      date: o.date || null, time: o.time || null, repeat: o.repeat || 'none', person: o.person || null,
      isBig: !!o.isBig, steps: o.steps || [], notes: o.notes || '', priority: o.priority === 'high' ? 'high' : 'normal', created: Date.now(), snoozes: 0,
      doneAt: null, doneDates: {}, over: {}, skip: {}, xpGot: {}
    };
  }

  function toggleDone(t, k, el) {
    var done = isDone(t, k);
    var rect = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    var key = t.repeat !== 'none' ? k : 'x';
    if (done) {
      if (t.repeat !== 'none') delete t.doneDates[k]; else t.doneAt = null;
      var g = t.xpGot[key] || 10; addXP(-g); delete t.xpGot[key];
      S.stats.total = Math.max(0, S.stats.total - 1); logActivity(-1);
      save(); render(); return;
    }
    var xp = 10, why = '';
    var wasOverdue = isOverdue(t);
    var tm = timeOn(t, k);
    if (wasOverdue) { xp += 15; S.stats.killed++; why = 'خلّصت المتأخرة'; }
    else if (tm && k === today()) {
      var p = tm.split(':'), due = new Date(); due.setHours(+p[0], +p[1], 0, 0);
      if (Date.now() <= due.getTime() + 15 * 60000) { xp += 5; S.stats.onTime++; why = 'في ميعادها'; }
    }
    if (t.isBig) { xp += 20; S.stats.bigDone++; }
    if (t.repeat !== 'none') t.doneDates[k] = Date.now(); else t.doneAt = Date.now();
    t.xpGot[key] = xp;
    S.stats.total++; logActivity(1);
    if (t.person) { var pp = findPerson(t.person); if (pp) { pp.last = Date.now(); S.stats.calls++; } }
    addXP(xp, cx, cy - 20);
    burst(cx, cy, t.isBig ? 140 : 46); sfx('done'); buzz(18);
    var line = why ? why + '، ' + say('done') : say('done');
    if (Math.random() < .55 || why) toast('✅', line);
    checkBadges(); save();
    if (el) { var host = el.closest('.task'); if (host) host.classList.add('is-done', 'pop'); }
    setTimeout(render, 520);
    // all done today?
    setTimeout(function () {
      var list = dayTasks(today()).concat(overdueList());
      if (k === today() && list.length > 2 && list.every(function (x) { return isDone(x, today()); })) {
        burst(innerWidth / 2, innerHeight / 3, 220); sfx('level'); toast('🏆', say('allDone'));
      }
    }, 900);
  }

  function snooze(t, mode) {
    var k = today(), now = new Date();
    if (t.repeat !== 'none') {
      var at = mode === 'hour' ? new Date(now.getTime() + 3600000) : null;
      if (at && dk(at) === k) t.over[k] = pad2(at.getHours()) + ':' + pad2(at.getMinutes());
      else if (mode === 'night') t.over[k] = '21:00';
      else { t.skip = t.skip || {}; t.skip[k] = 1; } // repeating: skip today, it comes back tomorrow
    } else {
      if (mode === 'hour') { var a = new Date(now.getTime() + 3600000); t.date = dk(a); t.time = pad2(a.getHours()) + ':' + pad2(a.getMinutes()); }
      else if (mode === 'night') { t.date = k; t.time = '21:00'; }
      else if (mode === 'tomorrow') { t.date = dk(addDays(now, 1)); t.time = t.time || null; }
      else if (mode === 'tmorning') { t.date = dk(addDays(now, 1)); t.time = '09:00'; }
    }
    t.snoozes = (t.snoozes || 0) + 1;
    S.stats.snoozes[k] = (S.stats.snoozes[k] || 0) + 1;
    save(); render(); scheduleNotifs();
    toast('⏰', say('snooze') + (t.snoozes >= 3 ? ' (أجّلتها ' + ar(t.snoozes) + ' مرات)' : ''));
    sfx('snooze');
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // ---- big task breakdown ----
  var STEP_TPL = {
    study: ['افتح الكتاب وحدد اللي هتذاكره (١٠ دقايق بس)', 'ذاكر أول جزء ٢٥ دقيقة', 'كمّل الجزء التاني', 'حل أسئلة أو امتحان قديم', 'راجع بسرعة'],
    def: ['افتح الملف واكتب أول ٣ سطور بس (٥ دقايق)', 'جمّع كل اللي محتاجه', 'اشتغل ٢٥ دقيقة على أصعب جزء', 'كمّل الباقي', 'راجع وسلّم قبل الميعاد بيوم']
  };
  function spreadSteps(titles, deadline) {
    var t0 = today(), span = deadline ? diffDays(deadline, t0) : 4;
    var last = span >= 2 ? span - 1 : Math.max(span, 0);       // finish one day early when possible
    return titles.map(function (title, i) {
      var off = titles.length > 1 ? Math.round(i * last / (titles.length - 1)) : 0;
      return { t: title, date: dk(addDays(parseDk(t0), off)), done: false };
    });
  }
  function localBreakdown(t) { return spreadSteps(STEP_TPL[t.cat === 'study' ? 'study' : 'def'], t.date); }
  function aiBreakdown(t) {
    var now = new Date();
    return postAI({ mode: 'breakdown', task: t.title, deadline: t.date || dk(addDays(now, 4)), now: now.toString(), weekday: WDF[now.getDay()] })
      .then(function (r) {
        if (!r || !r.steps || !r.steps.length) return null;
        return { steps: r.steps.map(function (s) { return { t: s.title, date: s.date, done: false }; }), reply: r.reply };
      });
  }
  function currentStep(t) { for (var i = 0; i < t.steps.length; i++) if (!t.steps[i].done) return t.steps[i]; return null; }

  // ================= AI endpoint =================
  var aiOk = null; // null unknown, false = disabled for session
  function postAI(body) {
    if (aiOk === false || location.protocol === 'file:') return Promise.resolve(null);
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { ctrl && ctrl.abort(); }, 14000);
    return fetch('/api/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl && ctrl.signal })
      .then(function (r) { clearTimeout(timer); if (r.status === 503 || r.status === 404 || r.status === 405 || r.status === 501) { aiOk = false; return null; } return r.ok ? r.json() : null; })
      .catch(function () { clearTimeout(timer); return null; });
  }
  function understand(text) {
    var now = new Date();
    var existing = S.tasks.filter(function (t) { return !t.doneAt; }).slice(-60).map(function (t) { return { id: t.id, title: t.title, date: t.date, time: t.time }; });
    return postAI({ mode: 'parse', text: text, now: now.toString(), weekday: WDF[now.getDay()], existing: existing }).then(function (r) {
      if (r && Array.isArray(r.tasks) && (r.tasks.length || (r.updates && r.updates.length))) { aiOk = true; return r; }
      return P.parse(text, now);
    });
  }

  // ================= rendering =================
  var view = 'today', selDay = today(), showDone = false, freshIds = {};
  function render() {
    if (view === 'today') renderToday();
    if (view === 'goals') renderGoals();
    if (view === 'people') renderPeople();
    if (view === 'me') renderMe();
    freshIds = {};
  }
  function ringSVG(size, stroke, pct, id, color) {
    var r = (size - stroke) / 2, C = 2 * Math.PI * r, off = C * (1 - clamp(pct, 0, 1));
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" style="stroke:var(--track)" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" style="stroke:' + (color || 'var(--brand)') + ';transition:stroke-dashoffset 1s cubic-bezier(.2,.9,.25,1)" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '"/></svg>';
  }
  function taskCard(t, k, idx, opts) {
    opts = opts || {};
    var done = isDone(t, k), tm = timeOn(t, k), late = isOverdue(t);
    var nowCls = '';
    if (!done && tm && k === today()) { var p = tm.split(':'), due = new Date(); due.setHours(+p[0], +p[1]); var diff = due - Date.now(); if (diff < 30 * 60000 && diff > -60 * 60000) nowCls = ' now'; }
    var tags = '';
    if (t.priority === 'high' && !done) tags += '<span class="tag hi">مهم</span>';
    if (late) tags += '<span class="tag late">متأخرة من ' + dayLabel(t.date) + '</span>';
    if (tm) tags += '<span class="tag time">' + fmtTime(tm) + '</span>';
    if (t.repeat !== 'none') tags += '<span class="tag rep">' + { daily: 'كل يوم', weekly: 'كل أسبوع', monthly: 'كل شهر' }[t.repeat] + '</span>';
    if (t.isBig && t.date && !done) { var left = diffDays(t.date, today()); tags += '<span class="tag big">' + (left > 0 ? 'فاضل ' + ar(left) + ' يوم' : left === 0 ? 'آخر يوم النهارده' : 'عدى الميعاد') + '</span>'; }
    if (t.snoozes >= 2 && !done) tags += '<span class="tag">اتأجلت ×' + ar(t.snoozes) + '</span>';
    var stepsBar = '';
    if (t.steps && t.steps.length) {
      var dn = t.steps.filter(function (s) { return s.done; }).length, cs = currentStep(t);
      stepsBar = (cs && !done ? '<div class="tag" style="margin-top:6px">الجاية: ' + esc(cs.t) + '</div>' : '') + '<div class="mini-steps"><i style="width:' + (dn / t.steps.length * 100) + '%"></i></div>';
    }
    var cls = 'task' + (t.priority === 'high' && !done ? ' hi' : '') + (done ? ' is-done' : '') + (late ? ' overdue' : '') + nowCls + (freshIds[t.id] ? ' enter' : '');
    return '<div class="' + cls + '" data-id="' + t.id + '" data-k="' + k + '" style="animation-delay:' + (idx * 70) + 'ms">' +
      '<div class="under"><span class="l" style="position:absolute;left:22px">خلصت</span><span class="r" style="position:absolute;right:22px">أجّل</span></div>' +
      '<div class="card"><div class="emo">' + esc(t.emoji) + '</div><div class="body"><div class="ttl">' + esc(t.title) + '</div>' +
      (tags ? '<div class="meta">' + tags + '</div>' : '') + (t.notes ? '<div class="notes">' + esc(t.notes) + '</div>' : '') + stepsBar + '</div>' +
      '<button class="chk" data-act="check" aria-label="خلصت"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button></div></div>';
  }

  function renderToday() {
    var el = $('#v-today'), k = selDay, isToday = k === today();
    var li = lvlInfo(S.stats.xp), st = streak();
    var list = dayTasks(k).sort(byTime(k));
    var od = isToday ? overdueList() : [];
    var all = list.concat(od);
    var doneN = all.filter(function (t) { return isDone(t, k); }).length;
    var pct = all.length ? doneN / all.length : 0;
    var pending = all.filter(function (t) { return !isDone(t, k); });

    var coachLine;
    if (!all.length) coachLine = say('empty');
    else if (!pending.length) coachLine = say('allDone');
    else if (od.length) coachLine = say('overdue', { n: od.length, task: od[0].title });
    else coachLine = say('left', { n: pending.length });

    var h = '';
    h += '<div class="top"><div class="hello"><h1>' + esc(greet()) + '</h1><div class="date">' + longDate(new Date()) + '</div></div>' +
      '<div class="chip-streak' + (st ? '' : ' cold') + '"><span class="fire">🔥</span>' + ar(st) + '</div>' +
      '<button class="lvl-av" data-act="go-me">' + ringSVG(44, 4, li.pct, 'lv1', 'var(--gold)') + '<div class="face">' + li.face + '</div><div class="n">' + ar(li.n) + '</div></button></div>';

    h += '<div class="coach"><div class="who">' + COACHES[S.profile.coach].face + '</div><div class="bubble" data-act="coach">' + esc(coachLine) + '<small>' + COACHES[S.profile.coach].name + ' • دوس يقولك حاجة تانية</small></div></div>';

    h += '<div class="daycard"><div class="ring">' + ringSVG(80, 9, pct, 'rg1', pct >= 1 ? 'var(--green)' : null) + '<div class="v"><div>' + ar(Math.round(pct * 100)) + '٪<small>النهارده</small></div></div></div>' +
      '<div class="txt"><b>' + (all.length ? 'خلّصت ' + ar(doneN) + ' من ' + ar(all.length) : 'لسه مفيش حاجة') + '</b>' +
      '<p>' + (isToday ? 'المستوى ' + ar(li.n) + ' • ' + li.title + ' ' + li.face : dayLabel(k)) + '</p>' +
      '<div class="xpbar"><i style="width:' + Math.round(li.pct * 100) + '%"></i></div><div class="xpline"><span>' + ar(S.stats.xp) + ' XP</span><span>' + ar(li.next) + '</span></div></div></div>';

    // day strip
    h += '<div class="strip" id="strip">';
    for (var i = -1; i <= 7; i++) {
      var d = addDays(new Date(), i), kk = dk(d), ts = dayTasks(kk), dots = '';
      ts.slice(0, 4).forEach(function (t) { dots += '<i class="' + (isDone(t, kk) ? 'ok' : '') + '"></i>'; });
      h += '<button class="dpill' + (kk === k ? ' on' : '') + '" data-act="day" data-k="' + kk + '"><div class="w">' + (i === 0 ? 'النهارده' : WD[d.getDay()]) + '</div><div class="d">' + ar(d.getDate()) + '</div><div class="dots">' + dots + '</div></button>';
    }
    h += '</div>';

    if (isToday) h += eodCardHTML() + nudgesHTML();

    if (!all.length) {
      h += '<div class="empty"><div class="big">🎙️</div><b>' + (isToday ? 'يومك لسه فاضي' : 'مفيش حاجة ' + dayLabel(k)) + '</b>دوس المايك اللي تحت وقول اللي وراك<br><span class="ex">"فكرني بكرة الساعة ٣ عندي ميعاد، وأكلم ماما بالليل"</span></div>';
    }
    var idx = 0;
    var odP = od.filter(function (t) { return !isDone(t, k); });
    if (odP.length) {
      h += '<div class="sec"><h3>متأخرة <span class="cnt">' + ar(odP.length) + '</span></h3><button data-act="kill-all">أجّلهم لبكرة</button></div><div class="list">';
      odP.forEach(function (t) { h += taskCard(t, k, idx++); }); h += '</div>';
    }
    var timed = list.filter(function (t) { return timeOn(t, k) && !isDone(t, k); });
    var anytime = list.filter(function (t) { return !timeOn(t, k) && !isDone(t, k); });
    if (timed.length) { h += '<div class="sec"><h3>ليها ميعاد <span class="cnt">' + ar(timed.length) + '</span></h3></div><div class="list">'; timed.forEach(function (t) { h += taskCard(t, k, idx++); }); h += '</div>'; }
    if (anytime.length) { h += '<div class="sec"><h3>في أي وقت <span class="cnt">' + ar(anytime.length) + '</span></h3></div><div class="list">'; anytime.forEach(function (t) { h += taskCard(t, k, idx++); }); h += '</div>'; }
    var dn = all.filter(function (t) { return isDone(t, k); });
    if (dn.length) {
      h += '<div class="sec"><h3>خلصتهم <span class="cnt">' + ar(dn.length) + '</span></h3><button data-act="toggle-done">' + (showDone ? 'اخفيهم' : 'وريهم') + '</button></div>';
      if (showDone) { h += '<div class="list">'; dn.forEach(function (t) { h += taskCard(t, k, idx++); }); h += '</div>'; }
    }
    if (isIOS && !isStandalone && !S.profile.hideInstall) {
      h += '<div class="nudge" style="margin-top:18px"><div class="e">📲</div><div class="t">ضيف فكرني للشاشة الرئيسية عشان يفتح زي أي أبلكيشن وتوصلك الإشعارات</div><button class="chunky" data-act="install">إزاي؟</button></div>';
    }
    el.innerHTML = h;
    bindSwipes(el);
    var on = $('.dpill.on', el); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function nudgesHTML() {
    var h = '', t0 = today(), md = t0.slice(5);
    S.people.forEach(function (p) {
      if (p.birthday && p.birthday === md) h += '<div class="nudge"><div class="e">🎂</div><div class="t">النهارده عيد ميلاد <b>' + esc(p.name) + '</b>. كلمه.</div><button class="chunky" data-act="called" data-id="' + p.id + '">كلمته ✓</button></div>';
    });
    var due = S.people.map(function (p) { return { p: p, r: personRatio(p) }; }).filter(function (x) { return x.r >= 1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 2);
    due.forEach(function (x) {
      var ds = x.p.last ? Math.floor((Date.now() - x.p.last) / 86400000) : null;
      h += '<div class="nudge"><div class="e">' + esc(x.p.emoji) + '</div><div class="t">' + (ds != null ? 'بقالك <b>' + ar(ds) + ' يوم</b> مكلمتش ' : 'لسه مكلمتش ') + '<b>' + esc(x.p.name) + '</b></div><button class="chunky" data-act="called" data-id="' + x.p.id + '">كلمته ✓</button></div>';
    });
    var big = S.tasks.filter(function (t) { return t.isBig && !t.doneAt && t.date && t.date >= t0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    if (big) {
      var left = diffDays(big.date, t0), cs = currentStep(big);
      h += '<div class="nudge"><div class="e">🏔️</div><div class="t">' + (left > 0 ? 'فاضل <b>' + ar(left) + ' يوم</b> على ' : 'النهارده آخر يوم لـ') + '<b>' + esc(big.title) + '</b>' + (cs ? '<br><small style="color:var(--mute)">الخطوة الجاية: ' + esc(cs.t) + '</small>' : '') + '</div><button class="chunky" data-act="focus" data-id="' + big.id + '">ابدأ ٥ دقايق</button></div>';
    }
    return h;
  }

  // ---------- goals ----------
  var GOAL_TPL = [
    { e: '💧', t: 'أشرب مية', target: 8, period: 'day', unit: 'كوباية' },
    { e: '🏋️', t: 'جيم', target: 3, period: 'week', unit: 'مرة' },
    { e: '🚶', t: 'أمشي ١٠ آلاف خطوة', target: 1, period: 'day', unit: '' },
    { e: '📖', t: 'أقرا ١٠ صفحات', target: 1, period: 'day', unit: '' },
    { e: '🤲', t: 'الصلاة في وقتها', target: 5, period: 'day', unit: 'صلاة', kind: 'prayer' },
    { e: '📵', t: 'ساعة من غير موبايل', target: 1, period: 'day', unit: '' },
    { e: '😴', t: 'أنام بدري', target: 5, period: 'week', unit: 'ليلة' },
    { e: '✍️', t: 'هدف تاني', target: 1, period: 'day', unit: '', custom: true }
  ];
  // ---- prayer times: computed on the phone (adhan.js, offline), from the user's location ----
  var PRAYERS = [['fajr', 'الفجر'], ['dhuhr', 'الضهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشا']];
  var CAIRO = { lat: 30.0444, lng: 31.2357 };
  function isPrayerGoal(g) { return g.kind === 'prayer' || (!g.kind && g.title === 'الصلاة في وقتها'); }
  function prayerMethod(c) {
    var A = window.adhan.CalculationMethod;
    if (c.lat > 22 && c.lat < 32 && c.lng > 24 && c.lng < 37) return A.Egyptian();
    if (c.lat > 16 && c.lat < 32.5 && c.lng >= 37 && c.lng < 56) return A.UmmAlQura();
    if (c.lat > 22 && c.lat < 27 && c.lng >= 51 && c.lng < 57) return A.Dubai();
    return A.MuslimWorldLeague();
  }
  function prayerTimes(k) {
    if (!window.adhan) return null;
    var c = S.profile.loc || CAIRO, A = window.adhan;
    try {
      var pt = new A.PrayerTimes(new A.Coordinates(c.lat, c.lng), parseDk(k || today()), prayerMethod(c));
      return PRAYERS.map(function (p) { return { id: p[0], name: p[1], at: pt[p[0]] }; });
    } catch (e) { return null; }
  }
  function hm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function askLocation(after) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function (pos) {
      S.profile.loc = { lat: +pos.coords.latitude.toFixed(3), lng: +pos.coords.longitude.toFixed(3) }; save();
      scheduleNotifs(); if (after) after();
    }, function () { toast('📍', 'مقدرتش أعرف مكانك، فهحسب مواقيت القاهرة'); }, { timeout: 10000, maximumAge: 86400000 });
  }
  function prayerRow(g) {
    var times = prayerTimes(); if (!times) return '';
    var marks = (g.marks && g.marks[today()]) || {}, now = Date.now(), nextId = null;
    for (var i = 0; i < times.length; i++) if (!marks[times[i].id] && times[i].at.getTime() > now) { nextId = times[i].id; break; }
    var h = '<div class="prayers">';
    times.forEach(function (p) {
      var on = !!marks[p.id], cls = on ? ' on' : p.id === nextId ? ' next' : p.at.getTime() < now ? ' missed' : '';
      var mins = Math.round((p.at.getTime() - now) / 60000);
      var sub = p.id === nextId && mins < 180 ? 'بعد ' + ar(mins >= 60 ? Math.floor(mins / 60) + ':' + pad2(mins % 60) : mins + ' د') : fmtTime(hm(p.at)).replace(/ .*/, '');
      h += '<button class="pr' + cls + '" data-act="prayer" data-id="' + g.id + '" data-p="' + p.id + '"><b>' + p.name + '</b><small>' + sub + '</small></button>';
    });
    h += '</div><button class="prloc" data-act="prayer-loc">' + (S.profile.loc ? 'المواقيت حسب مكانك' : 'مواقيت القاهرة. دوس عشان أحسبها لمكانك') + '</button>';
    return h;
  }
  function prayerToggle(g, pid, btn) {
    var k = today(); g.marks = g.marks || {}; var m = g.marks[k] = g.marks[k] || {};
    var r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (m[pid]) { delete m[pid]; g.log[k] = Object.keys(m).length; addXP(-3); logActivity(-1); save(); renderGoals(); return; }
    m[pid] = Date.now(); var c = Object.keys(m).length; g.log[k] = c;
    var xp = 3; logActivity(1);
    if (c >= g.target) { xp += 15; S.stats.goalHits++; burst(cx, cy, 90); sfx('level'); toast(g.emoji, 'صليت الخمس فروض النهارده'); }
    else { burst(cx, cy, 14); sfx('tick'); }
    addXP(xp, cx, cy - 30); buzz(12); checkBadges(); save(); renderGoals();
  }
  function gKey(g, k) { return g.period === 'week' ? weekKey(k || today()) : (k || today()); }
  function gCount(g, k) { return g.log[gKey(g, k)] || 0; }
  function renderGoals() {
    var el = $('#v-goals'), h = '';
    var hit = S.goals.filter(function (g) { return gCount(g) >= g.target; }).length;
    h += '<div class="top"><div class="hello"><h1>أهدافي</h1><div class="date">' + (S.goals.length ? 'حققت ' + ar(hit) + ' من ' + ar(S.goals.length) + ' النهارده' : 'حاجات عايز تتعود عليها') + '</div></div><button class="chip-add chunky" data-act="add-goal">＋ هدف</button></div>';
    if (!S.goals.length) {
      h += '<div class="empty"><div class="big">🎯</div><b>مفيش أهداف لسه</b>اختار هدف، وكل ما تعمله دوس ＋</div><div class="sec"><h3>ابدأ بواحد من دول</h3></div>' + goalTplHTML();
    } else {
      h += '<div class="list" style="margin-top:6px">';
      S.goals.forEach(function (g, i) {
        var c = gCount(g), pct = c / g.target, comp = c >= g.target, dots = '';
        var isPr = isPrayerGoal(g);
        if (g.target <= 12 && !isPr) for (var j = 0; j < g.target; j++) dots += '<i class="' + (j < c ? 'on' : '') + '"></i>';
        var week = '';
        if (g.period === 'day') {
          week = '<div style="display:flex;gap:4px;margin-top:10px;align-items:flex-end;height:22px">';
          for (var d = 6; d >= 0; d--) { var kk = dk(addDays(new Date(), -d)), v = Math.min(1, (g.log[kk] || 0) / g.target); week += '<i style="flex:1;border-radius:4px;height:' + Math.max(4, v * 22) + 'px;background:' + (v >= 1 ? 'var(--green)' : v > 0 ? 'var(--brand)' : 'var(--track)') + '"></i>'; }
          week += '</div>';
        }
        h += '<div class="goal' + (comp ? ' complete' : '') + '" data-gid="' + g.id + '" style="animation:enter .5s ' + (i * 60) + 'ms both cubic-bezier(.2,.9,.25,1.15)">' +
          '<div class="ring">' + ringSVG(58, 6, pct, 'g' + i, comp ? 'var(--green)' : null) + '<div class="v">' + esc(g.emoji) + '</div></div>' +
          '<div class="gl" data-act="edit-goal" data-id="' + g.id + '"><h4>' + esc(g.title) + '</h4><p>' + ar(c) + ' / ' + ar(g.target) + ' ' + esc(g.unit || '') + ' • ' + (g.period === 'week' ? 'الأسبوع ده' : 'النهارده') + (comp ? ' • خلص' : '') + '</p>' + (dots ? '<div class="dots">' + dots + '</div>' : '') + (isPr ? '' : week) + '</div>' +
          (isPr ? prayerRow(g) : '<button class="plus chunky" data-act="goal-plus" data-id="' + g.id + '">' + (comp ? '✓' : '＋') + '</button>') + '</div>';
      });
      h += '</div>';
    }
    el.innerHTML = h;
  }
  function goalTplHTML() {
    return '<div class="tpl-grid">' + GOAL_TPL.map(function (t, i) {
      return '<button class="tpl" data-act="goal-tpl" data-i="' + i + '"><div class="e">' + t.e + '</div><b>' + t.t + '</b><small>' + (t.custom ? 'اكتب هدفك' : ar(t.target) + ' ' + t.unit + ' ' + (t.period === 'week' ? 'في الأسبوع' : 'في اليوم')) + '</small></button>';
    }).join('') + '</div>';
  }
  function goalPlus(g, btn) {
    var key = gKey(g), c = (g.log[key] || 0);
    if (c >= g.target) { toast(g.emoji, 'هدف ' + (g.period === 'week' ? 'الأسبوع ده' : 'النهارده') + ' خلص. لو عايز تعدّله دوس عليه.'); return; }
    g.log[key] = c + 1;
    var r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var rip = document.createElement('span'); rip.className = 'ripple'; rip.style.cssText = 'width:56px;height:56px;left:0;top:0'; btn.appendChild(rip); setTimeout(function () { rip.remove(); }, 700);
    var xp = 3; logActivity(1);
    if (c + 1 >= g.target) { xp += 15; S.stats.goalHits++; burst(cx, cy, 90); sfx('level'); toast(g.emoji, 'خلّصت هدف <b>' + esc(g.title) + '</b>'); }
    else { burst(cx, cy, 14); sfx('tick'); }
    addXP(xp, cx, cy - 30); buzz(12); checkBadges(); save(); renderGoals();
  }

  // ---------- people ----------
  var PEOPLE_TPL = [
    { n: 'ماما', e: '👩', every: 2, rel: 'العيلة' }, { n: 'بابا', e: '👨', every: 2, rel: 'العيلة' }, { n: 'تيتا', e: '👵', every: 7, rel: 'العيلة' }, { n: 'جدو', e: '👴', every: 7, rel: 'العيلة' },
    { n: 'أخويا', e: '🧑', every: 7, rel: 'العيلة' }, { n: 'أختي', e: '👧', every: 7, rel: 'العيلة' }, { n: 'صاحبي', e: '🤝', every: 14, rel: 'صحاب' }, { n: 'حد تاني', e: '⭐', every: 7, rel: '', custom: true }
  ];
  var EVERY = [[1, 'كل يوم'], [2, 'كل يومين'], [3, 'كل ٣ أيام'], [7, 'كل أسبوع'], [14, 'كل أسبوعين'], [30, 'كل شهر']];
  function everyLabel(n) { for (var i = 0; i < EVERY.length; i++) if (EVERY[i][0] === n) return EVERY[i][1]; return 'كل ' + ar(n) + ' يوم'; }
  function personRatio(p) { if (!p.last) return (Date.now() - p.created) / 86400000 >= 1 ? 1 : 0.5; return ((Date.now() - p.last) / 86400000) / p.every; }
  function renderPeople() {
    var el = $('#v-people'), h = '';
    h += '<div class="top"><div class="hello"><h1>ناسي</h1><div class="date">الناس اللي مش عايز تبعد عنهم</div></div><button class="chip-add chunky" data-act="add-person">＋ حد</button></div>';
    if (!S.people.length) {
      h += '<div class="empty"><div class="big">❤️</div><b>ضيف الناس اللي عايز تفضل قريب منهم</b>وفكرني هيقولك لما تطوّل عليهم</div><div class="sec"><h3>ابدأ بواحد من دول</h3></div><div class="tpl-grid">' +
        PEOPLE_TPL.map(function (p, i) { return '<button class="tpl" data-act="person-tpl" data-i="' + i + '"><div class="e">' + p.e + '</div><b>' + p.n + '</b><small>' + (p.custom ? 'أي حد' : everyLabel(p.every)) + '</small></button>'; }).join('') + '</div>';
    } else {
      var arr = S.people.slice().sort(function (a, b) { return personRatio(b) - personRatio(a); });
      h += '<div class="list" style="margin-top:6px">';
      arr.forEach(function (p, i) {
        var r = personRatio(p), col = r >= 1 ? 'var(--red)' : r >= .7 ? 'var(--gold)' : 'var(--green)';
        var ds = p.last ? Math.floor((Date.now() - p.last) / 86400000) : null;
        var txt = ds == null ? 'لسه مكلمتوش من ساعة ما ضفته' : ds === 0 ? 'كلمته النهارده' : ds === 1 ? 'كلمته امبارح' : 'كلمته من ' + ar(ds) + ' أيام';
        var bd = '';
        if (p.birthday) { var nb = nextBirthday(p.birthday); if (nb <= 14) bd = ' • عيد ميلاده ' + (nb === 0 ? 'النهارده' : 'بعد ' + ar(nb) + ' يوم'); }
        h += '<div class="person" style="--st:' + col + ';animation:enter .5s ' + (i * 60) + 'ms both cubic-bezier(.2,.9,.25,1.15)"><div class="av" data-act="edit-person" data-id="' + p.id + '">' + esc(p.emoji) + '</div>' +
          '<div class="pl" data-act="edit-person" data-id="' + p.id + '"><h4>' + esc(p.name) + '</h4><p>' + txt + ' • ' + everyLabel(p.every) + bd + '</p><div class="warm"><i style="width:' + Math.round(clamp(1 - r, 0.04, 1) * 100) + '%"></i></div></div>' +
          '<button class="called" data-act="called" data-id="' + p.id + '">كلمته ✓</button></div>';
      });
      h += '</div>';
    }
    el.innerHTML = h;
  }
  function nextBirthday(md) {
    var t = new Date(), y = t.getFullYear(), p = md.split('-'), d = new Date(y, +p[0] - 1, +p[1]);
    var t0 = parseDk(today()); if (d < t0) d = new Date(y + 1, +p[0] - 1, +p[1]);
    return Math.round((d - t0) / 86400000);
  }
  function called(p, btn) {
    p.last = Date.now(); S.stats.calls++; logActivity(1);
    var r = btn ? btn.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    addXP(8, r.left + r.width / 2, r.top);
    burst(r.left + r.width / 2, r.top + r.height / 2, 50); sfx('done'); buzz(15);
    // auto-complete today's call task with this person
    dayTasks(today()).concat(overdueList()).forEach(function (t) { if (t.person && findPerson(t.person) === p && !isDone(t, today())) { if (t.repeat !== 'none') t.doneDates[today()] = Date.now(); else t.doneAt = Date.now(); S.stats.total++; } });
    toast('❤️', pick(['ربنا يخليهولك', 'كده الأصول', 'حلو إنك سألت عليه']));
    checkBadges(); save(); render();
  }

  // ---------- me ----------
  function renderMe() {
    var el = $('#v-me'), li = lvlInfo(S.stats.xp), st = streak(), h = '';
    var snzWeek = 0; for (var i = 0; i < 7; i++) snzWeek += S.stats.snoozes[dk(addDays(new Date(), -i))] || 0;
    h += '<div class="hero"><div class="bigav">' + ringSVG(104, 8, li.pct, 'me1', 'var(--gold)') + '<div class="face">' + li.face + '</div></div><h2>' + esc(S.profile.name || 'أنا') + '</h2><div class="title">المستوى ' + ar(li.n) + ' • ' + li.title + '</div>' +
      '<div class="xpbar" style="margin-top:14px"><i style="width:' + Math.round(li.pct * 100) + '%"></i></div><div class="xpline"><span>' + ar(S.stats.xp) + ' XP</span><span>فاضل ' + ar(li.next - S.stats.xp) + ' للمستوى الجاي</span></div></div>';
    h += '<div class="stats"><div class="stat"><div class="n">' + ar(st) + '</div><div class="l">ستريك (أحسن: ' + ar(S.stats.best) + ')</div></div><div class="stat"><div class="n">' + ar(S.stats.total) + '</div><div class="l">حاجة خلصت</div></div>' +
      '<div class="stat"><div class="n">' + ar(S.stats.killed) + '</div><div class="l">متأخرة خلّصتها</div></div><div class="stat"><div class="n">' + ar(snzWeek) + '</div><div class="l">أجّلت الأسبوع ده</div></div></div>';
    // heatmap 12 weeks
    h += '<div class="sec"><h3>آخر ١٢ أسبوع</h3></div><div class="heat">';
    var start = addDays(new Date(), -83); start = addDays(start, -start.getDay());
    for (var d = 0; d < 84 + new Date().getDay() + 1; d++) {
      var day = addDays(start, d); if (day > new Date()) break;
      var c = S.stats.days[dk(day)] || 0, l = c === 0 ? '' : c < 2 ? 'l1' : c < 4 ? 'l2' : c < 7 ? 'l3' : 'l4';
      h += '<i class="' + l + '" title="' + dk(day) + '"></i>';
    }
    h += '</div>';
    h += '<div class="sec"><h3>الأوسمة <span class="cnt">' + ar(S.stats.badges.length) + '/' + ar(BADGES.length) + '</span></h3></div><div class="badges">' +
      BADGES.map(function (b) { var got = S.stats.badges.indexOf(b.id) >= 0; return '<div class="badge ' + (got ? 'got' : 'locked') + '"><div class="e">' + b.e + '</div><b>' + b.t + '</b><small>' + b.d + '</small></div>'; }).join('') + '</div>';
    h += '<div class="sec"><h3>المدرب بتاعك</h3></div><div class="seg">' + Object.keys(COACHES).map(function (k) { var c = COACHES[k]; return '<button class="' + (S.profile.coach === k ? 'on' : '') + '" data-act="coach-set" data-k="' + k + '"><span class="e">' + c.face + '</span>' + c.name + '</button>'; }).join('') + '</div>';
    var rvKeys = Object.keys(S.reviews || {}).sort().reverse().slice(0, 7);
    h += '<div class="sec"><h3>مراجعاتك</h3></div><button class="rowbtn" data-act="eod"><span class="e">🌙</span><span>' + (S.reviews[today()] ? 'خطة بكرة' : 'قفّل يومك') + '</span><small>' + (S.reviews[today()] ? 'اتعملت' : 'دقيقة') + '</small></button>' +
      rvKeys.map(function (k) { var r = S.reviews[k]; return '<div class="rv-hist"><b>' + dayLabel(k) + '</b><span>' + ar(r.done) + '/' + ar(r.total) + '</span><small>' + esc(r.better || r.good || (r.feedback || '').split('\n')[0]) + '</small></div>'; }).join('');
    h += '<div class="sec"><h3>الإعدادات</h3></div>' +
      '<button class="rowbtn" data-act="share"><span class="e">📣</span><span>ابعت مستواك لصحابك</span><small>تحدّاهم</small></button>' +
      '<button class="rowbtn" data-act="notif"><span class="e">🔔</span><span>الإشعارات</span><small>' + notifLabel() + '</small></button>' +
      '<button class="rowbtn" data-act="sound"><span class="e">' + (S.profile.sound ? '🔊' : '🔇') + '</span><span>الأصوات</span><small>' + (S.profile.sound ? 'شغالة' : 'مقفولة') + '</small></button>' +
      '<button class="rowbtn" data-act="rename"><span class="e">✏️</span><span>اسمي</span><small>' + esc(S.profile.name || '—') + '</small></button>' +
      (isIOS && !isStandalone ? '<button class="rowbtn" data-act="install"><span class="e">📲</span><span>ضيفه للشاشة الرئيسية</span><small>زي الأبلكيشن</small></button>' : '') +
      '<button class="rowbtn" data-act="export"><span class="e">💾</span><span>احفظ نسخة من بياناتي</span><small>ملف</small></button>' +
      '<button class="rowbtn" data-act="import"><span class="e">📥</span><span>رجّع نسخة قديمة</span><small>من ملف</small></button>' +
      '<button class="rowbtn" data-act="reset" style="color:var(--red)"><span class="e">🗑️</span><span>امسح كل حاجة وابدأ من الأول</span></button>' +
      '<p style="text-align:center;color:var(--dim);font-size:12px;margin:18px 0 4px">فكرني، نسخة تجريبية. بياناتك على موبايلك بس.</p>';
    el.innerHTML = h;
  }
  function notifLabel() {
    if (!('Notification' in window)) return isIOS && !isStandalone ? 'ضيفه للشاشة الأول' : 'مش مدعومة';
    return Notification.permission === 'granted' ? 'شغالة' : Notification.permission === 'denied' ? 'مقفولة من الإعدادات' : 'دوس وفعّلها';
  }

  // ================= end-of-day review =================
  // Close the day: what got done, what slipped (carry to tomorrow or drop), two honest notes,
  // then an AI coach writes feedback and a plan for tomorrow the user can accept in one tap.
  var EOD_HOUR = 19;
  function dayData(k) {
    var all = dayTasks(k).concat(k === today() ? overdueList() : []);
    var seen = {}; all = all.filter(function (t) { if (seen[t.id]) return false; seen[t.id] = 1; return true; });
    var pg = S.goals.filter(isPrayerGoal)[0], pm = pg && pg.marks && pg.marks[k] ? pg.marks[k] : {};
    return {
      done: all.filter(function (t) { return isDone(t, k); }),
      missed: all.filter(function (t) { return !isDone(t, k); }),
      goals: S.goals.filter(function (g) { return !isPrayerGoal(g); }).map(function (g) { return { title: g.title, count: gCount(g, k), target: g.target, period: g.period }; }),
      prayers: pg ? PRAYERS.map(function (p) { return { name: p[1], done: !!pm[p[0]] }; }) : null,
      snoozes: S.stats.snoozes[k] || 0
    };
  }
  function eodCardHTML() {
    if (new Date().getHours() < EOD_HOUR) return '';
    if (S.reviews[today()]) return '<div class="nudge eod done"><div class="e">🌙</div><div class="t">قفلت يومك. <b>خطة بكرة جاهزة.</b></div><button class="chunky" data-act="eod">شوفها</button></div>';
    return '<div class="nudge eod"><div class="e">🌙</div><div class="t"><b>قفّل يومك</b><br><small>شوف عملت إيه، وخطّط لبكرة في دقيقة</small></div><button class="chunky" data-act="eod">يلا</button></div>';
  }
  var eodChoice = {};
  function openEOD() {
    var k = today(), rv = S.reviews[k];
    if (rv) return showEODResult(rv);
    var d = dayData(k); eodChoice = {};
    d.missed.forEach(function (t) { eodChoice[t.id] = t.repeat !== 'none' ? 'keep' : 'tomorrow'; });
    var total = d.done.length + d.missed.length, h = '<h2>يومك النهارده</h2>';
    h += '<div class="eod-stats"><div><b>' + ar(d.done.length) + '<small> من ' + ar(total) + '</small></b><span>خلّصت</span></div>' +
      (d.prayers ? '<div><b>' + ar(d.prayers.filter(function (p) { return p.done; }).length) + '<small> من ٥</small></b><span>صلاة</span></div>' : '') +
      '<div><b>' + ar(d.snoozes) + '</b><span>أجّلت</span></div></div>';
    if (d.done.length) h += '<div class="sec"><h3>خلّصت</h3></div><div class="eod-list">' + d.done.map(function (t) { return '<div class="eod-row ok"><span class="c">✓</span><span>' + esc(t.title) + '</span></div>'; }).join('') + '</div>';
    if (d.missed.length) h += '<div class="sec"><h3>ماخلصتش</h3></div><div class="eod-list">' + d.missed.map(function (t) {
      return '<div class="eod-row" data-id="' + t.id + '"><span>' + esc(t.title) + '</span>' + (t.repeat !== 'none' ? '<small>بتتكرر</small>' : '<button class="tag rep" data-eod="cycle">بكرة</button>') + '</div>';
    }).join('') + '</div>';
    if (d.goals.length) h += '<div class="sec"><h3>أهدافك</h3></div><div class="eod-list">' + d.goals.map(function (g) { return '<div class="eod-row' + (g.count >= g.target ? ' ok' : '') + '"><span>' + esc(g.title) + '</span><small>' + ar(g.count) + '/' + ar(g.target) + '</small></div>'; }).join('') + '</div>';
    h += '<div class="field" style="margin-top:14px"><label>إيه اللي مشي كويس؟</label><textarea id="eGood" rows="2" placeholder="حتى لو حاجة صغيرة"></textarea></div>' +
      '<div class="field"><label>إيه اللي كان ممكن يبقى أحسن؟</label><textarea id="eBetter" rows="2" placeholder="بصراحة، محدش هيشوفها غيرك"></textarea></div>' +
      '<div class="acts"><button class="act pri full" id="eGo">قفّل اليوم وخطّط لبكرة</button></div>';
    openSheet(h, function (root) {
      $$('[data-eod=cycle]', root).forEach(function (b) {
        b.onclick = function () {
          var id = b.closest('.eod-row').dataset.id, o = ['tomorrow', 'drop', 'keep'], nx = o[(o.indexOf(eodChoice[id]) + 1) % 3];
          eodChoice[id] = nx; b.textContent = { tomorrow: 'بكرة', drop: 'امسحها', keep: 'سيبها' }[nx]; b.className = 'tag ' + (nx === 'drop' ? 'late' : nx === 'keep' ? '' : 'rep');
        };
      });
      $('#eGo', root).onclick = function () { closeDay(d, $('#eGood').value.trim(), $('#eBetter').value.trim(), this); };
    });
  }
  function closeDay(d, good, better, btn) {
    var k = today(), tmr = dk(addDays(new Date(), 1));
    btn.innerHTML = '<span class="dotsl"><i></i><i></i><i></i></span>';
    var carry = [];
    d.missed.forEach(function (t) {
      var c = eodChoice[t.id];
      if (c === 'drop') S.tasks = S.tasks.filter(function (x) { return x.id !== t.id; });
      else if (c === 'tomorrow') carry.push(t);
    });
    var payload = {
      done: d.done.map(function (t) { return t.title; }),
      carried: carry.map(function (t) { return { id: t.id, title: t.title, time: t.time, priority: t.priority || 'normal', notes: (t.notes || '').slice(0, 200) }; }),
      tomorrowAlready: dayTasks(tmr).map(function (t) { return { title: t.title, time: timeOn(t, tmr) }; }),
      goals: d.goals, prayers: d.prayers, snoozes: d.snoozes, wentWell: good, couldBeBetter: better
    };
    var now = new Date();
    postAI({ mode: 'review', day: payload, now: now.toString(), weekday: WDF[now.getDay()] }).then(function (r) {
      var plan = r && Array.isArray(r.plan) ? r.plan : carry.map(function (t) { return { taskId: t.id, title: t.title, time: t.time, priority: t.priority || 'normal' }; });
      var fb = r && r.feedback ? r.feedback : localFeedback(d);
      var rv = { date: k, done: d.done.length, total: d.done.length + d.missed.length, good: good, better: better, feedback: fb, plan: plan, applied: false };
      S.reviews[k] = rv;
      addXP(15, innerWidth / 2, innerHeight / 2); logActivity(1); save(); render();
      showEODResult(rv);
    });
  }
  function localFeedback(d) {
    var n = d.done.length, m = d.missed.length;
    var a = n ? 'خلّصت ' + ar(n) + (n === 1 ? ' حاجة' : ' حاجات') + ' النهارده، ودي بداية.' : 'النهارده مخلّصتش حاجة، بس إنك قاعد تراجع ده في حد ذاته خطوة.';
    var b = d.snoozes >= 2 ? 'أجّلت ' + ar(d.snoozes) + ' مرات. بكرة ابدأ بأتقل حاجة الصبح قبل ما تفتح الموبايل.' : m ? 'بكرة ابدأ بأول حاجة في الخطة قبل أي حاجة تانية.' : 'كمّل بنفس الشكل بكرة.';
    return a + '\n' + b;
  }
  function showEODResult(rv) {
    var tmr = dk(addDays(new Date(parseDk(rv.date)), 1));
    var h = '<h2>خطة بكرة</h2><div class="eod-fb">' + esc(rv.feedback).replace(/\n/g, '<br>') + '</div>';
    if (rv.plan.length) {
      h += '<div class="eod-list" style="margin-top:12px">' + rv.plan.map(function (p, i) {
        return '<div class="eod-row plan"><span class="n">' + ar(i + 1) + '</span><span>' + esc(p.title) + '</span>' + (p.priority === 'high' ? '<span class="tag hi">مهم</span>' : '') + '<small>' + (p.time ? fmtTime(p.time) : 'أي وقت') + '</small></div>';
      }).join('') + '</div>';
    } else h += '<p style="color:var(--mute);margin-top:12px">مفيش حاجة متشالة لبكرة. قول اللي وراك بالمايك.</p>';
    h += '<div class="acts">' + (rv.applied ? '<button class="act full" data-x="close">تمام</button>' : '<button class="act pri full" data-x="apply">اعتمد الخطة</button><button class="act full" data-x="close">بعدين</button>') + '</div>';
    openSheet(h, function (root) {
      $$('[data-x]', root).forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.x === 'apply') {
            rv.plan.forEach(function (p) {
              var t = p.taskId && findTask(p.taskId);
              if (t) { if (t.repeat === 'none') t.date = tmr; t.time = p.time || t.time; t.priority = p.priority; }
              else S.tasks.push(newTask({ title: p.title, date: tmr, time: p.time, priority: p.priority }));
            });
            rv.applied = true; save(); scheduleNotifs(); render(); burst(innerWidth / 2, innerHeight / 3, 80); sfx('level');
            toast('🌙', 'الخطة اتحطت في بكرة. تصبح على خير.');
          }
          closeSheet();
        };
      });
    });
  }

  // ================= sheets =================
  function openSheet(html, onMount) {
    $('#sheetBody').innerHTML = html;
    $('#sheet').classList.add('open'); $('#scrim').classList.add('open');
    if (onMount) onMount($('#sheetBody'));
  }
  function closeSheet() { $('#sheet').classList.remove('open'); $('#scrim').classList.remove('open'); }
  $('#scrim').addEventListener('click', closeSheet);
  $('#sheet .grab').addEventListener('click', closeSheet);
  (function () { var sy = null, sh = $('#sheet'); sh.addEventListener('touchstart', function (e) { sy = sh.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true }); sh.addEventListener('touchmove', function (e) { if (sy == null) return; var d = e.touches[0].clientY - sy; if (d > 0) { sh.style.transition = 'none'; sh.style.transform = 'translate(-50%,' + d + 'px)'; } }, { passive: true }); sh.addEventListener('touchend', function (e) { if (sy == null) return; var d = e.changedTouches[0].clientY - sy; sh.style.transition = ''; sh.style.transform = ''; if (d > 110) closeSheet(); sy = null; }); })();

  var EMOJIS = ['✨', '💊', '📅', '📞', '❤️', '💼', '📦', '💻', '🛒', '💪', '💧', '📚', '🩺', '🚗', '💰', '🎂', '🤲', '🏠', '✈️', '🎯'];
  function taskSheet(t, k) {
    var stepsH = '';
    if (t.steps && t.steps.length) {
      stepsH = '<div class="sec" style="margin-top:4px"><h3>الخطوات</h3></div><div class="steps">' + t.steps.map(function (s, i) {
        return '<div class="step' + (s.done ? ' d' : '') + '" data-act="step" data-i="' + i + '"><div class="c">' + (s.done ? '✓' : '') + '</div><span>' + esc(s.t) + '</span><small>' + (s.date ? dayLabel(s.date) : '') + '</small></div>';
      }).join('') + '</div>';
    }
    var html = '<h2>' + esc(t.emoji) + ' ' + esc(t.title) + '</h2>' +
      '<div class="field"><label>المهمة</label><input id="fT" value="' + esc(t.title) + '"></div>' +
      '<div class="field"><label>تفاصيل</label><textarea id="fN" rows="3" placeholder="مبالغ، أرقام، أي حاجة عايز تفتكرها">' + esc(t.notes || '') + '</textarea></div>' +
      '<div class="field"><label>الأيقونة</label><div class="emoji-pick" id="fE">' + EMOJIS.map(function (e) { return '<button class="' + (e === t.emoji ? 'on' : '') + '" data-e="' + e + '">' + e + '</button>'; }).join('') + '</div></div>' +
      '<div class="row2"><div class="field"><label>اليوم</label><input type="date" id="fD" value="' + (t.date || '') + '"></div><div class="field"><label>الساعة</label><input type="time" id="fH" value="' + (t.time || '') + '"></div></div>' +
      '<div class="row2"><div class="field"><label>بيتكرر؟</label><select id="fR">' + [['none', 'لأ'], ['daily', 'كل يوم'], ['weekly', 'كل أسبوع'], ['monthly', 'كل شهر']].map(function (o) { return '<option value="' + o[0] + '"' + (t.repeat === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>الأولوية</label><select id="fP"><option value="normal">عادي</option><option value="high"' + (t.priority === 'high' ? ' selected' : '') + '>مهم</option></select></div></div>' +
      '<div class="row2"><div class="field"><label>مهمة كبيرة؟</label><select id="fB"><option value="0">لأ</option><option value="1"' + (t.isBig ? ' selected' : '') + '>أيوه</option></select></div></div>' +
      stepsH +
      '<div class="acts">' +
      '<button class="act pri" data-sa="save">احفظ</button>' +
      '<button class="act" data-sa="focus">ابدأ ٥ دقايق</button>' +
      ((!t.steps || !t.steps.length) ? '<button class="act" data-sa="break">قسّمها خطوات</button>' : '<button class="act" data-sa="rebreak">قسّمها تاني</button>') +
      '<button class="act" data-sa="snooze">أجّل</button>' +
      '<button class="act" data-sa="ics">ضيفها للتقويم</button>' +
      '<button class="act warn" data-sa="del">امسح</button>' +
      '</div>';
    openSheet(html, function (root) {
      $$('#fE button', root).forEach(function (b) { b.onclick = function () { $$('#fE button', root).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); }; });
      $$('[data-act=step]', root).forEach(function (row) {
        row.onclick = function () {
          var s = t.steps[+row.dataset.i]; s.done = !s.done;
          if (s.done) { var r = row.getBoundingClientRect(); addXP(8, r.left + 30, r.top); burst(r.left + 30, r.top + 20, 24); sfx('tick'); logActivity(1); }
          else { addXP(-8); logActivity(-1); }
          save(); taskSheet(t, k); render();
          if (t.steps.every(function (x) { return x.done; }) && !isDone(t, k)) setTimeout(function () { closeSheet(); toggleDone(t, k, null); }, 300);
        };
      });
      $$('[data-sa]', root).forEach(function (b) {
        b.onclick = function () {
          var a = b.dataset.sa;
          if (a === 'save' || a === 'focus' || a === 'break' || a === 'rebreak' || a === 'ics') {
            t.title = $('#fT').value.trim() || t.title;
            var e = $('#fE button.on', root); if (e) t.emoji = e.dataset.e;
            t.date = $('#fD').value || null; t.time = $('#fH').value || null; t.repeat = $('#fR').value; t.isBig = $('#fB').value === '1'; t.notes = $('#fN').value.trim(); t.priority = $('#fP').value;
            if (t.repeat !== 'none' && !t.date) t.date = today();
            save();
          }
          if (a === 'save') { closeSheet(); render(); scheduleNotifs(); toast('👌', 'اتحفظت'); }
          if (a === 'focus') { closeSheet(); openFocus(t); }
          if (a === 'break' || a === 'rebreak') {
            b.innerHTML = '<span class="dotsl"><i></i><i></i><i></i></span>';
            aiBreakdown(t).then(function (r) {
              t.steps = r ? r.steps : localBreakdown(t); t.isBig = true; save();
              taskSheet(t, k); render(); toast('🔨', r && r.reply ? esc(r.reply) : 'قسمتها لخطوات صغيرة. أول خطوة خمس دقايق بس، ابدأ بيها.');
            });
          }
          if (a === 'snooze') snoozeSheet(t);
          if (a === 'ics') downloadICS(t);
          if (a === 'del') {
            S.tasks = S.tasks.filter(function (x) { return x.id !== t.id; }); save(); closeSheet(); render(); toast('🗑️', 'اتمسحت');
          }
        };
      });
    });
  }
  function snoozeSheet(t) {
    openSheet('<h2>أجّلها لإمتى؟</h2><p style="color:var(--mute);margin:-6px 0 14px;font-size:14px">' + esc(say('snooze')) + '</p><div class="acts">' +
      '<button class="act" data-m="hour">بعد ساعة</button><button class="act" data-m="night">بالليل (٩)</button>' +
      '<button class="act" data-m="tmorning">بكرة الصبح</button><button class="act" data-m="tomorrow">بكرة</button>' +
      '<button class="act pri full" data-m="focus">لأ، هشتغل عليها ٥ دقايق دلوقتي</button></div>', function (root) {
      $$('[data-m]', root).forEach(function (b) { b.onclick = function () { closeSheet(); if (b.dataset.m === 'focus') openFocus(t); else snooze(t, b.dataset.m); }; });
    });
  }
  function goalSheet(g, tpl) {
    var isNew = !g;
    g = g || { id: uid(), title: tpl.custom ? '' : tpl.t, emoji: tpl.e, target: tpl.target, period: tpl.period, unit: tpl.unit, kind: tpl.kind || null, log: {}, created: Date.now() };
    var html = '<h2>' + esc(g.emoji) + ' ' + (isNew ? 'هدف جديد' : esc(g.title)) + '</h2>' +
      '<div class="field"><label>الهدف</label><input id="gT" value="' + esc(g.title) + '" placeholder="مثلاً: أذاكر ساعة"></div>' +
      '<div class="row2"><div class="field"><label>كام مرة؟</label><input id="gN" type="number" inputmode="numeric" min="1" max="50" value="' + g.target + '"></div>' +
      '<div class="field"><label>في</label><select id="gP"><option value="day"' + (g.period === 'day' ? ' selected' : '') + '>اليوم</option><option value="week"' + (g.period === 'week' ? ' selected' : '') + '>الأسبوع</option></select></div></div>' +
      '<div class="field"><label>الأيقونة</label><div class="emoji-pick" id="gE">' + ['🎯', '💧', '🏋️', '🚶', '📖', '🤲', '📵', '😴', '🥗', '🧘', '💊', '✍️', '💰', '🎸', '🧠', '🚭'].map(function (e) { return '<button class="' + (e === g.emoji ? 'on' : '') + '" data-e="' + e + '">' + e + '</button>'; }).join('') + '</div></div>' +
      '<div class="acts"><button class="act pri' + (isNew ? ' full' : '') + '" data-ga="save">' + (isNew ? 'ابدأ' : 'احفظ') + '</button>' +
      (isNew ? '' : '<button class="act" data-ga="minus">شيل مرة</button><button class="act warn full" data-ga="del">امسح الهدف</button>') + '</div>';
    openSheet(html, function (root) {
      $$('#gE button', root).forEach(function (b) { b.onclick = function () { $$('#gE button', root).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); }; });
      $$('[data-ga]', root).forEach(function (b) {
        b.onclick = function () {
          var a = b.dataset.ga;
          if (a === 'save') {
            g.title = $('#gT').value.trim(); if (!g.title) { $('#gT').focus(); return; }
            g.target = clamp(parseInt($('#gN').value, 10) || 1, 1, 50); g.period = $('#gP').value;
            var e = $('#gE button.on', root); if (e) g.emoji = e.dataset.e;
            if (isNew) { S.goals.push(g); if (isPrayerGoal(g)) { toast('🤲', 'دوس على كل صلاة لما تصليها'); if (!S.profile.loc) askLocation(renderGoals); } else toast('🎯', 'تمام. كل ما تعمله دوس ＋'); }
          }
          if (a === 'minus') { var k = gKey(g); g.log[k] = Math.max(0, (g.log[k] || 0) - 1); }
          if (a === 'del') S.goals = S.goals.filter(function (x) { return x.id !== g.id; });
          save(); closeSheet(); renderGoals();
        };
      });
    });
  }
  function personSheet(p, tpl) {
    var isNew = !p;
    p = p || { id: uid(), name: tpl.custom ? '' : tpl.n, emoji: tpl.e, every: tpl.every, rel: tpl.rel, last: null, birthday: null, created: Date.now() };
    var html = '<h2>' + esc(p.emoji) + ' ' + (isNew ? 'حد جديد' : esc(p.name)) + '</h2>' +
      '<div class="field"><label>الاسم</label><input id="pN" value="' + esc(p.name) + '" placeholder="مثلاً: ماما، أحمد صاحبي"></div>' +
      '<div class="field"><label>عايز تكلمه كل قد إيه؟</label><div class="choice" id="pE">' + EVERY.map(function (o) { return '<button class="' + (o[0] === p.every ? 'on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><label>عيد ميلاده (اختياري)</label><input id="pB" type="date" value="' + (p.birthday ? '2000-' + p.birthday : '') + '"></div>' +
      '<div class="field"><label>الأيقونة</label><div class="emoji-pick" id="pX">' + ['👩', '👨', '👵', '👴', '🧑', '👧', '👦', '🤝', '❤️', '⭐', '👶', '💍'].map(function (e) { return '<button class="' + (e === p.emoji ? 'on' : '') + '" data-e="' + e + '">' + e + '</button>'; }).join('') + '</div></div>' +
      '<div class="acts"><button class="act pri' + (isNew ? ' full' : '') + '" data-pa="save">' + (isNew ? 'ضيفه' : 'احفظ') + '</button>' +
      (isNew ? '' : '<button class="act" data-pa="remind">فكرني أكلمه النهارده</button><button class="act warn full" data-pa="del">امسح</button>') + '</div>';
    openSheet(html, function (root) {
      [['#pE', 'v'], ['#pX', 'e']].forEach(function (pair) { $$(pair[0] + ' button', root).forEach(function (b) { b.onclick = function () { $$(pair[0] + ' button', root).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); }; }); });
      $$('[data-pa]', root).forEach(function (b) {
        b.onclick = function () {
          var a = b.dataset.pa;
          if (a === 'save') {
            p.name = $('#pN').value.trim(); if (!p.name) { $('#pN').focus(); return; }
            var e = $('#pE button.on', root); if (e) p.every = +e.dataset.v;
            var x = $('#pX button.on', root); if (x) p.emoji = x.dataset.e;
            var bd = $('#pB').value; p.birthday = bd ? bd.slice(5) : null;
            if (isNew) { S.people.push(p); toast('❤️', 'هفكّرك بـ' + esc(p.name) + ' ' + everyLabel(p.every)); }
          }
          if (a === 'remind') { var t = newTask({ title: 'أكلم ' + p.name, emoji: '📞', category: 'people', person: p.name, date: today(), time: '20:00' }); S.tasks.push(t); freshIds[t.id] = 1; scheduleNotifs(); toast('📞', 'تمام، هفكّرك الساعة ٨ بالليل'); }
          if (a === 'del') S.people = S.people.filter(function (x) { return x.id !== p.id; });
          save(); closeSheet(); render();
        };
      });
    });
  }
  function installSheet() {
    openSheet('<h2>حط فكرني على الشاشة الرئيسية</h2><p style="color:var(--mute);line-height:1.7;margin-bottom:6px">من غير App Store، ٣ خطوات بس:</p><div class="ios-steps">' +
      '<div><b>١</b><span>افتح اللينك ده من <b>Safari</b></span></div>' +
      '<div><b>٢</b><span>دوس على زرار المشاركة <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4DA3FF" stroke-width="2" style="vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg> تحت</span></div>' +
      '<div><b>٣</b><span>اختار <b>Add to Home Screen</b> ثم <b>Add</b></span></div></div>' +
      '<p style="color:var(--mute);line-height:1.7;margin-top:14px;font-size:14px">بعدها افتح فكرني من الأيقونة وفعّل الإشعارات من صفحة "أنا".</p>' +
      '<div class="acts" style="margin-top:14px"><button class="act" data-x="hide">متفكرنيش تاني</button><button class="act pri" data-x="ok">تمام</button></div>', function (root) {
      $$('[data-x]', root).forEach(function (b) { b.onclick = function () { if (b.dataset.x === 'hide') { S.profile.hideInstall = true; save(); render(); } closeSheet(); }; });
    });
  }

  // ================= swipe gestures =================
  function bindSwipes(root) {
    $$('.task', root).forEach(function (row) {
      var card = $('.card', row), under = $('.under', row), sx = 0, sy = 0, dx = 0, drag = false, decided = false, pid = null, t0 = 0;
      card.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; dx = 0; drag = false; decided = false; pid = e.pointerId; t0 = Date.now(); card.style.transition = 'none'; });
      card.addEventListener('pointermove', function (e) {
        if (pid !== e.pointerId) return;
        var mx = e.clientX - sx, my = e.clientY - sy;
        if (!decided && (Math.abs(mx) > 8 || Math.abs(my) > 8)) { decided = true; drag = Math.abs(mx) > Math.abs(my) * 1.2; if (drag) try { card.setPointerCapture(pid); } catch (_) { } }
        if (!drag) return;
        dx = mx; var damp = Math.abs(dx) > 110 ? 110 + (Math.abs(dx) - 110) * .35 : Math.abs(dx);
        card.style.transform = 'translateX(' + (dx < 0 ? -damp : damp) + 'px) rotate(' + (dx / 60) + 'deg)';
        under.className = 'under ' + (dx > 0 ? 'done' : 'snz');
        $('.l', under).style.opacity = dx > 0 ? Math.min(1, dx / 90) : 0;
        $('.r', under).style.opacity = dx < 0 ? Math.min(1, -dx / 90) : 0;
        if (Math.abs(dx) > 90 && !row._buzzed) { buzz(8); row._buzzed = true; } if (Math.abs(dx) < 90) row._buzzed = false;
      });
      function end(e) {
        if (pid !== e.pointerId) return; pid = null;
        card.style.transition = '';
        var t = findTask(row.dataset.id), k = row.dataset.k;
        if (drag && t) {
          if (dx > 90) { card.style.transform = 'translateX(110%)'; setTimeout(function () { card.style.transform = ''; toggleDone(t, k, $('.chk', row)); }, 180); return; }
          if (dx < -90) { card.style.transform = ''; snoozeSheet(t); return; }
        }
        card.style.transform = '';
        if (!drag && !decided && Date.now() - t0 < 500 && t && !(e.target.closest && e.target.closest('[data-act=check]'))) taskSheet(t, k);
      }
      card.addEventListener('pointerup', end); card.addEventListener('pointercancel', function (e) { if (pid === e.pointerId) { pid = null; card.style.transition = ''; card.style.transform = ''; } });
    });
  }

  // ================= global clicks =================
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act, id = b.dataset.id;
    unlockAudio();
    switch (a) {
      case 'check': { var row = b.closest('.task'); var t = findTask(row.dataset.id); if (t) toggleDone(t, row.dataset.k, b); break; }
      case 'day': selDay = b.dataset.k; renderToday(); break;
      case 'coach': b.style.animation = 'pop .4s'; setTimeout(function () { b.style.animation = ''; }, 400); break;
      case 'toggle-done': showDone = !showDone; renderToday(); break;
      case 'kill-all': overdueList().forEach(function (t) { t.date = dk(addDays(new Date(), 1)); t.snoozes++; }); S.stats.snoozes[today()] = (S.stats.snoozes[today()] || 0) + 1; save(); render(); toast('😴', say('snooze')); break;
      case 'go-me': switchView('me'); break;
      case 'eod': openEOD(); break;
      case 'install': installSheet(); break;
      case 'focus': { var ft = findTask(id); if (ft) openFocus(ft); break; }
      case 'called': { var p = S.people.filter(function (x) { return x.id === id; })[0]; if (p) called(p, b); break; }
      case 'add-goal': openSheet('<h2>اختار هدف</h2>' + goalTplHTML()); break;
      case 'goal-tpl': goalSheet(null, GOAL_TPL[+b.dataset.i]); break;
      case 'prayer': { var pg = S.goals.filter(function (x) { return x.id === id; })[0]; if (pg) prayerToggle(pg, b.dataset.p, b); break; }
      case 'prayer-loc': askLocation(function () { renderGoals(); toast('📍', 'المواقيت اتحسبت لمكانك'); }); break;
      case 'goal-plus': { var g = S.goals.filter(function (x) { return x.id === id; })[0]; if (g) goalPlus(g, b); break; }
      case 'edit-goal': { var g2 = S.goals.filter(function (x) { return x.id === id; })[0]; if (g2) goalSheet(g2); break; }
      case 'add-person': openSheet('<h2>عايز تفضل قريب من مين؟</h2><div class="tpl-grid">' + PEOPLE_TPL.map(function (p, i) { return '<button class="tpl" data-act="person-tpl" data-i="' + i + '"><div class="e">' + p.e + '</div><b>' + p.n + '</b><small>' + (p.custom ? 'أي حد' : everyLabel(p.every)) + '</small></button>'; }).join('') + '</div>'); break;
      case 'person-tpl': personSheet(null, PEOPLE_TPL[+b.dataset.i]); break;
      case 'edit-person': { var pp = S.people.filter(function (x) { return x.id === id; })[0]; if (pp) personSheet(pp); break; }
      case 'coach-set': S.profile.coach = b.dataset.k; save(); renderMe(); toast(COACHES[b.dataset.k].face, say('done')); break;
      case 'sound': S.profile.sound = !S.profile.sound; save(); renderMe(); sfx('tick'); break;
      case 'notif': enableNotifs(); break;
      case 'rename': { var n = prompt('اسمك إيه؟', S.profile.name || ''); if (n != null) { S.profile.name = n.trim(); save(); render(); } break; }
      case 'share': shareProgress(); break;
      case 'export': exportData(); break;
      case 'import': importData(); break;
      case 'reset': if (confirm('متأكد؟ كل المهام والأهداف والـXP هيتمسحوا.')) { localStorage.removeItem(KEY); location.reload(); } break;
    }
  });
  // coach bubble: rotate through contextual lines
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.bubble'); if (!b) return;
    var k = today(), all = dayTasks(k).concat(overdueList()), pend = all.filter(function (t) { return !isDone(t, k); });
    var key = !all.length ? 'empty' : !pend.length ? 'allDone' : pick(['left', 'left', 'done']);
    b.firstChild.textContent = say(key, { n: pend.length });
  }, true);

  function switchView(v) {
    view = v; $$('.view').forEach(function (s) { s.classList.toggle('on', s.id === 'v-' + v); });
    $$('.nav .tab').forEach(function (t) { t.classList.toggle('on', t.dataset.v === v); });
    if (v === 'today') selDay = today();
    render(); window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  $$('.nav .tab').forEach(function (t) { t.addEventListener('click', function () { buzz(6); switchView(t.dataset.v); }); });

  // ================= voice =================
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  // Server speech-to-text (Whisper) is far better at Egyptian Arabic than the browser's recognizer.
  var canRecord = !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  var sttOk = false, mRec = null, mStream = null, mChunks = [], mMime = '', mAnalyser = null, mAC = null, mLevel = null;
  if (canRecord && location.protocol !== 'file:') fetch('/api/transcribe').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { sttOk = !!(j && j.ok); }).catch(function () { });
  function useServer() { return canRecord && sttOk; }
  function startMedia() {
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
      mStream = stream; mChunks = [];
      mMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].filter(function (m) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m); })[0] || '';
      mRec = mMime ? new MediaRecorder(stream, { mimeType: mMime }) : new MediaRecorder(stream);
      mMime = mRec.mimeType || mMime || 'audio/mp4';
      mRec.ondataavailable = function (e) { if (e.data && e.data.size) mChunks.push(e.data); };
      mRec.start(250); recOn = true; buzz(10); sfx('rec'); voiceUI('listen');
      $('#vLive').innerHTML = '<span class="interim">اتكلم براحتك، ولما تخلص دوس ✓</span>';
      try {
        mAC = new (window.AudioContext || window.webkitAudioContext)(); var src = mAC.createMediaStreamSource(stream);
        mAnalyser = mAC.createAnalyser(); mAnalyser.fftSize = 256; src.connect(mAnalyser);
        var buf = new Uint8Array(mAnalyser.frequencyBinCount);
        (function lvl() { if (!mAnalyser) return; mAnalyser.getByteFrequencyData(buf); var sum = 0; for (var i = 0; i < buf.length; i++) sum += buf[i]; energy = Math.max(energy, Math.min(1, sum / buf.length / 60)); mLevel = requestAnimationFrame(lvl); })();
      } catch (_) { }
    }).catch(function () { recOn = false; voiceUI('type'); $('#vHint').innerHTML = 'المايك مقفول. اكتب، أو اتكلم من <b>مايك الكيبورد</b>'; });
  }
  function stopMedia(cb) {
    recOn = false; cancelAnimationFrame(mLevel); mAnalyser = null; if (mAC) { try { mAC.close(); } catch (_) { } mAC = null; }
    var done = function () { if (mStream) mStream.getTracks().forEach(function (t) { t.stop(); }); mStream = null; var blob = mChunks.length ? new Blob(mChunks, { type: mMime }) : null; mRec = null; mChunks = []; if (cb) cb(blob); };
    if (mRec && mRec.state !== 'inactive') { mRec.onstop = done; try { mRec.stop(); } catch (_) { done(); } } else done();
  }
  function transcribe(blob) {
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () {
        var b64 = String(fr.result).split(',')[1] || '';
        var terms = S.people.map(function (p) { return p.name; });
        fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: b64, mime: blob.type, terms: terms }) })
          .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { resolve(j && j.text ? j.text : ''); }).catch(function () { resolve(''); });
      };
      fr.onerror = function () { resolve(''); };
      fr.readAsDataURL(blob);
    });
  }
  var rec = null, recOn = false, finalText = '', interim = '', energy = 0, orbMode = 'idle', parsed = [];
  var HINTS = ['جرّب: <b>"فكرني بكرة الساعة ٣ عندي ميعاد دكتور"</b>', '<b>"فكرني أكلم ماما بالليل"</b>', '<b>"فكرني آخد الفيتامين كل يوم الصبح"</b>', '<b>"لازم أخلص التقرير قبل الخميس"</b>', 'تقدر تقول كذا حاجة ورا بعض.', '<b>"فكرني أصلّح كمبيوتر الصيدلية بكرة، وأوصّل أوردر الساعة ٥"</b>'];
  var hintI = 0, hintTimer = null;
  function voiceUI(state) {
    // state: listen | type | think | review
    $('#vLive').classList.toggle('hidden', state === 'review' || state === 'think');
    $('#orb').classList.toggle('hidden', state === 'review');
    $('#vHint').classList.toggle('hidden', state === 'review' || state === 'think');
    $('#vThink').classList.toggle('show', state === 'think');
    $('#vReview').classList.toggle('show', state === 'review');
    $('#vActs').classList.toggle('show', state === 'review');
    $('#vCtrls').classList.toggle('hidden', state === 'review' || state === 'think' || state === 'type');
    $('#vType').classList.toggle('show', state === 'type');
    $('#vState').textContent = state === 'listen' && recOn ? '● بسمعك' : state === 'think' ? '' : '';
    orbMode = state === 'think' ? 'think' : recOn ? 'listen' : 'idle';
    $('#vMic').classList.toggle('rec', recOn);
    $('#vMic').textContent = recOn ? '■' : '🎙';
  }
  function openVoice() {
    unlockAudio();
    finalText = ''; interim = ''; parsed = [];
    $('#vLive').innerHTML = ''; $('#vText').value = '';
    $('#voice').classList.add('open'); startOrb();
    hintI = 0; $('#vHint').innerHTML = HINTS[0];
    clearInterval(hintTimer); hintTimer = setInterval(function () { var h = $('#vHint'); h.style.opacity = 0; setTimeout(function () { hintI = (hintI + 1) % HINTS.length; h.innerHTML = HINTS[hintI]; h.style.opacity = 1; }, 400); }, 3800);
    if (useServer()) startMedia(); else if (SR) startRec(); else { voiceUI('type'); $('#vHint').innerHTML = 'اكتب، أو دوس <b>المايك اللي في الكيبورد</b> واتكلم'; setTimeout(function () { $('#vText').focus(); }, 350); }
  }
  function closeVoice() { if (mRec || mStream) stopMedia(null); stopRec(); clearInterval(hintTimer); $('#voice').classList.remove('open'); orbMode = 'idle'; setTimeout(stopOrb, 400); }
  function startRec() {
    try {
      rec = new SR(); rec.lang = 'ar-EG'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onresult = function (ev) {
        interim = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var r = ev.results[i];
          if (r.isFinal) finalText += (finalText ? ' ' : '') + r[0].transcript.trim(); else interim += r[0].transcript;
        }
        energy = 1; showLive();
      };
      rec.onerror = function (ev) {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { recOn = false; voiceUI('type'); $('#vHint').innerHTML = 'المايك مقفول. اكتب، أو اتكلم من <b>مايك الكيبورد</b>'; }
      };
      rec.onend = function () { if (recOn) { try { rec.start(); } catch (_) { recOn = false; voiceUI('listen'); } } };
      rec.start(); recOn = true; buzz(10); sfx('rec'); voiceUI('listen');
    } catch (e) { recOn = false; voiceUI('type'); }
  }
  function stopRec() { recOn = false; if (rec) { try { rec.stop(); } catch (_) { } } rec = null; }
  function showLive() {
    $('#vLive').innerHTML = esc(finalText) + (interim ? ' <span class="interim">' + esc(interim) + '</span>' : '');
    var l = $('#vLive'); l.scrollTop = l.scrollHeight;
  }
  function finishVoice() {
    if (mRec) {
      voiceUI('think'); clearInterval(hintTimer); $('#vThinkT').textContent = 'بكتب اللي قلته';
      stopMedia(function (blob) {
        if (!blob || blob.size < 2000) { voiceUI('listen'); toast('🤔', 'مسمعتش حاجة. قول تاني أو اكتب'); return; }
        transcribe(blob).then(function (text) {
          if (!text) { voiceUI('type'); $('#vHint').innerHTML = 'معرفتش أكتب الصوت. اكتبها هنا'; return; }
          finalText = text; interim = ''; handleText(text);
        });
      });
      return;
    }
    var text = (finalText + ' ' + interim).trim() || $('#vText').value.trim();
    stopRec();
    if (!text) { voiceUI(SR ? 'listen' : 'type'); toast('🤔', 'مسمعتش حاجة. قول تاني أو اكتب'); return; }
    handleText(text);
  }
  // "الساعة ١٠ النهارده" said at 5 PM means 10 PM: if a morning hour already passed today, use the evening one.
  function eveningFix(t) {
    if (!t.time || t.date !== today()) return;
    var p = t.time.split(':'), h = +p[0], m = +p[1], now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
    if (h >= 1 && h <= 11 && h * 60 + m < cur && (h + 12) * 60 + m > cur) t.time = pad2(h + 12) + ':' + pad2(m);
  }
  var pendingUpdates = [];
  function handleText(text) {
    voiceUI('think'); clearInterval(hintTimer); $('#vThinkT').textContent = 'ثانية بفهم';
    var said = text;
    understand(text).then(function (r) {
      pendingUpdates = (r.updates || []).filter(function (u) { return findTask(u.id); });
      parsed = (r.tasks || []).map(function (x) { return newTask(x); });
      parsed.forEach(eveningFix);
      parsed.forEach(function (t, i) { var src = r.tasks[i]; if (t.isBig && t.date) { t.steps = src.steps && src.steps.length ? spreadSteps(src.steps, t.date) : localBreakdown(t); } });
      renderReview(said, r.reply || (parsed.length ? say('voice', { n: parsed.length }) : ''), r.source);
    });
  }
  function renderReview(said, reply, source) {
    var h = '<div class="said">"' + esc(said) + '"</div>';
    if (!parsed.length && !pendingUpdates.length) {
      h += '<div class="reply">مفهمتش. قول "فكرني" وبعدها الحاجة والميعاد</div>';
      $('#vReview').innerHTML = h; voiceUI('review'); $('#vSave').classList.add('hidden'); return;
    }
    $('#vSave').classList.remove('hidden');
    h += '<div class="reply"><span style="font-size:24px">' + COACHES[S.profile.coach].face + '</span><span>' + esc(reply) + '</span></div>';
    parsed.forEach(function (t, i) {
      h += '<div class="rcard" style="animation-delay:' + (i * 110 + 80) + 'ms" data-i="' + i + '"><div class="emo">' + esc(t.emoji) + '</div><div class="b">' +
        '<input class="t" value="' + esc(t.title) + '" data-f="title">' +
        '<div class="meta"><label class="tag time"><span>' + (t.date ? dayLabel(t.date) : 'في أي وقت') + '</span><input type="date" data-f="date" value="' + (t.date || '') + '"></label>' +
        '<label class="tag time"><span>' + (t.time ? fmtTime(t.time) : 'من غير ساعة') + '</span><input type="time" data-f="time" value="' + (t.time || '') + '"></label>' +
        '<button class="tag rep" data-f="repeat">' + { none: 'مرة واحدة', daily: 'كل يوم', weekly: 'كل أسبوع', monthly: 'كل شهر' }[t.repeat] + '</button>' +
        '<button class="tag' + (t.priority === 'high' ? ' hi' : '') + '" data-f="prio">' + (t.priority === 'high' ? 'مهم' : 'عادي') + '</button>' +
        (t.isBig ? '<span class="tag big">' + ar(t.steps.length) + ' خطوات</span>' : '') + '</div>' +
        (t.notes ? '<div class="notes">' + esc(t.notes) + '</div>' : '') + '</div><button class="del" data-f="del">✕</button></div>';
    });
    pendingUpdates.forEach(function (u, i) {
      var ot = findTask(u.id);
      h += '<div class="rcard upd" style="animation-delay:' + ((parsed.length + i) * 110 + 80) + 'ms" data-u="' + i + '"><div class="emo">' + esc(ot.emoji) + '</div><div class="b"><div class="t">' + esc(ot.title) + '</div>' +
        '<div class="meta"><span class="tag ' + (u.remove ? 'late' : 'rep') + '">' + esc(u.summary || (u.remove ? 'هتتمسح' : 'هتتعدل')) + '</span></div></div><button class="del" data-f="udel">✕</button></div>';
    });
    if (source === 'local' && aiOk === false) h += '<div style="color:var(--dim);font-size:11.5px;text-align:center">اتفهمت على الموبايل نفسه</div>';
    $('#vReview').innerHTML = h; voiceUI('review');
    sfx('pop');
    $$('.rcard.upd', $('#vReview')).forEach(function (card) {
      $('[data-f=udel]', card).onclick = function () { pendingUpdates[+card.dataset.u]._skip = true; card.style.transition = '.3s'; card.style.opacity = 0; setTimeout(function () { card.remove(); }, 300); };
    });
    $$('.rcard:not(.upd)', $('#vReview')).forEach(function (card) {
      var t = parsed[+card.dataset.i];
      $('input.t', card).oninput = function () { t.title = this.value; };
      $('[data-f=date]', card).onchange = function () { t.date = this.value || null; this.previousElementSibling.textContent = t.date ? dayLabel(t.date) : 'في أي وقت'; };
      $('[data-f=time]', card).onchange = function () { t.time = this.value || null; this.previousElementSibling.textContent = t.time ? fmtTime(t.time) : 'من غير ساعة'; if (t.time && !t.date) t.date = today(); };
      $('[data-f=repeat]', card).onclick = function () { var o = ['none', 'daily', 'weekly', 'monthly']; t.repeat = o[(o.indexOf(t.repeat) + 1) % 4]; if (t.repeat !== 'none' && !t.date) t.date = today(); this.textContent = { none: 'مرة واحدة', daily: 'كل يوم', weekly: 'كل أسبوع', monthly: 'كل شهر' }[t.repeat]; };
      $('[data-f=prio]', card).onclick = function () { t.priority = t.priority === 'high' ? 'normal' : 'high'; this.textContent = t.priority === 'high' ? 'مهم' : 'عادي'; this.classList.toggle('hi', t.priority === 'high'); };
      $('[data-f=del]', card).onclick = function () { card.style.transition = '.3s'; card.style.opacity = 0; card.style.transform = 'translateX(-40px)'; t._del = true; setTimeout(function () { card.remove(); }, 300); };
    });
  }
  $('#vSave').onclick = function () {
    var add = parsed.filter(function (t) { return !t._del && t.title.trim(); });
    var ups = pendingUpdates.filter(function (u) { return !u._skip; }); pendingUpdates = [];
    ups.forEach(applyUpdate);
    if (!add.length) { closeVoice(); if (ups.length) { save(); render(); scheduleNotifs(); toast('👌', 'عدّلت ' + ar(ups.length)); } return; }
    add.forEach(function (t) { t.title = t.title.trim(); S.tasks.push(t); freshIds[t.id] = 1; if (t.person) { var p = findPerson(t.person); if (p) t.person = p.name; } });
    S.stats.voice++; addXP(Math.min(10, add.length * 2), innerWidth / 2, innerHeight - 140);
    checkBadges(); save();
    var first = add[0];
    closeVoice();
    if (view !== 'today') switchView('today');
    selDay = first.date && first.date !== today() && !add.some(function (t) { return occursOn(t, today()); }) ? first.date : today();
    renderToday(); scheduleNotifs();
    burst(innerWidth / 2, innerHeight - 90, 40); sfx('done');
    toast('🧠', 'اتسجلوا ' + ar(add.length) + (selDay !== today() ? '، وريتك ' + dayLabel(selDay) : ''));
  };
  function applyUpdate(u) {
    var t = findTask(u.id); if (!t) return;
    if (u.remove) { S.tasks = S.tasks.filter(function (x) { return x.id !== t.id; }); return; }
    if (u.done) { if (!isDone(t, today())) toggleDone(t, today(), null); return; }
    if (u.date) t.date = u.date; if (u.time) { t.time = u.time; if (!t.date) t.date = today(); }
    if (u.priority) t.priority = u.priority;
    if (u.addNote) t.notes = (t.notes ? t.notes + '\n' : '') + u.addNote;
  }
  $('#vRedo').onclick = function () { parsed = []; finalText = ''; interim = ''; $('#vLive').innerHTML = ''; $('#vText').value = ''; if (useServer()) startMedia(); else if (SR) startRec(); else voiceUI('type'); };
  $('#fab').onclick = openVoice;
  $('#vClose').onclick = closeVoice;
  $('#vMic').onclick = function () { if (recOn) { finishVoice(); } else if (useServer()) { startMedia(); } else if (SR) { startRec(); } else { voiceUI('type'); $('#vText').focus(); } };
  $('#vDone').onclick = finishVoice;
  $('#orb').onclick = function () { if (recOn) finishVoice(); else if (useServer()) startMedia(); else if (SR) startRec(); };
  $('#vKb').onclick = function () { if (mRec || mStream) stopMedia(null); stopRec(); voiceUI('type'); var ta = $('#vText'); ta.value = (finalText + ' ' + interim).trim(); setTimeout(function () { ta.focus(); }, 50); };
  $('#vSend').onclick = function () { finalText = ''; interim = ''; finishVoice(); };
  $('#vText').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#vSend').click(); } });

  // ---- orb animation ----
  var orbRAF = null, orbT = 0, ctxO = $('#orb').getContext('2d');
  function startOrb() { if (!orbRAF) orbRAF = requestAnimationFrame(drawOrb); }
  function stopOrb() { cancelAnimationFrame(orbRAF); orbRAF = null; }
  var orbCol = null;
  function drawOrb() {
    var c = ctxO, W = 660, cx = W / 2, cy = W / 2;
    if (!orbCol) { var cs = getComputedStyle(document.documentElement); orbCol = { b: cs.getPropertyValue('--brand').trim() || '#E8590C', soft: cs.getPropertyValue('--brand-soft').trim() || '#FDE8DA' }; }
    orbT += orbMode === 'think' ? 0.05 : 0.02;
    var target = orbMode === 'listen' ? 0.2 : orbMode === 'think' ? 0.3 : 0.05;
    energy = Math.max(target, energy * 0.93);
    c.clearRect(0, 0, W, W);
    var base = 150 + Math.sin(orbT * 2) * 6;
    c.fillStyle = orbCol.soft; c.beginPath(); c.arc(cx, cy, base * (1.25 + energy * 0.5), 0, Math.PI * 2); c.fill();
    if (orbMode === 'listen') {
      for (var i = 0; i < 2; i++) { var p = ((orbT * 0.6 + i / 2) % 1); c.globalAlpha = 0.5 * (1 - p); c.strokeStyle = orbCol.b; c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, base + p * 150, 0, Math.PI * 2); c.stroke(); }
      c.globalAlpha = 1;
    }
    c.fillStyle = orbCol.b; c.beginPath(); c.arc(cx, cy, base * (1 + energy * 0.25), 0, Math.PI * 2); c.fill();
    if (orbMode === 'think') {
      c.strokeStyle = '#fff'; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, base * 0.55, orbT * 3, orbT * 3 + 1.6); c.stroke();
    } else {
      c.save(); c.translate(cx, cy); c.scale(7, 7); c.translate(-12, -12);
      c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineWidth = 2.2; c.lineCap = 'round';
      c.beginPath(); if (c.roundRect) c.roundRect(9, 2.5, 6, 12, 3); else c.rect(9, 2.5, 6, 12); c.fill();
      c.beginPath(); c.arc(12, 11, 7, 0, Math.PI); c.stroke();
      c.beginPath(); c.moveTo(12, 18); c.lineTo(12, 21.5); c.stroke(); c.restore();
    }
    orbRAF = requestAnimationFrame(drawOrb);
  }

  // ================= focus mode =================
  var fTimer = null, fLeft = 0, fTotal = 0, fTask = null, fPaused = false, wake = null;
  function openFocus(t) {
    fTask = t; fTotal = fLeft = 5 * 60; fPaused = false;
    var el = $('#focus');
    el.innerHTML = '<div class="fs">خمس دقايق بس. لو عايز تقف بعدها، اقف.</div><div class="ft">' + esc(t.emoji) + ' ' + esc((currentStep(t) || {}).t || t.title) + '</div>' +
      '<div class="clock">' + '<svg width="240" height="240" viewBox="0 0 250 250"><circle cx="125" cy="125" r="112" fill="none" style="stroke:var(--track)" stroke-width="14"/><circle id="fArc" cx="125" cy="125" r="112" fill="none" style="stroke:var(--brand)" stroke-width="14" stroke-linecap="round" stroke-dasharray="703.7" stroke-dashoffset="0"/></svg><div class="v" id="fV">05:00</div></div>' +
      '<div class="fs" id="fMsg">' + pick(['اشتغل عليها خمس دقايق وبعدين نشوف.', 'سيب الموبايل خمس دقايق، مش هيطير.', 'أول دقيقة هي اللي تقيلة.']) + '</div>' +
      '<div class="fb"><button class="btn" id="fPause">وقّف</button><button class="btn pri" id="fDoneB">خلصتها</button></div><button class="btn ghost" id="fClose" style="max-width:360px;width:100%;flex:none">اقفل</button>';
    el.classList.add('open');
    $('#fPause').onclick = function () { fPaused = !fPaused; this.textContent = fPaused ? 'كمّل' : 'وقّف'; };
    $('#fDoneB').onclick = function () { closeFocus(); var k = today(); if (t.steps && t.steps.length && currentStep(t)) { currentStep(t).done = true; addXP(8, innerWidth / 2, innerHeight / 2); burst(innerWidth / 2, innerHeight / 2, 60); logActivity(1); save(); render(); if (t.steps.every(function (s) { return s.done; })) toggleDone(t, k, null); } else if (!isDone(t, k)) toggleDone(t, k, null); };
    $('#fClose').onclick = closeFocus;
    clearInterval(fTimer); fTimer = setInterval(tickFocus, 1000); tickFocus(true);
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () { }); } catch (_) { }
  }
  function tickFocus(first) {
    if (!first && !fPaused) fLeft--;
    var m = Math.floor(Math.max(0, fLeft) / 60), s = Math.max(0, fLeft) % 60;
    var v = $('#fV'); if (v) v.textContent = pad2(m) + ':' + pad2(s);
    var arc = $('#fArc'); if (arc) arc.setAttribute('stroke-dashoffset', 703.7 * (1 - fLeft / fTotal));
    if (fLeft <= 0) {
      clearInterval(fTimer); S.stats.focus++; logActivity(1);
      addXP(10, innerWidth / 2, innerHeight / 2); burst(innerWidth / 2, innerHeight / 2, 120); sfx('level'); buzz(40);
      checkBadges(); save();
      notify('خلصت ' + ar(Math.round(fTotal / 60)) + ' دقايق', 'بدأت، وده كان أصعب جزء.');
      $('#fMsg').innerHTML = '<b>عدّوا الخمس دقايق.</b> تكمّل ٢٠ كمان؟';
      $('#fPause').textContent = '＋ ٢٠ دقيقة'; $('#fPause').onclick = function () { fTotal = fLeft = 20 * 60; fPaused = false; this.textContent = 'وقّف'; this.onclick = function () { fPaused = !fPaused; this.textContent = fPaused ? 'كمّل' : 'وقّف'; }; clearInterval(fTimer); fTimer = setInterval(tickFocus, 1000); $('#fMsg').textContent = 'ماشي، ٢٠ دقيقة.'; };
    }
  }
  function closeFocus() { clearInterval(fTimer); $('#focus').classList.remove('open'); if (wake) { try { wake.release(); } catch (_) { } wake = null; } }

  // ================= notifications =================
  var timers = [];
  function enableNotifs() {
    if (!('Notification' in window)) { if (isIOS && !isStandalone) installSheet(); else toast('🔕', 'المتصفح ده مش بيدعم الإشعارات'); return; }
    Notification.requestPermission().then(function (p) {
      S.profile.notif = p === 'granted'; save(); renderMe();
      if (p === 'granted') { notify('الإشعارات اشتغلت', 'هبعتلك هنا لما ييجي ميعاد أي حاجة.'); scheduleNotifs(); }
      else toast('🔕', 'الإشعارات مقفولة، تقدر تفتحها من إعدادات الموبايل');
    });
  }
  function notify(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    var opts = { body: body, tag: tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: !!tag };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (r) { r.showNotification(title, opts); }).catch(function () { try { new Notification(title, opts); } catch (_) { } });
    } else { try { new Notification(title, opts); } catch (_) { } }
    return true;
  }
  function scheduleNotifs() {
    timers.forEach(clearTimeout); timers = [];
    var now = Date.now();
    [0, 1].forEach(function (off) {
      var k = dk(addDays(new Date(), off));
      dayTasks(k).forEach(function (t) {
        var tm = timeOn(t, k); if (!tm || isDone(t, k)) return;
        var p = tm.split(':'), at = parseDk(k); at.setHours(+p[0], +p[1], 0, 0);
        var ms = at.getTime() - now;
        if (ms > 0 && ms < 2147483000) timers.push(setTimeout(function () { ping(t, k); }, ms));
      });
    });
    schedulePrayers();
    var eod = new Date(); eod.setHours(21, 30, 0, 0); var ems = eod.getTime() - now;
    if (ems > 0 && S.tasks.length) timers.push(setTimeout(function () { if (S.reviews[today()]) return; notify('🌙 قفّل يومك', 'دقيقة تراجع فيها النهارده وتخطط لبكرة', 'eod'); if (document.visibilityState === 'visible') { toast('🌙', '<b>قفّل يومك</b> وخطط لبكرة'); render(); } }, ems));
  }
  function schedulePrayers() {
    var pg = S.goals.filter(isPrayerGoal)[0]; if (!pg) return;
    var times = prayerTimes(), now = Date.now(); if (!times) return;
    times.forEach(function (p) {
      var ms = p.at.getTime() - now;
      if (ms > 0) timers.push(setTimeout(function () { var m = (pg.marks && pg.marks[today()]) || {}; if (m[p.id]) return; notify('🤲 ' + p.name, 'جه وقت ' + p.name, 'prayer-' + p.id); if (document.visibilityState === 'visible') { toast('🤲', 'جه وقت <b>' + p.name + '</b>'); sfx('ping'); renderGoals(); } }, ms));
    });
  }
  function ping(t, k) {
    if (isDone(t, k)) return;
    t.pinged = t.pinged || {}; t.pinged[k] = 1; save();
    notify(t.emoji + ' ' + t.title, say('ping'), t.id);
    if (document.visibilityState === 'visible') { toast(t.emoji, '<b>' + esc(t.title) + '</b>، ' + say('ping')); sfx('ping'); buzz([30, 60, 30]); render(); }
  }
  function catchUp() {
    var k = today(), now = new Date(), missed = [];
    dayTasks(k).forEach(function (t) {
      var tm = timeOn(t, k); if (!tm || isDone(t, k) || (t.pinged && t.pinged[k])) return;
      var p = tm.split(':'), at = new Date(); at.setHours(+p[0], +p[1], 0, 0);
      if (at < now && now - at < 3 * 3600000) { missed.push(t); t.pinged = t.pinged || {}; t.pinged[k] = 1; }
    });
    if (missed.length) { save(); setTimeout(function () { toast('⏰', 'فاتك ميعاد: <b>' + missed.map(function (t) { return esc(t.title); }).join('، ') + '</b>'); sfx('ping'); }, 800); }
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { if (selDay < today()) selDay = today(); catchUp(); scheduleNotifs(); render(); } });

  function downloadICS(t) {
    var d = (t.date || today()).replace(/-/g, ''), tm = (t.time || '09:00').replace(':', '') + '00';
    var end = (function () { var p = (t.time || '09:00').split(':'), x = parseDk(t.date || today()); x.setHours(+p[0], +p[1] + 30); return dk(x).replace(/-/g, '') + 'T' + pad2(x.getHours()) + pad2(x.getMinutes()) + '00'; })();
    var rr = { daily: 'RRULE:FREQ=DAILY\r\n', weekly: 'RRULE:FREQ=WEEKLY\r\n', monthly: 'RRULE:FREQ=MONTHLY\r\n' }[t.repeat] || '';
    var ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Fakkarny//AR\r\nBEGIN:VEVENT\r\nUID:' + t.id + '@fakkarny\r\nDTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z\r\n' +
      'DTSTART:' + d + 'T' + tm + '\r\nDTEND:' + end + '\r\n' + rr + 'SUMMARY:' + t.emoji + ' ' + t.title.replace(/[,;\\]/g, ' ') + '\r\nDESCRIPTION:من فكرني\r\n' +
      'BEGIN:VALARM\r\nTRIGGER:-PT0M\r\nACTION:DISPLAY\r\nDESCRIPTION:' + t.title.replace(/[,;\\]/g, ' ') + '\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fakkarny-' + t.id + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('📅', 'افتح الملف واختار Add، والتقويم هينبهك حتى لو فكرني مقفول');
  }

  // ================= share / data =================
  function shareProgress() {
    var li = lvlInfo(S.stats.xp);
    var txt = 'أنا مستوى ' + ar(li.n) + ' (' + li.title + ') على فكرني.\nبقالي ' + ar(streak()) + ' يوم ورا بعض، وخلّصت ' + ar(S.stats.total) + ' حاجة.\nتعرف تغلبني؟';
    var url = location.origin + location.pathname;
    if (navigator.share) navigator.share({ title: 'فكرني', text: txt, url: url }).catch(function () { });
    else if (navigator.clipboard) navigator.clipboard.writeText(txt + '\n' + url).then(function () { toast('📋', 'اتنسخ، ابعته لصحابك'); });
  }
  function exportData() {
    var blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fakkarny-backup-' + today() + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000);
  }
  function importData() {
    var i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
    i.onchange = function () {
      var f = i.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { try { var d = JSON.parse(r.result); if (!d.tasks || !d.stats) throw 0; S = d; save(); location.reload(); } catch (e) { toast('⚠️', 'الملف ده مش نسخة فكرني'); } };
      r.readAsText(f);
    };
    i.click();
  }

  // ================= effects =================
  var tt = null;
  function toast(icon, html) {
    var t = $('#toast'); t.innerHTML = '<span style="font-size:20px">' + icon + '</span><span>' + html + '</span>';
    t.classList.add('show'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  function floatXP(txt, x, y) {
    var e = document.createElement('div'); e.className = 'xpf'; e.textContent = txt; e.style.left = x + 'px'; e.style.top = y + 'px';
    document.body.appendChild(e); setTimeout(function () { e.remove(); }, 1150);
  }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { } }
  function levelUp(n) {
    var li = lvlInfo(S.stats.xp), el = $('#levelup');
    el.innerHTML = '<div class="box"><div class="e">' + li.face + '</div><h2>المستوى ' + ar(n) + '</h2><p>بقيت <b style="color:var(--text)">' + li.title + '</b><br>' + esc(say('done')) + '</p><button class="btn pri" style="width:100%" id="luOk">كمّل</button></div>';
    el.classList.add('open'); burst(innerWidth / 2, innerHeight / 2.4, 260); sfx('level'); buzz([40, 50, 80]);
    $('#luOk').onclick = function () { el.classList.remove('open'); render(); };
  }
  // confetti
  var fx = $('#fx'), fxc = fx.getContext('2d'), parts = [], fxRAF = null, DPR = Math.min(2, window.devicePixelRatio || 1);
  function sizeFx() { fx.width = innerWidth * DPR; fx.height = innerHeight * DPR; fx.style.width = innerWidth + 'px'; fx.style.height = innerHeight + 'px'; }
  sizeFx(); addEventListener('resize', sizeFx);
  var COLS = ['#E8590C', '#2F9E44', '#E8A100', '#1C7ED6', '#D9363E', '#7048E8'];
  function burst(x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * (n > 100 ? 11 : 7);
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (n > 100 ? 5 : 3), r: 3 + Math.random() * 5, c: pick(COLS), rot: Math.random() * 6, vr: (Math.random() - .5) * .4, life: 1, shape: Math.random() < .5 ? 0 : 1 });
    }
    if (!fxRAF) fxRAF = requestAnimationFrame(stepFx);
  }
  function stepFx() {
    fxc.setTransform(DPR, 0, 0, DPR, 0, 0); fxc.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.life > 0 && p.y < innerHeight + 40; });
    parts.forEach(function (p) {
      p.vy += 0.22; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.009;
      fxc.save(); fxc.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6)); fxc.translate(p.x, p.y); fxc.rotate(p.rot); fxc.fillStyle = p.c;
      if (p.shape) fxc.fillRect(-p.r, -p.r / 2.5, p.r * 2, p.r / 1.25); else { fxc.beginPath(); fxc.arc(0, 0, p.r / 1.6, 0, Math.PI * 2); fxc.fill(); }
      fxc.restore();
    });
    fxRAF = parts.length ? requestAnimationFrame(stepFx) : (fxc.clearRect(0, 0, innerWidth, innerHeight), null);
  }
  // sound (WebAudio, no files)
  var AC = null;
  function unlockAudio() { if (!AC && (window.AudioContext || window.webkitAudioContext)) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { } } if (AC && AC.state === 'suspended') AC.resume(); }
  function tone(f, t0, dur, type, vol) {
    var o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, AC.currentTime + t0); g.gain.linearRampToValueAtTime(vol || .15, AC.currentTime + t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + t0 + dur);
    o.connect(g); g.connect(AC.destination); o.start(AC.currentTime + t0); o.stop(AC.currentTime + t0 + dur + .02);
  }
  function sfx(kind) {
    if (!S.profile.sound || !AC) return;
    try {
      if (kind === 'done') { tone(880, 0, .12, 'triangle', .14); tone(1320, .08, .22, 'triangle', .12); }
      else if (kind === 'tick') tone(1046, 0, .08, 'sine', .1);
      else if (kind === 'pop') { tone(660, 0, .06, 'sine', .1); tone(990, .05, .08, 'sine', .08); }
      else if (kind === 'snooze') { tone(440, 0, .15, 'sine', .1); tone(330, .1, .2, 'sine', .08); }
      else if (kind === 'rec') tone(740, 0, .1, 'sine', .08);
      else if (kind === 'ping') { tone(988, 0, .12, 'sine', .14); tone(988, .18, .12, 'sine', .14); }
      else if (kind === 'level' || kind === 'badge') [523, 659, 784, 1046].forEach(function (f, i) { tone(f, i * .09, .25, 'triangle', .12); });
    } catch (_) { }
  }

  // ================= onboarding =================
  function onboarding() {
    var step = 0, el = $('#onb');
    function dots() { var h = '<div class="pdots">'; for (var i = 0; i < 4; i++) h += '<i class="' + (i === step ? 'on' : '') + '"></i>'; return h + '</div>'; }
    function show() {
      var h = '<div class="onb"><div class="bg-glow"></div>';
      if (step === 0) {
        h += '<div class="pg"><div class="logo">فكرني</div><h2>قول، وأنا أفتكرلك.</h2><p>قول اللي وراك بصوتك. فكرني يكتبه ويفكّرك بيه في ميعاده، ويفضل وراك لحد ما تخلّصه.</p>' +
          '<div class="bubbles"><div class="bb me" style="animation-delay:.3s">🎙 فكرني بكرة الساعة ٣ عندي ميعاد دكتور، وأكلم ماما بالليل</div>' +
          '<div class="bb" style="animation-delay:1.1s">تمام يا باشا<br>🩺 ميعاد الدكتور، بكرة ٣:٠٠ العصر<br>❤️ أكلم ماما، بكرة ٩:٠٠ بالليل</div>' +
          '<div class="bb" style="animation-delay:1.9s">وكل حاجة تخلّصها بتاخد عليها نقط وتطلع مستوى.</div></div></div>' + dots() + '<button class="nextb" id="oN">يلا نبدأ</button>';
      } else if (step === 1) {
        h += '<div class="pg"><h2>أناديك بإيه؟</h2><p>عشان المدرب يكلمك باسمك.</p><input class="name" id="oName" placeholder="اسمك" value="' + esc(S.profile.name) + '" autocomplete="given-name"></div>' + dots() + '<button class="nextb" id="oN">كمّل</button>';
      } else if (step === 2) {
        h += '<div class="pg"><h2>اختار المدرب بتاعك</h2><p>ده اللي هيكلمك ويزقّك. تقدر تغيّره بعدين.</p><div class="coach-pick">' +
          Object.keys(COACHES).map(function (k) { var c = COACHES[k]; return '<button class="' + (S.profile.coach === k ? 'on' : '') + '" data-c="' + k + '"><span class="e">' + c.face + '</span><span><b>' + c.name + '</b><small>' + c.desc + '</small></span></button>'; }).join('') +
          '</div></div>' + dots() + '<button class="nextb" id="oN">كمّل</button>';
      } else {
        if (isIOS && !isStandalone) {
          h += '<div class="pg"><h2>حطه على الشاشة الرئيسية</h2><p>من غير App Store. عشان يفتح بلمسة وتوصلك الإشعارات:</p><div class="ios-steps"><div><b>١</b><span>دوس زرار المشاركة <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4DA3FF" stroke-width="2" style="vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg> في Safari</span></div><div><b>٢</b><span>اختار <b>Add to Home Screen</b></span></div><div><b>٣</b><span>افتح فكرني من الأيقونة الجديدة</span></div></div></div>' + dots() + '<button class="nextb" id="oN">تمام</button>';
        } else {
          h += '<div class="pg"><h2>أفكّرك إزاي وإنت قافله؟</h2><p>فعّل الإشعارات عشان أبعتلك في ميعاد كل حاجة. ولو قافل التطبيق خالص، تقدر تضيف أي مهمة للتقويم.</p></div>' + dots() + '<button class="nextb" id="oNotif">فعّل الإشعارات</button><button class="skip" id="oN">بعدين</button>';
        }
      }
      h += '</div>';
      el.innerHTML = h;
      var n = $('#oName'); if (n) { setTimeout(function () { n.focus(); }, 300); n.onkeydown = function (e) { if (e.key === 'Enter') $('#oN').click(); }; }
      $$('[data-c]', el).forEach(function (b) { b.onclick = function () { S.profile.coach = b.dataset.c; $$('[data-c]', el).forEach(function (x) { x.classList.toggle('on', x === b); }); unlockAudio(); sfx('tick'); }; });
      var nb = $('#oNotif'); if (nb) nb.onclick = function () { if ('Notification' in window) Notification.requestPermission().then(function (p) { S.profile.notif = p === 'granted'; finish(); }); else finish(); };
      $('#oN').onclick = function () {
        unlockAudio();
        if (step === 1) { S.profile.name = ($('#oName').value || '').trim(); }
        if (step < 3) { step++; show(); sfx('tick'); } else finish();
      };
    }
    function finish() {
      S.onboarded = true;
      if (!S.tasks.length) {
        var a = newTask({ title: 'اسحبني يمين لما تخلّص', emoji: '👋', date: today() });
        var b = newTask({ title: 'دوس المايك وقول: فكرني بكرة الساعة ٥', emoji: '🎙️', date: today() });
        var c = newTask({ title: 'اسحبني شمال لو عايز تأجّل (بس متتعودش)', emoji: '😴', date: today() });
        S.tasks.push(a, b, c); freshIds[a.id] = freshIds[b.id] = freshIds[c.id] = 1;
      }
      save(); el.innerHTML = ''; render(); burst(innerWidth / 2, innerHeight / 3, 120); sfx('level');
      toast(COACHES[S.profile.coach].face, 'أهلاً يا ' + esc(S.profile.name || 'باشا') + '. يلا نشوف هتأجّل قد إيه.');
    }
    show();
  }

  // ================= boot =================
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () { });
  if (!S.onboarded) onboarding();
  render(); catchUp(); scheduleNotifs();
  setInterval(function () { if (document.visibilityState === 'visible' && view === 'today' && !$('#sheet').classList.contains('open') && !$('#voice').classList.contains('open')) renderToday(); }, 60000);
  window.addEventListener('pageshow', function () { scheduleNotifs(); });
})();
