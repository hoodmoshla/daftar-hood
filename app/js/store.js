/* ═══════════════════════════════════════════════════════════════
   دفتر هود الذكي — طبقة البيانات (store.js)
   تخزين محلي بالكامل عبر localStorage + طبقة مزامنة اختيارية.
   لا تُرسل أي بيانات لأي جهة إلا إذا ربط المستخدم خدمة سحابية.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const K = {
    meta:    'dh_meta',
    sections:'dh_sections',
    tasks:   'dh_tasks',
    cats:    'dh_categories',
    meetings:'dh_meetings',
    time:    'dh_timelog',
    timer:   'dh_active_timer',
    settings:'dh_settings',
    done:    'dh_done_log'
  };

  /* ── أدوات مساعدة ─────────────────────────────────────────── */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // التاريخ بصيغة YYYY-MM-DD بالتوقيت المحلي للجهاز (وليس UTC)
  function todayISO(d) {
    d = d || new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function addDaysISO(base, n) {
    const d = base ? new Date(base + 'T12:00:00') : new Date();
    d.setDate(d.getDate() + n);
    return todayISO(d);
  }

  // فرق الأيام بين تاريخين (b - a)
  function daysBetween(aISO, bISO) {
    const a = new Date(aISO + 'T12:00:00');
    const b = new Date(bISO + 'T12:00:00');
    return Math.round((b - a) / 86400000);
  }

  function safeJSON(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try {
      const v = JSON.parse(raw);
      return (v === null || v === undefined) ? fallback : v;
    } catch (e) {
      console.warn('[store] بيانات تالفة، تم استخدام القيمة الافتراضية:', e.message);
      return fallback;
    }
  }

  function read(key, fallback) {
    try { return safeJSON(localStorage.getItem(key), fallback); }
    catch (e) { return fallback; }
  }

  function write(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      // الحصة ممتلئة أو التخزين معطّل (وضع التصفح الخاص)
      console.error('[store] فشل الحفظ:', e.message);
      if (global.DH && DH.ui && DH.ui.toast) {
        DH.ui.toast('تعذّر الحفظ: مساحة التخزين ممتلئة أو معطّلة', 'error');
      }
      return false;
    }
  }

  /* ── الأقسام الافتراضية ───────────────────────────────────── */
  function defaultSections() {
    return [
      { id: 'sec_work',  name: 'عملي – محلات أبو ياسين التجارية', short: 'عملي',
        color: '#2E7D6B', icon: '🏪', order: 0, system: true, cats: ['cat_acct','cat_collect','cat_sales','cat_reps','cat_stock','cat_prices','cat_staff','cat_reports'] },
      { id: 'sec_tech',  name: 'مشاريعي التقنية', short: 'مشاريعي',
        color: '#5B6ABF', icon: '⚙️', order: 1, system: true, cats: ['cat_android','cat_github','cat_code','cat_ai','cat_test','cat_bug','cat_deploy'] },
      { id: 'sec_personal', name: 'شخصي', short: 'شخصي',
        color: '#B5773A', icon: '🏠', order: 2, system: true, cats: ['cat_appt','cat_duties','cat_shopping','cat_family','cat_goals'] }
    ];
  }

  function defaultCategories() {
    return [
      // عملي
      { id: 'cat_acct',     sectionId: 'sec_work', name: 'المحاسبة ومراجعة الحسابات',      icon: '🧾' },
      { id: 'cat_collect',  sectionId: 'sec_work', name: 'تحصيل المستحقات ومتابعة العملاء', icon: '💰' },
      { id: 'cat_sales',    sectionId: 'sec_work', name: 'المبيعات والأهداف البيعية',       icon: '📈' },
      { id: 'cat_reps',     sectionId: 'sec_work', name: 'متابعة المندوبين والموزعين',      icon: '🚚' },
      { id: 'cat_stock',    sectionId: 'sec_work', name: 'المخزون والبضائع',                icon: '📦' },
      { id: 'cat_prices',   sectionId: 'sec_work', name: 'الأسعار وقوائم الأسعار',          icon: '🏷️' },
      { id: 'cat_staff',    sectionId: 'sec_work', name: 'الموظفون والتعليمات الإدارية',    icon: '👥' },
      { id: 'cat_reports',  sectionId: 'sec_work', name: 'التقارير والاجتماعات',            icon: '📊' },
      // تقني
      { id: 'cat_android',  sectionId: 'sec_tech', name: 'تطبيقات Android',                 icon: '📱' },
      { id: 'cat_github',   sectionId: 'sec_tech', name: 'مشاريع GitHub',                   icon: '🐙' },
      { id: 'cat_code',     sectionId: 'sec_tech', name: 'البرمجة والتطوير',                icon: '💻' },
      { id: 'cat_ai',       sectionId: 'sec_tech', name: 'الذكاء الاصطناعي وتجربة النماذج', icon: '🤖' },
      { id: 'cat_test',     sectionId: 'sec_tech', name: 'الاختبارات',                      icon: '🧪' },
      { id: 'cat_bug',      sectionId: 'sec_tech', name: 'إصلاح الأخطاء',                   icon: '🐞' },
      { id: 'cat_deploy',   sectionId: 'sec_tech', name: 'البناء والنشر والتحديثات',        icon: '🚀' },
      // شخصي
      { id: 'cat_appt',     sectionId: 'sec_personal', name: 'المواعيد',                    icon: '📅' },
      { id: 'cat_duties',   sectionId: 'sec_personal', name: 'الالتزامات والمهام اليومية',   icon: '✅' },
      { id: 'cat_shopping', sectionId: 'sec_personal', name: 'المشتريات',                   icon: '🛒' },
      { id: 'cat_family',   sectionId: 'sec_personal', name: 'شؤون الأسرة',                 icon: '👨‍👩‍👧' },
      { id: 'cat_goals',    sectionId: 'sec_personal', name: 'الأهداف والعادات',            icon: '🎯' }
    ];
  }

  function defaultSettings() {
    return {
      theme: 'auto',                 // auto | light | dark
      workDays: [0,1,2,3,4],          // الأحد–الخميس (0=الأحد)
      workTime: '08:30',
      offTime: '12:00',
      remindersEnabled: false,
      reminderOverdue: true,
      reminderToday: true,
      reminderMeetings: true,
      meetingLeadMinutes: 15,
      lastReminderShown: null,
      aiEndpoint: '',                // فارغ = التحليل المحلي
      aiModel: '',
      syncEndpoint: '',
      userName: 'هود'
    };
  }

  /* ── الحالة ───────────────────────────────────────────────── */
  const state = {
    sections: [],
    tasks: [],
    categories: [],
    meetings: [],
    timeLog: [],       // { id, taskId, startedAt, endedAt, seconds, day }
    doneLog: [],       // سجل الإنجاز
    settings: {},
    activeTimer: null, // { taskId, startedAt, accumulated, paused, pausedAt }
    migrated: false
  };

  /* ── الإقلاع ──────────────────────────────────────────────── */
  function load() {
    const meta = read(K.meta, null);

    // نقرأ كل البيانات أولًا، قبل أي كتابة — حتى لا نمحو شيئًا محفوظًا
    const storedTasks    = read(K.tasks, []);
    const storedTimer    = read(K.timer, null);
    const storedTime     = read(K.time, []);
    const storedDone     = read(K.done, []);
    const storedMeetings = read(K.meetings, []);

    const isFirstRun = !meta &&
      storedTasks.length === 0 && !storedTimer &&
      storedTime.length === 0 && storedMeetings.length === 0;

    if (isFirstRun) {
      // أول تشغيل حقيقي: نُنشئ الافتراضيات
      state.sections = defaultSections();
      state.categories = defaultCategories();
      state.settings = defaultSettings();
      state.migrated = true;
    } else {
      state.sections   = read(K.sections,  defaultSections());
      state.categories = read(K.cats,      defaultCategories());
      state.settings   = Object.assign(defaultSettings(), read(K.settings, {}));
      if (state.sections.length === 0) state.sections = defaultSections();
      if (state.categories.length === 0) state.categories = defaultCategories();
    }

    // استرجاع البيانات المحفوظة (يجب أن يسبق أي persistAll)
    state.tasks       = storedTasks;
    state.meetings    = storedMeetings;
    state.timeLog     = storedTime;
    state.doneLog     = storedDone;
    state.activeTimer = storedTimer;

    // إصلاح المراجع المكسورة
    reconcile();

    // الآن يمكن الكتابة بأمان
    if (isFirstRun) {
      persistAll();
      write(K.meta, { schema: SCHEMA_VERSION, created: new Date().toISOString() });
    } else if (!meta || meta.schema !== SCHEMA_VERSION) {
      persistAll();
      write(K.meta, {
        schema: SCHEMA_VERSION,
        created: (meta && meta.created) || new Date().toISOString(),
        migratedAt: new Date().toISOString()
      });
    }

    return state;
  }

  // إصلاح مراجع مكسورة (قسم/تصنيف محذوف)
  function reconcile() {
    const secIds = new Set(state.sections.map(s => s.id));
    const catIds = new Set(state.categories.map(c => c.id));
    let dirty = false;
    const fallbackSec = state.sections.length ? state.sections[0].id : null;

    state.tasks.forEach(t => {
      if (!secIds.has(t.sectionId) && fallbackSec) { t.sectionId = fallbackSec; dirty = true; }
      if (t.categoryId && !catIds.has(t.categoryId)) { t.categoryId = null; dirty = true; }
    });
    // مهمة المؤقت النشط يجب أن تكون موجودة
    if (state.activeTimer && !state.tasks.some(t => t.id === state.activeTimer.taskId)) {
      state.activeTimer = null;
      write(K.timer, null);
    }
    if (dirty) write(K.tasks, state.tasks);
  }

  function persistAll() {
    write(K.sections, state.sections);
    write(K.categories, state.categories);
    write(K.settings, state.settings);
    write(K.tasks, state.tasks);
    write(K.meetings, state.meetings);
    write(K.time, state.timeLog);
  }

  /* ── المهام ───────────────────────────────────────────────── */
  function newTask(partial) {
    const now = new Date().toISOString();
    return Object.assign({
      id: uid(),
      title: '',
      notes: '',
      sectionId: 'sec_work',
      categoryId: null,
      priority: 'normal',          // low | normal | high | urgent
      size: 'small',               // small | large
      kind: 'task',                // task | meeting | reminder | ai_assist
      dueDate: null,
      suitableDays: [],            // أيام مناسبة للتنفيذ (ISO)
      repeat: 'none',              // none | daily | weekly | monthly
      status: 'open',              // open | in_progress | waiting_test | waiting_deploy | done
      client: '', rep: '', branch: '', item: '',
      amount: null, quantity: null, duePayment: null,
      repo: '', problem: '', changes: '', tests: '',
      buildStatus: '', nextStep: '',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      canceled: false,
      meetingId: null,
      aiAssist: null               // { type, draft, createdAt }
    }, partial || {});
  }

  function addTask(partial) {
    const t = newTask(partial);
    if (!t.title && t.problem) t.title = t.problem.slice(0, 60);
    state.tasks.push(t);
    write(K.tasks, state.tasks);
    emit('tasks');
    return t;
  }

  function updateTask(id, patch) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return null;
    Object.assign(t, patch, { updatedAt: new Date().toISOString() });
    write(K.tasks, state.tasks);
    emit('tasks');
    return t;
  }

  function getTask(id) { return state.tasks.find(x => x.id === id) || null; }

  // حذف مع إمكانية التراجع (نتيجة الحذف تُعاد للواجهة)
  function deleteTask(id) {
    const idx = state.tasks.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const removed = state.tasks[idx];
    state.tasks.splice(idx, 1);
    // إيقاف المؤقت إن كان يعمل على هذه المهمة
    if (state.activeTimer && state.activeTimer.taskId === id) {
      stopTimer();
    }
    write(K.tasks, state.tasks);
    emit('tasks');
    return { task: removed, index: idx };
  }

  function restoreTask(snapshot) {
    if (!snapshot || !snapshot.task) return null;
    // منع التكرار إن أُعيدت سابقًا
    if (state.tasks.some(t => t.id === snapshot.task.id)) return snapshot.task;
    state.tasks.splice(Math.min(snapshot.index, state.tasks.length), 0, snapshot.task);
    write(K.tasks, state.tasks);
    emit('tasks');
    return snapshot.task;
  }

  function completeTask(id) {
    const t = getTask(id);
    if (!t) return null;
    t.status = 'done';
    t.completedAt = new Date().toISOString();
    t.updatedAt = t.completedAt;
    state.doneLog.push({ id: uid(), taskId: t.id, title: t.title, sectionId: t.sectionId,
                         completedAt: t.completedAt, spentSeconds: totalForTask(t.id) });
    if (state.doneLog.length > 2000) state.doneLog = state.doneLog.slice(-2000);
    write(K.tasks, state.tasks);
    write(K.done, state.doneLog);

    // المهام المتكررة: عند الإنجاز نُنشئ نسخة قادمة
    if (t.repeat && t.repeat !== 'none') {
      const base = t.dueDate || todayISO();
      const next = t.repeat === 'daily' ? addDaysISO(base, 1)
                 : t.repeat === 'weekly' ? addDaysISO(base, 7)
                 : addDaysISO(base, 30);
      addTask(Object.assign({}, t, {
        id: uid(), status: 'open', completedAt: null, dueDate: next,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        aiAssist: null,
        title: t.title + ' (متكررة)'
      }));
    }
    emit('tasks');
    return t;
  }

  function reopenTask(id) {
    const t = getTask(id);
    if (!t) return null;
    t.status = 'open';
    t.completedAt = null;
    t.updatedAt = new Date().toISOString();
    write(K.tasks, state.tasks);
    emit('tasks');
    return t;
  }

  /* ── الأقسام والتصنيفات ───────────────────────────────────── */
  function addSection(data) {
    const s = {
      id: uid(), name: data.name || 'قسم جديد', short: data.short || data.name || 'قسم',
      color: data.color || '#6B7280', icon: data.icon || '📁',
      order: state.sections.length, system: false, cats: []
    };
    state.sections.push(s);
    write(K.sections, state.sections);
    emit('sections');
    return s;
  }

  function updateSection(id, patch) {
    const s = state.sections.find(x => x.id === id);
    if (!s) return null;
    Object.assign(s, patch);
    write(K.sections, state.sections);
    emit('sections');
    return s;
  }

  function deleteSection(id) {
    const idx = state.sections.findIndex(x => x.id === id);
    if (idx < 0) return null;
    if (state.sections.length <= 1) return { error: 'لا يمكن حذف القسم الأخير' };
    const moved = state.tasks.filter(t => t.sectionId === id).length;
    if (moved > 0) return { error: 'يوجد ' + moved + ' مهمة في هذا القسم. انقلها أولًا.' };
    const removed = state.sections[idx];
    state.sections.splice(idx, 1);
    state.categories = state.categories.filter(c => c.sectionId !== id);
    write(K.sections, state.sections);
    write(K.cats, state.categories);
    emit('sections');
    return { section: removed };
  }

  function addCategory(data) {
    const c = { id: uid(), sectionId: data.sectionId, name: data.name || 'تصنيف جديد', icon: data.icon || '•' };
    state.categories.push(c);
    write(K.cats, state.categories);
    emit('sections');
    return c;
  }

  function updateCategory(id, patch) {
    const c = state.categories.find(x => x.id === id);
    if (!c) return null;
    Object.assign(c, patch);
    write(K.cats, state.categories);
    emit('sections');
    return c;
  }

  function deleteCategory(id) {
    const c = state.categories.find(x => x.id === id);
    if (!c) return null;
    state.categories = state.categories.filter(x => x.id !== id);
    state.tasks.forEach(t => { if (t.categoryId === id) t.categoryId = null; });
    write(K.cats, state.categories);
    write(K.tasks, state.tasks);
    emit('sections');
    return { category: c };
  }

  function catsFor(sectionId) {
    return state.categories.filter(c => c.sectionId === sectionId);
  }
  function sectionById(id) { return state.sections.find(s => s.id === id) || null; }
  function catById(id) { return state.categories.find(c => c.id === id) || null; }

  /* ── الاجتماعات ───────────────────────────────────────────── */
  function newMeeting(p) {
    return Object.assign({
      id: uid(), title: '', date: '', time: '', duration: 60,
      place: '', people: '', notes: '',
      sectionId: 'sec_work',
      calendarEventId: null,        // معرّف حدث Google Calendar إن رُبط
      calendarStatus: 'none',       // none | pending | synced | failed
      createdAt: new Date().toISOString()
    }, p || {});
  }

  function addMeeting(p) {
    const m = newMeeting(p);
    if (!m.date) return { error: 'التاريخ مطلوب لإنشاء الاجتماع' };
    state.meetings.push(m);
    // مهمة مرتبطة تظهر في قسم اجتماعات اليوم
    const t = addTask({
      title: m.title || 'اجتماع',
      sectionId: m.sectionId, categoryId: null,
      kind: 'meeting', dueDate: m.date, size: 'large',
      notes: (m.time ? 'الساعة ' + m.time + ' • ' : '') +
             (m.place ? 'المكان: ' + m.place + ' • ' : '') +
             (m.people ? 'الحاضرون: ' + m.people : ''),
      meetingId: m.id
    });
    m.taskId = t.id;
    write(K.meetings, state.meetings);
    write(K.tasks, state.tasks);
    emit('meetings'); emit('tasks');
    return m;
  }

  function updateMeeting(id, patch) {
    const m = state.meetings.find(x => x.id === id);
    if (!m) return null;
    Object.assign(m, patch);
    write(K.meetings, state.meetings);
    // تزامن المهمة المرتبطة
    if (m.taskId) {
      const t = getTask(m.taskId);
      if (t) {
        t.title = m.title || t.title;
        t.dueDate = m.date || t.dueDate;
        t.notes = (m.time ? 'الساعة ' + m.time + ' • ' : '') +
                  (m.place ? 'المكان: ' + m.place + ' • ' : '') +
                  (m.people ? 'الحاضرون: ' + m.people : '');
        write(K.tasks, state.tasks);
      }
    }
    emit('meetings'); emit('tasks');
    return m;
  }

  function deleteMeeting(id) {
    const idx = state.meetings.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const removed = state.meetings[idx];
    state.meetings.splice(idx, 1);
    if (removed.taskId) {
      const i = state.tasks.findIndex(t => t.id === removed.taskId);
      if (i >= 0) state.tasks.splice(i, 1);
    }
    write(K.meetings, state.meetings);
    write(K.tasks, state.tasks);
    emit('meetings'); emit('tasks');
    return { meeting: removed, index: idx };
  }

  function meetingsOn(dateISO) {
    return state.meetings.filter(m => m.date === dateISO)
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  }
  function upcomingMeetings(limit) {
    const today = todayISO();
    return state.meetings
      .filter(m => m.date >= today)
      .sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')))
      .slice(0, limit || 5);
  }

  /* ── مؤقت العمل ───────────────────────────────────────────── */
  function startTimer(taskId) {
    if (state.activeTimer) {
      // مهمة واحدة فقط بالمؤقت في نفس الوقت
      return { error: 'يوجد مؤقت يعمل بالفعل على مهمة أخرى. أوقفه أولًا.',
               activeTaskId: state.activeTimer.taskId };
    }
    const t = getTask(taskId);
    if (!t) return { error: 'المهمة غير موجودة' };
    state.activeTimer = {
      taskId, startedAt: Date.now(), accumulated: 0, paused: false, pausedAt: null
    };
    if (t.status === 'open') t.status = 'in_progress';
    write(K.timer, state.activeTimer);
    write(K.tasks, state.tasks);
    emit('timer'); emit('tasks');
    return state.activeTimer;
  }

  function elapsedOf(timer) {
    if (!timer) return 0;
    const running = timer.paused ? 0 : (Date.now() - timer.startedAt) / 1000;
    const val = Math.floor(timer.accumulated + running);
    return val > 0 ? val : 0;
  }

  function pauseTimer() {
    if (!state.activeTimer || state.activeTimer.paused) return state.activeTimer;
    const t = state.activeTimer;
    t.accumulated = elapsedOf(t);
    t.paused = true;
    t.pausedAt = Date.now();
    write(K.timer, state.activeTimer);
    emit('timer');
    return t;
  }

  function resumeTimer() {
    if (!state.activeTimer || !state.activeTimer.paused) return state.activeTimer;
    const t = state.activeTimer;
    t.paused = false;
    t.startedAt = Date.now();
    t.pausedAt = null;
    write(K.timer, state.activeTimer);
    emit('timer');
    return t;
  }

  function stopTimer() {
    if (!state.activeTimer) return null;
    const t = state.activeTimer;
    const secs = elapsedOf(t);
    if (secs >= 1) {
      state.timeLog.push({
        id: uid(), taskId: t.taskId, seconds: secs,
        day: todayISO(), startedAt: new Date(t.startedAt).toISOString(),
        endedAt: new Date().toISOString()
      });
      if (state.timeLog.length > 5000) state.timeLog = state.timeLog.slice(-5000);
      write(K.time, state.timeLog);
    }
    state.activeTimer = null;
    write(K.timer, null);
    emit('timer'); emit('time');
    return { taskId: t.taskId, seconds: secs };
  }

  function totalForTask(taskId) {
    return state.timeLog.filter(e => e.taskId === taskId)
      .reduce((s, e) => s + e.seconds, 0);
  }

  function totalForDay(day) {
    day = day || todayISO();
    const bySection = {};
    let total = 0;
    state.timeLog.filter(e => e.day === day).forEach(e => {
      const t = getTask(e.taskId);
      const sid = t ? t.sectionId : 'unknown';
      bySection[sid] = (bySection[sid] || 0) + e.seconds;
      total += e.seconds;
    });
    return { total, bySection };
  }

  function logForTask(taskId) {
    return state.timeLog.filter(e => e.taskId === taskId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  function logForDay(day) {
    return state.timeLog.filter(e => e.day === day)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /* ── الإعدادات ────────────────────────────────────────────── */
  function setSetting(key, val) {
    state.settings[key] = val;
    write(K.settings, state.settings);
    emit('settings');
    return state.settings;
  }

  /* ── التصدير والاستيراد ───────────────────────────────────── */
  function exportAll() {
    return {
      app: 'daftar-hood', schema: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      sections: state.sections, categories: state.categories,
      tasks: state.tasks, meetings: state.meetings,
      timeLog: state.timeLog, doneLog: state.doneLog,
      settings: state.settings
    };
  }

  function importAll(data, mode) {
    if (!data || typeof data !== 'object') return { error: 'ملف غير صالح' };
    if (data.app !== 'daftar-hood') return { error: 'هذا الملف ليس نسخة احتياطية من دفتر هود' };
    if (!Array.isArray(data.tasks)) return { error: 'الملف لا يحتوي على مهام صالحة' };

    if (mode === 'replace') {
      state.sections  = data.sections  || defaultSections();
      state.categories= data.categories|| defaultCategories();
      state.tasks     = data.tasks;
      state.meetings  = data.meetings  || [];
      state.timeLog   = data.timeLog   || [];
      state.doneLog   = data.doneLog   || [];
      state.settings  = Object.assign(defaultSettings(), data.settings || {});
    } else {
      // دمج: نتجاهل المكرر بالمعرّف
      const ids = new Set(state.tasks.map(t => t.id));
      let added = 0;
      (data.tasks || []).forEach(t => { if (t && t.id && !ids.has(t.id)) { state.tasks.push(t); added++; } });
      const mids = new Set(state.meetings.map(m => m.id));
      (data.meetings || []).forEach(m => { if (m && m.id && !mids.has(m.id)) state.meetings.push(m); });
      const tids = new Set(state.timeLog.map(e => e.id));
      (data.timeLog || []).forEach(e => { if (e && e.id && !tids.has(e.id)) state.timeLog.push(e); });
      // الأقسام المخصصة
      const sids = new Set(state.sections.map(s => s.id));
      (data.sections || []).forEach(s => { if (s && s.id && !sids.has(s.id)) state.sections.push(s); });
      (data.categories || []).forEach(c => { if (c && c.id && !state.categories.some(x => x.id === c.id)) state.categories.push(c); });
      reconcile();
      persistAll();
      emit('tasks'); emit('sections'); emit('time');
      return { ok: true, added };
    }
    reconcile();
    persistAll();
    emit('tasks'); emit('sections'); emit('time'); emit('meetings');
    return { ok: true, mode: mode || 'merge', total: state.tasks.length };
  }

  function clearAll() {
    Object.values(K).forEach(k => {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    state.tasks = []; state.meetings = []; state.timeLog = [];
    state.doneLog = []; state.activeTimer = null;
    state.sections = defaultSections();
    state.categories = defaultCategories();
    state.settings = defaultSettings();
    persistAll();
    emit('tasks'); emit('sections'); emit('time'); emit('meetings'); emit('settings');
    return { ok: true };
  }

  /* ── نظام الأحداث ─────────────────────────────────────────── */
  const listeners = {};
  function on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
  }
  function emit(evt) {
    (listeners[evt] || []).forEach(fn => {
      try { fn(); } catch (e) { console.error('[store] خطأ في مستمع ' + evt + ':', e); }
    });
    (listeners['*'] || []).forEach(fn => { try { fn(evt); } catch (e) {} });
  }

  /* ── التصدير العام ────────────────────────────────────────── */
  global.DH = global.DH || {};
  global.DH.store = {
    state, load, on, emit,
    todayISO, addDaysISO, daysBetween, uid,
    newTask, addTask, updateTask, getTask, deleteTask, restoreTask,
    completeTask, reopenTask,
    addSection, updateSection, deleteSection, sectionById,
    addCategory, updateCategory, deleteCategory, catsFor, catById,
    newMeeting, addMeeting, updateMeeting, deleteMeeting, meetingsOn, upcomingMeetings,
    startTimer, pauseTimer, resumeTimer, stopTimer, elapsedOf,
    totalForTask, totalForDay, logForTask, logForDay,
    setSetting, exportAll, importAll, clearAll,
    K, SCHEMA_VERSION
  };
})(window);