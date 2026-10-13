/* ═══════════════════════════════════════════════════════════════
   اختبارات التحمل وسلامة البيانات
   تتحقق أن التطبيق لا يفقد بيانات ولا يتعطل تحت الضغط.
   ═══════════════════════════════════════════════════════════════ */
const H = require('./harness');
const { createEnv, suite, test, assert, assertEq, assertIncludes, report } = H;

const { win } = createEnv();
const S = win.DH.store, AI = win.DH.ai, AS = win.DH.assist, CAL = win.DH.calendar;
S.load();
const TODAY = S.todayISO();

/* ── ١. حجم كبير ─────────────────────────────────────────── */
suite('١. التحمل مع البيانات الكبيرة');

test('إضافة ٥٠٠ مهمة تعمل دون خطأ', () => {
  const start = Date.now();
  for (let i = 0; i < 500; i++) {
    S.addTask({
      title: 'مهمة رقم ' + i, sectionId: 'sec_work',
      categoryId: 'cat_acct', dueDate: S.addDaysISO(TODAY, (i % 30) - 5),
      priority: ['low','normal','high','urgent'][i % 4],
      size: i % 3 === 0 ? 'large' : 'small'
    });
  }
  const ms = Date.now() - start;
  assert(S.state.tasks.length >= 500, 'عدد المهام: ' + S.state.tasks.length);
  assert(ms < 8000, 'الإضافة سريعة: ' + ms + 'ms');
});

test('الترتيب يتحمل ٥٠٠ مهمة بسرعة', () => {
  const start = Date.now();
  const sorted = win.DH.ui.sortTasks(S.state.tasks);
  const ms = Date.now() - start;
  assertEq(sorted.length, S.state.tasks.length, 'لا مهام مفقودة في الترتيب');
  assert(ms < 500, 'الترتيب سريع: ' + ms + 'ms');
});

test('الترتيب صحيح فعليًا مع البيانات الكبيرة', () => {
  const sorted = win.DH.ui.sortTasks(S.state.tasks.filter(t => t.status !== 'done'));
  let lastRank = -1;
  let violations = 0;
  sorted.forEach(t => {
    const r = win.DH.ui.dueInfo(t).rank;
    if (r < lastRank) violations++;
    lastRank = r;
  });
  assertEq(violations, 0, 'لا انتهاكات في ترتيب الأولوية');
});

test('الترشيح يتحمل البيانات الكبيرة', () => {
  const start = Date.now();
  const filtered = win.DH.ui.filteredTasks();
  const ms = Date.now() - start;
  assert(filtered.length > 0, 'نتائج موجودة');
  assert(ms < 800, 'الترشيح سريع: ' + ms + 'ms');
});

test('البحث في ٥٠٠ مهمة سريع', () => {
  const start = Date.now();
  S.state.tasks.filter(t => AI.normalize(t.title).indexOf(AI.normalize('رقم 400')) > -1);
  const ms = Date.now() - start;
  assert(ms < 300, 'البحث سريع: ' + ms + 'ms');
});

test('إجمالي الوقت يتحمل ٢٠٠٠ سجل', () => {
  for (let i = 0; i < 2000; i++) {
    S.state.timeLog.push({
      id: 'sl' + i, taskId: S.state.tasks[i % 100].id,
      seconds: 60 + (i % 120), day: S.addDaysISO(TODAY, -(i % 40)),
      startedAt: new Date().toISOString(), endedAt: new Date().toISOString()
    });
  }
  const start = Date.now();
  const day = S.totalForDay(TODAY);
  const ms = Date.now() - start;
  assert(day.total > 0, 'إجمالي محسوب: ' + day.total + 'ث');
  assert(ms < 500, 'الحساب سريع: ' + ms + 'ms');
});

test('التصدير يتحمل البيانات الكبيرة', () => {
  const start = Date.now();
  const data = S.exportAll();
  const json = JSON.stringify(data);
  const ms = Date.now() - start;
  assert(json.length > 10000, 'حجم البيانات: ' + Math.round(json.length/1024) + ' ك.ب');
  assert(ms < 3000, 'التصدير سريع: ' + ms + 'ms');
  assertEq(data.tasks.length, S.state.tasks.length, 'كل المهام مُصدَّرة');
});

test('الاستيراد بالدمج يتحمل ملفًا كبيرًا', () => {
  const data = S.exportAll();
  const copy = JSON.parse(JSON.stringify(data));
  // اجعل كل المعرّفات جديدة لتُضاف فعلًا
  copy.tasks.forEach((t, i) => t.id = 'imported_' + i);
  const before = S.state.tasks.length;
  const start = Date.now();
  const r = S.importAll(copy, 'merge');
  const ms = Date.now() - start;
  assert(!r.error, 'الاستيراد نجح');
  assertEq(S.state.tasks.length, before + copy.tasks.length, 'كل المهام استُوردت');
  assert(ms < 4000, 'الاستيراد سريع: ' + ms + 'ms');
});

test('لا تكرار عند استيراد نفس الملف مرتين', () => {
  const before = S.state.tasks.length;
  const data = S.exportAll();
  S.importAll(JSON.parse(JSON.stringify(data)), 'merge');
  assertEq(S.state.tasks.length, before, 'لا نسخ مكررة');
});

/* ── ٢. سلامة البيانات ───────────────────────────────────── */
suite('٢. سلامة البيانات عبر الجلسات');

test('كل البيانات تُستعاد بالكامل من التخزين', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  st.addTask({ title: 'مهمة استعادة', sectionId: 'sec_work', client: 'أحمد', amount: 12345 });
  st.addMeeting({ title: 'اجتماع استعادة', date: st.todayISO(), time: '14:00' });
  // ملاحظة: إنشاء اجتماع يُنشئ مهمة مرتبطة تلقائيًا → مهمتان
  // نسجّل وقتًا عبر الواجهة الحقيقية (وليس بالدفع المباشر) ليُحفظ فعلًا
  const firstId = st.state.tasks[0].id;
  st.startTimer(firstId);
  st.state.activeTimer.startedAt = Date.now() - 300000;   // ٥ دقائق
  st.stopTimer();
  assertEq(st.state.timeLog.length, 1, 'الوقت سُجّل');
  st.setSetting('userName', 'هود المختبر');

  const KEYS = ['dh_tasks','dh_meetings','dh_timelog','dh_settings','dh_meta',
                'dh_sections','dh_categories','dh_active_timer'];
  const snapshot = {};
  KEYS.forEach(k => { snapshot[k] = env.win.localStorage.getItem(k); });

  // جلسة جديدة تمامًا
  const env2 = createEnv();
  KEYS.forEach(k => { if (snapshot[k] !== null) env2.win.localStorage.setItem(k, snapshot[k]); });
  env2.win.DH.store.load();
  const st2 = env2.win.DH.store;

  assertEq(st2.state.tasks.length, 2, 'المهام (مهمة + مهمة الاجتماع)');
  const restored = st2.state.tasks.find(t => t.title === 'مهمة استعادة');
  assert(restored, 'المهمة الأصلية موجودة');
  assertEq(restored.client, 'أحمد', 'اسم العميل محفوظ');
  assertEq(restored.amount, 12345, 'المبلغ محفوظ');
  assertEq(st2.state.meetings.length, 1, 'الاجتماعات');
  assertEq(st2.state.timeLog.length, 1, 'سجل الوقت');
  assertEq(st2.state.timeLog[0].seconds, 300, 'قيمة الوقت');
  assertEq(st2.state.settings.userName, 'هود المختبر', 'الإعدادات');
});

test('المؤقت يستعيد وقته الكامل بعد إعادة الفتح', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  const t = st.addTask({ title: 'مؤقت مستمر' });
  st.startTimer(t.id);
  st.state.activeTimer.startedAt = Date.now() - 120000;  // دقيقتان
  const timerJSON = JSON.stringify(st.state.activeTimer);
  const tasksJSON = JSON.stringify(st.state.tasks);

  const env2 = createEnv();
  env2.win.localStorage.setItem('dh_meta', JSON.stringify({ schema: 1 }));
  env2.win.localStorage.setItem('dh_tasks', tasksJSON);
  env2.win.localStorage.setItem('dh_active_timer', timerJSON);
  env2.win.localStorage.setItem('dh_meta', JSON.stringify({schema:1, created:new Date().toISOString()}));
  env2.win.DH.store.load();

  const st2 = env2.win.DH.store;
  assert(st2.state.activeTimer, 'المؤقت استُعيد من التخزين');
  assertEq(st2.state.activeTimer.taskId, t.id, 'نفس المهمة');
  const elapsed = st2.elapsedOf(st2.state.activeTimer);
  assert(elapsed >= 120, 'الوقت محفوظ بالكامل: ' + elapsed + 'ث (متوقع ≥ 120)');
  // أعد الإيقاف لإثبات أن الساعة استمرت عبر إعادة الفتح
  const r = st2.stopTimer();
  assert(r.seconds >= 120, 'الوقت المسجّل بعد الإعادة: ' + r.seconds);
});

test('المؤقت لا يفقد وقتًا عند إغلاق الصفحة مفاجئًا', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  const t = st.addTask({ title: 'مؤقت' });
  st.startTimer(t.id);
  st.state.activeTimer.startedAt = Date.now() - 60000;
  st.pauseTimer();   // ما يفعله beforeunload
  const elapsed = st.elapsedOf(st.state.activeTimer);
  assertEq(elapsed, 60, 'الوقت محفوظ عند الإيقاف المؤقت: ' + elapsed);
  assertEq(st.state.activeTimer.paused, true, 'متوقف');
});

test('المهام بأقسام وتصنيفات محذوفة تُصلَّح عند الإقلاع', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  st.addTask({ title: 'أ', sectionId: 'sec_work', categoryId: 'cat_acct' });
  st.addTask({ title: 'ب', sectionId: 'قسم_محذوف', categoryId: 'تصنيف_محذوف' });
  const tasksJSON = JSON.stringify(st.state.tasks);

  const env2 = createEnv();
  env2.win.localStorage.setItem('dh_meta', JSON.stringify({ schema: 1 }));
  env2.win.localStorage.setItem('dh_tasks', tasksJSON);
  env2.win.DH.store.load();
  const st2 = env2.win.DH.store;

  const fixed = st2.state.tasks.find(t => t.title === 'ب');
  assertBoth(fixed);
  function assertBoth(t) {
    assert(t.sectionId !== 'قسم_محذوف', 'القسم صُحّح: ' + t.sectionId);
    assertEq(t.categoryId, null, 'التصنيف أُفرغ');
    assert(st2.sectionById(t.sectionId), 'القسم الجديد موجود فعلًا');
  }
});

/* ── ٣. حالات فشل التخزين ────────────────────────────────── */
suite('٣. سلوك التخزين عند الفشل');

test('فشل الحفظ لا يُعطّل التطبيق', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  // اجعل setItem يرمي خطأ (الحصة ممتلئة)
  const orig = env.win.localStorage.setItem;
  env.win.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  let threw = false;
  try {
    st.addTask({ title: 'مهمة بعد امتلاء الحصة' });
  } catch (e) {
    threw = true;
  }
  env.win.localStorage.setItem = orig;
  assert(!threw, 'لم يرمِ خطأ غير معالج');
  assert(st.state.tasks.length > 0, 'المهمة في الذاكرة رغم فشل الحفظ');
});

test('بيانات تالفة في كل مفتاح لا تُعطّل الإقلاع', () => {
  const env = createEnv();
  ['dh_meta','dh_tasks','dh_sections','dh_categories','dh_meetings',
   'dh_timelog','dh_settings','dh_active_timer','dh_done_log'].forEach(k => {
    env.win.localStorage.setItem(k, '{{{ تالف');
  });
  let threw = false;
  try { env.win.DH.store.load(); } catch (e) { threw = true; }
  assert(!threw, 'الإقلاع نجح رغم تلف كل البيانات');
  assert(Array.isArray(env.win.DH.store.state.tasks), 'المهام مصفوفة صالحة');
  assert(env.win.DH.store.state.sections.length > 0, 'الأقسام الافتراضية عادت');
});

test('قيم غير متوقعة في المهام لا تكسر العرض', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  // أضف مهامًا ببيانات مشوّهة مباشرة إلى المصفوفة
  st.state.tasks.push({ id: 'weird', title: null, sectionId: 123, dueDate: 'ليس-تاريخا' });
  st.state.tasks.push({ id: 'weird2' });
  st.state.tasks.push({ id: 'weird3', title: 'سليمة إلى حد ما', sectionId: 'sec_work',
    dueDate: null, amount: 'ليس-رقما', priority: 'غير-معروف' });

  env.win.localStorage.setItem('dh_meta', JSON.stringify({ schema: 1 }));
  env.win.localStorage.setItem('dh_tasks', JSON.stringify(st.state.tasks));

  const env2 = createEnv();
  env2.win.localStorage.setItem('dh_meta', JSON.stringify({ schema: 1 }));
  env2.win.localStorage.setItem('dh_tasks', JSON.stringify(st.state.tasks));

  let threw = null;
  try {
    env2.win.DH.store.load();
    // استدعِ كل دوال العرض الحساسة
    env2.win.DH.ui.renderHeader();
    env2.win.DH.ui.renderTasks();
    env2.win.DH.ui.renderMeetings();
    env2.win.DH.ui.renderAssist();
    env2.win.DH.ui.renderDoneToday();
    env2.win.DH.ui.sortTasks(env2.win.DH.store.state.tasks);
    env2.win.DH.store.state.tasks.forEach(t => env2.win.DH.ui.dueInfo(t));
  } catch (e) {
    threw = e.message;
  }
  assert(!threw, 'العرض لم ينكسر — الخطأ: ' + threw);
  // المهام المشوّهة لا تُنتج عناوين مكسورة
  const html = env2.win.DH.ui.renderTasks();
  assert(html.indexOf('undefined') === -1, 'لا «undefined» في العرض');
  assert(html.indexOf('>null<') === -1, 'لا «null» ظاهر في العرض');
});

/* ── ٤. التحليل تحت الضغط ────────────────────────────────── */
suite('٤. المحلل تحت الضغط');

test('تحليل فقرة طويلة جدًا', () => {
  const sentences = [];
  for (let i = 0; i < 60; i++) {
    sentences.push([
      'أراجع حسابات العملاء المتأخرة',
      'أتابع مع المندوب بشأن البضاعة الراكدة',
      'أراجع مشكلة التنزيلات في مشروعي',
      'أحدّث قائمة الأسعار',
      'أجهّز تقرير المبيعات الشهري'
    ][i % 5]);
  }
  const text = sentences.join('، و');
  const start = Date.now();
  const r = AI.parseLocal(text);
  const ms = Date.now() - start;
  assertEq(r.tasks.length, 60, 'استخرج ٦٠ مهمة، الفعلي: ' + r.tasks.length);
  assert(ms < 5000, 'المعالجة سريعة: ' + ms + 'ms');
  // كل مهمة لها عنوان غير فارغ
  const empty = r.tasks.filter(t => !t.title || !t.title.trim()).length;
  assertEq(empty, 0, 'لا عناوين فارغة');
});

test('نصوص غريبة لا تكسر المحلل', () => {
  const weird = [
    '٠١٢٣٤٥٦٧٨٩', '!!!!!', '........', '   ', '\n\n\n',
    '😀😀😀', '<script>alert(1)</script>', "'; DROP TABLE tasks;--",
    '{{{}}}', 'null', 'undefined', 'NaN', '[]{}',
    'ا'.repeat(500), 'أراجع'.repeat(200)
  ];
  weird.forEach(w => {
    let threw = false;
    try {
      const r = AI.parseLocal(w);
      assert(Array.isArray(r.tasks), 'نتيجة صالحة للنص: ' + JSON.stringify(w.slice(0,20)));
    } catch (e) {
      threw = true;
    }
    assert(!threw, 'لم يرمِ خطأ على: ' + JSON.stringify(w.slice(0,20)));
  });
});

test('XSS في العناوين لا يُنفَّذ', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  const evil = '<img src=x onerror="window.__pwned=1">';
  st.addTask({ title: evil, notes: evil, client: evil });
  const escaped = env.win.DH.ui.esc(evil);
  assert(escaped.indexOf('<') === -1, 'الأقواس مُهرَّبة');
  assertIncludes(escaped, '&lt;img');
});

test('كل المسودات تُولَّد لكل الأقسام دون خطأ', () => {
  ['sec_work', 'sec_tech', 'sec_personal'].forEach(sec => {
    AS.typesFor(sec).forEach(type => {
      const r = AS.generate(type.id, {});
      assert(!r.error, sec + ' / ' + type.id + ': ' + (r.error || ''));
      assertIncludes(r.draft, 'أحتاج منك:', sec + ' / ' + type.id + ' ينتهي بسطر النواقص');
    });
  });
});

/* ── ٥. التقويم ─────────────────────────────────────────── */
suite('٥. التقويم تحت الضغط');

test('ICS لـ ١٠٠ اجتماع صالح', () => {
  const meetings = [];
  for (let i = 0; i < 100; i++) {
    meetings.push(S.newMeeting({
      title: 'اجتماع رقم ' + i, date: S.addDaysISO(TODAY, i % 60),
      time: String(8 + (i % 10)).padStart(2,'0') + ':' + String(i % 60).padStart(2,'0'),
      duration: 30 + (i % 90), place: 'قاعة ' + i, people: 'شخص ' + i
    }));
  }
  const ics = CAL.buildICS(meetings);
  const events = (ics.match(/BEGIN:VEVENT/g) || []).length;
  const ends = (ics.match(/END:VEVENT/g) || []).length;
  assertEq(events, 100, 'عدد الأحداث');
  assertEq(ends, 100, 'كل حدث مُغلق');
  assertEq((ics.match(/BEGIN:VCALENDAR/g) || []).length, 1, 'بداية واحدة');
  assertEq((ics.match(/END:VCALENDAR/g) || []).length, 1, 'نهاية واحدة');
  assertEq((ics.match(/BEGIN:VALARM/g) || []).length, 100, 'تنبيه لكل حدث');
});

test('كل حدث ICS له تواريخ بداية ونهاية صالحة', () => {
  const m = S.newMeeting({ title: 'اختبار', date: TODAY, time: '23:30', duration: 90 });
  const ics = CAL.buildICS([m]);
  const dtstart = ics.match(/DTSTART:(\d{8}T\d{6}Z)/);
  const dtend = ics.match(/DTEND:(\d{8}T\d{6}Z)/);
  assert(dtstart, 'DTSTART موجود');
  assert(dtend, 'DTEND موجود');
  assert(dtend[1] > dtstart[1], 'النهاية بعد البداية (تجاوز منتصف الليل)');
});

test('الحدث بدون وقت يستخدم ٩ صباحًا افتراضيًا', () => {
  const body = CAL.toEventBody(S.newMeeting({ title: 'بلا وقت', date: TODAY }));
  assertIncludes(body.start.dateTime, 'T09:00:00');
});

/* ── ٦. التكامل الكامل ─────────────────────────────────── */
suite('٦. سيناريو يوم عمل كامل');

test('يوم عمل من البداية للنهاية', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  const T = st.todayISO();

  // ١. إملاء المهام
  const r = AI.parseLocal(
    'تحصيل 50000 من العميل أحمد بكرة، ومراجعة حسابات العملاء المتأخرة اليوم، ' +
    'وإصلاح مشكلة التنزيلات في مشروعي بعد المغرب، وشراء أغراض البيت'
  );
  assertEq(r.tasks.length, 4, 'أربع مهام');
  r.tasks.forEach(t => { const c = Object.assign({}, t); delete c._meta; st.addTask(c); });
  assertEq(st.state.tasks.length, 4, 'حُفظت الأربع');

  // ٢. إنشاء اجتماع
  const m = st.addMeeting({ title: 'اجتماع المبيعات', date: T, time: '10:00', duration: 45 });
  assert(m.id, 'الاجتماع أُنشئ');

  // ٣. العمل على مهمة بمؤقت
  const collectTask = st.state.tasks.find(t => t.categoryId === 'cat_collect');
  assert(collectTask, 'مهمة التحصيل موجودة');
  st.startTimer(collectTask.id);
  st.state.activeTimer.startedAt = Date.now() - 3600000;  // ساعة
  const stopped = st.stopTimer();
  assertEq(stopped.seconds, 3600, 'ساعة مسجّلة');

  // ٤. إنجاز مهمة
  st.completeTask(collectTask.id);
  assertEq(st.getTask(collectTask.id).status, 'done', 'منجزة');
  // المبلغ لم يُمس
  assertEq(st.getTask(collectTask.id).amount, 50000, 'المبلغ كما هو — لم يُعدّل');

  // ٥. تقرير الوقت
  const day = st.totalForDay(T);
  assertEq(day.total, 3600, 'إجمالي اليوم ساعة');
  assertEq(day.bySection.sec_work, 3600, 'كلها في قسم العمل');

  // ٦. مسودة رسالة تحصيل
  const draft = AS.generate('collection_msg', { clientName: 'أحمد', amount: 50000 });
  assertIncludes(draft.draft, 'أحمد');
  assertIncludes(draft.draft, '50,000');
  assertIncludes(draft.draft, 'رسالة متابعة فقط');

  // ٨. استعادة في بيئة جديدة
  const backup = st.exportAll();
  assertEq(backup.tasks.length, 5, 'النسخة تحتوي المهام (٤ + مهمة الاجتماع)');
  assertEq(backup.meetings.length, 1, 'والاجتماع');
  assertEq(backup.timeLog.length, 1, 'والوقت');

  const env2 = createEnv();
  env2.win.DH.store.load();
  const res = env2.win.DH.store.importAll(JSON.parse(JSON.stringify(backup)), 'replace');
  assert(!res.error, 'الاستعادة نجحت');
  assertEq(env2.win.DH.store.state.tasks.length, 5, 'المهام استُعيدت');
  assertEq(env2.win.DH.store.state.meetings.length, 1, 'الاجتماع استُعيد');
  assertEq(env2.win.DH.store.totalForDay(T).total, 3600, 'الوقت استُعيد');
});

test('حذف يوم كامل ثم التراجع يعيد كل شيء', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(st.addTask({ title: 'م' + i, sectionId: 'sec_work' }).id);
  const snaps = ids.map(id => st.deleteTask(id));
  assertEq(st.state.tasks.length, 0, 'حُذفت كلها');
  // تراجع بترتيب معكوس
  snaps.slice().reverse().forEach(s => st.restoreTask(s));
  assertEq(st.state.tasks.length, 5, 'كلها عادت');
  const titles = st.state.tasks.map(t => t.title).sort().join(',');
  assertEq(titles, 'م0,م1,م2,م3,م4', 'بالترتيب الصحيح');
});

const failedCount = H.failedCount;
report();
process.exit(failedCount ? 1 : 0);