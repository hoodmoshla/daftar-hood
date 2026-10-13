/* ═══════════════════════════════════════════════════════════════
   دفتر هود الذكي — محرك فهم الكلام (ai.js)
   ───────────────────────────────────────────────────────────────
   طبقتان:
   1) محلّل محلي (LocalParser): يعمل دائمًا بدون إنترنت ولا مفاتيح،
      مبني على قواعد للعربية الفصحى واللهجة اليمنية.
   2) مولّد عبر خدمة ذكاء اصطناعي (إذا أدخل المستخدم عنوان خدمة
      في الإعدادات). لا توجد مفاتيح مضمّنة في الواجهة إطلاقًا.

   مهم: هذا المحلّل يقرأ النص ويقسّمه ويصنّفه — لا يختلق أسماء
   ولا أرقامًا ولا تواريخ. أي معلومة غير موجودة تُترك فارغة.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const S = () => DH.store;

  /* ── القاموس: كلمات مفتاحية ← تصنيف ───────────────────────── */
  // الأوزان: العبارات الأخص تؤخذ بعين الاعتبار. «مراجعة حسابات» محاسبة،
  // ولا يجوز أن تجرّها كلمة «متأخرة» إلى التحصيل.
  const CAT_RULES = [
    // ─── عملي ───
    // المحاسبة أولًا: عبارات دقيقة الصلة (وزن أعلى للعبارات المركّبة)
    { cat: 'cat_acct',    sec: 'sec_work', w: ['مراجعة حسابات','مراجعة الحسابات','كشف حساب','ميزان المراجعة','تسوية الحسابات','تسجيل حساب','قيود محاسبية','دفتر المحاسبة','المحاسبة','محاسبة','حسابات العملاء','حسابات','فواتير','فاتورة','جرد حسابي'] },
    { cat: 'cat_collect', sec: 'sec_work', w: ['تحصيل','محصل','استحقاق','مستحق','مستحقات','ديون','مديون','فلوس','يسدد','سدد','اقبض','قبض','باقي عليه','متأخرات','مطالبة','مطالبات'] },
    { cat: 'cat_sales',   sec: 'sec_work', w: ['مبيعات','مبيع','بيوع','أهداف بيعية','هدف بيعي','إيراد','ايراد','طلبية','طلبات','عمولة','تسويق','ترويج','عرض خاص','بيع'] },
    { cat: 'cat_reps',    sec: 'sec_work', w: ['مندوب','مندوبين','مناديب','موزع','موزعين','خط سير','توزيع','جولة','زيارة ميدانية','تحصيل ميداني'] },
    { cat: 'cat_stock',   sec: 'sec_work', w: ['مخزون','مخزن','مخازن','بضاعة','بضاعه','ركود','راكد','راكدة','الراكدة','ناقص','نواقص','كمية','صنف','أصناف','اصناف','توريد','استلام','صرف','نقل بضاعة','جرد المخزن','جرد'] },
    { cat: 'cat_prices',  sec: 'sec_work', w: ['أسعار','اسعار','قائمة أسعار','تسعير','تخفيض','هامش','تكلفة','سعر'] },
    { cat: 'cat_staff',   sec: 'sec_work', w: ['موظف','موظفين','عامل','عمال','تعميم','تعليمات','إنذار','انذار','مكافأة','راتب','رواتب','إداري','اداري','شؤون الموظفين'] },
    { cat: 'cat_reports', sec: 'sec_work', w: ['تقرير','تقارير','ملخص مبيعات','خطة عامة','متابعة عامة'] },
    // ─── تقني ───
    { cat: 'cat_bug',     sec: 'sec_tech', w: ['إصلاح الأخطاء','إصلاح خطأ','خطأ','أخطاء','اخطاء','بق','مشكلة','مشاكل','عطل','انهيار','كراش','crash','bug','error','فشل','توقف','التنزيلات','التنزيل','تنزيل','تحميل'] },
    { cat: 'cat_android', sec: 'sec_tech', w: ['android','أندرويد','اندرويد','تطبيق جوال','apk','كوتلن','kotlin','جافا','إصدار التطبيق'] },
    { cat: 'cat_github',  sec: 'sec_tech', w: ['github','جيت هب','مستودع','repo','repository','pull request','commit','ريبو','فرع'] },
    { cat: 'cat_ai',      sec: 'sec_tech', w: ['ذكاء اصطناعي','نماذج','برومبت','prompt','llm','تدريب','fine tune','وكلاء','وكيل برمجة','agent','نموذج لغوي','نموذج'] },
    { cat: 'cat_test',    sec: 'sec_tech', w: ['اختبار','اختبارات','تست','test','فحص','مراجعة كود','unit test','تحقق'] },
    { cat: 'cat_deploy',  sec: 'sec_tech', w: ['نشر','بناء','بناء ونشر','إصدار جديد','تحديثات','رفع','deploy','build','release','استضافة','سيرفر','خادم','دومين','حزمة'] },
    { cat: 'cat_code',    sec: 'sec_tech', w: ['برمجة','كود','شيفرة','دالة','دوال','api','قاعدة بيانات','refactor','إعادة هيكلة','تحسين أداء','مكتبة'] },
    // ─── شخصي ───
    { cat: 'cat_appt',    sec: 'sec_personal', w: ['موعد','مواعيد','دكتور','طبيب','مستشفى','عيادة','مقابلة','حجز موعد','موعد شخصي'] },
    { cat: 'cat_shopping',sec: 'sec_personal', w: ['شراء','أشتري','اشتري','مشتريات','تسوق','بقالة','خضار'] },
    { cat: 'cat_family',  sec: 'sec_personal', w: ['أسرة','اسرة','أهل','اهل','عيال','أولاد','اولاد','زوجة','والدتي','والدي','مناسبة','عزيمة','وليمة','زيارة'] },
    { cat: 'cat_goals',   sec: 'sec_personal', w: ['هدف','أهداف','اهداف','عادة','عادات','رياضة','مشي','قراءة','تطوير ذاتي','ورد يومي'] },
    { cat: 'cat_duties',  sec: 'sec_personal', w: ['التزام','التزامات','واجب','واجبات','مهمة يومية'] }
  ];

  /* ── الزمن: تعبيرات لهجة يمنية + فصحى ─────────────────────── */
  // النمط: { كلمات، إزاحة أيام، هل هو يوم أسبوع }
  const TIME_RULES = [
    // الأطول أولًا — «بعد العصر» قبل «العصر»، «بعد بكرة» قبل «بكرة»
    { w: ['بعد بكرة','بعد بكره','بعد غد','بعد غدا'], d: 2 },
    { w: ['بداية الشهر','أول الشهر','اول الشهر'], special: 'start_of_month' },
    { w: ['نهاية الشهر','آخر الشهر','اخر الشهر'], special: 'end_of_month' },
    { w: ['نهاية الأسبوع','نهاية الاسبوع','الويكند'], special: 'end_of_week' },
    { w: ['بعد أسبوع','بعد اسبوع','الأسبوع القادم','الاسبوع القادم','الأسبوع الجاي','الاسبوع الجاي'], d: 7 },
    { w: ['بعد شهر','الشهر القادم','الشهر الجاي','بعد شهر كامل'], d: 30 },
    { w: ['أمس','امس','البارحة','امبارح'], d: -1 },
    { w: ['بكرة','بكره','بكرا','غدا','غدًا','غد','الغد','باكر','لحق'], d: 1 },
    { w: ['اليوم','هاليوم','هذا اليوم','الان','الآن','حالا','حالًا'], d: 0 }
  ];

  // أيام الأسبوع: الاسم ← رقم (0=الأحد)
  const WEEKDAYS = {
    'الأحد': 0, 'الاحد': 0, 'يوم الأحد': 0,
    'الاثنين': 1, 'الإثنين': 1, 'الأثنين': 1, 'الاتنين': 1,
    'الثلاثاء': 2, 'الثلاثا': 2, 'يوم الثلاثاء': 2,
    'الأربعاء': 3, 'الاربعاء': 3, 'الأربعا': 3,
    'الخميس': 4, 'يوم الخميس': 4,
    'الجمعة': 5, 'الجمعه': 5,
    'السبت': 6, 'يوم السبت': 6
  };

  // فترات اليوم
  // ملاحظة: نستخدم كلمة واحدة لكل مفتاح، والترتيب في parsePeriod يحسم الأطول
  const PERIODS = [
    // الأطول/الأدق أولًا
    { w:'بعد المغرب', v:'18:30' },
    { w:'بعد العصر',  v:'16:00' },
    { w:'بعد العشاء', v:'21:00' },
    { w:'قبل الظهر',  v:'10:00' },
    { w:'بعد الظهر',  v:'13:00' },
    { w:'بعد الفجر',  v:'06:00' },
    { w:'الصباح', v:'08:00' }, { w:'صباحا', v:'08:00' }, { w:'صباحًا', v:'08:00' },
    { w:'بالصباح', v:'08:00' },
    { w:'الفجر', v:'05:00' },
    { w:'الظهر', v:'12:00' }, { w:'ظهرا', v:'12:00' }, { w:'ظهرًا', v:'12:00' },
    { w:'العصر', v:'15:30' }, { w:'العصرية', v:'15:30' },
    { w:'المغرب', v:'18:00' }, { w:'المغربية', v:'18:00' },
    { w:'الليل', v:'20:00' }, { w:'ليلا', v:'20:00' }, { w:'ليلاً', v:'20:00' },
    { w:'بالليل', v:'20:00' },
    { w:'العشاء', v:'20:00' }
  ];

  const PRIORITY_RULES = [
    { p: 'urgent', w: ['عاجل','عاجلًا','عاجلا','ضروري جدًا','ضروري جدا','طارئ','بسرعة','حالًا حالًا','فورا','فورًا','ما يتأخر','مستعجل'] },
    { p: 'high',   w: ['مهم','مهمة مهمة','أولوية','أولوية عالية','لازم اليوم','ما أنساه','لا تنسى','ضروري','أكيد','مؤكد'] },
    { p: 'low',    w: ['لاحقًا','لاحقا','إذا سمح الوقت','إن سمح الوقت','وقت فراغ','متى ما قدرت','مو مستعجل','غير عاجل','رواق','على راحتي'] }
  ];

  const REPEAT_RULES = [
    { r: 'daily',   w: ['كل يوم','يوميًا','يوميا','كل يومي','بشكل يومي','متكرر يوميًا','كل صباح','كل مساء','يوم بعد يوم'] },
    { r: 'weekly',  w: ['كل أسبوع','أسبوعيًا','اسبوعيا','كل اسبوع','بشكل أسبوعي','كل جمعة','كل سبت','كل خميس','أسبوع بعد أسبوع'] },
    { r: 'monthly', w: ['كل شهر','شهريًا','شهريا','بشكل شهري','كل نهاية شهر','شهر بعد شهر'] }
  ];

  // اكتشاف التكرار بأنماط صريحة — يمنع مطابقة «اليوم» مع «يوميًا»
  const REPEAT_PATTERNS = [
    { r: 'daily',   re: /(?:^|[\s،])(?:كل\s+يوم|يومي[ًاا]|يوم\s+بعد\s+يوم|كل\s+صباح|كل\s+مساء|بشكل\s+يومي)(?=[\s،.]|$)/u },
    { r: 'weekly',  re: /(?:^|[\s،])(?:كل\s+أسبوع|كل\s+اسبوع|أسبوعي[ًاا]|اسبوعي[ًاا]|أسبوع\s+بعد\s+أسبوع|بشكل\s+أسبوعي|كل\s+جمعة|كل\s+سبت|كل\s+خميس)(?=[\s،.]|$)/u },
    { r: 'monthly', re: /(?:^|[\s،])(?:كل\s+شهر|شهري[ًاا]|بشكل\s+شهري|كل\s+نهاية\s+شهر|شهر\s+بعد\s+شهر)(?=[\s،.]|$)/u }
  ];

  const SIZE_RULES = {
    large: ['مشروع','تقرير كامل','مراجعة كاملة','خطة','دراسة','تطوير','بناء','نشر','تصميم','جرد شامل','مقابلة','اجتماع','تحليل','إعداد كامل'],
    smallKw: ['مكالمة','اتصال','رسالة','تذكير','سؤال','تأكيد','إرسال','طباعة','توقيع','ملاحظة','مراجعة سريعة','تعديل بسيط']
  };

  const KIND_RULES = {
    meeting: ['اجتماع','مقابلة','اجتماع إداري','لقاء','مجلس'],
    reminder: ['تذكير','ذكرني','لا تنسى','تذكر'],
    ai_assist: ['خطاب','تعميم','رسالة','بريد','إيميل','صياغة','مسودة','برومبت','أجندة','قائمة','تقرير مبيعات','رسالة للعملاء','إعداد تقرير']
  };

  /* ── أدوات نصية ───────────────────────────────────────────── */
  function normalize(s) {
    if (!s) return '';
    return s
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '')  // تشكيل وتطويل
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[ؤئ]/g, 'ء')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // يزيل سوابق التعريف/الجر العربية: «ال» و«بال» و«لل» و«وال» و«فال»
  function stripArticle(w) {
    return w.replace(/^(?:وبال|فبال|وال|بال|كال|لل|ال|وب|فب|و|ف)/, '');
  }

  // يزيل لواحق الضمير والتأنيث الشائعة: «ها»، «ه»، «ين»، «ون»، «ات»، «ة»
  function stripSuffix(w) {
    return w.replace(/(?:ها|هما|هم|هن|كم|كن|نا|ي|ه|ة)$/, '');
  }

  // جذر تقريبي للمطابقة المرنة
  function stem(w) {
    let s = stripArticle(normalize(w));
    s = stripSuffix(s);
    return s.length >= 3 ? s : stripArticle(normalize(w));
  }

  /**
   * مطابقة كلمات مرنة مع العربية:
   * - تتجاهل «ال» التعريف والسوابق واللواحق
   * - تشترط أن تبدأ كلمة النص بنفس الجذر وتمتد بنفس الحرف الأول
   * هذا يمنع المطابقة الجزئية الخاطئة (مثل «سعر» داخل «سعيد»)
   * مع السماح بالاشتقاقات العربية (راكد/الراكدة/راكدة).
   */
  function hasAny(text, words) {
    const n = normalize(text);
    if (!n) return false;
    // نفصل النص إلى كلمات مرة واحدة
    const tokens = n.split(/[^\u0621-\u064A0-9a-zA-Z]+/).filter(Boolean);

    return words.some(w => {
      const nw = normalize(w);
      if (!nw) return false;

      // عبارة متعددة الكلمات: مطابقة مباشرة على النص
      if (nw.indexOf(' ') > -1) return n.indexOf(nw) > -1;

      const ws = stem(nw);
      if (ws.length < 3) {
        // كلمات قصيرة (مثل «بق»): مطابقة كلمة كاملة فقط
        return tokens.indexOf(nw) > -1;
      }

      return tokens.some(tok => {
        const ts = stem(tok);
        if (ts === ws) return true;
        // اشتقاق: يبدأ الجذر بالجذر المطلوب وفرق الطول ≤ 2
        if (ts.length > ws.length && ts.indexOf(ws) === 0 && ts.length - ws.length <= 2) return true;
        if (ws.length > ts.length && ws.indexOf(ts) === 0 && ws.length - ts.length <= 2) return true;
        return false;
      });
    });
  }

  function foundWords(text, words) {
    return words.filter(w => hasAny(text, [w]));
  }

  /* ── تقسيم النص إلى جمل/مهام ──────────────────────────────── */
  // يفصل على أدوات العطف والفصل الشائعة في الإملاء العربي
  function splitUtterances(raw) {
    if (!raw) return [];
    let s = String(raw).trim();
    if (!s) return [];

    // توحيد فواصل الإملاء
    s = s.replace(/\s*[.؛;!?؟,]\s*/g, ' | ')
         .replace(/\s*،\s*(?:و\s*)?/g, ' | ')
         // نقطع عند «و» دائمًا هنا، ثم نُعيد دمج الأسماء المعطوفة لاحقًا (mergeFragments)
         .replace(/\s+و(?=[\u0621-\u064A])/g, ' | ')
         .replace(/\s+(?:كمان|أيضًا|ايضا|برضو|برضه|كذالك|كذلك|وبعدها|بعدها|ثم)\s+/g, ' | ')
         .replace(/\s*\n+\s*/g, ' | ');

    const parts = s.split('|').map(p => p.trim()).filter(p => p.length > 1);

    // التخلص من البدايات الفارغة مثل "أريد" و"لازم"
    return parts.map(p => p
      .replace(/^(?:أريد|اريد|أبغى|ابغى|أبغا|ابغا|عندي|علينا|ذكرني|أضف|اضف|سجل|سجّل|أنا|ابي)\s+/u, '')
      .replace(/^و\s+/u, '')
      .trim()
    ).filter(p => p.length > 1);
  }

  // أدوات عطف داخل الجملة تُبقي الفعل مشتركًا: «أراجع المخزن وأسجل النواقص»
  // نعتبر «و + فعل مضارع» استمرارًا للجملة لا مهمة جديدة، إلا إذا طال المقطع.

  /**
   * يعالج المقاطع الناتجة عن التقسيم على «و»:
   * - «خضار» + «فواكه من السوق»  → يُدمجان (اسم معطوف، لا فعل)
   * - «أسجل النواقص»             → يبقى مستقلًا (فيه فعل)
   */
  function mergeFragments(parts) {
    if (parts.length < 2) return parts;

    // جذور الأفعال + صيغ المصادر الشائعة في الإملاء اليومي
    const VERB_ROOTS = /(?:راجع|تابع|جهز|صلح|شتري|نشر|بني|رسل|تصل|كلم|دفع|سدد|حصل|عمل|سجل|شوف|زور|رتب|سوي|كتب|حضر|ضيف|شغل|اتصل|حدّث|حدث|تحديث|طوّر|طور|تطوير|اختبر|اختبار|حلّل|حلل|تحليل|صمّم|صمم|تصميم|طبّق|طبق|تطبيق|أضف|اضف|إضافة|اضافة|سوّي|نسوي|اطلب|أطلب|طلب|بيع|اشتر|أشتر|عدّل|عدل|تعديل|غيّر|غير|تغيير|راقب|مراقبة|خطّط|خطط|تخطيط|انشئ|أنشئ|إنشاء|ادرس|أدرس|دراسة|درّب|درب|تدريب|جمّع|جمع|تجديد|افرز|أفرز|فرز|أنجز|انجز|إنجاز|سلّم|سلم|تسليم|استلم|تسلم|تحصيل|مراجعة|متابعة|تجهيز|إصلاح|اصلاح|شراء|نشر|بناء|إرسال|اتصال|تسجيل|إعداد|اعداد|صياغة|كتابة|تحقق|تحقّق|تأكد|تاكد|تأكّد|راجع|تتبع|تدقيق|فحص|مقارنة|مطابقة|ترتيب|تنظيف|تحديث|استرجاع|طبع|طباعة|توقيع|تسليم|إيداع|ايداع|سحب|إرجاع|ارجاع)/;

    // هل يبدأ المقطع بفعل (بصيغة متكلم/مخاطب/غائب)؟
    function startsWithVerb(seg) {
      const first = seg.split(/\s+/)[0] || '';
      if (first.length < 3) return false;
      // أفعال المتكلم/المخاطب تبدأ غالبًا بـ أ/ن/ي/ت
      const stripped = first.replace(/^[أنيت]/, '');
      if (VERB_ROOTS.test(first)) return true;
      if (VERB_ROOTS.test(stripped)) return true;
      // كلمة أولى قصيرة جدًا مع بقية مقطع من كلمتين ⇒ غالبًا اسم معطوف
      return false;
    }

    function hasOwnVerb(seg) {
      const w = seg.split(/\s+/);
      return w.length >= 2 && w.some((x, i) => i > 0 && VERB_ROOTS.test(x));
    }

    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const cur = parts[i].trim();
      if (!cur) continue;
      const words = cur.split(/\s+/).filter(Boolean);

      // مقطع لا يبدأ بفعل ولا يحوي فعلًا مستقلًا = اسم معطوف أو تكملة
      const isNounFragment = !startsWithVerb(cur) && !hasOwnVerb(cur);

      // عدد الكلمات الجوهرية (بدون حروف الجر والتعبيرات الزمنية)
      const STOP = /^(?:من|في|على|عن|إلى|الى|مع|عند|لدى|خلال|قبل|بعد|بـ|ب|لـ|ل|هذا|هذه|ذلك|بكرة|بكره|غدا|اليوم|امس|أمس|البارحة|كل|و)$/;
      const coreWords = words.filter(w => !STOP.test(w));

      // مؤشرات أن المقطع السابق لم يكتمل
      const prevEndsOpen = out.length > 0 &&
        /(?:^|\s)(?:من|في|على|عن|إلى|الى|مع|بـ|ب|لـ|ل|عند|لدى|خلال|قبل|بعد)\s*$/.test(out[out.length - 1]);

      // اسم معطوف بلا فعل: يُدمج إن كانت كلماته الجوهرية قليلة
      if (isNounFragment && out.length > 0 && (coreWords.length <= 3 || prevEndsOpen)) {
        const prev = out[out.length - 1];
        if (prev.length + cur.length < 115) {
          out[out.length - 1] = prev + ' و' + cur;
          continue;
        }
      }
      out.push(cur);
    }
    return out;
  }

  /* ── استخراج التاريخ ─────────────────────────────────────── */
  function parseDate(text, nowISO) {
    const base = nowISO || S().todayISO();
    const baseDate = new Date(base + 'T12:00:00');
    const ntext = normalize(text);

    // 1) تاريخ صريح رقمية: 2026-05-12 أو 12/5/2026
    let m = ntext.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return { date: y + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0'), source: 'صريح' };
      }
    }
    // 12/5/2026 (يوم/شهر/سنة)
    m = ntext.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) {
      const d = +m[1], mo = +m[2], y = +m[3];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return { date: y + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0'), source: 'صريح' };
      }
    }
    // 12/5 (يوم/شهر، السنة الحالية أو القادمة)
    m = ntext.match(/(?:^|\s)(\d{1,2})[\/\-](\d{1,2})(?=\s|$)/);
    if (m) {
      const d = +m[1], mo = +m[2];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        let y = baseDate.getFullYear();
        let cand = new Date(y, mo - 1, d, 12);
        if ((cand - baseDate) / 86400000 < -180) { y++; cand = new Date(y, mo - 1, d, 12); }
        return { date: cand.getFullYear() + '-' + String(cand.getMonth()+1).padStart(2,'0') +
                 '-' + String(cand.getDate()).padStart(2,'0'), source: 'صريح' };
      }
    }

    // 2) "بعد N أيام / أسابيع / أشهر"
    m = ntext.match(/بعد\s+(\d+)\s*(يوم|ايام|أيام|اسبوع|أسابيع|اسابيع|شهر|اشهر|أشهر)/);
    if (m) {
      const n = +m[1];
      const unit = m[2];
      const mult = /يوم|ايام/.test(unit) ? 1 : /اسبوع|أسابيع|اسابيع/.test(unit) ? 7 : 30;
      return { date: S().addDaysISO(base, n * mult), source: 'نسبي' };
    }

    // 2ب) «بعد N يوم» بصيغة أخرى، و«خلال N يوم»
    m = ntext.match(/(?:خلال|في غضون)\s+(\d+)\s*(يوم|ايام|أيام|اسبوع|اسابيع|شهر|اشهر)/);
    if (m) {
      const n = +m[1];
      const unit = m[2];
      const mult = /يوم|ايام/.test(unit) ? 1 : /اسبوع|اسابيع/.test(unit) ? 7 : 30;
      return { date: S().addDaysISO(base, n * mult), source: 'نسبي' };
    }

    // 3) كلمات التوقيت النسبي
    for (const r of TIME_RULES) {
      if (hasAny(text, r.w)) {
        if (r.d !== undefined) return { date: S().addDaysISO(base, r.d), source: 'نسبي' };
        if (r.special === 'end_of_month') {
          const last = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 12);
          return { date: S().todayISO(last), source: 'نسبي' };
        }
        if (r.special === 'start_of_month') {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1, 12);
          return { date: S().todayISO(d), source: 'نسبي' };
        }
        if (r.special === 'end_of_week') {
          // أقرب خميس/جمعة
          const dow = baseDate.getDay();
          const delta = (5 - dow + 7) % 7 || 7;
          return { date: S().addDaysISO(base, delta), source: 'نسبي' };
        }
      }
    }

    // 4) اسم يوم الأسبوع ("الاثنين" = الأقرب القادم)
    for (const name in WEEKDAYS) {
      const nn = normalize(name).replace(/^يوم\s+/, '');
      const re = new RegExp('(^|[\\s،])' + nn + '(?![\\u0621-\\u064A])', 'u');
      if (re.test(ntext)) {
        const target = WEEKDAYS[name];
        let delta = (target - baseDate.getDay() + 7) % 7;
        if (delta === 0) delta = 7; // "الاثنين" يعني القادم لا اليوم
        return { date: S().addDaysISO(base, delta), source: 'يوم أسبوع' };
      }
    }

    return { date: null, source: null };
  }

  function parsePeriod(text) {
    const n = normalize(text);

    // ١) «الساعة X» صريحة — لها الأولوية على فترات اليوم العامة
    //    (لأن «الساعة عشر الصباح» تعني 10:00 لا 08:00)
    const HOUR_WORDS = {
      'واحده':1, 'واحدة':1, 'واحد':1, 'الثانيه':2, 'الثانية':2, 'الثاني':2, 'اثنتين':2, 'اثنين':2,
      'ثلاثه':3, 'ثلاثة':3, 'ثلاث':3, 'اربعه':4, 'أربعة':4, 'اربعة':4, 'اربع':4, 'أربع':4,
      'خمسه':5, 'خمسة':5, 'خمس':5, 'سته':6, 'ستة':6, 'ست':6,
      'سبعه':7, 'سبعة':7, 'سبع':7, 'ثمانيه':8, 'ثمانية':8, 'ثماني':8, 'ثمان':8,
      'تسعه':9, 'تسعة':9, 'تسع':9, 'عشره':10, 'عشرة':10, 'عشر':10,
      'احدعشر':11, 'احد عشر':11, 'اثناعشر':12, 'اثنا عشر':12, 'اثني عشر':12
    };

    // رقمي: «الساعة 10:30» أو «الساعة 3 مساء»
    let mNumeric = n.match(/(?:الساعه|الساعة)\s*(\d{1,2})(?::(\d{2}))?\s*(صباحا|صباحًا|صباح|مساء|مساءً|ظهرا|ظهرًا|ظهر|عصرا|عصرًا|عصر|ليلا|ليلًا|ليل)?/);
    if (mNumeric) {
      let h = +mNumeric[1];
      const mi = mNumeric[2] ? +mNumeric[2] : 0;
      const ap = mNumeric[3] || '';
      if (/مساء|عصر|ليل/.test(ap) && h < 12) h += 12;
      if (/ظهر/.test(ap) && h < 12 && h !== 12) { /* الظهر يبقى كما هو إن كان 12 */ if (h < 9) h += 12; }
      if (h >= 0 && h <= 23 && mi <= 59) return String(h).padStart(2,'0') + ':' + String(mi).padStart(2,'0');
    }

    // كلمات: «الساعة عشر»، «الساعة سبع»
    const mHour = n.match(/(?:الساعه|الساعة)\s+([\u0621-\u064A]+)/u);
    if (mHour) {
      const w = mHour[1];
      let h = HOUR_WORDS[w] || HOUR_WORDS[stripArticle(w)] || HOUR_WORDS[stripSuffix(w)];
      if (h) {
        const isPM = /(?:مساء|عصر|ليل|بعد\s+الظهر|بعد\s+العصر|بعد\s+المغرب|بالليل|ليلا|الليل)/.test(n);
        if (isPM && h < 12) h += 12;
        return String(h).padStart(2,'0') + ':00';
      }
    }

    // ٢) فترات اليوم العامة (الترتيب مهم: الأطول أولًا)
    for (const p of PERIODS) {
      if (n.indexOf(normalize(p.w)) > -1) return p.v;
    }

    // ٣) وقت بصيغة HH:MM مجردة
    const m = n.match(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$)/);
    if (m) {
      const h = +m[1], mi = +m[2];
      if (h <= 23 && mi <= 59) return String(h).padStart(2,'0') + ':' + String(mi).padStart(2,'0');
    }
    return null;
  }

  /* ── استخراج اسم العميل/المندوب/الصنف ────────────────────── */
  // كلمات توقف: لا تُعتبر جزءًا من الاسم
  const STOP_WORDS = ['عن','من','في','على','بشان','بشأن','بخصوص','لان','لأن','حتى','مع','و','الى','إلى',
    'خلال','قبل','بعد','عشان','شان','عند','لدى','هذا','هذه','ذلك','الذي','التي','ضد','حول','بس','بسعر',
    'مبلغ','مقدار','قيمة','الاجل','الدفعة','الدفعه','كامل','كاملة','ريال','دولار',
    // تعبيرات الوقت — ليست أسماء
    'اليوم','هاليوم','بكرة','بكره','بكرا','غدا','غدًا','الغد','باكر','لحق','امس','أمس','البارحة','امبارح',
    'الصباح','الظهر','العصر','المغرب','الليل','العشاء','الفجر','بالصباح','بالليل',
    'الاحد','الاثنين','الثلاثاء','الاربعاء','الأربعاء','الخميس','الجمعة','السبت',
    'كل','يوميًا','يوميا','اسبوعيًا','شهريًا','عاجل','عاجلًا','ضروري','لاحقًا','مستعجل','فورًا'];

  // يقتطع الجملة عند أول كلمة توقف أو رقم أو علامة ترقيم
  function trimEntityName(s) {
    if (!s) return '';
    let v = String(s).trim();
    // قطع عند الأرقام
    v = v.replace(/\d.*$/, '').trim();
    // قطع عند أول كلمة توقف
    const parts = v.split(/\s+/);
    const kept = [];
    for (const p of parts) {
      const np = normalize(p);
      if (STOP_WORDS.indexOf(np) > -1) break;
      if (np.length < 2) break;
      kept.push(p);
      if (kept.length >= 2) break;   // اسم أو اسمان كحد أقصى
    }
    v = kept.join(' ').trim();
    // قطع عند علامات الترقيم
    v = v.replace(/[،,.!؟;:\-]+.*$/, '').trim();
    return v.length > 1 && v.length < 40 ? v : '';
  }

  function parseEntities(text) {
    const out = { client: '', rep: '', branch: '', item: '' };
    const patterns = [
      ['client', /(?:العميل|عميل|العميله|العميلة|الحاج|الشيخ|الأخ|الاخ)\s+([^\n،,.!؟;:]{2,40})/u],
      ['rep',    /(?:المندوب|مندوب|الموزع|موزع)\s+([^\n،,.!؟;:]{2,40})/u],
      ['branch', /(?:فرع|الفرع|محل|المحل|محلات)\s+([^\n،,.!؟;:]{2,40})/u],
      ['item',   /(?:صنف|الصنف|منتج|المنتج)\s+([^\n،,.!؟;:]{2,40})/u]
    ];
    patterns.forEach(([key, re]) => {
      const m = text.match(re);
      if (m && m[1]) {
        const v = trimEntityName(m[1]);
        if (v) out[key] = v;
      }
    });
    return out;
  }

  function parseAmount(text) {
    const n = normalize(text);
    // أرقام عربية-هندية
    const digitMap = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
    const ar = n.replace(/[٠-٩]/g, d => digitMap[d]);

    // 1) صيغة «N ألف» أولًا (قبل الرقم المجرد) لتفادي قراءة 5 بدل 5000
    let m = ar.match(/(\d[\d,\.]*)\s*(?:الف|ألف)/);
    if (m) {
      const num = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 0) return { amount: num * 1000, raw: m[0].trim() };
    }

    // 2) أرقام مكتوبة بالكلمات: «خمسة آلاف»، «عشرة آلاف»، «مئة ألف»
    //    نعمل على النص المُطبَّع حتى تتوحد الصيغ (مائة/ماءه/مئه)
    //    ونرتب من الأطول إلى الأقصر حتى لا يُقرأ جزء من العبارة
    const WORD_NUMS = [
      { w: 'مليون', v: 1000000 },
      { w: 'مايه الف', v: 100000 }, { w: 'ماءه الف', v: 100000 }, { w: 'مئه الف', v: 100000 },
      { w: 'ميه الف', v: 100000 }, { w: 'مايه الف', v: 100000 },
      { w: 'خمسين الف', v: 50000 }, { w: 'اربعين الف', v: 40000 }, { w: 'ثلاثين الف', v: 30000 },
      { w: 'عشرين الف', v: 20000 }, { w: 'عشره الاف', v: 10000 }, { w: 'عشر الاف', v: 10000 },
      { w: 'خمسه الاف', v: 5000 }, { w: 'خمس الاف', v: 5000 },
      { w: 'اربعه الاف', v: 4000 }, { w: 'اربعه الاف', v: 4000 }, { w: 'اربع الاف', v: 4000 },
      { w: 'ثلاثه الاف', v: 3000 }, { w: 'ثلاث الاف', v: 3000 },
      { w: 'الفين', v: 2000 }, { w: 'الفان', v: 2000 }, { w: 'الفى', v: 2000 },
      { w: 'مايه', v: 100 }, { w: 'ماءه', v: 100 }, { w: 'مئه', v: 100 }, { w: 'ميه', v: 100 },
      { w: 'الف', v: 1000 }
    ];
    for (const wn of WORD_NUMS) {
      if (ar.indexOf(wn.w) > -1) return { amount: wn.v, raw: wn.w };
    }

    // 3) رقم مجرد مع أو بدون عملة
    m = ar.match(/(\d[\d,\.]*)\s*(?:ريال|ر\.ي|ر س|دولار|ريالا)?/);
    if (m && m[1]) {
      const num = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 0) return { amount: num, raw: m[0].trim() };
    }

    return { amount: null, raw: null };
  }

  /* ── التصنيف الرئيسي ─────────────────────────────────────── */
  function classify(text) {
    let best = null, bestScore = 0, bestSec = null, bestMatched = [];

    // ── إشارات قوية تُحسم مباشرة ──
    // وجود مبلغ أو فعل تحصيل أو اسم عميل ⇒ قسم العمل / تحصيل المستحقات
    const n = normalize(text);
    const hasAmount = parseAmount(text).amount !== null;
    const collectVerb = /(?:تحصيل|احصل|أحصل|نحصل|أسدد|اسدد|سدد|يسدد|اقبض|أقبض|مستحق|متاخر|ديون|مديون)/.test(n);
    const hasClient = /(?:العميل|عميل|الحاج|الشيخ)/.test(n);
    const workSignal = /(?:حساب|مخزن|بضاعه|مبيعات|مندوب|موزع|اسعار|سعر|موظف|فاتوره|جرد|طلبي|توريد|فرع|محل)/.test(n);

    if ((hasAmount && (collectVerb || hasClient)) || (collectVerb && hasClient)) {
      return { sectionId: 'sec_work', categoryId: 'cat_collect',
               confidence: 1, matched: ['إشارة تحصيل مؤكدة'] };
    }

    // التقارير والإجتماعات لها أولوية على المبيعات عند ذكر «تقرير»
    if (/(?:^|\s)(?:تقرير|تقارير|ملخص)(?=\s|$)/.test(n)) {
      if (workSignal || /مبيعات|بيع/.test(n)) {
        return { sectionId: 'sec_work', categoryId: 'cat_reports',
                 confidence: 0.9, matched: ['تقرير'] };
      }
    }

    // عطل/خطأ صريح في تطبيق ⇒ إصلاح الأخطاء لا «تطبيقات أندرويد»
    const bugSignal = /(?:مشكله|خطا|اخطاء|بق|عطل|انهيار|كراش|crash|bug|error|فشل|توقف|لا\s+يعمل|ما\s+يعمل)/.test(n);
    const androidSignal = /(?:android|اندرويد|apk|كوتلن|kotlin)/.test(n);
    if (bugSignal) {
      if (androidSignal) return { sectionId: 'sec_tech', categoryId: 'cat_bug', confidence: 0.95, matched: ['خطأ في تطبيق'] };
      if (/(?:تنزيل|تحميل)/.test(n)) return { sectionId: 'sec_tech', categoryId: 'cat_bug', confidence: 0.9, matched: ['مشكلة تنزيل'] };
    }

    CAT_RULES.forEach(rule => {
      let score = 0;
      const matched = [];
      rule.w.forEach(w => {
        if (hasAny(text, [w])) {
          // العبارات المركّبة (بمسافة) أدق من الكلمة المفردة → وزن أعلى
          const weight = w.indexOf(' ') > -1 ? 4 : (w.length >= 6 ? 1.5 : 1);
          score += weight;
          matched.push(w);
        }
      });
      // تعزيز: إشارات العمل ترفع تصنيفات قسم العمل
      if (score > 0 && rule.sec === 'sec_work' && workSignal) score += 0.5;
      if (score > bestScore) {
        bestScore = score; best = rule.cat; bestSec = rule.sec; bestMatched = matched;
      }
    });

    if (!best) return { sectionId: 'sec_personal', categoryId: 'cat_duties', confidence: 0, matched: [] };
    return {
      sectionId: bestSec,
      categoryId: best,
      confidence: Math.min(1, bestScore / 5),
      matched: bestMatched
    };
  }

  /* ── بناء مهمة من مقطع نصي ───────────────────────────────── */
  function taskFromSegment(seg, opts) {
    opts = opts || {};
    const cls = classify(seg);
    const dt = parseDate(seg, opts.nowISO);
    const period = parsePeriod(seg);

    let priority = 'normal';
    for (const rule of PRIORITY_RULES) {
      if (hasAny(seg, rule.w)) { priority = rule.p; break; }
    }

    let repeat = 'none';
    const nSeg = normalize(seg);
    for (const rp of REPEAT_PATTERNS) {
      if (rp.re.test(nSeg)) { repeat = rp.r; break; }
    }

    let kind = 'task';
    for (const k in KIND_RULES) {
      if (hasAny(seg, KIND_RULES[k])) { kind = k; break; }
    }

    let size = 'small';
    if (hasAny(seg, SIZE_RULES.large)) size = 'large';
    else if (hasAny(seg, SIZE_RULES.smallKw)) size = 'small';

    const ent = parseEntities(seg);
    const amt = parseAmount(seg);

    // عنوان نظيف ومختصر
    let title = seg
      .replace(/^(?:ان|أن|إني|اني)\s+/u, '')
      .trim();

    // ١) إزالة تعبيرات الوقت أولًا (التاريخ والوقت لهما حقولهما الخاصة)
    //    نعمل على نسخة منقّصة، لكن نتحقق أن العنوان لن يصبح فارغًا
    const timeExpressions = [
      'بعد المغرب','بعد العصر','بعد العشاء','بعد الظهر','قبل الظهر','بعد الفجر',
      'الصباح','بالصباح','الظهر','العصر','المغرب','الليل','بالليل','العشاء','الفجر',
      'بعد بكرة','بعد بكره','بعد غد','بعد غدا','بكرة','بكره','بكرا','غدا','غدًا','الغد','باكر',
      'اليوم','هاليوم','أمس','امس','البارحة','امبارح',
      'نهاية الشهر','آخر الشهر','اخر الشهر','بداية الشهر','أول الشهر','اول الشهر',
      'نهاية الأسبوع','نهاية الاسبوع','الويكند','الأسبوع القادم','الاسبوع القادم',
      'الشهر القادم','بعد أسبوع','بعد اسبوع','بعد شهر',
      // أسماء أيام الأسبوع — تُنقل لحقل التاريخ
      'يوم الأحد','يوم الاثنين','يوم الثلاثاء','يوم الأربعاء','يوم الخميس','يوم الجمعة','يوم السبت',
      'الأحد','الاحد','الاثنين','الإثنين','الأثنين','الاتنين','الثلاثاء','الثلاثا',
      'الأربعاء','الاربعاء','الأربعا','الخميس','الجمعة','الجمعه','السبت',
      // التكرار
      'كل يوم','كل أسبوع','كل اسبوع','كل شهر','يوميًا','يوميا','أسبوعيًا','اسبوعيا','شهريًا','شهريا',
      // الأولوية
      'عاجل','عاجلًا','عاجلا','بسرعة','فورًا','فورا','مستعجل','لاحقًا','لاحقا','ضروري',
      'مهم جدًا','مهم جدا','ما يتأخر'
    ];
    let stripped = title;
    timeExpressions.forEach(exp => {
      const re = new RegExp('(^|[\\s،])' + exp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|،|$)', 'u');
      stripped = stripped.replace(re, '$1');
    });
    // إزالة «الساعة <كلمة>» كاملة (بعد أن نُقل الوقت لحقله)
    stripped = stripped.replace(/(?:^|\s)الساع[هة]\s+[\u0621-\u064A]+/u, ' ');
    stripped = stripped.replace(/\s{2,}/g, ' ').replace(/^[\s،,]+|[\s،,]+$/g, '').trim();
    if (stripped.length >= 4) title = stripped;   // نتبنّى النسخة المنقّصة فقط إن بقيت ذات معنى

    // ٢) تحويل الأفعال المضارعة في البداية إلى صيغة اسمية أوضح
    const VERB_MAP = [
      [/^(?:أراجع|اراجع|راجع|راجعت|نراجع)\s+/u, 'مراجعة '],
      [/^(?:أتابع|اتابع|تابع|تابعت|نتبع)\s+/u, 'متابعة '],
      [/^(?:أجهز|اجهز|جهز|جهزت|أحضر|احضر|نحضر)\s+لي\s+/u, 'تجهيز '],
      [/^(?:أجهز|اجهز|جهز|جهزت|أحضر|احضر|نحضر)\s+/u, 'تجهيز '],
      [/^(?:اتصل|أكلم|اكلم|كلم|اتكلم)\s+/u, 'الاتصال بـ '],
      [/^(?:أرسل|ارسل|رسل)\s+/u, 'إرسال '],
      [/^(?:أدفع|ادفع|دفع|أسدد|اسدد|سدد|يسدد|نحصل|أحصل|احصل|تحصل)\s+/u, 'تحصيل '],
      [/^(?:أرتب|ارتب|رتب)\s+/u, 'ترتيب '],
      [/^(?:أشوف|اشوف|شوف)\s+/u, 'مراجعة '],
      [/^(?:أزور|ازور|زر)\s+/u, 'زيارة '],
      [/^(?:أشتري|اشتري|اشتر)\s+/u, 'شراء '],
      [/^(?:أصلح|اصلح|صلح)\s+/u, 'إصلاح '],
      [/^(?:نراجع|نرتب|ننشر|نبني|نطور|نسجل|نسوّي|نسوي)\s+/u, 'تجهيز '],
      [/^(?:أعمل|اعمل)\s+/u, 'إعداد '],
      [/^(?:لازم|يجب|ضروري)\s+(?:لازم\s+)?/u, '']
    ];
    for (const [re, rep] of VERB_MAP) {
      if (re.test(title)) { title = title.replace(re, rep); break; }
    }

    // إزالة حشو الكلام اليمني/العامي من بداية العنوان
    title = title
      .replace(/^(?:عندنا|عندي|احنا|إحنا|نحن|لازم\s+لازم)\s+/u, '')
      .replace(/^(?:بس|كذا|هيك|زين)\s+/u, '')
      .trim();

    title = title.replace(/\s{2,}/g, ' ').replace(/^[\s،,]+|[\s،,]+$/g, '').trim();

    if (title.length < 2) title = seg.slice(0, 90);
    if (title.length > 90) title = title.slice(0, 87) + '…';

    // المهام المتكررة بلا تاريخ صريح: أول موعد هو اليوم (أو الغد إن ذُكر وقت مضى)
    // «كل يوم أراجع الحسابات» → تبدأ اليوم، وتتكرر يوميًا بعد ذلك
    let dueDate = dt.date;
    if (repeat !== 'none' && !dueDate) dueDate = S().todayISO();

    const t = S().newTask({
      title: title,
      sectionId: cls.sectionId,
      categoryId: cls.categoryId,
      priority: priority,
      size: size,
      kind: kind,
      dueDate: dueDate,
      repeat: repeat,
      notes: period ? 'الوقت المقترح: ' + period : '',
      client: ent.client, rep: ent.rep, branch: ent.branch, item: ent.item,
      amount: amt.amount,
      _meta: { confidence: cls.confidence, matched: cls.matched, dateSource: dt.source, period: period }
    });
    return t;
  }

  /* ── الواجهة العامة للمحلّل المحلي ────────────────────────── */
  function parseLocal(rawText, opts) {
    const segments = mergeFragments(splitUtterances(rawText));
    if (!segments.length) return { tasks: [], engine: 'local', segments: 0 };
    const tasks = segments.map(seg => taskFromSegment(seg, opts));
    return { tasks, engine: 'local', segments: segments.length };
  }

  /* ═══════════════════════════════════════════════════════════
     طبقة الذكاء الاصطناعي الاختيارية
     لا مفتاح API في الواجهة — العنوان فقط، والمفتاح يبقى على
     الخادم أو يُدار من الإعدادات كمتغير بيئة.
     ═══════════════════════════════════════════════════════════ */
  function buildPrompt(text, sections, categories, today) {
    const secList = sections.map(s =>
      '- ' + s.id + ' :: ' + s.name + ' :: تصنيفاته: ' +
      categories.filter(c => c.sectionId === s.id).map(c => c.id + '=' + c.name).join(', ')
    ).join('\n');

    return [
      'أنت مساعد تنظيم مهام عربي. حوّل النص التالي إلى مهام منفصلة بصيغة JSON فقط.',
      'لا تختلق أي اسم أو رقم أو تاريخ غير موجود في النص. اترك الحقل null إن لم يتوفر.',
      'اليوم الحالي: ' + today + ' (توقيت المستخدم).',
      '',
      'الأقسام المتاحة:',
      secList,
      '',
      'أعد كائنًا بهذا الشكل بالضبط:',
      '{"tasks":[{"title":"عنوان مختصر","sectionId":"معرف القسم","categoryId":"معرف التصنيف أو null",',
      '"dueDate":"YYYY-MM-DD أو null","priority":"low|normal|high|urgent","size":"small|large",',
      '"kind":"task|meeting|reminder|ai_assist","repeat":"none|daily|weekly|monthly",',
      '"client":"","rep":"","branch":"","item":"","amount":null,"quantity":null,"notes":""}]}',
      '',
      'النص:',
      '"""' + text + '"""'
    ].join('\n');
  }

  async function parseRemote(rawText, opts) {
    const st = S().state;
    const endpoint = (st.settings.aiEndpoint || '').trim();
    if (!endpoint) return { error: 'no_endpoint' };

    const today = S().todayISO();
    const prompt = buildPrompt(rawText, st.sections, st.categories, today);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: st.settings.aiModel || undefined,
          messages: [
            { role: 'system', content: 'أنت محلل مهام عربي. تُخرج JSON صالحًا فقط.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);

      if (!res.ok) return { error: 'http_' + res.status };
      const data = await res.json();
      const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
                    || data.content || data.text || '';
      if (!content) return { error: 'empty_response' };

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { error: 'bad_json' };
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) return { error: 'bad_shape' };

      const tasks = parsed.tasks.map(p => {
        const sec = st.sections.find(s => s.id === p.sectionId) ? p.sectionId :
                    (st.sections.find(s => s.short === p.sectionId) ? st.sections.find(s => s.short === p.sectionId).id : 'sec_personal');
        const catOk = st.categories.some(c => c.id === p.categoryId && c.sectionId === sec);
        return S().newTask({
          title: (p.title || '').slice(0, 120) || 'مهمة',
          sectionId: sec,
          categoryId: catOk ? p.categoryId : null,
          dueDate: /^\d{4}-\d{2}-\d{2}$/.test(p.dueDate || '') ? p.dueDate : null,
          priority: ['low','normal','high','urgent'].includes(p.priority) ? p.priority : 'normal',
          size: p.size === 'large' ? 'large' : 'small',
          kind: ['task','meeting','reminder','ai_assist'].includes(p.kind) ? p.kind : 'task',
          repeat: ['none','daily','weekly','monthly'].includes(p.repeat) ? p.repeat : 'none',
          client: p.client || '', rep: p.rep || '', branch: p.branch || '', item: p.item || '',
          amount: (typeof p.amount === 'number' && isFinite(p.amount)) ? p.amount : null,
          quantity: (typeof p.quantity === 'number' && isFinite(p.quantity)) ? p.quantity : null,
          notes: p.notes || '',
          _meta: { confidence: 0.9, source: 'ai' }
        });
      });
      return { tasks, engine: 'ai', segments: tasks.length };
    } catch (e) {
      clearTimeout(timer);
      return { error: e.name === 'AbortError' ? 'timeout' : 'network' };
    }
  }

  // الواجهة الموحّدة: تجرب AI إن وُجد، وإلا المحلي، وتبقى تعمل دائمًا
  async function parse(rawText, opts) {
    opts = opts || {};
    const st = S().state;
    const useAI = opts.force !== 'local' && !!st.settings.aiEndpoint;

    if (useAI) {
      const r = await parseRemote(rawText, opts);
      if (r && r.tasks && r.tasks.length) return r;
      // الفشل لا يعطّل التطبيق — نعود للمحلي
      const local = parseLocal(rawText, opts);
      local.fellBack = true;
      local.reason = r && r.error;
      return local;
    }
    return parseLocal(rawText, opts);
  }

  global.DH = global.DH || {};
  global.DH.ai = {
    parse, parseLocal, parseRemote,
    splitUtterances, classify, parseDate, parsePeriod,
    parseEntities, parseAmount, normalize,
    CAT_RULES
  };
})(window);