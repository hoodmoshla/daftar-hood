/* ═══════════════════════════════════════════════════════════════
   دفتر هود الذكي — تكامل التقويم والتنبيهات (calendar.js)
   ───────────────────────────────────────────────────────────────
   صدق كامل في الحالة: لا يُعرض أي اجتماع كـ«مضاف للتقويم» إلا بعد
   تأكيد نجاح العملية من الخدمة فعليًا. عند نقص الصلاحيات أو غياب
   الإعداد تظهر حالة واضحة وزر للربط.

   وضعان للتقويم:
   1) Google Calendar الرسمي (يتطلب معرّف عميل OAuth + خادم وسيط
      يحفظ الجلسة — لا يمكن وضع أسرار في الواجهة).
   2) تقويم مقترح داخل التطبيق (.ics) — يعمل فورًا بدون أي إعداد:
      تصدير ملف ICS يُستورد في Google Calendar أو أي تطبيق تقويم.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const S = () => DH.store;
  const LS_TOKEN = 'dh_gcal_token';
  const LS_PREF  = 'dh_gcal_pref';

  /* ── الحالة ───────────────────────────────────────────────── */
  const gcal = {
    connected: false,
    email: '',
    calendarId: 'primary',
    lastError: null,
    token: null,
    expiresAt: 0
  };

  function loadPref() {
    try {
      const p = JSON.parse(localStorage.getItem(LS_PREF) || 'null');
      if (p) {
        gcal.connected = !!p.connected;
        gcal.email = p.email || '';
        gcal.calendarId = p.calendarId || 'primary';
      }
      const t = JSON.parse(localStorage.getItem(LS_TOKEN) || 'null');
      if (t && t.token && t.expiresAt > Date.now()) {
        gcal.token = t.token;
        gcal.expiresAt = t.expiresAt;
      }
    } catch (e) { /* تجاهل */ }
    return gcal;
  }

  function savePref() {
    try {
      localStorage.setItem(LS_PREF, JSON.stringify({
        connected: gcal.connected, email: gcal.email, calendarId: gcal.calendarId
      }));
    } catch (e) {}
  }

  function status() {
    if (!gcal.connected) {
      return {
        state: 'disconnected',
        label: 'غير مرتبط',
        detail: 'لم يتم ربط حساب Google بعد. الاجتماعات تُحفظ في الدفتر وتُصدَّر كملف تقويم.',
        canConnect: true
      };
    }
    if (!gcal.token || gcal.expiresAt <= Date.now()) {
      return {
        state: 'expired',
        label: 'الصلاحية منتهية',
        detail: 'انتهت صلاحية الوصول إلى تقويم Google. أعد الربط للمزامنة.',
        canConnect: true
      };
    }
    return {
      state: 'connected',
      label: 'مرتبط',
      detail: 'مرتبط بـ ' + (gcal.email || 'حساب Google'),
      canConnect: false
    };
  }

  /* ═══ التكامل الرسمي مع Google Calendar ═══════════════════════
     SAPIs: يتطلب Client ID + خادم OAuth يحفظ client_secret.
     الواجهة تحصل على access_token قصير العمر فقط.
     ═══════════════════════════════════════════════════════════ */

  // يجب أن يضبط المستخدم هذا في الإعدادات (معرّف عميل عام، ليس سرًا)
  function clientId() {
    return (S().state.settings.gcalClientId || '').trim();
  }

  async function connect() {
    const cid = clientId();
    if (!cid) {
      return {
        error: 'missing_client_id',
        message: 'لا يمكن الربط: يلزم معرّف عميل Google (OAuth Client ID). ' +
                 'تفاصيل الإعداد في ملف docs/SETUP-AR.md'
      };
    }
    const redirect = location.origin + location.pathname;
    const scope = 'https://www.googleapis.com/auth/calendar.events';
    const url = 'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + encodeURIComponent(cid) +
      '&redirect_uri=' + encodeURIComponent(redirect) +
      '&response_type=token' +
      '&scope=' + encodeURIComponent(scope) +
      '&include_granted_scopes=true&prompt=consent';

    return new Promise(resolve => {
      const popup = window.open(url, 'gcalAuth', 'width=500,height=650');
      if (!popup) {
        resolve({ error: 'popup_blocked', message: 'المتصفح منع النافذة المنبثقة. اسمح بها ثم أعد المحاولة.' });
        return;
      }
      const poll = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(poll);
            resolve({ error: 'closed', message: 'أُغلقت نافذة الربط قبل إكمال الصلاحية.' });
            return;
          }
          const hash = popup.location.hash;
          if (hash && hash.indexOf('access_token') > -1) {
            const params = new URLSearchParams(hash.slice(1));
            const token = params.get('access_token');
            const expires = params.get('expires_in');
            gcal.token = token;
            gcal.expiresAt = Date.now() + (parseInt(expires, 10) || 3600) * 1000;
            gcal.connected = true;
            localStorage.setItem(LS_TOKEN, JSON.stringify({ token, expiresAt: gcal.expiresAt }));
            savePref();
            popup.close();
            clearInterval(poll);
            // جلب البريد للعرض
            fetchUserInfo().then(() => resolve({ ok: true, email: gcal.email }));
          }
        } catch (e) {
          // سياسة المصدر تمنع القراءة أثناء وجودنا على accounts.google.com — طبيعي
        }
      }, 700);
      setTimeout(() => { clearInterval(poll); }, 180000);
    });
  }

  async function fetchUserInfo() {
    if (!gcal.token) return;
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + gcal.token }
      });
      if (r.ok) {
        const d = await r.json();
        gcal.email = d.email || '';
        savePref();
      }
    } catch (e) {}
  }

  function disconnect() {
    gcal.connected = false; gcal.token = null; gcal.email = ''; gcal.expiresAt = 0;
    try { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_PREF); } catch (e) {}
    DH.store.emit('calendar');
    return { ok: true };
  }

  // بناء جسم الحدث بصيغة Google Calendar API v3
  function toEventBody(meeting) {
    if (!meeting.date) return null;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Aden';
    const startTime = meeting.time || '09:00';
    const start = meeting.date + 'T' + startTime + ':00';
    const [h, m] = startTime.split(':').map(Number);
    const endDate = new Date(meeting.date + 'T' + startTime + ':00');
    endDate.setMinutes(endDate.getMinutes() + (+meeting.duration || 60));
    const p = n => String(n).padStart(2, '0');
    const end = endDate.getFullYear() + '-' + p(endDate.getMonth()+1) + '-' + p(endDate.getDate()) +
                'T' + p(endDate.getHours()) + ':' + p(endDate.getMinutes()) + ':00';

    return {
      summary: meeting.title || 'اجتماع',
      location: meeting.place || undefined,
      description: [
        meeting.people ? 'الحاضرون: ' + meeting.people : '',
        meeting.notes || '',
        '— أُنشئ من دفتر هود الذكي'
      ].filter(Boolean).join('\n'),
      start: { dateTime: start, timeZone: tz },
      end:   { dateTime: end,   timeZone: tz },
      reminders: {
        useDefault: false,
        overrides: [ { method: 'popup', minutes: (+S().state.settings.meetingLeadMinutes) || 15 } ]
      }
    };
  }

  async function api(method, path, body) {
    if (!gcal.token || gcal.expiresAt <= Date.now()) {
      return { error: 'no_token', message: 'انتهت صلاحية الوصول. أعد ربط الحساب.' };
    }
    try {
      const r = await fetch('https://www.googleapis.com/calendar/v3' + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + gcal.token,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });
      if (r.status === 204) return { ok: true };
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return { error: 'api_' + r.status, message: (data.error && data.error.message) || 'فشل الطلب' };
      }
      return { ok: true, data };
    } catch (e) {
      return { error: 'network', message: 'تعذّر الاتصال بخدمة التقويم. تحقّق من الإنترنت.' };
    }
  }

  // إنشاء حدث — يعيد نتيجة حقيقية ولا يدّعي النجاح
  async function createEvent(meeting) {
    if (!gcal.connected || !gcal.token) {
      return { error: 'not_connected', message: 'الحساب غير مرتبط بتقويم Google.' };
    }
    const body = toEventBody(meeting);
    if (!body) return { error: 'no_date', message: 'لا يمكن الإضافة بدون تاريخ.' };

    const res = await api('POST',
      '/calendars/' + encodeURIComponent(gcal.calendarId) + '/events', body);
    if (res.ok && res.data && res.data.id) {
      return { ok: true, eventId: res.data.id, htmlLink: res.data.htmlLink };
    }
    return res;
  }

  async function updateEvent(meeting) {
    if (!gcal.connected || !gcal.token) {
      return { error: 'not_connected', message: 'الحساب غير مرتبط.' };
    }
    if (!meeting.calendarEventId) return { error: 'no_event', message: 'لا يوجد حدث مرتبط بهذا الاجتماع.' };
    const body = toEventBody(meeting);
    if (!body) return { error: 'no_date', message: 'لا يمكن التعديل بدون تاريخ.' };

    const res = await api('PATCH',
      '/calendars/' + encodeURIComponent(gcal.calendarId) + '/events/' +
      encodeURIComponent(meeting.calendarEventId), body);
    return res.ok ? { ok: true, eventId: meeting.calendarEventId } : res;
  }

  async function deleteEvent(meeting) {
    if (!gcal.connected || !gcal.token) {
      return { error: 'not_connected', message: 'الحساب غير مرتبط.' };
    }
    if (!meeting.calendarEventId) {
      return { error: 'no_event', message: 'الاجتماع غير مرتبط بحدث في تقويم Google.' };
    }
    const res = await api('DELETE',
      '/calendars/' + encodeURIComponent(gcal.calendarId) + '/events/' +
      encodeURIComponent(meeting.calendarEventId));
    return res.ok ? { ok: true } : res;
  }

  /* ═══ مزامنة الاجتماع كاملًا مع تتبّع حالة صادقة ═════════════ */
  async function syncMeeting(meeting) {
    const res = await createEvent(meeting);
    if (res.ok) {
      S().updateMeeting(meeting.id, {
        calendarEventId: res.eventId,
        calendarStatus: 'synced',
        calendarLink: res.htmlLink || null,
        calendarError: null
      });
      return { ok: true };
    }
    S().updateMeeting(meeting.id, {
      calendarStatus: 'failed',
      calendarError: res.message || 'فشل غير معروف'
    });
    return { ok: false, message: res.message, error: res.error };
  }

  async function resyncMeeting(meeting) {
    if (meeting.calendarEventId) {
      const res = await updateEvent(meeting);
      if (res.ok) {
        S().updateMeeting(meeting.id, { calendarStatus: 'synced', calendarError: null });
        return { ok: true, updated: true };
      }
      S().updateMeeting(meeting.id, { calendarStatus: 'failed', calendarError: res.message });
      return { ok: false, message: res.message };
    }
    return syncMeeting(meeting);
  }

  /* ═══ تصدير .ics — يعمل دائمًا بلا إعداد ═══════════════════ */
  function pad(n) { return String(n).padStart(2, '0'); }

  function toICSDate(dateStr, timeStr, durationMin) {
    // UTC بصيغة ICS: YYYYMMDDTHHMMSSZ
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = (timeStr || '09:00').split(':').map(Number);
    const start = new Date(y, mo - 1, d, h, mi, 0);
    const end = new Date(start.getTime() + (durationMin || 60) * 60000);
    const f = dt => dt.getUTCFullYear() + pad(dt.getUTCMonth()+1) + pad(dt.getUTCDate()) +
                    'T' + pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + '00Z';
    return { dtstart: f(start), dtend: f(end) };
  }

  function escapeICS(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;')
      .replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function buildICS(meetings) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Daftar Hood//Smart Notebook//AR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:دفتر هود الذكي',
      'X-WR-TIMEZONE:' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Aden'),
      // يخبر التطبيقات المستقبِلة بموعد الاستحقاق بصيغة UTC — مطلوب في بعض العملاء
      'X-WR-TIMEZONE-UTC:' + (() => {
        const o = -new Date().getTimezoneOffset();
        const s = o < 0 ? '-' : '+';
        const a = Math.abs(o);
        return s + pad(Math.floor(a / 60)) + pad(a % 60);
      })()
    ];

    const lead = (+S().state.settings.meetingLeadMinutes) || 15;

    meetings.forEach(m => {
      if (!m.date) return;
      const { dtstart, dtend } = toICSDate(m.date, m.time, m.duration);
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + m.id + '@daftar-hood',
        'DTSTAMP:' + toICSDate(S().todayISO(), '00:00', 0).dtstart,
        'DTSTART:' + dtstart,
        'DTEND:' + dtend,
        'SUMMARY:' + escapeICS(m.title || 'اجتماع'),
        m.place ? 'LOCATION:' + escapeICS(m.place) : null,
        'DESCRIPTION:' + escapeICS([
          m.people ? 'الحاضرون: ' + m.people : '',
          m.notes || '',
          'أُنشئ من دفتر هود الذكي'
        ].filter(Boolean).join('\n')),
        'BEGIN:VALARM',
        'TRIGGER:-PT' + lead + 'M',
        'ACTION:DISPLAY',
        'DESCRIPTION:' + escapeICS('تذكير: ' + (m.title || 'اجتماع')),
        'END:VALARM',
        'END:VEVENT'
      );
    });

    lines.push('END:VCALENDAR');
    return lines.filter(l => l !== null).join('\r\n');
  }

  function downloadICS(meetings, filename) {
    const content = buildICS(meetings);
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || ('daftar-hood-' + S().todayISO() + '.ics');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, count: meetings.filter(m => m.date).length, content };
  }

  function googleCalendarUrl(meeting) {
    if (!meeting.date) return null;
    const { dtstart, dtend } = toICSDate(meeting.date, meeting.time, meeting.duration);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(meeting.title || 'اجتماع') +
      '&dates=' + dtstart + '/' + dtend +
      (meeting.place ? '&location=' + encodeURIComponent(meeting.place) : '') +
      '&details=' + encodeURIComponent([
        meeting.people ? 'الحاضرون: ' + meeting.people : '',
        meeting.notes || '',
        'أُنشئ من دفتر هود الذكي'
      ].filter(Boolean).join('\n'));
  }

  /* ═══ التنبيهات ═══════════════════════════════════════════════
     صدق: الإشعارات تعمل فقط أثناء فتح التطبيق (الصفحة). لا توجد
     خدمة خلفية ولا Service Worker Push مُهيّأ هنا. الواجهة توضّح
     ذلك صراحةً ولا تدّعي إرسال تنبيهات في الخلفية.
     ═══════════════════════════════════════════════════════════ */
  const notifier = {
    permission: (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported',

    async requestPermission() {
      if (typeof Notification === 'undefined') {
        return { ok: false, message: 'هذا المتصفح لا يدعم الإشعارات.' };
      }
      try {
        const p = await Notification.requestPermission();
        this.permission = p;
        if (p === 'granted') return { ok: true };
        if (p === 'denied') return { ok: false, message: 'تم رفض الإذن. يمكنك تغييره من إعدادات المتصفح للموقع.' };
        return { ok: false, message: 'لم يُمنح الإذن.' };
      } catch (e) {
        return { ok: false, message: 'تعذّر طلب الإذن: ' + e.message };
      }
    },

    send(title, body) {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
      try {
        new Notification(title, { body: body || '', tag: 'daftar-hood', lang: 'ar' });
        return true;
      } catch (e) { return false; }
    },

    isSupported() { return typeof Notification !== 'undefined'; },
    isGranted() { return this.isSupported() && Notification.permission === 'granted'; }
  };

  global.DH = global.DH || {};
  global.DH.calendar = {
    gcal, loadPref, status, connect, disconnect,
    createEvent, updateEvent, deleteEvent, syncMeeting, resyncMeeting,
    buildICS, downloadICS, googleCalendarUrl, toEventBody,
    notifier
  };
})(window);