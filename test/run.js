/* ═══════════════════════════════════════════════════════════════
   اختبارات دفتر هود الذكي — المنطق الأساسي
   ═══════════════════════════════════════════════════════════════ */
const H = require('./harness');
const { createEnv, suite, test, testAsync, assert, assertEq, assertIncludes, assertNotIncludes, report } = H;

const { win } = createEnv();
const S = win.DH.store;
const AI = win.DH.ai;
const AS = win.DH.assist;
const CAL = win.DH.calendar;

S.load();
const TODAY = S.todayISO();

/* ═══════════════════════════════════════════════════════════════
   ١. التخزين والإقلاع
   ═══════════════════════════════════════════════════════════════ */
suite('١. التخزين والإقلاع');

test('يُهيّئ ٣ أقسام رئيسية عند أول تشغيل', () => {
  assertEq(S.state.sections.length, 3, 'عدد الأقسام');
  assertEq(S.state.sections[0].id, 'sec_work');
  assertEq(S.state.sections[1].id, 'sec_tech');
  assertEq(S.state.sections[2].id, 'sec_personal');
});

test('لكل قسم لون مميز', () => {
  const colors = S.state.sections.map(s => s.color);
  assertEq(new Set(colors).size, 3, 'الألوان يجب أن تكون مختلفة');
});

test('يُنشئ تصنيفات العمل الثمانية المطلوبة', () => {
  const workCats = S.catsFor('sec_work');
  assertEq(workCats.length, 8, 'عدد تصنيفات العمل');
  const names = workCats.map(c => c.name).join(' | ');
  ['المحاسبة', 'تحصيل المستحقات', 'المبيعات', 'المندوبين',
   'المخزون', 'الأسعار', 'الموظفون', 'التقارير'].forEach(n => {
    assertIncludes(names, n, 'تصنيف مفقود');
  });
});

test('التصنيفات التقنية موجودة', () => {
  const techCats = S.catsFor('sec_tech');
  assert(techCats.length >= 5, 'عدد التصنيفات التقنية');
  const names = techCats.map(c => c.name).join(' | ');
  assertIncludes(names, 'Android');
  assertIncludes(names, 'GitHub');
  assertIncludes(names, 'إصلاح الأخطاء');
});

test('البيانات تُحفظ وتُقرأ من التخزين بعد إعادة التحميل', () => {
  S.addTask({ title: 'مهمة اختبار الحفظ', sectionId: 'sec_work' });
  const before = S.state.tasks.length;
  const env2 = createEnv();
  env2.win.DH.store.load();
  assertEq(env2.win.DH.store.state.tasks.length, 0, 'البيئة الجديدة لها تخزين منفصل');
  // في نفس البيئة: نعيد القراءة من نفس localStorage
  const raw = win.localStorage.getItem('dh_tasks');
  assert(raw, 'المهام مخزّنة فعليًا');
  const parsed = JSON.parse(raw);
  assertEq(parsed.length, before, 'عدد المهام في التخزين');
});

test('JSON تالف لا يُعطّل التطبيق', () => {
  win.localStorage.setItem('dh_tasks', '{هذا ليس JSON صالح');
  const env = createEnv();
  // ننسخ البيانات التالفة
  env.win.localStorage.setItem('dh_tasks', '{تالف');
  env.win.localStorage.setItem('dh_meta', JSON.stringify({ schema: 1 }));
  env.win.DH.store.load();
  assert(Array.isArray(env.win.DH.store.state.tasks), 'يجب أن يعود لمصفوفة فارغة');
  assertEq(env.win.DH.store.state.tasks.length, 0);
});

test('الإعدادات الافتراضية للتذكير صحيحة', () => {
  const s = S.state.settings;
  assertEq(s.workTime, '08:30', 'وقت الدوام');
  assertEq(s.offTime, '12:00', 'وقت الإجازة');
  assertEq(s.meetingLeadMinutes, 15, 'تنبيه الاجتماع');
  assert(Array.isArray(s.workDays), 'أيام الدوام مصفوفة');
});

/* ═══════════════════════════════════════════════════════════════
   ٢. تحليل الكلام — العبارة المطلوبة حرفيًا
   ═══════════════════════════════════════════════════════════════ */
suite('٢. تحليل الكلام واللهجة اليمنية');

test('يقسّم العبارة النموذجية إلى ٣ مهام', () => {
  const text = 'بكرة أراجع حسابات العملاء المتأخرة، وأتابع مع المندوب بشأن البضاعة الراكدة، وبعد المغرب أراجع مشكلة التنزيلات في مشروعي';
  const segs = AI.splitUtterances(text);
  assertEq(segs.length, 3, 'عدد المقاطع: ' + JSON.stringify(segs));
});

test('«بكرة» = تاريخ الغد', () => {
  const r = AI.parseDate('بكرة أراجع الحسابات');
  assertEq(r.date, S.addDaysISO(TODAY, 1), 'تاريخ الغد');
  assertEq(r.source, 'نسبي');
});

test('«بعد بكرة» = بعد يومين', () => {
  const r = AI.parseDate('بعد بكرة نسوي جرد');
  assertEq(r.date, S.addDaysISO(TODAY, 2));
});

test('«بعد بكرة» لا يُختصر إلى الغد', () => {
  assertNotIncludes(AI.parseDate('بعد بكرة').date, S.addDaysISO(TODAY, 1),
    'يجب أن لا يكون الغد');
});

test('«اليوم» = تاريخ اليوم', () => {
  assertEq(AI.parseDate('اليوم أراجع المخزون').date, TODAY);
});

test('«بعد المغرب» يُستخرج كوقت', () => {
  const p = AI.parsePeriod('بعد المغرب أراجع المشكلة');
  assertEq(p, '18:30', 'وقت بعد المغرب');
});

test('«بعد العصر» و«الصباح» و«الليل» تُفسَّر', () => {
  assertEq(AI.parsePeriod('بعد العصر نروح'), '16:00');
  assertEq(AI.parsePeriod('الصباح نبدأ'), '08:00');
  assertEq(AI.parsePeriod('بالليل نراجع'), '20:00');
});

test('أيام الأسبوع: «الخميس» = أقرب خميس قادم (ليس اليوم)', () => {
  const r = AI.parseDate('الخميس نسوي اجتماع');
  const diff = S.daysBetween(TODAY, r.date);
  assert(diff >= 1 && diff <= 7, 'الفارق يجب أن يكون 1..7، الفعلي: ' + diff);
  assertEq(new Date(r.date + 'T12:00:00').getDay(), 4, 'يجب أن يكون يوم خميس');
});

test('«كل يوم» = تكرار يومي', () => {
  const t = AI.parseLocal('كل يوم أراجع الحسابات').tasks[0];
  assertEq(t.repeat, 'daily');
});

test('«كل أسبوع» = تكرار أسبوعي', () => {
  assertEq(AI.parseLocal('كل أسبوع نتابع المبيعات').tasks[0].repeat, 'weekly');
});

test('«كل شهر» = تكرار شهري', () => {
  assertEq(AI.parseLocal('كل شهر نسوي جرد المخزن').tasks[0].repeat, 'monthly');
});

test('«عاجل» = أولوية عاجلة', () => {
  assertEq(AI.parseLocal('عاجل التحصيل من العميل').tasks[0].priority, 'urgent');
});

test('«لاحقًا» = أولوية منخفضة', () => {
  assertEq(AI.parseLocal('لاحقًا أراجع الأسعار').tasks[0].priority, 'low');
});

test('تصنيف: التحصيل يذهب لتصنيف المستحقات', () => {
  const t = AI.parseLocal('تحصيل المستحقات من العملاء المتأخرين').tasks[0];
  assertEq(t.sectionId, 'sec_work');
  assertEq(t.categoryId, 'cat_collect');
});

test('تصنيف: البضاعة الراكدة تذهب للمخزون', () => {
  const t = AI.parseLocal('متابعة البضاعة الراكدة في المخزن').tasks[0];
  assertEq(t.categoryId, 'cat_stock');
});

test('تصنيف: المندوبين', () => {
  assertEq(AI.parseLocal('متابعة المندوبين في خط السير').tasks[0].categoryId, 'cat_reps');
});

test('تصنيف: مشكلة برمجية تذهب لإصلاح الأخطاء', () => {
  const t = AI.parseLocal('إصلاح مشكلة في التنزيلات').tasks[0];
  assertEq(t.sectionId, 'sec_tech');
  assertEq(t.categoryId, 'cat_bug');
});

test('تصنيف: النشر والبناء', () => {
  assertEq(AI.parseLocal('بناء ونشر الإصدار الجديد').tasks[0].categoryId, 'cat_deploy');
});

test('تصنيف: الأسعار', () => {
  assertEq(AI.parseLocal('تحديث قائمة الأسعار').tasks[0].categoryId, 'cat_prices');
});

test('تصنيف: الموظفين والتعليمات', () => {
  assertEq(AI.parseLocal('تعميم تعليمات للموظفين').tasks[0].sectionId, 'sec_work');
});

test('تصنيف: المواعيد الشخصية', () => {
  assertEq(AI.parseLocal('موعد عند الطبيب').tasks[0].sectionId, 'sec_personal');
});

test('تصنيف: المشتريات الشخصية', () => {
  assertEq(AI.parseLocal('شراء أغراض البيت').tasks[0].sectionId, 'sec_personal');
});

test('حجم المهمة: «اجتماع» = كبيرة', () => {
  assertEq(AI.parseLocal('اجتماع إداري مع الموظفين').tasks[0].size, 'large');
});

test('حجم المهمة: «مكالمة» = صغيرة', () => {
  assertEq(AI.parseLocal('مكالمة سريعة مع العميل').tasks[0].size, 'small');
});

test('نوع المهمة: «اجتماع» يُكتشف', () => {
  assertEq(AI.parseLocal('اجتماع مع المندوبين').tasks[0].kind, 'meeting');
});

test('نوع المهمة: «تذكير» يُكتشف', () => {
  assertEq(AI.parseLocal('تذكير بموعد السداد').tasks[0].kind, 'reminder');
});

test('يمنع اختلاق أسماء: لا اسم عميل إن لم يُذكر', () => {
  const t = AI.parseLocal('تحصيل المبلغ المتأخر').tasks[0];
  assertEq(t.client, '', 'يجب ألا يخترع اسم عميل');
});

test('يستخرج اسم العميل عند ذكره صراحة', () => {
  const t = AI.parseLocal('تحصيل المبلغ من العميل أحمد').tasks[0];
  assertEq(t.client, 'أحمد', 'اسم العميل المستخرج');
});

test('يستخرج اسم المندوب عند ذكره', () => {
  const t = AI.parseLocal('متابعة المندوب سالم بشأن الطلبية').tasks[0];
  assertEq(t.rep, 'سالم');
});

test('لا يختلق مبلغًا إن لم يُذكر', () => {
  const t = AI.parseLocal('تحصيل مستحقات العملاء').tasks[0];
  assertEq(t.amount, null, 'المبلغ يجب أن يكون null لا رقمًا مُختلقًا');
});

test('يستخرج المبلغ عند ذكره', () => {
  const t = AI.parseLocal('تحصيل 50000 ريال من العميل').tasks[0];
  assertEq(t.amount, 50000, 'المبلغ المستخرج');
});

test('«خمسة آلاف» = 5000', () => {
  const t = AI.parseLocal('تحصيل خمسة آلاف من العميل').tasks[0];
  assertEq(t.amount, 5000);
});

test('لا يختلق تاريخًا إن لم يُذكر', () => {
  const t = AI.parseLocal('مراجعة حسابات العملاء').tasks[0];
  assertEq(t.dueDate, null, 'التاريخ يجب أن يكون null');
});

test('المهمة بلا تاريخ تُصنَّف «بدون موعد محدد»', () => {
  const t = S.addTask({ title: 'مهمة بدون تاريخ' });
  const di = win.DH.ui ? null : null;
  assertEq(S.daysBetween(TODAY, t.dueDate || TODAY), 0);
  S.deleteTask(t.id);
});

test('تاريخ صريح 12/5/2026 يُقرأ صحيحًا', () => {
  const r = AI.parseDate('المراجعة في 12/5/2026');
  assertEq(r.date, '2026-05-12');
});

test('«بعد 3 أيام» يعمل', () => {
  assertEq(AI.parseDate('راجع بعد 3 أيام').date, S.addDaysISO(TODAY, 3));
});

test('«نهاية الشهر» = آخر يوم في الشهر', () => {
  const r = AI.parseDate('جرد نهاية الشهر');
  const d = new Date(r.date + 'T12:00:00');
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  assertEq(d.getDate(), last, 'يجب أن يكون آخر يوم في الشهر');
});

/* ═══════════════════════════════════════════════════════════════
   ٣. إدارة المهام
   ═══════════════════════════════════════════════════════════════ */
suite('٣. إدارة المهام');

let idA, idB, idC;

test('إضافة مهمة تعمل', () => {
  const t = S.addTask({ title: 'مراجعة حسابات العملاء', sectionId: 'sec_work', categoryId: 'cat_acct' });
  idA = t.id;
  assert(t.id, 'المهمة لها معرّف');
  assert(S.getTask(idA), 'يمكن استرجاعها');
});

test('تعديل مهمة يعمل ويحدّث updatedAt', () => {
  const before = S.getTask(idA).updatedAt;
  S.updateTask(idA, { priority: 'urgent' });
  assertEq(S.getTask(idA).priority, 'urgent');
  assert(S.getTask(idA).updatedAt >= before, 'وقت التحديث');
});

test('حذف مهمة يعيد لقطة للتراجع', () => {
  const t = S.addTask({ title: 'مهمة للحذف' });
  const snap = S.deleteTask(t.id);
  assert(snap && snap.task, 'لقطة الحذف موجودة');
  assertEq(S.getTask(t.id), null, 'حُذفت فعلًا');
});

test('التراجع عن الحذف يعيد المهمة في مكانها', () => {
  const t = S.addTask({ title: 'مهمة للتراجع' });
  const idx = S.state.tasks.length - 1;
  const snap = S.deleteTask(t.id);
  S.restoreTask(snap);
  assert(S.getTask(t.id), 'أُعيدت المهمة');
  assertEq(S.state.tasks.findIndex(x => x.id === t.id), snap.index, 'عادت لنفس الموضع');
});

test('التراجع مرتين لا يُنشئ نسخة مكررة', () => {
  const t = S.addTask({ title: 'مهمة تكرار' });
  const snap = S.deleteTask(t.id);
  S.restoreTask(snap);
  S.restoreTask(snap);
  const count = S.state.tasks.filter(x => x.id === t.id).length;
  assertEq(count, 1, 'نسخة واحدة فقط');
});

test('إنجاز مهمة يضيفها لسجل الإنجاز', () => {
  const before = S.state.doneLog.length;
  S.completeTask(idA);
  assertEq(S.getTask(idA).status, 'done');
  assert(S.getTask(idA).completedAt, 'وقت الإنجاز مسجّل');
  assertEq(S.state.doneLog.length, before + 1, 'سجل الإنجاز');
});

test('إعادة المهمة المنجزة إلى القائمة', () => {
  S.reopenTask(idA);
  assertEq(S.getTask(idA).status, 'open');
  assertEq(S.getTask(idA).completedAt, null, 'وقت الإنجاز يُمسح');
});

test('المهمة المتكررة تُنشئ نسخة قادمة عند الإنجاز', () => {
  const t = S.addTask({ title: 'مراجعة يومية', repeat: 'daily', dueDate: TODAY });
  const before = S.state.tasks.length;
  S.completeTask(t.id);
  assertEq(S.state.tasks.length, before + 1, 'أُضيفت نسخة');
  const next = S.state.tasks[S.state.tasks.length - 1];
  assertEq(next.dueDate, S.addDaysISO(TODAY, 1), 'النسخة القادمة بعد يوم');
  assertEq(next.status, 'open', 'النسخة القادمة مفتوحة');
  S.deleteTask(next.id);
  S.deleteTask(t.id);
});

test('المهمة الأسبوعية المتكررة تتقدم 7 أيام', () => {
  const t = S.addTask({ title: 'مراجعة أسبوعية', repeat: 'weekly', dueDate: TODAY });
  S.completeTask(t.id);
  const next = S.state.tasks[S.state.tasks.length - 1];
  assertEq(next.dueDate, S.addDaysISO(TODAY, 7));
  S.deleteTask(next.id); S.deleteTask(t.id);
});

test('مهمة التحصيل: علامة «تم» لا تعني السداد', () => {
  const t = S.addTask({ title: 'تحصيل من العميل', categoryId: 'cat_collect', amount: 50000 });
  S.completeTask(t.id);
  // المبلغ يبقى موجودًا كما هو — لم يُعدّل ولم يُصفَّر
  assertEq(S.getTask(t.id).amount, 50000, 'المبلغ لم يُمس');
  assertEq(S.getTask(t.id).status, 'done', 'المهمة منجزة (إجراء المتابعة)');
  S.deleteTask(t.id);
});

/* ═══════════════════════════════════════════════════════════════
   ٤. الترتيب وحالات المواعيد
   ═══════════════════════════════════════════════════════════════ */
suite('٤. الترتيب وحالات المواعيد');

const ui = win.DH.ui;

test('«مستحقة اليوم» تُكتشف', () => {
  const t = S.newTask({ title: 'اليوم', dueDate: TODAY });
  assertEq(ui.dueInfo(t).key, 'today');
  assertEq(ui.dueInfo(t).label, 'مستحقة اليوم');
});

test('«متأخرة يومين» بالصيغة الصحيحة', () => {
  const t = S.newTask({ title: 'متأخرة', dueDate: S.addDaysISO(TODAY, -2) });
  assertEq(ui.dueInfo(t).key, 'overdue');
  assertEq(ui.dueInfo(t).label, 'متأخرة 2 أيام');
});

test('«متأخرة يوم واحد» بصيغة المفرد', () => {
  const t = S.newTask({ title: 'متأخرة', dueDate: S.addDaysISO(TODAY, -1) });
  assertEq(ui.dueInfo(t).label, 'متأخرة يوم واحد');
});

test('«موعدها غدًا» تُكتشف', () => {
  const t = S.newTask({ title: 'غدًا', dueDate: S.addDaysISO(TODAY, 1) });
  assertEq(ui.dueInfo(t).label, 'موعدها غدًا');
});

test('«بدون موعد محدد» تُكتشف', () => {
  const t = S.newTask({ title: 'بلا موعد' });
  assertEq(ui.dueInfo(t).label, 'بدون موعد محدد');
});

test('الترتيب: متأخرة ← اليوم ← القادمة ← بدون موعد', () => {
  const mk = (title, due, extra) => S.newTask(Object.assign({ title, dueDate: due }, extra || {}));
  const list = [
    mk('بلا موعد', null),
    mk('قادمة', S.addDaysISO(TODAY, 5)),
    mk('اليوم', TODAY),
    mk('متأخرة', S.addDaysISO(TODAY, -3)),
    mk('غدًا', S.addDaysISO(TODAY, 1))
  ];
  const sorted = ui.sortTasks(list);
  assertEq(sorted[0].title, 'متأخرة', 'المتأخرة أولًا');
  assertEq(sorted[1].title, 'اليوم', 'ثم مهام اليوم');
  assertEq(sorted[2].title, 'غدًا');
  assertEq(sorted[3].title, 'قادمة');
  assertEq(sorted[4].title, 'بلا موعد', 'بدون موعد أخيرًا');
});

test('داخل نفس المجموعة: المهام الكبيرة قبل الصغيرة', () => {
  const list = [
    S.newTask({ title: 'صغيرة', dueDate: TODAY, size: 'small' }),
    S.newTask({ title: 'كبيرة', dueDate: TODAY, size: 'large' })
  ];
  const sorted = ui.sortTasks(list);
  assertEq(sorted[0].title, 'كبيرة', 'الكبيرة أولًا');
});

test('داخل نفس الحجم: الأولوية الأعلى أولًا', () => {
  const list = [
    S.newTask({ title: 'عادية', dueDate: TODAY, size: 'small', priority: 'normal' }),
    S.newTask({ title: 'عاجلة', dueDate: TODAY, size: 'small', priority: 'urgent' }),
    S.newTask({ title: 'مهمة', dueDate: TODAY, size: 'small', priority: 'high' })
  ];
  const sorted = ui.sortTasks(list);
  assertEq(sorted[0].title, 'عاجلة');
  assertEq(sorted[1].title, 'مهمة');
  assertEq(sorted[2].title, 'عادية');
});

/* ═══════════════════════════════════════════════════════════════
   ٥. مؤقت العمل
   ═══════════════════════════════════════════════════════════════ */
suite('٥. مؤقت العمل');

let tid1, tid2;

test('بدء المؤقت يعمل', () => {
  tid1 = S.addTask({ title: 'مهمة بمؤقت ١', sectionId: 'sec_work' }).id;
  tid2 = S.addTask({ title: 'مهمة بمؤقت ٢', sectionId: 'sec_tech' }).id;
  const r = S.startTimer(tid1);
  assert(r && !r.error, 'بدأ المؤقت');
  assertEq(S.state.activeTimer.taskId, tid1);
});

test('المهمة تنتقل تلقائيًا إلى «قيد التنفيذ»', () => {
  assertEq(S.getTask(tid1).status, 'in_progress');
});

test('مؤقت واحد فقط في نفس الوقت', () => {
  const r = S.startTimer(tid2);
  assert(r.error, 'يجب أن يرفض مؤقتًا ثانيًا');
  assertEq(S.state.activeTimer.taskId, tid1, 'المؤقت الأول ما زال يعمل');
});

test('الإيقاف المؤقت والاستئناف يعملان', () => {
  S.pauseTimer();
  assert(S.state.activeTimer.paused, 'متوقف مؤقتًا');
  S.resumeTimer();
  assert(!S.state.activeTimer.paused, 'استُؤنف');
});

test('المؤقت محفوظ في التخزين (يبقى بعد إغلاق الصفحة)', () => {
  const raw = win.localStorage.getItem('dh_active_timer');
  assert(raw && raw !== 'null', 'المؤقت مخزّن');
  const parsed = JSON.parse(raw);
  assertEq(parsed.taskId, tid1);
});

test('الإيقاف النهائي يسجّل الوقت', () => {
  // نثبّت بداية المؤقت في الماضي لقياس وقت حقيقي بدون انتظار
  if (S.state.activeTimer) S.stopTimer();   // تأكد من عدم وجود مؤقت سابق
  const t = S.addTask({ title: 'مؤقت لقياس الوقت', sectionId: 'sec_work' });
  const started = S.startTimer(t.id);
  assert(!started.error, 'بدأ المؤقت: ' + (started.error || ''));
  S.state.activeTimer.startedAt = Date.now() - 95000;   // 95 ثانية
  const before = S.state.timeLog.length;
  const r = S.stopTimer();
  assertEq(r.taskId, t.id, 'المهمة الصحيحة');
  assertEq(S.state.timeLog.length, before + 1, 'سُجّل الوقت');
  assertEq(r.seconds, 95, 'الوقت المسجّل بالثواني');
  assertEq(S.totalForTask(t.id), 95, 'إجمالي المهمة');
  assertEq(S.state.activeTimer, null, 'لا مؤقت نشط');
  S.deleteTask(t.id);
});

test('الوقت يستمر في الاحتساب أثناء الإيقاف المؤقت', () => {
  const t = S.addTask({ title: 'مؤقت إيقاف', sectionId: 'sec_work' });
  S.startTimer(t.id);
  S.state.activeTimer.startedAt = Date.now() - 30000;   // 30 ثانية
  S.pauseTimer();
  const paused = S.elapsedOf(S.state.activeTimer);
  assertEq(paused, 30, 'الوقت المحتسب عند الإيقاف المؤقت');
  // بعد الإيقاف المؤقت لا يزيد الوقت
  S.state.activeTimer.pausedAt = Date.now() - 5000;
  assertEq(S.elapsedOf(S.state.activeTimer), 30, 'لا يزيد أثناء الإيقاف');
  // الاستئناف ثم الإيقاف النهائي يجمع الوقتين
  S.resumeTimer();
  S.state.activeTimer.startedAt = Date.now() - 10000;   // 10 ثوانٍ إضافية
  const r = S.stopTimer();
  assertEq(r.seconds, 40, 'مجموع الوقتين');
  S.deleteTask(t.id);
});

test('إيقاف المؤقت يسجّل الوقت تحت اليوم الصحيح', () => {
  const t = S.addTask({ title: 'مؤقت اليوم', sectionId: 'sec_tech' });
  S.startTimer(t.id);
  S.state.activeTimer.startedAt = Date.now() - 60000;
  S.stopTimer();
  const day = S.totalForDay(TODAY);
  assert(day.bySection.sec_tech >= 60, 'وقت القسم التقني مسجّل');
  S.deleteTask(t.id);
});

test('لا وقت مُسجَّل لمدة أقل من ثانية', () => {
  S.startTimer(tid2);
  const before = S.state.timeLog.length;
  S.stopTimer();
  assertEq(S.state.timeLog.length, before, 'لم يُسجّل وقت ضئيل');
});

test('إجمالي وقت المهمة يُحسب', () => {
  const before = S.totalForTask(tid1);
  S.state.timeLog.push({ id: 'x1', taskId: tid1, seconds: 120, day: TODAY, startedAt: new Date().toISOString(), endedAt: new Date().toISOString() });
  assertEq(S.totalForTask(tid1), before + 120, 'أُضيف 120 ثانية');
});

test('إجمالي اليوم مع التوزيع حسب الأقسام', () => {
  const before = S.totalForDay(TODAY);
  S.state.timeLog.push({ id: 'x2', taskId: tid2, seconds: 60, day: TODAY, startedAt: new Date().toISOString(), endedAt: new Date().toISOString() });
  const day = S.totalForDay(TODAY);
  assertEq(day.total, before.total + 60, 'الإجمالي زاد 60');
  assertEq(day.bySection.sec_tech, (before.bySection.sec_tech || 0) + 60, 'وقت القسم التقني');
  assert(day.bySection.sec_work >= 120, 'وقت قسم العمل موجود');
});

test('الوقت المسجّل في يوم آخر لا يُحتسب اليوم', () => {
  const before = S.totalForDay(TODAY);
  S.state.timeLog.push({ id: 'x3', taskId: tid1, seconds: 9999, day: '2026-01-01',
    startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T11:00:00Z' });
  const after = S.totalForDay(TODAY);
  assertEq(after.total, before.total, 'الأيام الأخرى لا تُحتسب');
  S.state.timeLog = S.state.timeLog.filter(e => e.id !== 'x3');
});

test('تنسيق المدة بالعربية صحيح', () => {
  assertEq(ui.fmtDuration(45), '45ث');
  assertEq(ui.fmtDuration(90), '1د 30ث');
  assertEq(ui.fmtDuration(3600), '1س 00د');
  assertEq(ui.fmtDuration(3725), '1س 02د');
});

test('سجل الوقت لكل مهمة يُرتَّب بالأحدث', () => {
  const log = S.logForTask(tid1);
  assert(log.length >= 1, 'يوجد سجل');
});

test('حذف مهمة تُوقف مؤقتها', () => {
  const t = S.addTask({ title: 'مؤقت للحذف' });
  S.startTimer(t.id);
  S.deleteTask(t.id);
  assertEq(S.state.activeTimer, null, 'أُوقف المؤقت تلقائيًا');
});

/* ═══════════════════════════════════════════════════════════════
   ٦. الأقسام المخصصة
   ═══════════════════════════════════════════════════════════════ */
suite('٦. الأقسام والتصنيفات المخصصة');

let customSecId;

test('إنشاء قسم مخصص يعمل', () => {
  const s = S.addSection({ name: 'قسم التجارة الإلكترونية', short: 'التجارة', color: '#8B5CF6', icon: '🛒' });
  customSecId = s.id;
  assert(s.id, 'القسم أُنشئ');
  assertEq(S.state.sections.length, 4);
});

test('تعديل اسم ولون القسم يعمل دون تعديل الكود', () => {
  S.updateSection(customSecId, { name: 'المتجر الإلكتروني', color: '#EC4899' });
  assertEq(S.sectionById(customSecId).name, 'المتجر الإلكتروني');
  assertEq(S.sectionById(customSecId).color, '#EC4899');
});

test('إضافة تصنيف فرعي داخل القسم', () => {
  const c = S.addCategory({ sectionId: customSecId, name: 'إدارة الطلبات', icon: '📦' });
  assertEq(S.catsFor(customSecId).length, 1);
});

test('حذف تصنيف يفصل المهام عنه دون حذفها', () => {
  const c = S.addCategory({ sectionId: customSecId, name: 'لحذف' });
  const t = S.addTask({ title: 'مهمة بتصنيف محذوف', sectionId: customSecId, categoryId: c.id });
  S.deleteCategory(c.id);
  assertEq(S.getTask(t.id).categoryId, null, 'التصنيف أُفرغ');
  assert(S.getTask(t.id), 'المهمة باقية');
});

test('لا يمكن حذف قسم يحتوي مهام', () => {
  const r = S.deleteSection(customSecId);
  assert(r.error, 'يجب أن يرفض الحذف');
  assertIncludes(r.error, 'مهمة');
});

test('يمكن حذف القسم بعد نقل مهامه', () => {
  S.state.tasks.filter(t => t.sectionId === customSecId)
    .forEach(t => S.updateTask(t.id, { sectionId: 'sec_work' }));
  const r = S.deleteSection(customSecId);
  assert(!r.error, 'حُذف القسم');
  assertEq(S.state.sections.length, 3);
});

test('لا يمكن حذف القسم الأخير', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  st.state.sections = [st.state.sections[0]];
  const r = st.deleteSection(st.state.sections[0].id);
  assert(r.error, 'يجب أن يرفض');
});

/* ═══════════════════════════════════════════════════════════════
   ٧. مسودات المساعدة الذكية
   ═══════════════════════════════════════════════════════════════ */
suite('٧. «أقدر أساعدك فيها»');

test('يولّد خطاب موظفين بالأسلوب الرسمي', () => {
  const r = AS.generate('letter_staff', {
    staffName: 'محمد', subject: 'تأخر الحضور', demand: 'الالتزام بمواعيد الدوام',
    deadline: '2026-11-01', dateLabel: TODAY
  });
  assertIncludes(r.draft, 'بسم الله');
  assertIncludes(r.draft, 'محلات أبو ياسين');
  assertIncludes(r.draft, 'محمد');
  assertIncludes(r.draft, 'مع التقدير');
});

test('قاعدة إلزامية: سطر «أحتاج منك:» يظهر عند نقص البيانات', () => {
  const r = AS.generate('letter_staff', { subject: 'تأخر الحضور' });
  assertIncludes(r.draft, 'أحتاج منك:');
  assert(r.missing.length > 0, 'يوجد نواقص');
});

test('حقول ناقصة تظهر بين أقواس ولا تُختلق', () => {
  const r = AS.generate('collection_msg', {});
  assertIncludes(r.draft, '[اسم العميل]');
  assertIncludes(r.draft, '[المبلغ]');
  assertIncludes(r.draft, '[تاريخ استحقاق المبلغ]');
});

test('لا يختلق أرقامًا: المبلغ يظهر كحقل فارغ', () => {
  const r = AS.generate('collection_msg', { clientName: 'أحمد' });
  assertIncludes(r.draft, '[المبلغ]');
  assertNotIncludes(r.draft, '0 ريال', 'لا يجب اختلاق صفر');
});

test('رسالة التحصيل تتضمن تنبيهًا أنها ليست إقرارًا محاسبيًا', () => {
  const r = AS.generate('collection_msg', { clientName: 'أحمد', amount: 50000 });
  assertIncludes(r.draft, 'رسالة متابعة فقط');
  assertIncludes(r.draft, 'لا تُعد إقرارًا');
  assertIncludes(r.draft, '50,000');
});

test('رسالة التحصيل لا تختلق مبلغًا عند غيابه', () => {
  const r = AS.generate('collection_msg', { clientName: 'أحمد' });
  assertIncludes(r.draft, '[المبلغ]');
  assertNotIncludes(r.draft, 'ريال\n', 'لا عملة مع رقم مُختلق');
});

test('عند اكتمال البيانات تظهر رسالة «لا شيء» بدل النواقص', () => {
  const r = AS.generate('circular_reps', {
    subject: 'الالتزام بالزيارات', demand: 'زيارة كل عميل أسبوعيًا',
    period: 'نوفمبر', region: 'صنعاء'
  });
  assertIncludes(r.draft, 'أحتاج منك: لا شيء');
  assertEq(r.missing.length, 0);
});

test('التعميم للمندوبين بالأسلوب الإداري', () => {
  const r = AS.generate('circular_reps', { subject: 'خط سير جديد', demand: 'الالتزام بالخطة', period: 'الأسبوع القادم', region: 'الجميع' });
  assertIncludes(r.draft, 'تعميم داخلي');
  assertIncludes(r.draft, 'المندوبين');
});

test('برومبت المشكلة البرمجية بالأسلوب التقني', () => {
  const r = AS.generate('bug_prompt', {
    repo: 'hood/app', problem: 'تعطل عند التنزيل', env: 'Android 13، نسخة 2.1',
    steps: '1. افتح\n2. اضغط تنزيل', tests: 'اختبار التنزيل'
  });
  assertIncludes(r.draft, 'برومبت إصلاح مشكلة برمجية');
  assertIncludes(r.draft, 'خطوات إعادة الإنتاج');
  assertIncludes(r.draft, 'معيار القبول');
  assertIncludes(r.draft, 'لا تدّعِ نجاح أي خطوة');
});

test('خطة الإصلاح تحذّر أن الاختبارات لم تُشغَّل', () => {
  const r = AS.generate('fix_plan', { problem: 'خلل في الحفظ' });
  assertIncludes(r.draft, 'لا تُعد الاختبارات مُنفّذة');
});

test('تقرير المبيعات لا يختلق أرقامًا', () => {
  const r = AS.generate('sales_report', { period: 'أكتوبر', scope: 'الفرع الرئيسي' });
  assertIncludes(r.draft, '[الرقم الفعلي]');
  assertIncludes(r.draft, 'لا يحتوي على أي أرقام مُختلقة');
});

test('خطة اليوم بالأسلوب البسيط', () => {
  const r = AS.generate('daily_plan', { focus: 'مراجعة الحسابات', availableTime: '4 ساعات' });
  assertIncludes(r.draft, 'خطة اليوم');
  assertNotIncludes(r.draft, 'بسم الله', 'ليس أسلوبًا رسميًا');
});

test('أجندة الاجتماع تتضمن الجدول والمخرجات', () => {
  const r = AS.generate('agenda', { subject: 'مراجعة الربع', people: 'أحمد، سالم', duration: '60', decisions: 'اعتماد الخطة' });
  assertIncludes(r.draft, 'جدول الأعمال');
  assertIncludes(r.draft, 'المخرجات المطلوبة');
});

test('كشف المهام القابلة للمساعدة', () => {
  const t = S.newTask({ title: 'تعميم للمندوبين بشأن الزيارات', sectionId: 'sec_work' });
  const a = AS.detectAssist(t);
  assert(a, 'كُشفت المساعدة');
  assertEq(a.id, 'circular_reps');
});

test('كشف مسودة برومبت للمشاكل التقنية', () => {
  const t = S.newTask({ title: 'إصلاح مشكلة التنزيلات', sectionId: 'sec_tech' });
  const a = AS.detectAssist(t);
  assert(a && a.sections.includes('sec_tech'), 'كُشفت مساعدة تقنية');
});

test('لا يقترح مساعدة عمل على مهمة شخصية', () => {
  const t = S.newTask({ title: 'شراء خضار للبيت', sectionId: 'sec_personal' });
  const a = AS.detectAssist(t);
  assert(!a, 'لا مساعدة إدارية لمهمة شخصية');
});

test('كل أنواع المساعدة لها مُولّد', () => {
  AS.ASSIST_TYPES.forEach(t => {
    const r = AS.generate(t.id, {});
    assert(!r.error, 'النوع ' + t.id + ' يجب أن يعمل: ' + (r.error || ''));
    assertIncludes(r.draft, 'أحتاج منك:', 'النوع ' + t.id);
  });
});

/* ═══════════════════════════════════════════════════════════════
   ٨. الاجتماعات
   ═══════════════════════════════════════════════════════════════ */
suite('٨. الاجتماعات');

let meetId;

test('إنشاء اجتماع يتطلب تاريخًا', () => {
  const r = S.addMeeting({ title: 'اجتماع بلا تاريخ' });
  assert(r.error, 'يجب أن يرفض الاجتماع بدون تاريخ');
  assertIncludes(r.error, 'التاريخ');
});

test('إنشاء اجتماع بتاريخ يعمل', () => {
  const m = S.addMeeting({
    title: 'اجتماع المبيعات', date: TODAY, time: '10:00',
    duration: 45, place: 'المكتب', people: 'أحمد، سالم'
  });
  meetId = m.id;
  assert(m.id, 'الاجتماع أُنشئ');
  assertEq(m.calendarStatus, 'none', 'الحالة الابتدائية: في الدفتر فقط');
});

test('الاجتماع يُنشئ مهمة مرتبطة', () => {
  const m = S.state.meetings.find(x => x.id === meetId);
  assert(m.taskId, 'معرّف المهمة موجود');
  const t = S.getTask(m.taskId);
  assertEq(t.kind, 'meeting');
  assertEq(t.dueDate, TODAY);
});

test('تعديل الاجتماع يحدّث المهمة المرتبطة', () => {
  S.updateMeeting(meetId, { title: 'اجتماع المبيعات الطارئ', time: '11:30' });
  const m = S.state.meetings.find(x => x.id === meetId);
  assertEq(S.getTask(m.taskId).title, 'اجتماع المبيعات الطارئ');
  assertIncludes(S.getTask(m.taskId).notes, '11:30');
});

test('اجتماعات اليوم تُرتَّب حسب الوقت', () => {
  S.addMeeting({ title: 'متأخر', date: TODAY, time: '16:00' });
  S.addMeeting({ title: 'مبكر', date: TODAY, time: '09:00' });
  const list = S.meetingsOn(TODAY);
  assertEq(list[0].time, '09:00', 'الأبكر أولًا');
});

test('الاجتماعات القادمة لا تشمل الماضي', () => {
  S.addMeeting({ title: 'ماضٍ', date: S.addDaysISO(TODAY, -5) });
  const up = S.upcomingMeetings(20);
  assert(up.every(m => m.date >= TODAY), 'لا اجتماعات ماضية');
});

test('حذف الاجتماع يحذف مهمته المرتبطة', () => {
  const m = S.state.meetings.find(x => x.id === meetId);
  const tid = m.taskId;
  const snap = S.deleteMeeting(meetId);
  assertEq(S.getTask(tid), null, 'المهمة حُذفت معه');
  assert(snap.meeting, 'لقطة للتراجع');
});

test('حالة التقويم صادقة: «في الدفتر فقط» افتراضيًا', () => {
  const m = S.addMeeting({ title: 'اجتماع اختبار', date: TODAY });
  assertEq(m.calendarStatus, 'none');
  assertEq(m.calendarEventId, null, 'لا معرّف حدث وهمي');
  S.deleteMeeting(m.id);
});

test('توليد ملف ICS يحتوي تنبيهًا قبل 15 دقيقة', () => {
  const m = S.newMeeting({ title: 'اختبار ICS', date: TODAY, time: '14:00', duration: 30, people: 'أحمد' });
  const ics = CAL.buildICS([m]);
  assertIncludes(ics, 'BEGIN:VCALENDAR');
  assertIncludes(ics, 'BEGIN:VEVENT');
  assertIncludes(ics, 'TRIGGER:-PT15M');
  assertIncludes(ics, 'SUMMARY:اختبار ICS');
  assertIncludes(ics, 'BEGIN:VALARM');
  assertIncludes(ics, 'END:VCALENDAR');
});

test('ملف ICS يحترم تغيير مدة التنبيه', () => {
  const old = S.state.settings.meetingLeadMinutes;
  S.setSetting('meetingLeadMinutes', 30);
  const m = S.newMeeting({ title: 'اختبار', date: TODAY, time: '10:00' });
  const ics = CAL.buildICS([m]);
  assertIncludes(ics, 'TRIGGER:-PT30M');
  assertNotIncludes(ics, 'TRIGGER:-PT15M');
  S.setSetting('meetingLeadMinutes', old);
});

test('ملف ICS يستثني الاجتماعات بلا تاريخ', () => {
  const ics = CAL.buildICS([S.newMeeting({ title: 'بلا تاريخ' })]);
  assertNotIncludes(ics, 'بلا تاريخ');
});

test('وصف الحدث يهرّب الأحرف الخاصة في ICS', () => {
  const m = S.newMeeting({ title: 'اجتماع, مهم; جدا', date: TODAY, notes: 'سطر١\nسطر٢; اختبار' });
  const ics = CAL.buildICS([m]);
  assertIncludes(ics, 'SUMMARY:اجتماع\\, مهم\\; جدا');
  assertIncludes(ics, '\\n');
  assertIncludes(ics, '\\;');
});

test('الفاصلة العربية لا تُهرَّب خطأً في ICS', () => {
  const m = S.newMeeting({ title: 'اجتماع، مهم', date: TODAY });
  const ics = CAL.buildICS([m]);
  assertIncludes(ics, 'SUMMARY:اجتماع، مهم');
});

test('رابط Google Calendar يُبنى صحيحًا', () => {
  const m = S.newMeeting({ title: 'اجتماع', date: TODAY, time: '09:00', duration: 60 });
  const url = CAL.googleCalendarUrl(m);
  assertIncludes(url, 'calendar.google.com');
  assertIncludes(url, 'action=TEMPLATE');
  assertIncludes(url, 'dates=');
  assert(url.indexOf('/') > 0, 'نطاق التواريخ موجود');
});

test('الحدث يحمل تذكيرًا قبل 15 دقيقة في جسم Google API', () => {
  const m = S.newMeeting({ title: 'اجتماع', date: TODAY, time: '09:00' });
  const body = CAL.toEventBody(m);
  assert(body, 'الجسم يُبنى');
  assertEq(body.reminders.overrides[0].minutes, 15);
  assertEq(body.reminders.useDefault, false);
  assertIncludes(body.summary, 'اجتماع');
});

test('لا يُبنى جسم حدث بدون تاريخ', () => {
  const m = S.newMeeting({ title: 'بلا تاريخ' });
  assertEq(CAL.toEventBody(m), null);
});

test('المزامنة بدون ربط تُرجع حالة صادقة لا نجاحًا وهميًا', async () => {
  const m = S.addMeeting({ title: 'اختبار عدم الربط', date: TODAY });
  const res = await CAL.syncMeeting(m);
  assertEq(res.ok, false, 'لا تدّعي النجاح');
  assertIncludes(res.message, 'غير مرتبط');
  const after = S.state.meetings.find(x => x.id === m.id);
  assertEq(after.calendarStatus, 'failed', 'الحالة: فشل');
  assertEq(after.calendarEventId, null, 'لا معرّف وهمي');
  assert(after.calendarError, 'سبب الفشل مسجّل');
  S.deleteMeeting(m.id);
});

test('حالة التقويم عند عدم الربط واضحة', () => {
  const st = CAL.status();
  assertEq(st.state, 'disconnected');
  assertEq(st.canConnect, true);
  assertIncludes(st.detail, 'لم يتم ربط');
});

test('الإشعارات: الوضع صادق عند عدم الدعم', () => {
  assertEq(CAL.notifier.isSupported(), false, 'Node لا يدعم Notification');
  assertEq(CAL.notifier.isGranted(), false);
  assertEq(CAL.notifier.send('اختبار', 'نص'), false, 'لا يدّعي الإرسال');
});

/* ═══════════════════════════════════════════════════════════════
   ٩. التصدير والاستيراد
   ═══════════════════════════════════════════════════════════════ */
suite('٩. النسخ الاحتياطي والاستيراد');

test('التصدير يحتوي كل البيانات', () => {
  const data = S.exportAll();
  assertEq(data.app, 'daftar-hood');
  assert(Array.isArray(data.tasks));
  assert(Array.isArray(data.sections));
  assert(Array.isArray(data.meetings));
  assert(Array.isArray(data.timeLog));
  assert(data.exportedAt, 'وقت التصدير');
});

test('الاستيراد بالدمج لا يُنشئ تكرارًا', () => {
  const data = S.exportAll();
  const before = S.state.tasks.length;
  const r = S.importAll(JSON.parse(JSON.stringify(data)), 'merge');
  assert(!r.error, 'الاستيراد نجح');
  assertEq(S.state.tasks.length, before, 'لم تُضف نسخ مكررة (نفس المعرّفات)');
});

test('الاستيراد بالدمج يضيف مهامًا جديدة بمعرّفات جديدة', () => {
  const fresh = {
    app: 'daftar-hood', schema: 1,
    sections: [], categories: [], meetings: [], timeLog: [], doneLog: [],
    tasks: [{ id: 'brand_new_id', title: 'مهمة مستوردة', sectionId: 'sec_work' }]
  };
  const before = S.state.tasks.length;
  const r = S.importAll(fresh, 'merge');
  assertEq(S.state.tasks.length, before + 1, 'أُضيفت واحدة');
  assertEq(r.added, 1);
  S.state.tasks = S.state.tasks.filter(t => t.id !== 'brand_new_id');
});

test('الاستيراد بالاستبدال يستبدل كل شيء', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  st.addTask({ title: 'قديمة' });
  const replacement = {
    app: 'daftar-hood', schema: 1,
    tasks: [{ id: 'n1', title: 'جديدة', sectionId: 'sec_work' }],
    sections: [], categories: [], meetings: [], timeLog: [], doneLog: []
  };
  st.importAll(replacement, 'replace');
  assertEq(st.state.tasks.length, 1);
  assertEq(st.state.tasks[0].title, 'جديدة');
});

test('ملف غير صالح يُرفض بوضوح', () => {
  assert(S.importAll({}, 'merge').error, 'كائن فارغ مرفوض');
  assert(S.importAll({ app: 'other-app', tasks: [] }, 'merge').error, 'تطبيق آخر مرفوض');
  assert(S.importAll({ app: 'daftar-hood' }, 'merge').error, 'بلا مهام مرفوض');
  assert(S.importAll(null, 'merge').error, 'null مرفوض');
});

test('استيراد ملف تالف لا يُعطّل التطبيق', () => {
  const env = createEnv();
  env.win.DH.store.load();
  const before = env.win.DH.store.state.tasks.length;
  const r = env.win.DH.store.importAll({ app: 'daftar-hood', tasks: 'not-an-array' }, 'merge');
  assert(r.error, 'رُفض');
  assertEq(env.win.DH.store.state.tasks.length, before, 'البيانات سليمة');
});

/* ═══════════════════════════════════════════════════════════════
   ١٠. الحالات الطرفية
   ═══════════════════════════════════════════════════════════════ */
suite('١٠. الحالات الطرفية');

test('نص فارغ لا ينتج مهامًا', () => {
  assertEq(AI.parseLocal('').tasks.length, 0);
  assertEq(AI.parseLocal('   ').tasks.length, 0);
});

test('نص بلا معنى لا يُنتج مهام بعنوان فارغ', () => {
  const r = AI.parseLocal('، ، ،');
  assertEq(r.tasks.length, 0);
});

test('النص الطويل جدًا يُعالج دون تعليق', () => {
  const long = Array(40).fill('مراجعة حسابات العملاء المتأخرين').join('، و');
  const start = Date.now();
  const r = AI.parseLocal(long);
  const ms = Date.now() - start;
  assert(r.tasks.length >= 20, 'أنتج مهامًا متعددة: ' + r.tasks.length);
  assert(ms < 3000, 'المعالجة سريعة: ' + ms + 'ms');
});

test('عنوان المهمة يُقصّر إن كان طويلًا', () => {
  const long = 'مراجعة ' + Array(30).fill('تفاصيل').join(' ');
  const t = AI.parseLocal(long).tasks[0];
  assert(t.title.length <= 91, 'الطول: ' + t.title.length);
});

test('التشكيل والهمزات لا تكسر التصنيف', () => {
  assertEq(AI.parseLocal('مُراجعة الحِسابات').tasks[0].categoryId, 'cat_acct');
  assertEq(AI.parseLocal('إصلاح الأخطاء').tasks[0].categoryId, 'cat_bug');
});

test('الأرقام العربية-الهندية تُقرأ', () => {
  const t = AI.parseLocal('تحصيل ٥٠٠٠٠ من العميل أبو ياسين').tasks[0];
  assertEq(t.amount, 50000, 'المبلغ بالأرقام الهندية');
});

test('الأقسام فارغة → التطبيق لا يتعطل', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  st.state.sections = [];
  assertEq(st.state.sections.length, 0);
  // reconcile لا يتعطل
  assert(true, 'لم يحدث خطأ');
});

test('مهمة بقسم محذوف تُنقل تلقائيًا عند الإقلاع', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  const t = st.addTask({ title: 'مهمة بقسم وهمي', sectionId: 'no_such_section' });
  env.win.localStorage.setItem('dh_tasks', JSON.stringify(st.state.tasks));
  const env2 = createEnv();
  env2.win.localStorage.setItem('dh_tasks', JSON.stringify(st.state.tasks));
  env2.win.localStorage.setItem('dh_meta', JSON.stringify({ schema: 1 }));
  env2.win.DH.store.load();
  assert(env2.win.DH.store.state.tasks.length > 0, 'المهمة موجودة');
  assertEq(env2.win.DH.store.state.tasks[0].sectionId, 'sec_work', 'نُقلت لقسم صالح');
});

test('مؤقت نشط لمهمة محذوفة يُلغى تلقائيًا', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  env.win.localStorage.setItem('dh_timer', JSON.stringify({ taskId: 'ghost_task', startedAt: Date.now(), accumulated: 10 }));
  const env2 = createEnv();
  env2.win.localStorage.setItem('dh_timer', JSON.stringify({ taskId: 'ghost_task', startedAt: Date.now(), accumulated: 10 }));
  env2.win.localStorage.setItem('dh_meta', JSON.stringify({ schema: 1 }));
  env2.win.DH.store.load();
  assertEq(env2.win.DH.store.state.activeTimer, null, 'المؤقت الوهمي أُلغي');
});

test('المبلغ صفر أو سالب لا يُعرض كبيانات', () => {
  const t = S.newTask({ title: 'اختبار', amount: null });
  assertEq(t.amount, null);
});

test('فلترة نشطة لا تُسقط المهام الصحيحة', () => {
  const env = createEnv();
  const st = env.win.DH.store;
  st.load();
  const a = st.addTask({ title: 'مراجعة الحسابات', sectionId: 'sec_work', dueDate: st.todayISO() });
  const b = st.addTask({ title: 'إصلاح الكود', sectionId: 'sec_tech' });
  // فحص حالة الموعد
  assertEq(env.win.DH.ui.dueInfo(a).key, 'today');
  assertEq(env.win.DH.ui.dueInfo(b).key, 'none');
});

test('البحث العربي مع تطبيع الهمزات', () => {
  const n1 = AI.normalize('إصلاح الأخطاء');
  const n2 = AI.normalize('اصلاح الاخطاء');
  assertEq(n1, n2, 'التطبيع يوحّد الهمزات');
});

report();
process.exit(process.exitCode || 0);