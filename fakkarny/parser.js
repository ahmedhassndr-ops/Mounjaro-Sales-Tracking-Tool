/* فكرني — Egyptian Arabic "remind me" parser.
 * Turns free speech like
 *   "فكرني بكرة الساعة ٣ عندي ميعاد دكتور وعايز اتصل بماما بالليل"
 * into structured tasks. Runs fully offline; the /api/parse endpoint (Claude)
 * is preferred when available and returns the same shape.
 */
(function (root) {
  'use strict';

  var DAY_MS = 86400000;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }

  function normalize(s) {
    return String(s || '')
      .replace(/[ً-ْـ]/g, '')            // tashkeel + tatweel
      .replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); })
      .replace(/[۰-۹]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c); })
      .replace(/[أإآ]/g, 'ا')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---------- word lists ----------
  var NUM_WORDS = [
    [/^(واحد[ةه]?|وحد[ةه])$/, 1], [/^(اتنين|اثنين|اتنتين)$/, 2], [/^(تلات[ةه]?|ثلاث[ةه]?|تلاته)$/, 3],
    [/^(اربع[ةه]?)$/, 4], [/^(خمس[ةه]?)$/, 5], [/^(ست[ةه]?)$/, 6], [/^(سبع[ةه]?)$/, 7],
    [/^(تمني[ةه]|تماني[ةه]?|تمان[ةه]?|ثماني[ةه]?|ثمان[ةه]?)$/, 8], [/^(تسع[ةه]?)$/, 9], [/^(عشر[ةه]?)$/, 10],
    [/^(حداشر|حداشار|احداشر)$/, 11], [/^(اتناشر|اثناشر|اطناشر)$/, 12]
  ];
  var NUM_WORD_RE = '(?:\\d{1,2}|واحد[ةه]?|وحد[ةه]|اتنين|اثنين|تلات[ةه]?|ثلاث[ةه]?|اربع[ةه]?|خمس[ةه]?|ست[ةه]?|سبع[ةه]?|تمني[ةه]|تماني[ةه]?|تمان[ةه]?|ثماني[ةه]?|تسع[ةه]?|عشر[ةه]?|حداشر|احداشر|اتناشر|اثناشر|اطناشر)';
  function wordToNum(w) {
    if (/^\d+$/.test(w)) return parseInt(w, 10);
    for (var i = 0; i < NUM_WORDS.length; i++) if (NUM_WORDS[i][0].test(w)) return NUM_WORDS[i][1];
    return null;
  }

  var WEEKDAYS = [
    [/(?:^|\s)(?:يوم\s+)?(?:ال)?(?:حد|احد)(?=\s|$)/, 0],
    [/(?:^|\s)(?:يوم\s+)?(?:ال)?(?:اتنين|اثنين)(?=\s|$)/, 1],
    [/(?:^|\s)(?:يوم\s+)?(?:ال)?(?:تلات|ثلاثاء|ثلاثا|تلاتاء|تلاتا)(?=\s|$)/, 2],
    [/(?:^|\s)(?:يوم\s+)?(?:ال)?(?:اربع|اربعاء|اربعا)(?=\s|$)/, 3],
    [/(?:^|\s)(?:يوم\s+)?(?:ال)?خميس(?=\s|$)/, 4],
    [/(?:^|\s)(?:يوم\s+)?(?:ال)?جمع[ةه](?=\s|$)/, 5],
    [/(?:^|\s)(?:يوم\s+)?(?:ال)?سبت(?=\s|$)/, 6]
  ];

  var PERIODS = [
    { re: /(?:الصبح|الصباح|صباحا|بدري|الفجر)/, kind: 'am', def: 9 },
    { re: /(?:الضهر|الظهر|ضهرا|ظهرا)/, kind: 'noon', def: 13 },
    { re: /(?:العصر|عصرا)/, kind: 'pm', def: 16 },
    { re: /(?:المغرب|مغربا)/, kind: 'pm', def: 18 },
    { re: /(?:بالليل|بليل|الليل[ةه]?|مساء|بالمسا|المسا|باليل)/, kind: 'night', def: 21 },
    { re: /قبل\s+(?:ما\s+)?(?:انام|النوم)/, kind: 'night', def: 23 }
  ];

  var CATS = [
    { cat: 'health', emoji: '💊', re: /(دوا|دوي[ةه]|علاج|فيتامين|مالتي|مغن[يى]?سيوم|زنك|حديد|اوميجا|مكمل|حباي[ةه]|برشام|انسولين|حقن[ةه]|مونجارو|قرص|كالسيوم|بروبيوتك|افروميد)/ },
    { cat: 'appointment', emoji: '📅', re: /(ميعاد|معاد|اجتماع|ميتنج|ميتينج|meeting|مقابل[ةه]|كشف|عياد[ةه]|انترفيو|interview)/i },
    { cat: 'people', emoji: '📞', re: /(اتصل|اكلم|كلم|ارن|رن على|مكالم[ةه]|اطمن على|ازور|زيار[ةه])/ },
    { cat: 'fitness', emoji: '💪', re: /(جيم|تمرين|اتمرن|رياض[ةه]|امشي|مشي|اجري|جري|سباح[ةه]|كارديو|يوجا)/ },
    { cat: 'water', emoji: '💧', re: /(اشرب\s+(?:مي[ةه]|ميا[ةه]|مايه)|كوباي[ةه]\s+مي[ةه]|مي[ةه]\s+كتير)/ },
    { cat: 'study', emoji: '📚', re: /(اذاكر|مذاكر[ةه]|امتحان|محاضر[ةه]|كورس|اقرا|كتاب|سكشن|واجب)/ },
    { cat: 'errand', emoji: '🛒', re: /(اشتري|اجيب|سوبرماركت|طلبات|اصلح|تصليح|صيان[ةه]|اغسل|مكوج[ةه]|بنك|ادفع|اشحن|شحن|اوديه|البقال)/ },
    { cat: 'work', emoji: '💼', re: /(شغل|اوردر|توصيل|اوصل|وصل|ايميل|ميل|تقرير|عميل|عملا|صيدلي[ةه]|مشروع|بريزنتيشن|presentation|حسابات|ديدلاين|deadline|اسلم|تسليم|مدير)/i },
    { cat: 'faith', emoji: '🤲', re: /(اصلي|صلا[ةه]|قران|قرآن|اذكار|استغفار)/ }
  ];
  var EMOJI_HINTS = [
    [/(كمبيوتر|لابتوب|لاب توب|موبايل|تليفون)/, '💻'], [/(عربي[ةه]|بنزين|ميكانيكي)/, '🚗'],
    [/(عيد ميلاد|ميلاد)/, '🎂'], [/(فلوس|ادفع|احول|تحويل|فاتور[ةه])/, '💰'], [/(دكتور|دكتور[ةه]|كشف)/, '🩺'],
    [/(ماما|امي|بابا|ابويا|تيتا|جدتي|جدو|اخويا|اختي)/, '❤️'], [/(اوردر|توصيل|اوصل)/, '📦']
  ];
  var FAMILY_RE = /(ماما|امي|بابا|ابويا|ابوي|تيتا|جدتي|جدو|جدي|اخويا|اختي|مراتي|جوزي|خالتي|عمتي|خالي|عمي|ابني|بنتي)/;
  var BIG_RE = /(مشروع|تقرير|بريزنتيشن|presentation|امتحان|رسال[ةه]|ديدلاين|deadline|اخلص|اسلم|تسليم|اذاكر)/i;

  // ---------- splitting ----------
  var STARTERS = '(?:عايز|عاوز|عايزه|عاوزه|عايزة|محتاج|لازم|عندي|اتصل|اكلم|كلم|اروح|اشتري|اخد|اجيب|ابعت|اوصل|اخلص|اذاكر|المفروض|ابقى|اشرب|انزل|اصلح|ادفع)';
  function splitSegments(text) {
    var t = ' ' + text + ' ';
    t = t.replace(/[،,\.!؟\?؛\n]+/g, ' | ');
    t = t.replace(/\s(?:و\s*)?(?:كمان\s+)?(?:فكرني|فكريني|ذكرني|افتكر|فكرنى)\s*/g, ' | ');
    t = t.replace(/\s(?:وبعدين|و بعدين|وبعد كد[هاة]|و بعد كد[هاة]|وكمان|و كمان|وبرضو|و برضو)\s/g, ' | ');
    t = t.replace(new RegExp('\\sو\\s?(?=' + STARTERS + ')', 'g'), ' | ');
    return t.split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s.replace(/\s/g, '').length > 1; });
  }

  // ---------- extraction ----------
  function extractRepeat(seg) {
    var m;
    if ((m = seg.match(/(?:كل\s+يوم|يوميا|يومياً|كل يومين)/))) return { repeat: 'daily', match: m[0] };
    if ((m = seg.match(/(?:كل\s+(?:اسبوع|أسبوع)|اسبوعيا)/))) return { repeat: 'weekly', match: m[0] };
    if ((m = seg.match(/(?:كل\s+شهر|شهريا|اول\s+كل\s+شهر)/))) return { repeat: 'monthly', match: m[0] };
    for (var i = 0; i < WEEKDAYS.length; i++) {
      var re = new RegExp('كل\\s+' + WEEKDAYS[i][0].source.replace('(?:^|\\s)(?:يوم\\s+)?', '(?:يوم\\s+)?'));
      if ((m = seg.match(re))) return { repeat: 'weekly', weekday: WEEKDAYS[i][1], match: m[0] };
    }
    return null;
  }

  function extractDay(seg, now) {
    var m, today = addDays(now, 0);
    if ((m = seg.match(/بعد\s+بكر[ةه]/))) return { date: addDays(today, 2), match: m[0] };
    if ((m = seg.match(/بكر[ةه]/))) return { date: addDays(today, 1), match: m[0] };
    if ((m = seg.match(/(?:النهارد[ةه]|انهارد[ةه]|النهار\s+د[هة]|دلوقتي|حالا)/))) return { date: today, match: m[0] };
    if ((m = seg.match(/بعد\s+(يومين|اسبوعين|اسبوع|(\d+)\s*(?:ايام|يوم))/))) {
      var n = m[1] === 'يومين' ? 2 : m[1] === 'اسبوع' ? 7 : m[1] === 'اسبوعين' ? 14 : parseInt(m[2], 10);
      return { date: addDays(today, n), match: m[0] };
    }
    if ((m = seg.match(/(?:الاسبوع|الأسبوع)\s+(?:الجاي|اللي\s+جاي|القادم)/))) return { date: addDays(today, 7), match: m[0] };
    if ((m = seg.match(/(?:اول|أول)\s+الشهر(?:\s+(?:الجاي|اللي\s+جاي))?/))) return { date: new Date(today.getFullYear(), today.getMonth() + 1, 1), match: m[0] };
    if ((m = seg.match(/الشهر\s+(?:الجاي|اللي\s+جاي)/))) return { date: new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()), match: m[0] };
    for (var i = 0; i < WEEKDAYS.length; i++) {
      if ((m = seg.match(WEEKDAYS[i][0]))) {
        var diff = (WEEKDAYS[i][1] - today.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        return { date: addDays(today, diff), match: m[0].trim() };
      }
    }
    if ((m = seg.match(/يوم\s+(\d{1,2})(?!\s*(?:ساع|دقي|:))/))) {
      var dd = parseInt(m[1], 10);
      if (dd >= 1 && dd <= 31) {
        var d = new Date(today.getFullYear(), today.getMonth(), dd);
        if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, dd);
        return { date: d, match: m[0] };
      }
    }
    return null;
  }

  function extractTime(seg, now) {
    var m, matches = [];
    // relative: "بعد ساعة" / "بعد نص ساعة" / "بعد ٢٠ دقيقة"
    var rel = seg.match(/بعد\s+(نص\s+ساع[ةه]|ربع\s+ساع[ةه]|ساع[ةه]\s+ونص|ساع[ةه]\s+و\s+نص|ساع[ةه]|ساعتين|(\d+)\s*(?:ساع[ةه]|ساعات)|(\d+)\s*(?:دقيق[ةه]|دقايق|دقيقه|د))/);
    if (rel) {
      var mins = 0, w = rel[1];
      if (/^نص/.test(w)) mins = 30; else if (/^ربع/.test(w)) mins = 15;
      else if (/ونص|و\s+نص/.test(w)) mins = 90; else if (w === 'ساعتين') mins = 120;
      else if (rel[2]) mins = parseInt(rel[2], 10) * 60; else if (rel[3]) mins = parseInt(rel[3], 10);
      else mins = 60;
      var at = new Date(now.getTime() + mins * 60000);
      return { h: at.getHours(), m: at.getMinutes(), date: at, relative: true, matches: [rel[0]] };
    }

    var h = null, mi = 0, period = null;
    for (var p = 0; p < PERIODS.length; p++) {
      if ((m = seg.match(PERIODS[p].re))) { period = PERIODS[p]; matches.push(m[0]); break; }
    }
    var timeRe = new RegExp('(?:(?:الساع[ةه]|ساع[ةه]|على|ع)\\s*(' + NUM_WORD_RE + ')(?:\\s*[:\\.]\\s*(\\d{2}))?)');
    var bare = new RegExp('(?:^|\\s)(' + NUM_WORD_RE + ')(?:\\s*[:\\.]\\s*(\\d{2}))?(?=\\s*(?:الصبح|الصباح|صباحا|الضهر|الظهر|العصر|المغرب|بالليل|بليل|مساء|المسا|الفجر))');
    var clock = seg.match(/(?:^|\s)(\d{1,2})[:\.](\d{2})(?=\s|$)/);
    if ((m = seg.match(timeRe)) || (m = seg.match(bare)) || (m = clock)) {
      h = wordToNum(m[1]);
      if (m[2]) mi = parseInt(m[2], 10);
      matches.push(m[0].trim());
      var tail = seg.slice(seg.indexOf(m[0]) + m[0].length);
      var mm;
      if ((mm = tail.match(/^\s*(?:و\s*نص|ونص)/))) { mi = 30; matches.push(mm[0].trim()); }
      else if ((mm = tail.match(/^\s*(?:و\s*ربع|وربع)/))) { mi = 15; matches.push(mm[0].trim()); }
      else if ((mm = tail.match(/^\s*(?:و\s*تلت|وتلت|و\s*ثلث)/))) { mi = 20; matches.push(mm[0].trim()); }
      else if ((mm = tail.match(/^\s*(?:الا|إلا)\s*ربع/))) { mi = 45; h = h - 1; matches.push(mm[0].trim()); }
      else if ((mm = tail.match(/^\s*(?:الا|إلا)\s*(?:تلت|ثلث)/))) { mi = 40; h = h - 1; matches.push(mm[0].trim()); }
      else if ((mm = tail.match(/^\s*و\s*(\d{1,2})\s*(?:دقيق[ةه]|دقايق)?/))) { mi = parseInt(mm[1], 10); matches.push(mm[0].trim()); }
      if (h === 0) h = 12;
    }

    if (h === null && !period) return null;
    if (h === null) { h = period.def; }
    else if (h <= 12) {
      var kind = period ? period.kind : null;
      if (kind === 'am') { if (h === 12) h = 0; }
      else if (kind === 'noon') { if (h < 11) h += 12; }
      else if (kind === 'pm') { if (h < 12) h += 12; }
      else if (kind === 'night') { if (h === 12) h = 0; else if (h >= 5) h += 12; }
      else { if (h >= 1 && h <= 7) h += 12; }   // Egyptian default: "الساعة ٣" = 3pm, "الساعة ٩" = 9am
    }
    if (h > 23) h = h % 24;
    return { h: h, m: Math.max(0, Math.min(59, mi)), matches: matches };
  }

  var STOP_AFTER_NAME = /^(بكر[ةه]|النهارد[ةه]|الساع[ةه]|ساع[ةه]|عشان|علشان|بالليل|الصبح|العصر|المغرب|الضهر|بعد|قبل|كل|يوم|في|و|اقوله|اقولها|اسأله|اساله|اطمن)$/;
  function extractPerson(seg) {
    var m = seg.match(/(?:اتصل|اكلم|كلم|ارن|رن|اطمن|ازور|زور|اسال|اسأل|ابعت)\s+(?:على\s+|عل[يى]\s+|ل)?(.*)$/);
    if (m) {
      var words = m[1].replace(/^ب(?=\S{2,})/, '').split(' '), out = [];
      for (var i = 0; i < words.length && out.length < 2; i++) {
        var w = words[i];
        if (!w || STOP_AFTER_NAME.test(w) || /^\d/.test(w)) break;
        out.push(w);
        if (FAMILY_RE.test(w)) break;
      }
      if (out.length) return out.join(' ');
    }
    var f = seg.match(FAMILY_RE);
    return f ? f[1] : null;
  }

  var B_KEEP = /^(بكر|بنك|باب|بابا|بيت|بنزين|بريد|برشام|بروبيوتك|بنت|بنتي|بقال|بلاي|بيتزا|بطاري|بطاقة|بطاق|برنامج|بريزنتيشن)/;
  function cleanTitle(seg, removals) {
    var t = ' ' + seg + ' ';
    removals.forEach(function (r) { if (r) t = t.split(r).join(' '); });
    t = t.replace(/\s(?:يا\s+)?(?:فكرني|فكريني|ذكرني)\s/g, ' ')
      .replace(/\s(?:ان\s+شاء\s+الله|انشاء\s+الله|لو\s+سمحت|بليز|please)\s/gi, ' ')
      .replace(/\s(?:الساع[ةه]|ساع[ةه])\s/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    // leading fillers (repeat a few times: "اني عايز ان ...")
    for (var k = 0; k < 4; k++) {
      t = t.replace(/^(?:ب?ان|اني|انا|إني|يعني|طب|بص|و|كمان|برضو|عايز|عاوز|عايزه|عاوزه|عايزة|عاوزة|محتاج|محتاجه|محتاجة|لازم|المفروض|ابقى|ابقي|يا\s*ريت|ياريت|عشان)\s+/, '');
    }
    t = t.replace(/^عندي\s+(?=(?:ميعاد|معاد|اجتماع|ميتنج|كشف|امتحان|مقابل|انترفيو|محاضر|سكشن|ديدلاين))/, '');
    t = t.replace(/(?:\s+(?:في|على|ع|من|يوم|الساعه|الساعة|و|عشان|ب|قبل|لحد|لغاية|لغايت))+$/, '');
    // "بميعاد الدكتور" -> "ميعاد الدكتور"
    var first = t.split(' ')[0] || '';
    if (/^ب\S{3,}/.test(first) && !B_KEEP.test(first) && !/^بال/.test(first)) t = t.slice(1);
    else if (/^بال\S{2,}/.test(first)) t = t.slice(1);
    return t.trim();
  }

  function categorize(seg, person) {
    var cat = 'other', emoji = '✨';
    for (var i = 0; i < CATS.length; i++) if (CATS[i].re.test(seg)) { cat = CATS[i].cat; emoji = CATS[i].emoji; break; }
    for (var j = 0; j < EMOJI_HINTS.length; j++) if (EMOJI_HINTS[j][0].test(seg)) { emoji = EMOJI_HINTS[j][1]; break; }
    if (cat === 'people' && person && FAMILY_RE.test(person)) emoji = '❤️';
    return { cat: cat, emoji: emoji };
  }

  function parseSegment(raw, now, ctx) {
    var seg = normalize(raw);
    var removals = [];
    var rep = extractRepeat(seg); if (rep) removals.push(rep.match);
    var day = extractDay(rep ? seg.replace(rep.match, ' ') : seg, now); if (day) removals.push(day.match);
    var time = extractTime(seg, now); if (time) removals = removals.concat(time.matches);
    var person = null;
    var c0 = /(اتصل|اكلم|كلم|ارن|اطمن|ازور|زور)/.test(seg) || FAMILY_RE.test(seg);
    if (c0) person = extractPerson(seg);
    var cc = categorize(seg, person);

    var date = null;
    if (time && time.relative) date = time.date;
    else if (day) date = day.date;
    else if (ctx.lastDate && !rep) date = ctx.lastDate;          // "فكرني بكرة X و Y" -> Y is tomorrow too
    if (!date && rep) date = addDays(now, 0);
    if (!date && time) {
      var cand = addDays(now, 0); cand.setHours(time.h, time.m, 0, 0);
      date = cand.getTime() > now.getTime() ? addDays(now, 0) : addDays(now, 1);
    }
    if (rep && rep.weekday != null) {
      var diff = (rep.weekday - now.getDay() + 7) % 7; date = addDays(now, diff);
    }
    if (day) ctx.lastDate = day.date;

    var title = cleanTitle(seg, removals);
    if (!title || title.length < 2) title = person ? ('اتصل بـ' + person) : 'تذكير';
    var isBig = BIG_RE.test(seg);
    return {
      title: title,
      emoji: cc.emoji,
      category: cc.cat,
      date: date ? dateKey(date) : null,
      time: time ? pad(time.h) + ':' + pad(time.m) : null,
      repeat: rep ? rep.repeat : 'none',
      person: person,
      isBig: isBig,
      steps: []
    };
  }

  function parse(text, now) {
    now = now || new Date();
    var segs = splitSegments(normalize(text));
    var ctx = { lastDate: null };
    var tasks = segs.map(function (s) { return parseSegment(s, now, ctx); })
      .filter(function (t) { return t.title && t.title !== 'تذكير' || t.time; });
    return { tasks: tasks, source: 'local' };
  }

  var api = { parse: parse, normalize: normalize, splitSegments: splitSegments, dateKey: dateKey, addDays: addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FakkarnyParser = api;
})(typeof self !== 'undefined' ? self : this);
