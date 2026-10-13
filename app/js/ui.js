/* ═══════════════════════════════════════════════════════════════
   دفتر هود الذكي — الواجهة والتفاعلات (ui.js)
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const S = () => DH.store;
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const AR_DAYS  = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const AR_MONTHS= ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  const PRIORITY_LABEL = { low:'منخفضة', normal:'عادية', high:'مهمة', urgent:'عاجلة' };
  const STATUS_LABEL = {
    open:'جديدة', in_progress:'قيد التنفيذ', waiting_test:'بانتظار الاختبار',
    waiting_deploy:'بانتظار النشر', done:'مكتملة'
  };
  const KIND_LABEL = { task:'تنفيذية', meeting:'اجتماع', reminder:'تذكير', ai_assist:'مساندة ذكية' };
  const REPEAT_LABEL = { none:'بدون تكرار', daily:'يوميًا', weekly:'أسبوعيًا', monthly:'شهريًا' };

  // بحث آمن عن التسمية: لا يُنتج undefined أبدًا للقيم غير المعروفة
  const lbl = (map, key, fallback) =>
    (map && Object.prototype.hasOwnProperty.call(map, key) && map[key]) ? map[key] : (fallback || '');

  /* ── حالة الواجهة ─────────────────────────────────────────── */
  const view = {
    activeSection: 'all',
    filter: { status: 'open', priority: 'all', search: '', dueRange: 'all' },
    pendingTasks: null,      // بطاقات المراجعة قبل الحفظ
    editingTask: null,
    expandedTask: null,
    showDone: false,
    doneOfDay: true,
    assistDraft: null,
    timerTick: null
  };

  /* ── أدوات التنسيق ───────────────────────────────────────── */
  function fmtDuration(secs) {
    secs = Math.max(0, Math.floor(secs || 0));
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    if (h > 0) return h + 'س ' + String(m).padStart(2,'0') + 'د';
    if (m > 0) return m + 'د ' + String(s).padStart(2,'0') + 'ث';
    return s + 'ث';
  }

  function fmtClock(secs) {
    secs = Math.max(0, Math.floor(secs || 0));
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  function fmtAmount(a) {
    if (a === null || a === undefined || isNaN(a)) return '';
    return new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 }).format(a);
  }

  function fmtDateAr(iso) {
    if (!iso) return 'بدون موعد محدد';
    const d = new Date(iso + 'T12:00:00');
    return AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtTimeAr(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const period = h < 12 ? 'صباحًا' : (h < 17 ? 'ظهرًا' : 'مساءً');
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + String(m).padStart(2,'0') + ' ' + period;
  }

  // حالة الموعد — الأساس لكل الترتيب والتلوين
  // متين ضد التواريخ التالفة أو المفقودة: لا يُنتج NaN أبدًا
  function isValidDate(iso) {
    if (!iso || typeof iso !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const d = new Date(iso + 'T12:00:00');
    return !isNaN(d.getTime());
  }

  function dueInfo(task) {
    const today = S().todayISO();
    if (task.status === 'done') return { key:'done', label:'مكتملة', cls:'due-done', rank: 90 };
    if (!isValidDate(task.dueDate)) return { key:'none', label:'بدون موعد محدد', cls:'due-none', rank: 50 };

    const diff = S().daysBetween(today, task.dueDate);
    if (typeof diff !== 'number' || !isFinite(diff)) {
      return { key:'none', label:'بدون موعد محدد', cls:'due-none', rank: 50 };
    }
    if (diff < 0) {
      const n = Math.abs(diff);
      return { key:'overdue', label: n === 1 ? 'متأخرة يوم واحد' : 'متأخرة ' + n + ' أيام',
               cls:'due-overdue', rank: 0, days: diff };
    }
    if (diff === 0) return { key:'today', label:'مستحقة اليوم', cls:'due-today', rank: 1, days: 0 };
    if (diff === 1) return { key:'tomorrow', label:'موعدها غدًا', cls:'due-tomorrow', rank: 2, days: 1 };
    if (diff <= 7)  return { key:'soon', label:'بعد ' + diff + ' أيام', cls:'due-soon', rank: 3, days: diff };
    return { key:'later', label:'بعد ' + diff + ' يومًا', cls:'due-later', rank: 4, days: diff };
  }

  // ترتيب: متأخرة → اليوم → القادمة، وداخل كل مجموعة: الكبيرة ثم الأولى
  function sortTasks(list) {
    const prioRank = { urgent:0, high:1, normal:2, low:3 };
    return list.slice().sort((a, b) => {
      const da = dueInfo(a), db = dueInfo(b);
      if (da.rank !== db.rank) return da.rank - db.rank;

      // داخل نفس المجموعة: المهام الكبيرة أولًا
      const sa = a.size === 'large' ? 0 : 1;
      const sb = b.size === 'large' ? 0 : 1;
      if (sa !== sb) return sa - sb;

      const pa = prioRank[a.priority] ?? 2, pb = prioRank[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;

      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });
  }

  /* ── تنبيهات مؤقتة ────────────────────────────────────────── */
  let toastTimer = null;
  function toast(msg, kind, actionLabel, actionFn) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.className = 'toast show' + (kind ? ' toast-' + kind : '');
    el.innerHTML = '<div class="toast-msg">' + esc(msg) + '</div>' +
      (actionLabel ? '<button class="toast-action">' + esc(actionLabel) + '</button>' : '');
    if (actionLabel && actionFn) {
      el.querySelector('.toast-action').onclick = () => { actionFn(); hideToast(); };
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 7000 : 3600);
  }
  function hideToast() {
    const el = document.getElementById('toast');
    if (el) el.className = 'toast';
  }

  /* ── نافذة تأكيد ──────────────────────────────────────────── */
  function confirmDialog(opts) {
    return new Promise(resolve => {
      const modal = document.getElementById('modal');
      const title = opts.title || 'تأكيد';
      let extra = '';
      if (opts.options && opts.options.length) {
        extra = '<div class="confirm-options">' + opts.options.map((o, i) =>
          '<label class="confirm-opt"><input type="radio" name="confirm-opt" value="' + esc(o.value) + '"' +
          (i === 0 ? ' checked' : '') + '><span>' + esc(o.label) + '</span></label>'
        ).join('') + '</div>';
      }
      modal.innerHTML =
        '<div class="modal-backdrop"></div>' +
        '<div class="modal-sheet">' +
          '<h3 class="modal-title">' + esc(title) + '</h3>' +
          '<p class="modal-body">' + (opts.html || esc(opts.body || '')) + '</p>' +
          extra +
          '<div class="modal-actions">' +
            '<button class="btn btn-ghost" data-act="cancel">' + esc(opts.cancelText || 'إلغاء') + '</button>' +
            '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok">' +
              esc(opts.okText || 'تأكيد') + '</button>' +
          '</div>' +
        '</div>';
      modal.classList.add('open');

      const close = (val) => {
        modal.classList.remove('open');
        modal.innerHTML = '';
        resolve(val);
      };
      modal.querySelector('[data-act="cancel"]').onclick = () => close(null);
      modal.querySelector('.modal-backdrop').onclick = () => close(null);
      modal.querySelector('[data-act="ok"]').onclick = () => {
        const sel = modal.querySelector('input[name="confirm-opt"]:checked');
        close(sel ? sel.value : true);
      };
    });
  }

  /* ── نافذة إدخال عامة ─────────────────────────────────────── */
  function promptDialog(opts) {
    return new Promise(resolve => {
      const modal = document.getElementById('modal');
      const fields = (opts.fields || []).map(f => {
        if (f.type === 'textarea') {
          return '<label class="fld"><span>' + esc(f.label) + '</span>' +
            '<textarea id="pf_' + f.name + '" rows="' + (f.rows || 4) + '" placeholder="' +
            esc(f.placeholder || '') + '">' + esc(f.value || '') + '</textarea></label>';
        }
        if (f.type === 'select') {
          return '<label class="fld"><span>' + esc(f.label) + '</span><select id="pf_' + f.name + '">' +
            f.options.map(o => '<option value="' + esc(o.value) + '"' +
              (String(o.value) === String(f.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') +
            '</select></label>';
        }
        if (f.type === 'color') {
          return '<label class="fld"><span>' + esc(f.label) + '</span>' +
            '<input type="color" id="pf_' + f.name + '" value="' + esc(f.value || '#2E7D6B') + '"></label>';
        }
        return '<label class="fld"><span>' + esc(f.label) + '</span>' +
          '<input type="' + (f.type || 'text') + '" id="pf_' + f.name + '" value="' + esc(f.value || '') +
          '" placeholder="' + esc(f.placeholder || '') + '"></label>';
      }).join('');

      modal.innerHTML =
        '<div class="modal-backdrop"></div>' +
        '<div class="modal-sheet modal-form">' +
          '<h3 class="modal-title">' + esc(opts.title || '') + '</h3>' +
          (opts.body ? '<p class="modal-body">' + esc(opts.body) + '</p>' : '') +
          '<div class="flds">' + fields + '</div>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-ghost" data-act="cancel">' + esc(opts.cancelText || 'إلغاء') + '</button>' +
            '<button class="btn btn-primary" data-act="ok">' + esc(opts.okText || 'حفظ') + '</button>' +
          '</div>' +
        '</div>';
      modal.classList.add('open');

      const close = v => { modal.classList.remove('open'); modal.innerHTML = ''; resolve(v); };
      modal.querySelector('[data-act="cancel"]').onclick = () => close(null);
      modal.querySelector('.modal-backdrop').onclick = () => close(null);
      modal.querySelector('[data-act="ok"]').onclick = () => {
        const out = {};
        (opts.fields || []).forEach(f => {
          const el = document.getElementById('pf_' + f.name);
          out[f.name] = el ? el.value : '';
        });
        close(out);
      };
      const first = modal.querySelector('input,textarea,select');
      if (first && !('ontouchstart' in window)) first.focus();
    });
  }

  /* ═══ الترويسة: التحية والملخص ═══════════════════════════════ */
  function renderHeader() {
    const st = S().state;
    const today = S().todayISO();
    const tasks = st.tasks.filter(t => !t.canceled);

    const open = tasks.filter(t => t.status !== 'done');
    const overdue = open.filter(t => dueInfo(t).key === 'overdue');
    const todayTasks = open.filter(t => dueInfo(t).key === 'today');
    const todayMeetings = S().meetingsOn(today);
    const doneToday = tasks.filter(t => t.status === 'done' &&
      t.completedAt && t.completedAt.slice(0, 10) === today);

    const d = new Date();
    const hour = d.getHours();
    const greet = hour < 12 ? 'صباح الخير' : (hour < 17 ? 'مساء الخير' : 'مساء الخير');

    const timeDay = S().totalForDay(today);

    return '' +
    '<header class="app-header">' +
      '<div class="header-top">' +
        '<div class="greet">' +
          '<span class="greet-hello">' + greet + '، ' + esc(st.settings.userName || 'هود') + '</span>' +
          '<span class="greet-date">' + AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' +
            AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear() + '</span>' +
        '</div>' +
        '<div class="header-btns">' +
          '<button class="icon-btn" id="btn-theme" title="المظهر">' + (document.body.classList.contains('dark') ? '☀️' : '🌙') + '</button>' +
          '<button class="icon-btn" id="btn-settings" title="الإعدادات">⚙️</button>' +
        '</div>' +
      '</div>' +

      '<div class="summary-grid">' +
        '<button class="sum-card sum-overdue" data-jump="overdue">' +
          '<span class="sum-num">' + overdue.length + '</span>' +
          '<span class="sum-lbl">متأخرة</span></button>' +
        '<button class="sum-card sum-today" data-jump="today">' +
          '<span class="sum-num">' + todayTasks.length + '</span>' +
          '<span class="sum-lbl">مهام اليوم</span></button>' +
        '<button class="sum-card sum-meet" data-jump="meetings">' +
          '<span class="sum-num">' + todayMeetings.length + '</span>' +
          '<span class="sum-lbl">اجتماعات اليوم</span></button>' +
        '<button class="sum-card sum-done" data-jump="done">' +
          '<span class="sum-num">' + doneToday.length + '</span>' +
          '<span class="sum-lbl">أُنجزت اليوم</span></button>' +
      '</div>' +

      (timeDay.total > 0 ? renderTimeBar(timeDay) : '') +
    '</header>';
  }

  function renderTimeBar(timeDay) {
    const st = S().state;
    const parts = st.sections.map(s => ({
      name: s.short, color: s.color, secs: timeDay.bySection[s.id] || 0
    })).filter(p => p.secs > 0);
    if (!parts.length) return '';

    let pos = 0;
    const segs = parts.map(p => {
      const pct = (p.secs / timeDay.total) * 100;
      const seg = '<div class="tb-seg" style="left:' + pos + '%;width:' + pct + '%;background:' + p.color +
        '" title="' + esc(p.name + ': ' + fmtDuration(p.secs)) + '"></div>';
      pos += pct;
      return seg;
    }).join('');

    return '<div class="time-bar-wrap">' +
      '<div class="time-bar-head"><span>عمل اليوم: ' + fmtDuration(timeDay.total) + '</span>' +
      '<button class="link-btn" id="open-time">السجل</button></div>' +
      '<div class="time-bar">' + segs + '</div>' +
      '<div class="time-legend">' + parts.map(p =>
        '<span class="tl-item"><i style="background:' + p.color + '"></i>' + esc(p.name) + ' ' +
        fmtDuration(p.secs) + '</span>').join('') + '</div>' +
    '</div>';
  }

  /* ═══ صندوق الإملاء ═════════════════════════════════════════ */
  function renderCapture() {
    return '' +
    '<section class="capture">' +
      '<div class="capture-box">' +
        '<textarea id="capture-input" rows="2" dir="rtl" ' +
          'placeholder="اكتب أو أملِ مهامك… مثال: بكرة أراجع حسابات العملاء المتأخرة، وأتابع مع المندوب بشأن البضاعة الراكدة"></textarea>' +
        '<div class="capture-row">' +
          '<button class="btn btn-ghost btn-sm" id="btn-mic" title="الإملاء الصوتي">🎤 إملاء</button>' +
          '<button class="btn btn-ghost btn-sm" id="btn-manual" title="إضافة يدوية">✏️ يدوي</button>' +
          '<button class="btn btn-primary btn-sm capture-go" id="btn-analyze">تحليل ←</button>' +
        '</div>' +
        '<div class="capture-note" id="mic-note"></div>' +
      '</div>' +
    '</section>';
  }

  /* ═══ بطاقة المراجعة قبل الحفظ ═══════════════════════════════ */
  function renderPendingReview() {
    if (!view.pendingTasks || !view.pendingTasks.length) return '';
    const st = S().state;

    const cards = view.pendingTasks.map((t, i) => {
      const sec = st.sections.find(s => s.id === t.sectionId) || st.sections[0];
      const di = dueInfo(t);
      const meta = t._meta || {};
      return '' +
      '<article class="rv-card" data-idx="' + i + '">' +
        '<div class="rv-head">' +
          '<input class="rv-title" data-field="title" value="' + esc(t.title) + '" dir="rtl">' +
          '<button class="rv-del" data-act="del" data-idx="' + i + '" title="حذف">✕</button>' +
        '</div>' +
        '<div class="rv-chips">' +
          '<span class="chip chip-sec" style="background:' + sec.color + '20;color:' + sec.color +
            ';border-color:' + sec.color + '55">' + esc(sec.short) + '</span>' +
          (meta.matched && meta.matched.length ?
            '<span class="chip chip-conf">ثقة ' + Math.round((meta.confidence||0)*100) + '%</span>' : '') +
          (meta.source === 'ai' ? '<span class="chip chip-ai">AI</span>' : '') +
        '</div>' +
        '<div class="rv-grid">' +
          '<label class="rv-f"><span>القسم</span><select data-field="sectionId">' +
            st.sections.map(s => '<option value="' + s.id + '"' +
              (s.id === t.sectionId ? ' selected' : '') + '>' + esc(s.short) + '</option>').join('') +
          '</select></label>' +
          '<label class="rv-f"><span>التصنيف</span><select data-field="categoryId">' +
            '<option value="">— بدون —</option>' +
            S().catsFor(t.sectionId).map(c => '<option value="' + c.id + '"' +
              (c.id === t.categoryId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
          '</select></label>' +
          '<label class="rv-f"><span>التاريخ</span><input type="date" data-field="dueDate" value="' +
            (t.dueDate || '') + '"></label>' +
          '<label class="rv-f"><span>الوقت</span><input type="time" data-field="timeHint" value="' +
            esc(meta.period || '') + '"></label>' +
          '<label class="rv-f"><span>الأولوية</span><select data-field="priority">' +
            Object.keys(PRIORITY_LABEL).map(k => '<option value="' + k + '"' +
              (k === t.priority ? ' selected' : '') + '>' + PRIORITY_LABEL[k] + '</option>').join('') +
          '</select></label>' +
          '<label class="rv-f"><span>الحجم</span><select data-field="size">' +
            '<option value="small"' + (t.size === 'small' ? ' selected' : '') + '>صغيرة</option>' +
            '<option value="large"' + (t.size === 'large' ? ' selected' : '') + '>كبيرة</option>' +
          '</select></label>' +
          '<label class="rv-f"><span>النوع</span><select data-field="kind">' +
            Object.keys(KIND_LABEL).map(k => '<option value="' + k + '"' +
              (k === t.kind ? ' selected' : '') + '>' + KIND_LABEL[k] + '</option>').join('') +
          '</select></label>' +
          '<label class="rv-f"><span>التكرار</span><select data-field="repeat">' +
            Object.keys(REPEAT_LABEL).map(k => '<option value="' + k + '"' +
              (k === t.repeat ? ' selected' : '') + '>' + REPEAT_LABEL[k] + '</option>').join('') +
          '</select></label>' +
        '</div>' +
        (t.client || t.rep || t.item || t.amount ? '<div class="rv-entities">' +
          (t.client ? '<span class="ent">العميل: ' + esc(t.client) + '</span>' : '') +
          (t.rep ? '<span class="ent">المندوب: ' + esc(t.rep) + '</span>' : '') +
          (t.branch ? '<span class="ent">الفرع: ' + esc(t.branch) + '</span>' : '') +
          (t.item ? '<span class="ent">الصنف: ' + esc(t.item) + '</span>' : '') +
          (t.amount ? '<span class="ent">المبلغ: ' + fmtAmount(t.amount) + '</span>' : '') +
        '</div>' : '') +
        '<div class="rv-status ' + di.cls + '">' + di.label + '</div>' +
      '</article>';
    }).join('');

    return '' +
    '<section class="review-wrap" id="review-wrap">' +
      '<div class="review-head">' +
        '<h3>مراجعة قبل الحفظ <span class="count">' + view.pendingTasks.length + '</span></h3>' +
        '<p class="review-hint">عدّل أي حقل ثم احفظ. لا شيء يُحفظ قبل ضغطك على «حفظ المهام».</p>' +
      '</div>' +
      '<div class="review-list">' + cards + '</div>' +
      '<div class="review-actions">' +
        '<button class="btn btn-ghost" id="rv-cancel">إلغاء الكل</button>' +
        '<button class="btn btn-primary" id="rv-save">حفظ المهام (' + view.pendingTasks.length + ')</button>' +
      '</div>' +
    '</section>';
  }

  /* ═══ المؤقت النشط ═══════════════════════════════════════════ */
  function renderActiveTimer() {
    const t = S().state.activeTimer;
    if (!t) return '';
    const task = S().getTask(t.taskId);
    if (!task) return '';
    const sec = S().sectionById(task.sectionId);
    const elapsed = S().elapsedOf(t);

    return '' +
    '<section class="active-timer" style="border-color:' + (sec ? sec.color : '#888') + '">' +
      '<div class="at-row">' +
        '<span class="at-dot' + (t.paused ? ' paused' : '') + '"></span>' +
        '<div class="at-info">' +
          '<span class="at-lbl">' + (t.paused ? 'متوقف مؤقتًا' : 'تعمل الآن على') + '</span>' +
          '<span class="at-title">' + esc(task.title) + '</span>' +
        '</div>' +
        '<span class="at-clock" id="at-clock">' + fmtClock(elapsed) + '</span>' +
      '</div>' +
      '<div class="at-actions">' +
        (t.paused
          ? '<button class="btn btn-primary btn-sm" id="t-resume">استئناف</button>'
          : '<button class="btn btn-ghost btn-sm" id="t-pause">إيقاف مؤقت</button>') +
        '<button class="btn btn-ghost btn-sm" id="t-open">المهمة</button>' +
        '<button class="btn btn-danger-soft btn-sm" id="t-stop">إنهاء وتسجيل</button>' +
      '</div>' +
    '</section>';
  }

  /* ═══ اجتماعات اليوم ═════════════════════════════════════════ */
  function renderMeetings() {
    const today = S().todayISO();
    const todays = S().meetingsOn(today);
    const upcoming = S().upcomingMeetings(6).filter(m => m.date !== today);
    if (!todays.length && !upcoming.length) {
      return '<section class="meetings-sec" id="meetings-sec">' +
        '<div class="sec-head"><h3>الاجتماعات</h3>' +
        '<button class="btn btn-ghost btn-sm" id="btn-new-meeting">+ اجتماع</button></div>' +
        '<p class="empty small">لا توجد اجتماعات قادمة.</p></section>';
    }

    const card = m => {
      const st = DH.calendar.status();
      const calBadge = m.calendarStatus === 'synced'
        ? '<span class="cal-badge cal-ok">مضاف للتقويم ✓</span>'
        : m.calendarStatus === 'failed'
        ? '<span class="cal-badge cal-fail" title="' + esc(m.calendarError || '') + '">لم يُضف للتقويم</span>'
        : '<span class="cal-badge cal-none">في الدفتر فقط</span>';
      return '' +
      '<article class="meet-card" data-mid="' + m.id + '">' +
        '<div class="meet-time">' + (m.time ? fmtTimeAr(m.time) : 'وقت غير محدد') + '</div>' +
        '<div class="meet-body">' +
          '<div class="meet-title">' + esc(m.title || 'اجتماع') + '</div>' +
          '<div class="meet-meta">' +
            (m.date === today ? '<span class="mm-today">اليوم</span>' : '<span>' + fmtDateAr(m.date) + '</span>') +
            (m.duration ? '<span>' + m.duration + ' دقيقة</span>' : '') +
            (m.place ? '<span>📍 ' + esc(m.place) + '</span>' : '') +
            (m.people ? '<span>👥 ' + esc(m.people) + '</span>' : '') +
          '</div>' +
          '<div class="meet-cal">' + calBadge + '</div>' +
        '</div>' +
        '<div class="meet-acts">' +
          '<button class="icon-btn sm" data-act="edit-meeting" data-mid="' + m.id + '" title="تعديل">✏️</button>' +
          '<button class="icon-btn sm" data-act="del-meeting" data-mid="' + m.id + '" title="حذف">🗑️</button>' +
        '</div>' +
      '</article>';
    };

    return '' +
    '<section class="meetings-sec" id="meetings-sec">' +
      '<div class="sec-head">' +
        '<h3>اجتماعات اليوم والقادمة</h3>' +
        '<button class="btn btn-ghost btn-sm" id="btn-new-meeting">+ اجتماع</button>' +
      '</div>' +
      (todays.length ? '<div class="meet-group-lbl">اليوم</div>' + todays.map(card).join('') : '') +
      (upcoming.length ? '<div class="meet-group-lbl">قادمة</div>' + upcoming.map(card).join('') : '') +
    '</section>';
  }

  /* ═══ تبويبات الأقسام + مرشحات ══════════════════════════════ */
  function renderTabs() {
    const st = S().state;
    const today = S().todayISO();
    const countFor = sid => {
      const open = st.tasks.filter(t => !t.canceled && t.status !== 'done' && (sid === 'all' || t.sectionId === sid));
      return open.length;
    };

    return '' +
    '<nav class="tabs" id="tabs">' +
      '<button class="tab' + (view.activeSection === 'all' ? ' active' : '') + '" data-sec="all">' +
        '<span class="tab-name">الكل</span><span class="tab-count">' + countFor('all') + '</span></button>' +
      st.sections.map(s =>
        '<button class="tab' + (view.activeSection === s.id ? ' active' : '') + '" data-sec="' + s.id + '" ' +
          'style="--sec-color:' + s.color + '">' +
          '<span class="tab-icon">' + s.icon + '</span>' +
          '<span class="tab-name">' + esc(s.short) + '</span>' +
          '<span class="tab-count">' + countFor(s.id) + '</span>' +
        '</button>').join('') +
      '<button class="tab tab-manage" id="btn-manage-sec" title="إدارة الأقسام">⚙︎</button>' +
    '</nav>';
  }

  function renderFilters() {
    const f = view.filter;
    return '' +
    '<div class="filters" id="filters">' +
      '<div class="flt-search">' +
        '<input type="search" id="flt-search" placeholder="بحث في المهام…" value="' + esc(f.search) + '" dir="rtl">' +
      '</div>' +
      '<div class="flt-row">' +
        '<select id="flt-status" class="flt-sel">' +
          '<option value="open"' + (f.status === 'open' ? ' selected' : '') + '>مفتوحة</option>' +
          '<option value="overdue"' + (f.status === 'overdue' ? ' selected' : '') + '>متأخرة</option>' +
          '<option value="today"' + (f.status === 'today' ? ' selected' : '') + '>اليوم</option>' +
          '<option value="done"' + (f.status === 'done' ? ' selected' : '') + '>منجزة</option>' +
          '<option value="all"' + (f.status === 'all' ? ' selected' : '') + '>الكل</option>' +
        '</select>' +
        '<select id="flt-priority" class="flt-sel">' +
          '<option value="all"' + (f.priority === 'all' ? ' selected' : '') + '>كل الأولويات</option>' +
          Object.keys(PRIORITY_LABEL).map(k => '<option value="' + k + '"' +
            (f.priority === k ? ' selected' : '') + '>' + PRIORITY_LABEL[k] + '</option>').join('') +
        '</select>' +
        '<select id="flt-range" class="flt-sel">' +
          '<option value="all"' + (f.dueRange === 'all' ? ' selected' : '') + '>كل المواعيد</option>' +
          '<option value="week"' + (f.dueRange === 'week' ? ' selected' : '') + '>هذا الأسبوع</option>' +
          '<option value="month"' + (f.dueRange === 'month' ? ' selected' : '') + '>هذا الشهر</option>' +
          '<option value="none"' + (f.dueRange === 'none' ? ' selected' : '') + '>بدون موعد</option>' +
        '</select>' +
      '</div>' +
    '</div>';
  }

  /* ═══ بطاقة مهمة ═════════════════════════════════════════════ */
  function taskCard(t) {
    const st = S().state;
    const sec = S().sectionById(t.sectionId) || { color:'#888', short:'—', icon:'•' };
    const cat = t.categoryId ? S().catById(t.categoryId) : null;
    const di = dueInfo(t);
    const isTimer = st.activeTimer && st.activeTimer.taskId === t.id;
    const spent = S().totalForTask(t.id);
    const expanded = view.expandedTask === t.id;

    const prioDot = t.priority === 'urgent' ? '<span class="prio prio-urgent" title="عاجلة"></span>'
                  : t.priority === 'high'   ? '<span class="prio prio-high" title="مهمة"></span>'
                  : t.priority === 'low'    ? '<span class="prio prio-low" title="منخفضة"></span>' : '';

    const assist = DH.assist.detectAssist(t);

    return '' +
    '<article class="task-card' + (t.status === 'done' ? ' is-done' : '') +
      (di.key === 'overdue' ? ' is-overdue' : '') + '" data-tid="' + t.id + '" ' +
      'style="--sec-color:' + sec.color + '">' +

      '<div class="tc-main">' +
        '<button class="tc-check" data-act="toggle-done" data-tid="' + t.id + '" ' +
          'title="' + (t.status === 'done' ? 'إعادة إلى المهام' : 'تم (إكمال إجراء المتابعة)') + '">' +
          (t.status === 'done' ? '✓' : '') + '</button>' +

        '<div class="tc-body" data-act="expand" data-tid="' + t.id + '">' +
          '<div class="tc-title-row">' +
            prioDot +
            (t.size === 'large' ? '<span class="size-tag">كبيرة</span>' : '') +
            '<span class="tc-title">' + (t.title ? esc(t.title) : '(بلا عنوان)') + '</span>' +
          '</div>' +
          '<div class="tc-meta">' +
            '<span class="tc-sec" style="color:' + sec.color + '">' + sec.icon + ' ' + esc(sec.short) + '</span>' +
            (cat ? '<span class="tc-cat">' + esc(cat.name) + '</span>' : '') +
            '<span class="tc-due ' + di.cls + '">' + di.label + '</span>' +
            (t.repeat && t.repeat !== 'none' ? '<span class="tc-rep">🔁 ' + esc(lbl(REPEAT_LABEL, t.repeat, t.repeat)) + '</span>' : '') +
            (spent > 0 ? '<span class="tc-spent">⏱ ' + fmtDuration(spent) + '</span>' : '') +
          '</div>' +
        '</div>' +

        '<div class="tc-acts">' +
          (t.status !== 'done' ?
            '<button class="icon-btn sm' + (isTimer ? ' on' : '') + '" data-act="timer" data-tid="' + t.id +
              '" title="' + (isTimer ? 'مؤقت يعمل' : 'تشغيل المؤقت') + '">▶</button>' : '') +
          (assist ? '<button class="icon-btn sm assist-btn" data-act="assist" data-tid="' + t.id +
              '" title="' + esc(assist.label) + '">✨</button>' : '') +
          '<button class="icon-btn sm" data-act="edit" data-tid="' + t.id + '" title="تعديل">✏️</button>' +
        '</div>' +
      '</div>' +

      (expanded ? renderTaskDetail(t, assist) : '') +
    '</article>';
  }

  function renderTaskDetail(t, assist) {
    const st = S().state;
    const rows = [];
    const add = (l, v) => { if (v !== null && v !== undefined && String(v).trim() !== '') rows.push(
      '<div class="dt-row"><span>' + l + '</span><b>' + esc(v) + '</b></div>'); };

    add('الحالة', lbl(STATUS_LABEL, t.status, 'جديدة'));
    add('النوع', lbl(KIND_LABEL, t.kind, 'تنفيذية'));
    if (t.dueDate) add('تاريخ الاستحقاق', fmtDateAr(t.dueDate));
    if (t.kind === 'meeting' && t.meetingId) {
      const m = st.meetings.find(x => x.id === t.meetingId);
      if (m) { add('وقت الاجتماع', m.time ? fmtTimeAr(m.time) : ''); add('المدة', m.duration ? m.duration + ' دقيقة' : ''); }
    }
    add('العميل', t.client);
    add('المندوب', t.rep);
    add('الفرع', t.branch);
    add('الصنف', t.item);
    add('المبلغ', t.amount ? fmtAmount(t.amount) : '');
    add('الكمية', t.quantity);
    add('تاريخ السداد', t.duePayment ? fmtDateAr(t.duePayment) : '');
    add('المستودع/المشروع', t.repo);
    add('المشكلة', t.problem);
    add('التعديلات المطلوبة', t.changes);
    add('الاختبارات', t.tests);
    add('حالة البناء', t.buildStatus);
    add('الخطوة التالية', t.nextStep);
    add('ملاحظات', t.notes);

    const log = S().logForTask(t.id);
    const timeRows = log.slice(0, 5).map(e =>
      '<div class="dt-log-row"><span>' + esc(e.day) + '</span><b>' + fmtDuration(e.seconds) + '</b></div>').join('');

    return '' +
    '<div class="tc-detail">' +
      (rows.length ? '<div class="dt-rows">' + rows.join('') + '</div>' : '<p class="empty small">لا تفاصيل إضافية.</p>') +

      (t.status !== 'done' ?
        '<div class="dt-status-row">' +
          '<span class="dt-lbl">الحالة:</span>' +
          Object.keys(STATUS_LABEL).filter(k => k !== 'done').map(k =>
            '<button class="st-chip' + (t.status === k ? ' on' : '') + '" data-act="set-status" ' +
              'data-tid="' + t.id + '" data-status="' + k + '">' + STATUS_LABEL[k] + '</button>').join('') +
        '</div>' : '') +

      (timeRows ? '<div class="dt-time"><div class="dt-time-head">سجل الوقت</div>' + timeRows + '</div>' : '') +

      (t.aiAssist && t.aiAssist.draft ?
        '<div class="dt-draft"><div class="dt-draft-head">مسودة محفوظة <button class="link-btn" ' +
        'data-act="view-draft" data-tid="' + t.id + '">عرض</button></div></div>' : '') +

      '<div class="dt-actions">' +
        (assist ? '<button class="btn btn-ghost btn-sm" data-act="assist" data-tid="' + t.id + '">✨ جهّزها لي</button>' : '') +
        '<button class="btn btn-ghost btn-sm" data-act="edit" data-tid="' + t.id + '">تعديل كامل</button>' +
        (t.status === 'done'
          ? '<button class="btn btn-ghost btn-sm" data-act="toggle-done" data-tid="' + t.id + '">↩ إعادة للمهام</button>'
          : '') +
        '<button class="btn btn-danger-soft btn-sm" data-act="del" data-tid="' + t.id + '">حذف</button>' +
      '</div>' +
    '</div>';
  }

  /* ═══ قائمة المهام مع التجميع ═══════════════════════════════ */
  function filteredTasks() {
    const st = S().state;
    const f = view.filter;
    const today = S().todayISO();

    let list = st.tasks.filter(t => {
      if (t.canceled) return false;
      if (view.activeSection !== 'all' && t.sectionId !== view.activeSection) return false;
      if (f.priority !== 'all' && t.priority !== f.priority) return false;

      const di = dueInfo(t);
      if (f.status === 'open'    && t.status === 'done') return false;
      if (f.status === 'done'    && t.status !== 'done') return false;
      if (f.status === 'overdue' && di.key !== 'overdue') return false;
      if (f.status === 'today'   && di.key !== 'today') return false;

      if (f.dueRange === 'week') {
        if (!t.dueDate) return false;
        const d = S().daysBetween(today, t.dueDate);
        if (d < 0 || d > 7) return false;
      }
      if (f.dueRange === 'month') {
        if (!t.dueDate) return false;
        const d = S().daysBetween(today, t.dueDate);
        if (d < 0 || d > 31) return false;
      }
      if (f.dueRange === 'none' && t.dueDate) return false;

      if (f.search) {
        const q = DH.ai.normalize(f.search);
        const hay = DH.ai.normalize([t.title, t.notes, t.client, t.rep, t.item, t.branch,
          t.problem, t.repo, (S().catById(t.categoryId) || {}).name || ''].join(' '));
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    return sortTasks(list);
  }

  function renderTasks() {
    const list = filteredTasks();
    const open = list.filter(t => t.status !== 'done');
    const done = list.filter(t => t.status === 'done');

    let html = '<section class="tasks-sec" id="tasks-sec">';

    if (!open.length && !done.length) {
      html += '<div class="empty-state"><div class="empty-ico">📋</div>' +
        '<p>لا توجد مهام مطابقة.</p>' +
        '<button class="btn btn-primary btn-sm" id="btn-empty-add">+ إضافة مهمة</button></div>';
    }

    // تجميع حسب حالة الموعد
    const groups = [
      { key:'overdue', label:'متأخرة', cls:'g-overdue', items: open.filter(t => dueInfo(t).key === 'overdue') },
      { key:'today',   label:'اليوم',   cls:'g-today',   items: open.filter(t => dueInfo(t).key === 'today') },
      { key:'soon',    label:'قادمة',   cls:'g-soon',    items: open.filter(t => ['tomorrow','soon','later'].includes(dueInfo(t).key)) },
      { key:'none',    label:'بدون موعد', cls:'g-none',  items: open.filter(t => dueInfo(t).key === 'none') }
    ];

    groups.forEach(g => {
      if (!g.items.length) return;
      html += '<div class="task-group ' + g.cls + '">' +
        '<div class="tg-head"><span class="tg-label">' + g.label + '</span>' +
        '<span class="tg-count">' + g.items.length + '</span></div>' +
        g.items.map(taskCard).join('') + '</div>';
    });

    if (done.length) {
      html += '<div class="task-group g-done">' +
        '<div class="tg-head"><span class="tg-label">منجزة</span>' +
        '<span class="tg-count">' + done.length + '</span></div>' +
        done.slice(0, 30).map(taskCard).join('') + '</div>';
    }

    html += '</section>';
    return html;
  }

  /* ═══ «أقدر أساعدك فيها» ════════════════════════════════════ */
  function renderAssist() {
    const st = S().state;
    const open = st.tasks.filter(t => t.status !== 'done' && !t.canceled);
    const items = DH.assist.assistableTasks(open).slice(0, 8);

    if (!items.length) {
      return '' +
      '<section class="assist-sec">' +
        '<div class="sec-head"><h3>✨ أقدر أساعدك فيها</h3></div>' +
        '<p class="empty small">لا توجد حاليًا مهام يظهر فيها عمل يمكنني تجهيزه. ' +
        'عند إضافة مهمة مثل «تعميم للمندوبين» أو «برومبت لإصلاح مشكلة» سيظهر زر «جهّزها لي» هنا وفي بطاقة المهمة.</p>' +
      '</section>';
    }

    return '' +
    '<section class="assist-sec">' +
      '<div class="sec-head"><h3>✨ أقدر أساعدك فيها</h3>' +
      '<span class="sec-sub">' + items.length + ' مهمة</span></div>' +
      '<div class="assist-list">' +
        items.map(({ task, assist }) => {
          const sec = S().sectionById(task.sectionId) || { short:'—', color:'#888' };
          return '' +
          '<article class="assist-card" style="--sec-color:' + sec.color + '">' +
            '<div class="ac-body">' +
              '<div class="ac-type"><span class="ac-ico">' + assist.icon + '</span>' +
                '<span class="ac-lbl">' + esc(assist.label) + '</span></div>' +
              '<div class="ac-task">' + esc(task.title) + '</div>' +
            '</div>' +
            '<button class="btn btn-primary btn-sm ac-go" data-act="assist" data-tid="' + task.id + '">جهّزها لي</button>' +
          '</article>';
        }).join('') +
      '</div>' +
    '</section>';
  }

  /* ═══ شريط التذكيرات ════════════════════════════════════════ */
  function renderReminderBanner() {
    const st = S().state;
    if (!st.settings.remindersEnabled) return '';

    const today = S().todayISO();
    const open = st.tasks.filter(t => t.status !== 'done' && !t.canceled);
    const overdue = open.filter(t => dueInfo(t).key === 'overdue');
    const todayT = open.filter(t => dueInfo(t).key === 'today');
    const meets = S().meetingsOn(today);

    const parts = [];
    if (st.settings.reminderOverdue && overdue.length) parts.push(overdue.length + ' مهمة متأخرة');
    if (st.settings.reminderToday && todayT.length) parts.push(todayT.length + ' مهمة اليوم');
    if (st.settings.reminderMeetings && meets.length) parts.push(meets.length + ' اجتماع اليوم');

    if (!parts.length) return '';

    const notifOk = DH.calendar.notifier.isGranted();
    return '' +
    '<div class="reminder-banner' + (overdue.length ? ' has-overdue' : '') + '">' +
      '<span class="rb-ico">🔔</span>' +
      '<span class="rb-text">' + parts.join(' • ') + '</span>' +
      (notifOk ? '' : '<button class="link-btn" id="rb-enable">تشغيل الإشعارات</button>') +
    '</div>';
  }

  /* ═══ «أُنجزت اليوم» ═════════════════════════════════════════ */
  function renderDoneToday() {
    const st = S().state;
    const today = S().todayISO();
    const doneToday = st.tasks.filter(t =>
      t.status === 'done' && t.completedAt && t.completedAt.slice(0, 10) === today);

    const totalTime = doneToday.reduce((s, t) => s + S().totalForTask(t.id), 0);

    return '' +
    '<section class="done-sec" id="done-sec">' +
      '<button class="done-head" id="btn-toggle-done">' +
        '<span class="dh-left">' +
          '<span class="dh-ico">🏆</span>' +
          '<span class="dh-title">أُنجزت اليوم</span>' +
          '<span class="dh-count">' + doneToday.length + '</span>' +
          (totalTime > 0 ? '<span class="dh-time">⏱ ' + fmtDuration(totalTime) + '</span>' : '') +
        '</span>' +
        '<span class="dh-chev' + (view.showDone ? ' open' : '') + '">▾</span>' +
      '</button>' +
      (view.showDone ? (
        doneToday.length
          ? '<div class="done-list">' + doneToday.map(taskCard).join('') + '</div>'
          : '<p class="empty small">لم تُنجز مهام اليوم بعد.</p>'
      ) : '') +
    '</section>';
  }

  /* ═══ العرض الكامل ══════════════════════════════════════════ */
  function render() {
    const app = document.getElementById('app');
    const scrollY = window.scrollY;

    app.innerHTML =
      renderHeader() +
      '<main class="app-main">' +
        renderReminderBanner() +
        renderCapture() +
        renderPendingReview() +
        renderActiveTimer() +
        renderMeetings() +
        '<section class="tasks-wrap" id="tasks-anchor">' +
          renderTabs() +
          renderFilters() +
          renderTasks() +
        '</section>' +
        renderAssist() +
        renderDoneToday() +
      '</main>' +
      '<nav class="bottom-bar">' +
        '<button class="bb-item" id="bb-add"><span>＋</span><b>مهمة</b></button>' +
        '<button class="bb-item" id="bb-meeting"><span>🗓️</span><b>اجتماع</b></button>' +
        '<button class="bb-item" id="bb-time"><span>⏱</span><b>الوقت</b></button>' +
        '<button class="bb-item" id="bb-search"><span>🔍</span><b>بحث</b></button>' +
      '</nav>';

    bindEvents();
    window.scrollTo(0, scrollY);
  }

  /* ═══ الأحداث ═══════════════════════════════════════════════ */
  let searchTimer = null;

  function bindEvents() {
    const app = document.getElementById('app');

    // ── الترويسة
    on(app, '#btn-theme', 'click', toggleTheme);
    on(app, '#btn-settings', 'click', openSettings);
    app.querySelectorAll('[data-jump]').forEach(el => {
      el.onclick = () => {
        const j = el.dataset.jump;
        if (j === 'overdue') { view.filter.status = 'overdue'; view.filter.search = ''; }
        else if (j === 'today') { view.filter.status = 'today'; view.filter.search = ''; }
        else if (j === 'done') { view.showDone = true; }
        else if (j === 'meetings') {
          const m = document.getElementById('meetings-sec');
          if (m) m.scrollIntoView({ behavior:'smooth', block:'start' });
          return;
        }
        render();
        const t = document.getElementById('tasks-anchor');
        if (t && j !== 'done') t.scrollIntoView({ behavior:'smooth', block:'start' });
      };
    });
    on(app, '#open-time', 'click', openTimeLog);

    // ── الإملاء
    on(app, '#btn-mic', 'click', startDictation);
    on(app, '#btn-manual', 'click', () => openTaskEditor(null));
    on(app, '#btn-analyze', 'click', analyzeInput);
    const cap = document.getElementById('capture-input');
    if (cap) {
      cap.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); analyzeInput(); }
      });
    }

    // ── المراجعة
    on(app, '#rv-cancel', 'click', () => { view.pendingTasks = null; render(); });
    on(app, '#rv-save', 'click', savePending);
    app.querySelectorAll('.rv-card').forEach(card => {
      const idx = +card.dataset.idx;
      card.querySelectorAll('[data-field]').forEach(el => {
        el.addEventListener('change', () => {
          const f = el.dataset.field, t = view.pendingTasks[idx];
          if (f === 'timeHint') {
            t._meta = t._meta || {};
            t._meta.period = el.value;
          } else if (f === 'sectionId') {
            t.sectionId = el.value;
            t.categoryId = null;
            // أعد بناء التصنيفات لهذا القسم
            render();
          } else if (f === 'dueDate') {
            t.dueDate = el.value || null;
          } else {
            t[f] = el.value;
          }
        });
      });
      const del = card.querySelector('[data-act="del"]');
      if (del) del.onclick = () => {
        view.pendingTasks.splice(idx, 1);
        render();
      };
    });

    // ── المؤقت النشط
    on(app, '#t-pause', 'click', () => { S().pauseTimer(); render(); });
    on(app, '#t-resume', 'click', () => { S().resumeTimer(); render(); });
    on(app, '#t-stop', 'click', stopActiveTimer);
    on(app, '#t-open', 'click', () => {
      const t = S().state.activeTimer;
      if (t) { view.expandedTask = t.taskId; view.filter.status = 'all'; render(); }
    });

    // ── التبويبات والمرشحات
    app.querySelectorAll('.tab[data-sec]').forEach(el => {
      el.onclick = () => { view.activeSection = el.dataset.sec; render(); };
    });
    on(app, '#btn-manage-sec', 'click', openSectionManager);

    const fs = document.getElementById('flt-search');
    if (fs) {
      fs.addEventListener('input', () => {
        view.filter.search = fs.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          const pos = fs.selectionStart;
          render();
          const nf = document.getElementById('flt-search');
          if (nf) { nf.focus(); nf.setSelectionRange(pos, pos); }
        }, 280);
      });
    }
    on(app, '#flt-status', 'change', e => { view.filter.status = e.target.value; render(); });
    on(app, '#flt-priority', 'change', e => { view.filter.priority = e.target.value; render(); });
    on(app, '#flt-range', 'change', e => { view.filter.dueRange = e.target.value; render(); });

    // ── بطاقات المهام
    app.querySelectorAll('[data-act]').forEach(el => {
      const act = el.dataset.act;
      const tid = el.dataset.tid;
      const mid = el.dataset.mid;
      el.onclick = (ev) => {
        ev.stopPropagation();
        switch (act) {
          case 'toggle-done': toggleDone(tid); break;
          case 'expand': view.expandedTask = (view.expandedTask === tid ? null : tid); render(); break;
          case 'timer': handleTimer(tid); break;
          case 'edit': openTaskEditor(tid); break;
          case 'del': deleteTaskFlow(tid); break;
          case 'assist': openAssistFlow(tid); break;
          case 'set-status': S().updateTask(tid, { status: el.dataset.status }); render(); break;
          case 'view-draft': showSavedDraft(tid); break;
          case 'edit-meeting': openMeetingEditor(mid); break;
          case 'del-meeting': deleteMeetingFlow(mid); break;
        }
      };
    });

    // ── الاجتماعات
    on(app, '#btn-new-meeting', 'click', () => openMeetingEditor(null));

    // ── أُنجزت اليوم
    on(app, '#btn-toggle-done', 'click', () => { view.showDone = !view.showDone; render(); });

    // ── الشريط السفلي
    on(app, '#bb-add', 'click', () => openTaskEditor(null));
    on(app, '#bb-meeting', 'click', () => openMeetingEditor(null));
    on(app, '#bb-time', 'click', openTimeLog);
    on(app, '#bb-search', 'click', () => {
      const f = document.getElementById('flt-search');
      if (f) { f.focus(); f.scrollIntoView({ behavior:'smooth', block:'center' }); }
    });

    on(app, '#rb-enable', 'click', enableNotifications);
    on(app, '#btn-empty-add', 'click', () => openTaskEditor(null));
  }

  function on(root, sel, evt, fn) {
    const el = root.querySelector(sel);
    if (el) el.addEventListener(evt, fn);
  }

  /* ═══ الإملاء الصوتي ════════════════════════════════════════ */
  let recognition = null, listening = false;

  function startDictation() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const note = document.getElementById('mic-note');
    const btn = document.getElementById('btn-mic');

    if (!SR) {
      if (note) note.textContent = 'الإملاء الصوتي غير مدعوم في هذا المتصفح. ' +
        'استخدم مايك لوحة مفاتيح هاتفك (زر المايك في الكيبورد) داخل مربع الكتابة — يعمل تمامًا.';
      const cap = document.getElementById('capture-input');
      if (cap) cap.focus();
      return;
    }
    if (listening) {
      try { recognition.stop(); } catch (e) {}
      return;
    }

    recognition = new SR();
    recognition.lang = 'ar-YE';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let base = (document.getElementById('capture-input') || {}).value || '';

    recognition.onstart = () => {
      listening = true;
      if (btn) { btn.textContent = '⏹ إيقاف'; btn.classList.add('rec'); }
      if (note) note.textContent = '🎙️ جاري الاستماع… تحدّث بشكل طبيعي.';
    };

    recognition.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += tr + ' ، ';
        else interim += tr;
      }
      const cap = document.getElementById('capture-input');
      if (cap) {
        if (final) base = (base ? base + ' ' : '') + final;
        cap.value = base + interim;
      }
    };

    recognition.onerror = (e) => {
      listening = false;
      if (btn) { btn.textContent = '🎤 إملاء'; btn.classList.remove('rec'); }
      const msgs = {
        'not-allowed': 'لم يُمنح إذن المايكروفون. اسمح بالوصول من إعدادات المتصفح، ' +
                       'أو استخدم مايك لوحة المفاتيح داخل مربع الكتابة.',
        'no-speech': 'لم يُسمع صوت. حاول مرة أخرى أو استخدم مايك الكيبورد.',
        'network': 'تعذّر الوصول لخدمة التعرف على الصوت. اكتب النص أو استخدم مايك الكيبورد.',
        'aborted': ''
      };
      if (note) note.textContent = msgs[e.error] || ('تعذّر الإملاء: ' + e.error + '. يمكنك الكتابة يدويًا.');
    };

    recognition.onend = () => {
      listening = false;
      if (btn) { btn.textContent = '🎤 إملاء'; btn.classList.remove('rec'); }
      if (note && note.textContent.indexOf('جاري') > -1) {
        note.textContent = 'توقف الاستماع. اضغط «تحليل» لمعالجة النص.';
      }
    };

    try { recognition.start(); }
    catch (e) {
      if (note) note.textContent = 'تعذّر بدء الإملاء. استخدم مايك لوحة المفاتيح داخل مربع الكتابة.';
    }
  }

  /* ═══ التحليل ═══════════════════════════════════════════════ */
  async function analyzeInput() {
    const cap = document.getElementById('capture-input');
    const note = document.getElementById('mic-note');
    const btn = document.getElementById('btn-analyze');
    const text = cap ? cap.value.trim() : '';

    if (!text) {
      if (note) note.textContent = 'اكتب أو أملِ مهامك أولًا.';
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '… يحلل'; }
    if (note) note.textContent = '';

    let result;
    try {
      result = await DH.ai.parse(text);
    } catch (e) {
      result = DH.ai.parseLocal(text);
      result.error = e.message;
    }

    if (btn) { btn.disabled = false; btn.textContent = 'تحليل ←'; }

    if (!result.tasks || !result.tasks.length) {
      if (note) note.textContent = 'لم أستخرج مهامًا واضحة من النص. عدّل الصياغة أو أضف يدويًا.';
      return;
    }

    view.pendingTasks = result.tasks;
    render();

    if (note) {
      if (result.fellBack) {
        note.textContent = 'تعذّر الوصول لخدمة الذكاء الاصطناعي (' + (result.reason || '') +
          ') — تم التحليل محليًا على جهازك. راجع النتائج.';
      } else if (result.engine === 'ai') {
        note.textContent = 'حُلّلت ' + result.tasks.length + ' مهمة عبر خدمة الذكاء الاصطناعي.';
      } else {
        note.textContent = 'حُلّلت ' + result.tasks.length + ' مهمة محليًا على جهازك (بدون إرسال أي بيانات).';
      }
    }
    const rv = document.getElementById('review-wrap');
    if (rv) rv.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function savePending() {
    if (!view.pendingTasks || !view.pendingTasks.length) return;
    let saved = 0;
    view.pendingTasks.forEach(t => {
      const clean = Object.assign({}, t);
      delete clean._meta;
      if (!clean.title || !clean.title.trim()) return;
      // دمج الوقت المقترح في الملاحظات
      const period = t._meta && t._meta.period;
      if (period) {
        const timeLine = 'الوقت المقترح: ' + fmtTimeAr(period);
        clean.notes = clean.notes ? (clean.notes.indexOf('الوقت المقترح') > -1 ? clean.notes : timeLine + '\n' + clean.notes) : timeLine;
      }
      S().addTask(clean);
      saved++;
    });
    const cap = document.getElementById('capture-input');
    if (cap) cap.value = '';
    view.pendingTasks = null;
    render();
    toast('تم حفظ ' + saved + ' مهمة ✓', 'ok');
    const fn = document.getElementById('mic-note');
    if (fn) fn.textContent = '';
  }

  /* ═══ المهام ════════════════════════════════════════════════ */
  function toggleDone(id) {
    const t = S().getTask(id);
    if (!t) return;
    if (t.status === 'done') {
      S().reopenTask(id);
      toast('أُعيدت المهمة إلى قائمة المهام', 'ok');
    } else {
      S().completeTask(id);
      const isCollect = t.categoryId === 'cat_collect';
      toast(isCollect ? 'سُجّل إكمال إجراء المتابعة ✓ (لا يعني سداد المبلغ)' : 'أُنجزت المهمة ✓', 'ok');
    }
    render();
  }

  function handleTimer(id) {
    const st = S().state;
    if (st.activeTimer && st.activeTimer.taskId === id) {
      stopActiveTimer();
      return;
    }
    if (st.activeTimer) {
      const other = S().getTask(st.activeTimer.taskId);
      toast('يوجد مؤقت يعمل على: ' + (other ? other.title : 'مهمة أخرى') + '. أوقفه أولًا.', 'warn',
        'إيقافه', () => { stopActiveTimer(); });
      return;
    }
    const r = S().startTimer(id);
    if (r && r.error) { toast(r.error, 'warn'); return; }
    render();
    toast('بدأ المؤقت', 'ok');
  }

  async function stopActiveTimer() {
    const r = S().stopTimer();
    render();
    if (r && r.seconds >= 1) toast('سُجّل ' + fmtDuration(r.seconds) + ' على المهمة', 'ok');
  }

  async function deleteTaskFlow(id) {
    const t = S().getTask(id);
    if (!t) return;

    const linkedMeeting = t.meetingId ? S().state.meetings.find(m => m.id === t.meetingId) : null;
    let opts = null, title = 'حذف المهمة؟', body = t.title;

    if (linkedMeeting) {
      opts = [
        { value: 'task_only', label: 'حذف المهمة من الدفتر فقط (يبقى الاجتماع)' },
        { value: 'both', label: 'حذف الاجتماع من الدفتر أيضًا' + (linkedMeeting.calendarEventId ? ' ومن Google Calendar' : '') }
      ];
      body = 'هذه المهمة مرتبطة باجتماع: «' + linkedMeeting.title + '».';
    }

    const answer = await confirmDialog({
      title, body, danger: true, okText: 'حذف',
      options: opts
    });
    if (!answer) return;

    if (linkedMeeting) {
      if (answer === 'both') {
        if (linkedMeeting.calendarEventId && DH.calendar.gcal.connected) {
          const sure = await confirmDialog({
            title: 'حذف من Google Calendar أيضًا؟',
            body: 'سيُحذف الحدث «' + linkedMeeting.title + '» من تقويم Google نهائيًا. لا يمكن التراجع.',
            danger: true, okText: 'نعم، احذف من التقويم'
          });
          if (sure) {
            const res = await DH.calendar.deleteEvent(linkedMeeting);
            if (!res.ok) toast('تعذّر الحذف من التقويم: ' + (res.message || ''), 'warn');
          }
        }
        const snap = S().deleteMeeting(linkedMeeting.id);
        render();
        toast('حُذف الاجتماع والمهمة', 'ok', 'تراجع', () => {
          if (snap) { S().state.meetings.splice(snap.index, 0, snap.meeting); S().addTask(t); render(); }
        });
        return;
      }
      // حذف المهمة فقط مع فصلها عن الاجتماع
      S().updateMeeting(linkedMeeting.id, { taskId: null });
      const snap = S().deleteTask(id);
      render();
      toast('حُذفت المهمة، والاجتماع باقٍ', 'ok', 'تراجع', () => {
        S().restoreTask(snap); S().updateMeeting(linkedMeeting.id, { taskId: id }); render();
      });
      return;
    }

    const snap = S().deleteTask(id);
    render();
    toast('حُذفت المهمة', 'ok', 'تراجع', () => {
      S().restoreTask(snap);
      render();
    });
  }

  /* ═══ محرر المهمة الكامل ════════════════════════════════════ */
  async function openTaskEditor(id) {
    const st = S().state;
    const t = id ? S().getTask(id) : null;

    const fields = [
      { name:'title', label:'العنوان', value: t ? t.title : '', placeholder:'مثال: مراجعة حسابات العملاء المتأخرين' },
      { name:'sectionId', label:'القسم', type:'select', value: t ? t.sectionId : (view.activeSection !== 'all' ? view.activeSection : 'sec_work'),
        options: st.sections.map(s => ({ value:s.id, label:s.name })) },
      { name:'categoryId', label:'التصنيف', type:'select', value: t ? (t.categoryId||'') : '',
        options:[{ value:'', label:'— بدون —' }].concat(
          S().catsFor(t ? t.sectionId : (view.activeSection !== 'all' ? view.activeSection : 'sec_work'))
            .map(c => ({ value:c.id, label:c.name }))) },
      { name:'dueDate', label:'تاريخ الاستحقاق', type:'date', value: t && t.dueDate ? t.dueDate : '' },
      { name:'priority', label:'الأولوية', type:'select', value: t ? t.priority : 'normal',
        options: Object.keys(PRIORITY_LABEL).map(k => ({ value:k, label:PRIORITY_LABEL[k] })) },
      { name:'size', label:'حجم المهمة', type:'select', value: t ? t.size : 'small',
        options:[{value:'small',label:'صغيرة'},{value:'large',label:'كبيرة'}] },
      { name:'kind', label:'النوع', type:'select', value: t ? t.kind : 'task',
        options: Object.keys(KIND_LABEL).map(k => ({ value:k, label:KIND_LABEL[k] })) },
      { name:'repeat', label:'التكرار', type:'select', value: t ? t.repeat : 'none',
        options: Object.keys(REPEAT_LABEL).map(k => ({ value:k, label:REPEAT_LABEL[k] })) },
      { name:'status', label:'الحالة', type:'select', value: t ? t.status : 'open',
        options: Object.keys(STATUS_LABEL).map(k => ({ value:k, label:STATUS_LABEL[k] })) },
      { name:'client', label:'اسم العميل (اختياري)', value: t ? t.client : '' },
      { name:'rep', label:'المندوب / الموزع (اختياري)', value: t ? t.rep : '' },
      { name:'branch', label:'الفرع (اختياري)', value: t ? t.branch : '' },
      { name:'item', label:'الصنف (اختياري)', value: t ? t.item : '' },
      { name:'amount', label:'المبلغ (اختياري)', type:'number', value: t && t.amount != null ? t.amount : '' },
      { name:'quantity', label:'الكمية (اختياري)', type:'number', value: t && t.quantity != null ? t.quantity : '' },
      { name:'duePayment', label:'تاريخ السداد (اختياري)', type:'date', value: t && t.duePayment ? t.duePayment : '' },
      { name:'repo', label:'المستودع / المشروع (تقني)', value: t ? t.repo : '' },
      { name:'problem', label:'المشكلة (تقني)', type:'textarea', rows:2, value: t ? t.problem : '' },
      { name:'changes', label:'التعديلات المطلوبة', type:'textarea', rows:2, value: t ? t.changes : '' },
      { name:'tests', label:'الاختبارات المطلوبة', type:'textarea', rows:2, value: t ? t.tests : '' },
      { name:'buildStatus', label:'حالة البناء والنشر', value: t ? t.buildStatus : '' },
      { name:'nextStep', label:'الخطوة التالية', value: t ? t.nextStep : '' },
      { name:'notes', label:'ملاحظات', type:'textarea', rows:3, value: t ? t.notes : '' }
    ];

    const out = await promptDialog({
      title: t ? 'تعديل المهمة' : 'مهمة جديدة',
      okText: t ? 'حفظ التعديل' : 'إضافة',
      fields
    });
    if (!out) return;

    if (!out.title || !out.title.trim()) { toast('العنوان مطلوب', 'warn'); return; }

    const patch = {
      title: out.title.trim(),
      sectionId: out.sectionId,
      categoryId: out.categoryId || null,
      dueDate: out.dueDate || null,
      priority: out.priority, size: out.size, kind: out.kind,
      repeat: out.repeat, status: out.status,
      client: out.client, rep: out.rep, branch: out.branch, item: out.item,
      amount: out.amount === '' ? null : parseFloat(out.amount),
      quantity: out.quantity === '' ? null : parseFloat(out.quantity),
      duePayment: out.duePayment || null,
      repo: out.repo, problem: out.problem, changes: out.changes,
      tests: out.tests, buildStatus: out.buildStatus, nextStep: out.nextStep,
      notes: out.notes
    };

    if (t) {
      S().updateTask(t.id, patch);
      toast('حُفظت التعديلات ✓', 'ok');
    } else {
      S().addTask(patch);
      toast('أُضيفت المهمة ✓', 'ok');
    }
    render();
  }

  /* ═══ المسودات ══════════════════════════════════════════════ */
  async function openAssistFlow(taskId) {
    const t = S().getTask(taskId);
    if (!t) return;
    let type = DH.assist.detectAssist(t);

    // إن لم نكتشف نوعًا، اعرض قائمة اختيار
    if (!type) {
      const opts = DH.assist.typesFor(t.sectionId);
      if (!opts.length) { toast('لا توجد أنواع مساعدة لهذا القسم', 'warn'); return; }
      const pick = await promptDialog({
        title:'ماذا تريد أن أجهّز؟',
        okText:'متابعة',
        fields: [{ name:'type', label:'نوع المساعدة', type:'select', value: opts[0].id,
          options: opts.map(o => ({ value:o.id, label:o.label })) }]
      });
      if (!pick) return;
      type = opts.find(o => o.id === pick.type);
    }

    // اجمع التفاصيل المتوفرة من المهمة، واطلب الناقص إملاءً
    const ctx = await promptDialog({
      title: '✨ ' + type.label,
      body: 'املأ ما تعرفه — اترك الباقي فارغًا وسأضع حقولًا بين أقواس يذكرها سطر «أحتاج منك:». ' +
            'لن أختلق أي اسم أو رقم أو تاريخ.',
      okText: 'ولّد المسودة',
      fields: buildAssistFields(type.id, t)
    });
    if (!ctx) return;

    // دمج بيانات المهمة كأساس
    const merged = Object.assign({}, ctx, {
      taskTitle: t.title,
      clientName: ctx.clientName || t.client || '',
      repo: ctx.repo || t.repo || '',
      problem: ctx.problem || t.problem || t.title,
      tests: ctx.tests || t.tests || '',
      branch: ctx.branch || '',
      dateLabel: S().todayISO()
    });

    const res = DH.assist.generate(type.id, merged);
    if (res.error) { toast(res.error, 'error'); return; }

    const saved = DH.assist.copyToClipboard(res.draft);

    await showDraftDialog(res, t, saved, type);
  }

  function buildAssistFields(typeId, task) {
    const F = {
      letter_staff: [
        { name:'staffName', label:'اسم الموظف أو الفئة المستهدفة', value:'' },
        { name:'subject', label:'الموضوع / السبب', value:task.title },
        { name:'body', label:'نص الموضوع (اختياري)', type:'textarea', rows:3 },
        { name:'demand', label:'المطلوب من الموظف', type:'textarea', rows:2 },
        { name:'deadline', label:'مهلة التنفيذ', value:task.dueDate || '' }
      ],
      circular_reps: [
        { name:'subject', label:'موضوع التعميم', value:task.title },
        { name:'demand', label:'التعليمات المطلوبة', type:'textarea', rows:3 },
        { name:'period', label:'الفترة الزمنية' },
        { name:'region', label:'المنطقة أو الفرع', value: task.branch || '' }
      ],
      collection_msg: [
        { name:'clientName', label:'اسم العميل', value: task.client || '' },
        { name:'amount', label:'المبلغ المستحق', type:'number', value: task.amount != null ? task.amount : '' },
        { name:'duePayment', label:'تاريخ استحقاق المبلغ', type:'date', value: task.duePayment || '' },
        { name:'payMethod', label:'طريقة السداد المقترحة' }
      ],
      sales_report: [
        { name:'period', label:'الفترة التي يغطيها التقرير' },
        { name:'scope', label:'الفرع أو المندوب', value: task.rep || task.branch || '' },
        { name:'numbers', label:'أرقام المبيعات الفعلية من نظامك', type:'textarea', rows:3 }
      ],
      agenda: [
        { name:'subject', label:'موضوع الاجتماع', value: task.title },
        { name:'meetingDate', label:'تاريخ الاجتماع', type:'date', value: task.dueDate || '' },
        { name:'meetingTime', label:'وقت الاجتماع', type:'time' },
        { name:'duration', label:'المدة المقررة (بالدقائق)' },
        { name:'place', label:'المكان' },
        { name:'people', label:'الحاضرون' },
        { name:'decisions', label:'القرارات المطلوبة', type:'textarea', rows:2 }
      ],
      email: [
        { name:'recipient', label:'الجهة المرسل إليها' },
        { name:'subject', label:'موضوع البريد', value: task.title },
        { name:'body', label:'نص الرسالة (اختياري)', type:'textarea', rows:3 },
        { name:'demand', label:'الطلب الأساسي', type:'textarea', rows:2 },
        { name:'deadline', label:'المهلة' }
      ],
      followup_list: [
        { name:'subject', label:'موضوع المتابعة', value: task.title },
        { name:'scope', label:'نطاق المتابعة' }
      ],
      plan: [
        { name:'goal', label:'الهدف', value: task.title },
        { name:'duration', label:'المدة الزمنية' },
        { name:'resources', label:'الموارد المتاحة', type:'textarea', rows:2 },
        { name:'success', label:'معايير النجاح' }
      ],
      bug_prompt: [
        { name:'repo', label:'المشروع / المستودع', value: task.repo || '' },
        { name:'branch', label:'الفرع' },
        { name:'env', label:'بيئة التشغيل والنسخ', value: task.buildStatus || '' },
        { name:'problem', label:'وصف المشكلة', type:'textarea', rows:3, value: task.problem || task.title },
        { name:'steps', label:'خطوات إعادة الإنتاج', type:'textarea', rows:3 },
        { name:'files', label:'الملفات المتوقعة', type:'textarea', rows:2 },
        { name:'tests', label:'الاختبارات المطلوبة', type:'textarea', rows:2, value: task.tests || '' }
      ],
      fix_plan: [
        { name:'problem', label:'المشكلة', type:'textarea', rows:3, value: task.problem || task.title },
        { name:'files', label:'الملفات المحتملة', type:'textarea', rows:2 },
        { name:'tests', label:'الاختبارات', type:'textarea', rows:2, value: task.tests || '' }
      ],
      release_note: [
        { name:'version', label:'رقم الإصدار' },
        { name:'changes', label:'التغييرات', type:'textarea', rows:4 }
      ],
      daily_plan: [
        { name:'focus', label:'الأعمال الأساسية', type:'textarea', rows:3 },
        { name:'availableTime', label:'الوقت المتاح فعليًا' }
      ]
    };
    return F[typeId] || [{ name:'notes', label:'تفاصيل', type:'textarea', rows:4 }];
  }

  async function showDraftDialog(res, task, copied, type) {
    const modal = document.getElementById('modal');
    modal.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-sheet modal-draft">' +
        '<div class="draft-head">' +
          '<h3>' + esc(type.icon + ' ' + type.label) + '</h3>' +
          '<p class="draft-sub">مرتبطة بـ: ' + esc(task.title) + '</p>' +
          (copied ? '<span class="copied-badge">نُسخت للحافظة ✓</span>' : '') +
        '</div>' +
        '<div class="draft-meta">' +
          (res.missing.length
            ? '<span class="dm-warn">⚠ ' + res.missing.length + ' معلومة ناقصة مذكورة في نهاية المسودة</span>'
            : '<span class="dm-ok">✓ كل البيانات الأساسية متوفرة</span>') +
        '</div>' +
        '<textarea class="draft-editor" id="draft-text" rows="16" dir="rtl"></textarea>' +
        '<div class="modal-actions draft-actions">' +
          '<button class="btn btn-ghost" data-act="close">إغلاق</button>' +
          '<button class="btn btn-ghost" data-act="copy">📋 نسخ</button>' +
          '<button class="btn btn-primary" data-act="save">💾 حفظ في المهمة</button>' +
        '</div>' +
      '</div>';
    modal.classList.add('open');
    const ta = document.getElementById('draft-text');
    ta.value = res.draft;

    const close = () => { modal.classList.remove('open'); modal.innerHTML = ''; };

    modal.querySelector('[data-act="close"]').onclick = close;
    modal.querySelector('.modal-backdrop').onclick = close;
    modal.querySelector('[data-act="copy"]').onclick = async () => {
      const ok = await DH.assist.copyToClipboard(ta.value);
      toast(ok ? 'نُسخت المسودة ✓' : 'تعذّر النسخ — حدّد النص يدويًا', ok ? 'ok' : 'warn');
    };
    modal.querySelector('[data-act="save"]').onclick = () => {
      const existing = S().getTask(task.id);
      const drafts = (existing && existing.aiAssist && existing.aiAssist.drafts) ? existing.aiAssist.drafts : [];
      drafts.unshift({
        type: res.type, label: res.label, draft: ta.value,
        missing: res.missing, createdAt: new Date().toISOString()
      });
      S().updateTask(task.id, { aiAssist: { type: res.type, label: res.label, draft: ta.value, drafts: drafts.slice(0, 10) } });
      close();
      render();
      toast('حُفظت المسودة في المهمة ✓', 'ok');
    };
  }

  function showSavedDraft(taskId) {
    const t = S().getTask(taskId);
    if (!t || !t.aiAssist) return;
    const a = t.aiAssist;
    const modal = document.getElementById('modal');
    modal.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-sheet modal-draft">' +
        '<div class="draft-head"><h3>' + esc(a.label || 'مسودة محفوظة') + '</h3>' +
          '<p class="draft-sub">' + esc(t.title) + '</p></div>' +
        '<textarea class="draft-editor" id="draft-text" rows="16" dir="rtl"></textarea>' +
        '<div class="modal-actions draft-actions">' +
          '<button class="btn btn-ghost" data-act="close">إغلاق</button>' +
          '<button class="btn btn-ghost" data-act="copy">📋 نسخ</button>' +
          '<button class="btn btn-primary" data-act="save">💾 حفظ التعديلات</button>' +
        '</div>' +
      '</div>';
    modal.classList.add('open');
    const ta = document.getElementById('draft-text');
    ta.value = a.draft || '';
    const close = () => { modal.classList.remove('open'); modal.innerHTML = ''; };
    modal.querySelector('[data-act="close"]').onclick = close;
    modal.querySelector('.modal-backdrop').onclick = close;
    modal.querySelector('[data-act="copy"]').onclick = async () => {
      const ok = await DH.assist.copyToClipboard(ta.value);
      toast(ok ? 'نُسخت ✓' : 'تعذّر النسخ', ok ? 'ok' : 'warn');
    };
    modal.querySelector('[data-act="save"]').onclick = () => {
      S().updateTask(t.id, { aiAssist: Object.assign({}, a, { draft: ta.value }) });
      close(); render(); toast('حُفظت ✓', 'ok');
    };
  }

  /* ═══ الاجتماعات ════════════════════════════════════════════ */
  async function openMeetingEditor(id) {
    const st = S().state;
    const m = id ? st.meetings.find(x => x.id === id) : null;

    const out = await promptDialog({
      title: m ? 'تعديل الاجتماع' : 'اجتماع جديد',
      okText: m ? 'حفظ' : 'إنشاء',
      body: m ? '' : 'إن لم تحدد التاريخ لن يُنشأ الاجتماع — لن أفترض موعدًا.',
      fields: [
        { name:'title', label:'عنوان الاجتماع', value: m ? m.title : '' },
        { name:'date', label:'التاريخ (مطلوب)', type:'date', value: m ? m.date : '' },
        { name:'time', label:'الوقت', type:'time', value: m ? m.time : '' },
        { name:'duration', label:'المدة (دقائق)', type:'number', value: m ? m.duration : 60 },
        { name:'place', label:'المكان', value: m ? m.place : '' },
        { name:'people', label:'الأشخاص المعنيون', value: m ? m.people : '' },
        { name:'sectionId', label:'القسم', type:'select', value: m ? m.sectionId : 'sec_work',
          options: st.sections.map(s => ({ value:s.id, label:s.name })) },
        { name:'notes', label:'ملاحظات', type:'textarea', rows:3, value: m ? m.notes : '' }
      ]
    });
    if (!out) return;

    if (!out.date) {
      toast('التاريخ مطلوب لإنشاء الاجتماع', 'warn');
      return;
    }

    const payload = {
      title: out.title || 'اجتماع',
      date: out.date, time: out.time || '',
      duration: parseInt(out.duration, 10) || 60,
      place: out.place, people: out.people,
      sectionId: out.sectionId, notes: out.notes
    };

    let meeting;
    if (m) {
      meeting = S().updateMeeting(m.id, payload);
      toast('حُفظ الاجتماع ✓', 'ok');
    } else {
      const r = S().addMeeting(payload);
      if (r && r.error) { toast(r.error, 'warn'); return; }
      meeting = r;
      toast('أُنشئ الاجتماع ✓', 'ok');
    }
    render();

    // عرض خيارات التقويم — بحالة صادقة
    offerCalendarSync(meeting);
  }

  async function offerCalendarSync(meeting) {
    const st = DH.calendar.status();
    const connected = st.state === 'connected';

    const answer = await confirmDialog({
      title: 'إضافة إلى التقويم؟',
      html: connected
        ? 'الحساب مرتبط بـ <b>' + esc(DH.calendar.gcal.email || 'Google') + '</b>.<br>' +
          'سيُضاف الحدث مع تنبيه قبل ' + (S().state.settings.meetingLeadMinutes || 15) + ' دقيقة.'
        : '<b>حالة تقويم Google: ' + esc(st.label) + '</b><br>' + esc(st.detail) +
          '<br><br>بدون ربط، يمكنك تنزيل ملف <b>.ics</b> واستيراده في تطبيق التقويم على هاتفك. ' +
          'الملف يحتوي على تنبيه قبل ' + (S().state.settings.meetingLeadMinutes || 15) + ' دقيقة.',
      okText: connected ? 'أضف إلى Google Calendar' : 'نزّل ملف .ics',
      cancelText: 'لاحقًا'
    });
    if (!answer) return;

    if (connected) {
      toast('جارٍ الإضافة إلى التقويم…');
      const res = await DH.calendar.syncMeeting(meeting);
      if (res.ok) {
        toast('أُضيف إلى Google Calendar ✓', 'ok');
      } else {
        toast('لم يُضف: ' + (res.message || 'خطأ غير معروف'), 'error');
      }
      render();
    } else {
      const r = DH.calendar.downloadICS([meeting], 'daftar-hood-event.ics');
      toast('نُزّل الملف — افتحه لإضافته إلى تقويم هاتفك (' + r.count + ' حدث)', 'ok');
      const again = await confirmDialog({
        title: 'هل أُضيفه إلى تقويم Google؟',
        body: 'يمكنني فتح صفحة إنشاء الحدث في Google Calendar في المتصفح. سيُضاف فقط إذا أكملت أنت الحفظ هناك.',
        okText: 'افتح Google Calendar', cancelText: 'لا'
      });
      if (again) {
        const url = DH.calendar.googleCalendarUrl(meeting);
        if (url) window.open(url, '_blank');
      }
    }
  }

  async function deleteMeetingFlow(mid) {
    const m = S().state.meetings.find(x => x.id === mid);
    if (!m) return;

    const hasEvent = !!m.calendarEventId;
    const answer = await confirmDialog({
      title: 'حذف الاجتماع؟',
      body: '«' + m.title + '»' + (hasEvent ? ' — مرتبط بحدث في تقويم Google.' : ''),
      danger: true, okText: 'حذف',
      options: hasEvent ? [
        { value:'notebook', label:'حذف من الدفتر فقط (يبقى في Google Calendar)' },
        { value:'both',     label:'حذف من الدفتر ومن Google Calendar' }
      ] : null
    });
    if (!answer) return;

    let calDeleted = false;
    if (hasEvent && answer === 'both' && DH.calendar.gcal.connected) {
      const sure = await confirmDialog({
        title: 'تأكيد حذف الحدث من التقويم',
        body: 'سيُحذف «' + m.title + '» نهائيًا من Google Calendar. هذا لا يمكن التراجع عنه.',
        danger: true, okText: 'نعم، احذف من التقويم'
      });
      if (sure) {
        const res = await DH.calendar.deleteEvent(m);
        calDeleted = res.ok;
        if (!res.ok) toast('لم يُحذف من التقويم: ' + (res.message || ''), 'warn');
      }
    }

    const snap = S().deleteMeeting(mid);
    render();
    toast(calDeleted ? 'حُذف من الدفتر ومن التقويم' : 'حُذف من الدفتر', 'ok', 'تراجع', () => {
      if (snap) {
        S().state.meetings.splice(snap.index, 0, snap.meeting);
        render();
        toast('تم التراجع ✓', 'ok');
      }
    });
  }

  /* ═══ سجل الوقت ═════════════════════════════════════════════ */
  function openTimeLog() {
    const st = S().state;
    const today = S().todayISO();
    const day = S().totalForDay(today);
    const log = S().logForDay(today);

    const rows = log.length ? log.map(e => {
      const t = S().getTask(e.taskId);
      const sec = t ? S().sectionById(t.sectionId) : null;
      return '<div class="tl-row">' +
        '<span class="tl-dot" style="background:' + (sec ? sec.color : '#999') + '"></span>' +
        '<span class="tl-name">' + esc(t ? t.title : 'مهمة محذوفة') + '</span>' +
        '<span class="tl-dur">' + fmtDuration(e.seconds) + '</span>' +
      '</div>';
    }).join('') : '<p class="empty small">لا وقت مُسجَّل اليوم.</p>';

    const secRows = st.sections.map(s => {
      const secs = day.bySection[s.id] || 0;
      if (!secs) return '';
      const pct = day.total ? Math.round((secs / day.total) * 100) : 0;
      return '<div class="tl-sec-row">' +
        '<span class="tl-sec-name" style="color:' + s.color + '">' + s.icon + ' ' + esc(s.short) + '</span>' +
        '<div class="tl-sec-bar"><div style="width:' + pct + '%;background:' + s.color + '"></div></div>' +
        '<span class="tl-sec-val">' + fmtDuration(secs) + '</span>' +
      '</div>';
    }).filter(Boolean).join('');

    // آخر 7 أيام
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = S().addDaysISO(today, -i);
      const dt = S().totalForDay(d);
      week.push({ day: d, secs: dt.total });
    }
    const maxSec = Math.max.apply(null, week.map(w => w.secs).concat([1]));
    const weekBars = week.map(w => {
      const h = Math.round((w.secs / maxSec) * 60);
      const dd = new Date(w.day + 'T12:00:00');
      return '<div class="wk-col" title="' + esc(fmtDateAr(w.day) + ': ' + fmtDuration(w.secs)) + '">' +
        '<div class="wk-bar" style="height:' + Math.max(2, h) + 'px"></div>' +
        '<span class="wk-lbl">' + AR_DAYS[dd.getDay()].slice(0, 3) + '</span>' +
      '</div>';
    }).join('');

    const active = st.activeTimer ? S().getTask(st.activeTimer.taskId) : null;

    const modal = document.getElementById('modal');
    modal.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-sheet modal-time">' +
        '<h3 class="modal-title">⏱ سجل الوقت</h3>' +
        (active ? '<div class="tm-active">يعمل الآن: ' + esc(active.title) + ' — ' +
          fmtClock(S().elapsedOf(st.activeTimer)) + '</div>' : '') +
        '<div class="tm-total">' +
          '<span class="tm-total-num">' + fmtDuration(day.total) + '</span>' +
          '<span class="tm-total-lbl">إجمالي العمل اليوم — ' + fmtDateAr(today) + '</span>' +
        '</div>' +
        (secRows ? '<div class="tm-sections"><div class="tm-sub">التوزيع حسب الأقسام</div>' + secRows + '</div>' : '') +
        '<div class="tm-week"><div class="tm-sub">آخر 7 أيام</div><div class="wk-chart">' + weekBars + '</div></div>' +
        '<div class="tm-log"><div class="tm-sub">تفاصيل اليوم</div>' + rows + '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn btn-ghost" data-act="export-time">تصدير CSV</button>' +
          '<button class="btn btn-primary" data-act="close">إغلاق</button>' +
        '</div>' +
      '</div>';
    modal.classList.add('open');

    const close = () => { modal.classList.remove('open'); modal.innerHTML = ''; };
    modal.querySelector('[data-act="close"]').onclick = close;
    modal.querySelector('.modal-backdrop').onclick = close;
    modal.querySelector('[data-act="export-time"]').onclick = () => {
      const rowsCsv = [['التاريخ','المهمة','القسم','الثواني','المدة']];
      st.timeLog.forEach(e => {
        const t = S().getTask(e.taskId);
        const sec = t ? S().sectionById(t.sectionId) : null;
        rowsCsv.push([e.day, t ? t.title : 'محذوفة', sec ? sec.short : '-', e.seconds, fmtDuration(e.seconds)]);
      });
      const csv = '\uFEFF' + rowsCsv.map(r =>
        r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
      downloadText(csv, 'daftar-hood-time-' + today + '.csv', 'text/csv');
      toast('صُدّر سجل الوقت ✓', 'ok');
    };
  }

  function downloadText(content, filename, mime) {
    const blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ═══ إدارة الأقسام ═════════════════════════════════════════ */
  async function openSectionManager() {
    const st = S().state;
    const modal = document.getElementById('modal');

    const renderMgr = () => {
      const secHtml = st.sections.map(s => {
        const cats = S().catsFor(s.id);
        return '<div class="mgr-sec" style="border-color:' + s.color + '55">' +
          '<div class="mgr-sec-head">' +
            '<span class="mgr-dot" style="background:' + s.color + '"></span>' +
            '<span class="mgr-name">' + esc(s.icon + ' ' + s.name) + '</span>' +
            '<button class="icon-btn sm" data-edit-sec="' + s.id + '">✏️</button>' +
            (st.sections.length > 1 ? '<button class="icon-btn sm" data-del-sec="' + s.id + '">🗑️</button>' : '') +
          '</div>' +
          '<div class="mgr-cats">' +
            cats.map(c => '<span class="mgr-cat">' + esc(c.icon + ' ' + c.name) +
              '<button class="mgr-cat-x" data-del-cat="' + c.id + '">✕</button></span>').join('') +
            '<button class="mgr-cat-add" data-add-cat="' + s.id + '">+ تصنيف</button>' +
          '</div>' +
        '</div>';
      }).join('');

      modal.innerHTML =
        '<div class="modal-backdrop"></div>' +
        '<div class="modal-sheet modal-mgr">' +
          '<h3 class="modal-title">إدارة الأقسام والتصنيفات</h3>' +
          '<p class="modal-body">كل التعديلات تُحفظ فورًا — لا حاجة لتعديل الكود.</p>' +
          '<div class="mgr-list">' + secHtml + '</div>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-ghost" data-act="add-sec">+ قسم جديد</button>' +
            '<button class="btn btn-primary" data-act="close">إغلاق</button>' +
          '</div>' +
        '</div>';
      modal.classList.add('open');

      modal.querySelector('[data-act="close"]').onclick = () => {
        modal.classList.remove('open'); modal.innerHTML = ''; render();
      };
      modal.querySelector('.modal-backdrop').onclick = () => {
        modal.classList.remove('open'); modal.innerHTML = ''; render();
      };
      modal.querySelector('[data-act="add-sec"]').onclick = async () => {
        const out = await promptDialog({
          title:'قسم جديد', okText:'إضافة',
          fields:[
            { name:'name', label:'اسم القسم الكامل' },
            { name:'short', label:'الاسم المختصر (يظهر في التبويب)' },
            { name:'icon', label:'أيقونة (إيموجي)', value:'📁' },
            { name:'color', label:'اللون', type:'color', value:'#6B7280' }
          ]
        });
        if (out && out.name) {
          S().addSection(out);
          renderMgr();
        }
      };
      modal.querySelectorAll('[data-edit-sec]').forEach(b => b.onclick = async () => {
        const s = S().sectionById(b.dataset.editSec);
        const out = await promptDialog({
          title:'تعديل القسم', okText:'حفظ',
          fields:[
            { name:'name', label:'الاسم الكامل', value:s.name },
            { name:'short', label:'الاسم المختصر', value:s.short },
            { name:'icon', label:'الأيقونة', value:s.icon },
            { name:'color', label:'اللون', type:'color', value:s.color }
          ]
        });
        if (out) { S().updateSection(s.id, out); renderMgr(); }
      });
      modal.querySelectorAll('[data-del-sec]').forEach(b => b.onclick = async () => {
        const s = S().sectionById(b.dataset.delSec);
        const counts = st.tasks.filter(t => t.sectionId === s.id).length;
        const ok = await confirmDialog({
          title:'حذف القسم؟',
          body: counts ? 'يوجد ' + counts + ' مهمة في هذا القسم. انقل المهام أولًا.' : 'سيُحذف «' + s.name + '» وتصنيفاته.',
          danger:true, okText:'حذف'
        });
        if (ok) {
          const r = S().deleteSection(s.id);
          if (r && r.error) toast(r.error, 'warn'); else renderMgr();
        }
      });
      modal.querySelectorAll('[data-add-cat]').forEach(b => b.onclick = async () => {
        const out = await promptDialog({
          title:'تصنيف جديد', okText:'إضافة',
          fields:[
            { name:'name', label:'اسم التصنيف' },
            { name:'icon', label:'أيقونة', value:'•' }
          ]
        });
        if (out && out.name) { S().addCategory({ sectionId:b.dataset.addCat, name:out.name, icon:out.icon }); renderMgr(); }
      });
      modal.querySelectorAll('[data-del-cat]').forEach(b => b.onclick = async () => {
        const c = S().catById(b.dataset.delCat);
        const ok = await confirmDialog({ title:'حذف التصنيف؟', body:c.name, danger:true, okText:'حذف' });
        if (ok) { S().deleteCategory(c.id); renderMgr(); }
      });
    };
    renderMgr();
  }

  /* ═══ الإعدادات ═════════════════════════════════════════════ */
  async function openSettings() {
    const st = S().state;
    const cal = DH.calendar.status();
    const notif = DH.calendar.notifier;

    const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

    const modal = document.getElementById('modal');
    modal.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-sheet modal-settings">' +
        '<h3 class="modal-title">⚙️ الإعدادات</h3>' +

        '<div class="set-group">' +
          '<h4>المظهر</h4>' +
          '<div class="set-row">' +
            '<span>وضع العرض</span>' +
            '<select id="set-theme">' +
              '<option value="auto"' + (st.settings.theme === 'auto' ? ' selected' : '') + '>تلقائي (حسب النظام)</option>' +
              '<option value="light"' + (st.settings.theme === 'light' ? ' selected' : '') + '>نهاري</option>' +
              '<option value="dark"' + (st.settings.theme === 'dark' ? ' selected' : '') + '>ليلي</option>' +
            '</select>' +
          '</div>' +
          '<div class="set-row"><span>الاسم</span>' +
            '<input id="set-name" value="' + esc(st.settings.userName || '') + '"></div>' +
        '</div>' +

        '<div class="set-group">' +
          '<h4>أوقات التذكير</h4>' +
          '<div class="set-row"><span>ساعات الدوام</span>' +
            '<div class="set-inline">' +
              '<input type="time" id="set-work-time" value="' + esc(st.settings.workTime) + '">' +
              '<span class="hint">اقتراح: 8:30 صباحًا</span>' +
            '</div></div>' +
          '<div class="set-row"><span>أيام الإجازة</span>' +
            '<div class="set-inline">' +
              '<input type="time" id="set-off-time" value="' + esc(st.settings.offTime) + '">' +
              '<span class="hint">اقتراح: 12:00 ظهرًا</span>' +
            '</div></div>' +
          '<div class="set-row"><span>أيام الدوام</span></div>' +
          '<div class="day-picker">' + days.map((d, i) =>
            '<button class="day-chip' + (st.settings.workDays.includes(i) ? ' on' : '') +
              '" data-day="' + i + '">' + d.slice(0, 4) + '</button>').join('') + '</div>' +
          '<div class="set-row"><span>تنبيه الاجتماعات قبل (دقيقة)</span>' +
            '<input type="number" id="set-lead" value="' + (st.settings.meetingLeadMinutes || 15) + '" min="5" max="120" style="width:80px"></div>' +
        '</div>' +

        '<div class="set-group">' +
          '<h4>الإشعارات</h4>' +
          '<div class="cal-status ' + (notif.isGranted() ? 'cs-ok' : 'cs-off') + '">' +
            '<b>' + (notif.isGranted() ? 'الإشعارات مسموحة ✓' : (notif.isSupported() ? 'الإشعارات غير مسموحة' : 'غير مدعومة في هذا المتصفح')) + '</b>' +
            '<p>' + (notif.isGranted()
              ? 'تُرسل إشعارات فورية أثناء فتح التطبيق فقط. لا توجد خدمة خلفية مُهيّأة.'
              : (notif.isSupported() ? 'اضغط للسماح بالإشعارات.' : 'استخدم متصفحًا يدعم الإشعارات.')) + '</p>' +
            (notif.isSupported() && !notif.isGranted()
              ? '<button class="btn btn-ghost btn-sm" id="set-notif">طلب الإذن</button>' : '') +
          '</div>' +
          '<label class="set-check"><input type="checkbox" id="set-rem-on"' +
            (st.settings.remindersEnabled ? ' checked' : '') + '><span>تشغيل لوحة التذكيرات في الصفحة الرئيسية</span></label>' +
          '<label class="set-check"><input type="checkbox" id="set-rem-over"' +
            (st.settings.reminderOverdue ? ' checked' : '') + '><span>تذكير بالمهام المتأخرة</span></label>' +
          '<label class="set-check"><input type="checkbox" id="set-rem-today"' +
            (st.settings.reminderToday ? ' checked' : '') + '><span>تذكير بمهام اليوم</span></label>' +
          '<label class="set-check"><input type="checkbox" id="set-rem-meet"' +
            (st.settings.reminderMeetings ? ' checked' : '') + '><span>تذكير باجتماعات اليوم</span></label>' +
          '<p class="honest-note">ملاحظة صادقة: التذكيرات تعمل أثناء فتح التطبيق فقط. ' +
            'للتنبيهات في الخلفية، أضف الاجتماعات إلى تقويم هاتفك (ملف .ics) — ' +
            'فالتقويم هو من يرسل الإشعار الحقيقي.</p>' +
        '</div>' +

        '<div class="set-group">' +
          '<h4>تقويم Google</h4>' +
          '<div class="cal-status ' + (cal.state === 'connected' ? 'cs-ok' : 'cs-off') + '">' +
            '<b>' + esc(cal.label) + '</b><p>' + esc(cal.detail) + '</p>' +
            (cal.canConnect
              ? '<button class="btn btn-ghost btn-sm" id="set-gcal">ربط الحساب</button>'
              : '<button class="btn btn-ghost btn-sm" id="set-gcal-off">فصل الحساب</button>') +
          '</div>' +
          '<div class="set-row"><span>معرّف عميل Google (Client ID)</span>' +
            '<input id="set-gcal-id" placeholder="xxxx.apps.googleusercontent.com" value="' +
              esc(st.settings.gcalClientId || '') + '" dir="ltr"></div>' +
          '<p class="hint">مطلوب للربط المباشر. لا تضع أي سر (client secret) هنا — ' +
            'الأسرار تبقى على الخادم فقط.</p>' +
          '<div class="set-row"><span>تصدير التقويم</span>' +
            '<button class="btn btn-ghost btn-sm" id="set-export-ics">نزّل ملف .ics لكل الاجتماعات</button></div>' +
        '</div>' +

        '<div class="set-group">' +
          '<h4>الذكاء الاصطناعي</h4>' +
          '<div class="set-row"><span>عنوان خدمة التحليل</span>' +
            '<input id="set-ai-url" placeholder="اتركه فارغًا للتحليل المحلي" value="' +
              esc(st.settings.aiEndpoint || '') + '" dir="ltr"></div>' +
          '<div class="set-row"><span>اسم النموذج</span>' +
            '<input id="set-ai-model" placeholder="مثال: gpt-4o-mini" value="' +
              esc(st.settings.aiModel || '') + '" dir="ltr"></div>' +
          '<p class="hint">إن تُرك فارغًا: يعمل التحليل محليًا على جهازك بقواعد عربية ولهجة يمنية، ' +
            'ولا تُرسل بياناتك لأي جهة. لا تضع مفتاح API هنا أبدًا.</p>' +
        '</div>' +

        '<div class="set-group">' +
          '<h4>البيانات والنسخ الاحتياطي</h4>' +
          '<div class="set-btns">' +
            '<button class="btn btn-ghost btn-sm" id="set-export">⬇ تصدير نسخة احتياطية</button>' +
            '<button class="btn btn-ghost btn-sm" id="set-import">⬆ استيراد نسخة</button>' +
            '<button class="btn btn-ghost btn-sm" id="set-csv">📊 تصدير المهام CSV</button>' +
          '</div>' +
          '<div class="set-stats">' +
            '<span>' + st.tasks.length + ' مهمة</span>' +
            '<span>' + st.meetings.length + ' اجتماع</span>' +
            '<span>' + st.timeLog.length + ' سجل وقت</span>' +
            '<span>' + (new Blob([JSON.stringify(st.tasks)]).size / 1024).toFixed(1) + ' ك.ب</span>' +
          '</div>' +
          '<button class="btn btn-danger-soft btn-sm" id="set-clear">🗑 حذف كل البيانات</button>' +
        '</div>' +

        '<div class="modal-actions">' +
          '<button class="btn btn-primary" data-act="close">إغلاق</button>' +
        '</div>' +
      '</div>';
    modal.classList.add('open');

    const close = () => { modal.classList.remove('open'); modal.innerHTML = ''; render(); };
    modal.querySelector('[data-act="close"]').onclick = close;
    modal.querySelector('.modal-backdrop').onclick = close;

    // المظهر
    modal.querySelector('#set-theme').onchange = e => {
      S().setSetting('theme', e.target.value); applyTheme();
    };
    modal.querySelector('#set-name').onchange = e => S().setSetting('userName', e.target.value);

    // التذكير
    modal.querySelector('#set-work-time').onchange = e => S().setSetting('workTime', e.target.value);
    modal.querySelector('#set-off-time').onchange = e => S().setSetting('offTime', e.target.value);
    modal.querySelector('#set-lead').onchange = e => S().setSetting('meetingLeadMinutes', parseInt(e.target.value, 10) || 15);
    modal.querySelectorAll('.day-chip').forEach(b => b.onclick = () => {
      const d = +b.dataset.day;
      const wd = st.settings.workDays.slice();
      const i = wd.indexOf(d);
      if (i >= 0) wd.splice(i, 1); else wd.push(d);
      S().setSetting('workDays', wd);
      b.classList.toggle('on');
    });
    modal.querySelector('#set-rem-on').onchange = e => { S().setSetting('remindersEnabled', e.target.checked); };
    modal.querySelector('#set-rem-over').onchange = e => { S().setSetting('reminderOverdue', e.target.checked); };
    modal.querySelector('#set-rem-today').onchange = e => { S().setSetting('reminderToday', e.target.checked); };
    modal.querySelector('#set-rem-meet').onchange = e => { S().setSetting('reminderMeetings', e.target.checked); };

    const nb = modal.querySelector('#set-notif');
    if (nb) nb.onclick = async () => {
      const r = await notif.requestPermission();
      if (r.ok) { toast('تم تشغيل الإشعارات ✓', 'ok'); S().setSetting('remindersEnabled', true); close(); openSettings(); }
      else toast(r.message, 'warn');
    };

    // التقويم
    const gc = modal.querySelector('#set-gcal');
    if (gc) gc.onclick = async () => {
      const cid = modal.querySelector('#set-gcal-id').value.trim();
      if (cid) S().setSetting('gcalClientId', cid);
      if (!cid) { toast('أدخل معرّف عميل Google أولًا', 'warn'); return; }
      const r = await DH.calendar.connect();
      if (r.ok) { toast('تم الربط ✓ ' + (r.email || ''), 'ok'); close(); openSettings(); }
      else toast(r.message, 'warn');
    };
    const gco = modal.querySelector('#set-gcal-off');
    if (gco) gco.onclick = async () => {
      const sure = await confirmDialog({ title:'فصل الحساب؟',
        body:'سيبقى كل شيء في الدفتر، لكن لن تُزامَن التعديلات الجديدة مع تقويم Google.',
        danger:true, okText:'فصل' });
      if (sure) { DH.calendar.disconnect(); toast('فُصل الحساب', 'ok'); close(); openSettings(); }
    };
    modal.querySelector('#set-gcal-id').onchange = e => S().setSetting('gcalClientId', e.target.value.trim());
    modal.querySelector('#set-export-ics').onclick = () => {
      const withDates = st.meetings.filter(m => m.date);
      if (!withDates.length) { toast('لا توجد اجتماعات بتواريخ', 'warn'); return; }
      DH.calendar.downloadICS(withDates, 'daftar-hood-calendar.ics');
      toast('نُزّل ' + withDates.length + ' حدث — افتحه لإضافته للتقويم', 'ok');
    };

    // AI
    modal.querySelector('#set-ai-url').onchange = e => S().setSetting('aiEndpoint', e.target.value.trim());
    modal.querySelector('#set-ai-model').onchange = e => S().setSetting('aiModel', e.target.value.trim());

    // البيانات
    modal.querySelector('#set-export').onclick = () => {
      const data = S().exportAll();
      downloadText(JSON.stringify(data, null, 2), 'daftar-hood-backup-' + S().todayISO() + '.json', 'application/json');
      toast('صُدّرت النسخة الاحتياطية ✓', 'ok');
    };
    modal.querySelector('#set-import').onclick = () => importFlow();
    modal.querySelector('#set-csv').onclick = () => {
      const rows = [['العنوان','القسم','التصنيف','الحالة','الأولوية','الحجم','النوع','التاريخ','العميل','المندوب','الصنف','المبلغ','الملاحظات']];
      st.tasks.forEach(t => {
        const s = S().sectionById(t.sectionId); const c = t.categoryId ? S().catById(t.categoryId) : null;
        rows.push([t.title, s ? s.short : '', c ? c.name : '', lbl(STATUS_LABEL, t.status, 'جديدة'),
          lbl(PRIORITY_LABEL, t.priority, 'عادية'), t.size === 'large' ? 'كبيرة' : 'صغيرة',
          lbl(KIND_LABEL, t.kind, 'تنفيذية'),
          t.dueDate || '', t.client, t.rep, t.item, t.amount != null ? t.amount : '', t.notes]);
      });
      const csv = '\uFEFF' + rows.map(r => r.map(x =>
        '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(',')).join('\n');
      downloadText(csv, 'daftar-hood-tasks-' + S().todayISO() + '.csv', 'text/csv');
      toast('صُدّرت المهام ✓', 'ok');
    };
    modal.querySelector('#set-clear').onclick = async () => {
      const sure = await confirmDialog({
        title:'حذف كل البيانات؟',
        body:'سيُحذف كل شيء نهائيًا. صدّر نسخة احتياطية أولًا إن كنت تريد الاحتفاظ بها.',
        danger:true, okText:'نعم، احذف الكل'
      });
      if (sure) {
        S().clearAll();
        close();
        toast('حُذفت كل البيانات', 'ok');
      }
    };
  }

  function importFlow() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const mode = await confirmDialog({
          title:'طريقة الاستيراد',
          body:'الملف يحتوي على ' + (data.tasks ? data.tasks.length : 0) + ' مهمة.',
          okText:'متابعة',
          options:[
            { value:'merge', label:'دمج مع بياناتي الحالية (يتجاهل المكرر)' },
            { value:'replace', label:'استبدال كل بياناتي الحالية' }
          ]
        });
        if (!mode) return;
        if (mode === 'replace') {
          const sure = await confirmDialog({
            title:'تأكيد الاستبدال',
            body:'ستُفقد كل البيانات الحالية وتُستبدل بمحتوى الملف. لا يمكن التراجع.',
            danger:true, okText:'نعم، استبدل'
          });
          if (!sure) return;
        }
        const res = S().importAll(data, mode);
        if (res.error) { toast(res.error, 'error'); return; }
        render();
        toast(mode === 'replace' ? 'استُبدلت البيانات ✓' : 'دُمجت ' + (res.added || 0) + ' مهمة ✓', 'ok');
      } catch (e) {
        toast('تعذّر قراءة الملف: ' + e.message, 'error');
      }
    };
    input.click();
  }

  async function enableNotifications() {
    const r = await DH.calendar.notifier.requestPermission();
    if (r.ok) { S().setSetting('remindersEnabled', true); toast('تم تشغيل الإشعارات ✓', 'ok'); render(); }
    else toast(r.message, 'warn');
  }

  /* ═══ المظهر ════════════════════════════════════════════════ */
  function applyTheme() {
    const pref = S().state.settings.theme || 'auto';
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = pref === 'dark' || (pref === 'auto' && prefersDark);
    document.body.classList.toggle('dark', dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#12161C' : '#F4F6F5');
  }

  function toggleTheme() {
    const isDark = document.body.classList.contains('dark');
    S().setSetting('theme', isDark ? 'light' : 'dark');
    applyTheme();
    render();
  }

  /* ═══ المشغّل ═══════════════════════════════════════════════ */
  function boot() {
    S().load();
    DH.calendar.loadPref();
    applyTheme();

    render();

    // إعادة الرسم عند تغيّر البيانات
    S().on('tasks', () => { if (!view.editingTask) render(); });
    S().on('meetings', render);
    S().on('sections', render);
    S().on('settings', () => { applyTheme(); });

    // تحديث المؤقت كل ثانية
    view.timerTick = setInterval(() => {
      const el = document.getElementById('at-clock');
      if (el && S().state.activeTimer) {
        el.textContent = fmtClock(S().elapsedOf(S().state.activeTimer));
      }
    }, 1000);

    // تذكير عند فتح التطبيق
    setTimeout(runReminders, 2500);

    // متابعة النظام للمظهر
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((S().state.settings.theme || 'auto') === 'auto') applyTheme();
      });
    }

    // حفظ قبل الإغلاق (احتياط)
    window.addEventListener('beforeunload', () => {
      if (S().state.activeTimer) S().pauseTimer();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (S().state.activeTimer && !S().state.activeTimer.paused) {
          // المؤقت يعتمد على الطابع الزمني فلا يفقد الوقت عند إخفاء الصفحة
          const el = document.getElementById('at-clock');
          if (el) el.textContent = fmtClock(S().elapsedOf(S().state.activeTimer));
        }
        runReminders();
      }
    });
  }

  /* ═══ التنبيهات داخل الصفحة ═════════════════════════════════ */
  function runReminders() {
    const st = S().state;
    if (!st.settings.remindersEnabled) return;
    if (!DH.calendar.notifier.isGranted()) return;

    const now = new Date();
    const today = S().todayISO();
    const stamp = today + 'T' + String(now.getHours()).padStart(2,'0');
    if (st.settings.lastReminderShown === stamp) return;

    // وقت التذكير اليوم: حسب يوم دوام أم إجازة
    const isWorkDay = st.settings.workDays.includes(now.getDay());
    const target = isWorkDay ? st.settings.workTime : st.settings.offTime;
    const [th, tm] = target.split(':').map(Number);
    const targetMin = th * 60 + tm;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < targetMin) return;

    const open = st.tasks.filter(t => t.status !== 'done' && !t.canceled);
    const overdue = open.filter(t => dueInfo(t).key === 'overdue');
    const todayT = open.filter(t => dueInfo(t).key === 'today');
    const meets = S().meetingsOn(today);

    const parts = [];
    if (st.settings.reminderOverdue && overdue.length) parts.push(overdue.length + ' مهمة متأخرة');
    if (st.settings.reminderToday && todayT.length) parts.push(todayT.length + ' مهمة اليوم');
    if (st.settings.reminderMeetings && meets.length) parts.push(meets.length + ' اجتماع');
    if (!parts.length) return;

    DH.calendar.notifier.send('دفتر هود الذكي — ' + (isWorkDay ? 'بداية الدوام' : 'تذكير اليوم'),
      parts.join(' • '));
    S().setSetting('lastReminderShown', stamp);
  }

  global.DH = global.DH || {};
  DH.ui = {
    render, toast, confirmDialog, promptDialog, bindEvents, boot,
    renderHeader, renderCapture, renderPendingReview, renderActiveTimer,
    renderMeetings, renderTabs, renderFilters, renderTasks, renderAssist, renderDoneToday,
    taskCard, dueInfo, sortTasks, filteredTasks,
    fmtDuration, fmtClock, fmtDateAr, fmtTimeAr, fmtAmount,
    applyTheme, toggleTheme, openSettings, openTimeLog, view,
    PRIORITY_LABEL, STATUS_LABEL, KIND_LABEL, REPEAT_LABEL, AR_DAYS, AR_MONTHS, esc
  };
})(window);