/* ═══════════════════════════════════════════════════════════════
   دفتر هود الذكي — «أقدر أساعدك فيها» (assist.js)
   ───────────────────────────────────────────────────────────────
   يولّد مسودات قابلة للتعديل والنسخ، بثلاث نبرات حسب القسم.
   قاعدة إلزامية: لا اختلاق لأي اسم أو رقم أو تاريخ أو نتيجة.
   كل معلومة ناقصة تظهر كحقل [بين قوسين]، وتُختم المسودة بسطر
   «أحتاج منك:» يعدّد النواقص.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const S = () => DH.store;

  /* ── أنواع المسودات المدعومة ─────────────────────────────── */
  const ASSIST_TYPES = [
    { id: 'letter_staff',   label: 'خطاب رسمي للموظفين',        icon: '📄', sections: ['sec_work'],
      needs: ['اسم الموظف أو الفئة المستهدفة', 'الموضوع/السبب', 'المطلوب من الموظف', 'تاريخ التنفيذ'] },
    { id: 'circular_reps',  label: 'تعميم للمندوبين',           icon: '📢', sections: ['sec_work'],
      needs: ['الموضوع', 'الفترة الزمنية', 'المنطقة أو الفرع', 'التعليمات المطلوبة'] },
    { id: 'collection_msg', label: 'رسالة تحفيز على المستحقات', icon: '💰', sections: ['sec_work'],
      needs: ['اسم العميل', 'المبلغ المستحق', 'تاريخ الاستحقاق', 'طريقة السداد'] },
    { id: 'sales_report',   label: 'تجهيز تقرير مبيعات',        icon: '📊', sections: ['sec_work'],
      needs: ['الفترة', 'الفرع/المندوب', 'أرقام المبيعات والكميات', 'الأصناف المطلوب تفصيلها'] },
    { id: 'agenda',         label: 'تجهيز أجندة اجتماع',        icon: '🗓️', sections: ['sec_work','sec_tech','sec_personal'],
      needs: ['موضوع الاجتماع', 'الحاضرون', 'المدة المتاحة', 'القرارات المطلوبة'] },
    { id: 'followup_list',  label: 'قائمة متابعة',              icon: '✔️', sections: ['sec_work','sec_personal'],
      needs: ['الموضوع', 'نطاق المتابعة', 'من المسؤول', 'المدة'] },
    { id: 'email',          label: 'كتابة بريد إلكتروني',       icon: '✉️', sections: ['sec_work','sec_personal'],
      needs: ['الجهة المرسل إليها', 'الموضوع', 'الطلب الأساسي', 'المهلة'] },
    { id: 'plan',           label: 'إعداد خطة عمل',             icon: '🎯', sections: ['sec_work','sec_tech','sec_personal'],
      needs: ['الهدف', 'المدة', 'الموارد المتاحة', 'معايير النجاح'] },
    { id: 'bug_prompt',     label: 'برومبت لإصلاح مشكلة برمجية', icon: '🐞', sections: ['sec_tech'],
      needs: ['اسم المشروع والمستودع', 'وصف المشكلة', 'خطوات إعادة الإنتاج', 'بيئة التشغيل والنسخة'] },
    { id: 'fix_plan',       label: 'خطة إصلاح تقنية',           icon: '🔧', sections: ['sec_tech'],
      needs: ['المشكلة', 'الملفات المتوقعة', 'الاختبارات الموجودة', 'معيار نجاح الإصلاح'] },
    { id: 'release_note',   label: 'ملاحظات إصدار / تحديث',     icon: '🚀', sections: ['sec_tech'],
      needs: ['رقم الإصدار', 'التغييرات', 'ما تم إصلاحه'] },
    { id: 'daily_plan',     label: 'خطة يوم',                   icon: '☀️', sections: ['sec_personal'],
      needs: ['الأعمال الأساسية', 'الوقت المتاح', 'الالتزامات الثابتة'] }
  ];

  function typesFor(sectionId) {
    return ASSIST_TYPES.filter(t => t.sections.includes(sectionId));
  }

  /* ── أدوات: تعبئة الفراغات ───────────────────────────────── */
  // يعيد القيمة إن وُجدت فعلًا، وإلا يعيد حقلًا بين قوسين
  function orField(val, label) {
    const v = (val === null || val === undefined) ? '' : String(val).trim();
    if (!v || v === '0') return '[' + label + ']';
    return v;
  }

  function fmtAmount(a) {
    if (a === null || a === undefined || isNaN(a)) return null;
    return new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 }).format(a);
  }

  // جمع النواقص الفعلية بناءً على ما توفّر
  function collectNeeds(type, ctx) {
    const missing = [];
    const n = (v) => !v || !String(v).trim();

    switch (type) {
      case 'letter_staff':
        if (n(ctx.staffName)) missing.push('اسم الموظف أو الفئة المستهدفة');
        if (n(ctx.subject)) missing.push('موضوع الخطاب وسببه');
        if (n(ctx.demand)) missing.push('المطلوب من الموظف بالتفصيل');
        if (n(ctx.deadline)) missing.push('تاريخ التنفيذ المطلوب');
        break;
      case 'circular_reps':
        if (n(ctx.subject)) missing.push('موضوع التعميم');
        if (n(ctx.period)) missing.push('الفترة الزمنية المشمولة');
        if (n(ctx.region)) missing.push('المنطقة أو الفرع');
        if (n(ctx.demand)) missing.push('التعليمات المطلوبة من المندوبين');
        break;
      case 'collection_msg':
        if (n(ctx.clientName)) missing.push('اسم العميل');
        if (n(ctx.amount)) missing.push('المبلغ المستحق');
        if (n(ctx.duePayment)) missing.push('تاريخ استحقاق المبلغ');
        if (n(ctx.payMethod)) missing.push('طريقة السداد المقترحة');
        break;
      case 'sales_report':
        if (n(ctx.period)) missing.push('الفترة التي يغطيها التقرير');
        if (n(ctx.scope)) missing.push('الفرع أو المندوب');
        if (n(ctx.numbers)) missing.push('أرقام المبيعات والكميات الفعلية');
        break;
      case 'agenda':
        if (n(ctx.subject)) missing.push('موضوع الاجتماع');
        if (n(ctx.people)) missing.push('أسماء الحاضرين');
        if (n(ctx.duration)) missing.push('المدة المتاحة للاجتماع');
        if (n(ctx.decisions)) missing.push('القرارات المطلوب الخروج بها');
        break;
      case 'email':
        if (n(ctx.recipient)) missing.push('الجهة المرسل إليها');
        if (n(ctx.subject)) missing.push('موضوع البريد');
        if (n(ctx.demand)) missing.push('الطلب الأساسي');
        break;
      case 'bug_prompt':
      case 'fix_plan':
        if (n(ctx.repo)) missing.push('اسم المشروع والمستودع');
        if (n(ctx.problem)) missing.push('وصف المشكلة بدقة');
        if (n(ctx.steps)) missing.push('خطوات إعادة إنتاج المشكلة');
        if (n(ctx.env)) missing.push('بيئة التشغيل وإصدارات الأدوات');
        if (type === 'fix_plan' && n(ctx.tests)) missing.push('الاختبارات الموجودة أو المطلوبة');
        break;
      case 'release_note':
        if (n(ctx.version)) missing.push('رقم الإصدار');
        if (n(ctx.changes)) missing.push('قائمة التغييرات');
        break;
      case 'daily_plan':
        if (n(ctx.focus)) missing.push('الأعمال الأساسية لليوم');
        if (n(ctx.availableTime)) missing.push('الوقت المتاح فعليًا');
        break;
      case 'followup_list':
        if (n(ctx.subject)) missing.push('موضوع المتابعة');
        if (n(ctx.scope)) missing.push('نطاق المتابعة (من/إلى)');
        break;
      case 'plan':
        if (n(ctx.goal)) missing.push('الهدف المطلوب تحقيقه');
        if (n(ctx.duration)) missing.push('المدة الزمنية');
        if (n(ctx.resources)) missing.push('الموارد المتاحة');
        break;
    }
    return missing;
  }

  /* ── مولّدات المسودات: عملي (رسمي إداري) ─────────────────── */
  const BUILDERS = {

    letter_staff(ctx) {
      const d = ctx.today;
      return `بسم الله الرحمن الرحيم
محلات أبو ياسين التجارية

التاريخ: ${orField(ctx.dateLabel, 'التاريخ')}
الموضوع: ${orField(ctx.subject, 'موضوع الخطاب')}

إلى: ${orField(ctx.staffName, 'اسم الموظف / الفئة المستهدفة')}

تحية طيبة وبعد،

إشارة إلى ${orField(ctx.subject, 'موضوع الخطاب')}، نود إبلاغكم بما يلي:

${ctx.body ? ctx.body : '[يرجى إضافة تفاصيل الموضوع هنا]'}

وعليه، نأمل منكم ${orField(ctx.demand, 'المطلوب من الموظف بالتفصيل')}، وذلك في موعد أقصاه ${orField(ctx.deadline, 'تاريخ التنفيذ المطلوب')}.

للعلم والعمل بموجبه.

مع التقدير،
عن إدارة محلات أبو ياسين التجارية
${orField(ctx.signer, 'اسم المسؤول وصفته')}`;
    },

    circular_reps(ctx) {
      return `تعميم داخلي — محلات أبو ياسين التجارية

التاريخ: ${orField(ctx.dateLabel, 'التاريخ')}
إلى: جميع السادة المندوبين والموزعين
الموضوع: ${orField(ctx.subject, 'موضوع التعميم')}

تحية طيبة،

بناءً على ${orField(ctx.subject, 'موضوع التعميم')}، نعمّم عليكم ما يلي:

1. ${orField(ctx.demand, 'التعليمات المطلوبة — البند الأول')}
2. [البند الثاني إن وجد]
3. [البند الثالث إن وجد]

الفترة الزمنية للتنفيذ: ${orField(ctx.period, 'الفترة الزمنية المشمولة')}
النطاق الجغرافي: ${orField(ctx.region, 'المنطقة أو الفرع')}

الالتزام بالتعليمات أعلاه إلزامي، وأي ملاحظة تُرفع إلى إدارة المبيعات فورًا.

مع التقدير،
إدارة المبيعات — محلات أبو ياسين التجارية`;
    },

    collection_msg(ctx) {
      const amt = fmtAmount(ctx.amount);
      return `الموضوع: متابعة رصيد مستحق

السيد/ ${orField(ctx.clientName, 'اسم العميل')} المحترم،

تحية طيبة،

نود التذكير بوجود رصيد مستحق لصالح محلات أبو ياسين التجارية قدره: ${amt ? amt + ' ريال' : '[المبلغ]'}
تاريخ الاستحقاق: ${orField(ctx.duePayment, 'تاريخ استحقاق المبلغ')}

نرجو التكرم بترتيب السداد عبر: ${orField(ctx.payMethod, 'طريقة السداد المقترحة')}.

وإن كان لديكم أي استفسار بخصوص هذا الرصيد أو رغبة في مطابقة الكشف، يسعدنا التواصل معكم.

شاكرين لكم حسن تعاونكم.

إدارة المبيعات وتحصيل المستحقات
محلات أبو ياسين التجارية

ملاحظة إدارية: هذه رسالة متابعة فقط ولا تُعد إقرارًا بمبلغ معيّن أو مطابقة نهائية للحساب.`;
    },

    sales_report(ctx) {
      return `تقرير مبيعات — محلات أبو ياسين التجارية

الفترة: ${orField(ctx.period, 'الفترة التي يغطيها التقرير')}
النطاق: ${orField(ctx.scope, 'الفرع أو المندوب')}
تاريخ الإعداد: ${orField(ctx.dateLabel, 'التاريخ')}

١. إجمالي المبيعات: [الرقم الفعلي]
٢. عدد الفواتير: [الرقم الفعلي]
٣. الكميات المباعة حسب الصنف: [التفصيل]
٤. الأصناف الأكثر حركة: [التفصيل]
٥. الأصناف الراكدة: [التفصيل]
٦. المبالغ المحصّلة: [الرقم الفعلي]
٧. المبالغ المتبقية: [الرقم الفعلي]

ملاحظات وتحليل:
${ctx.numbers ? ctx.numbers : '[أضف الأرقام الفعلية من النظام المحاسبي قبل اعتماد التقرير]'}

التوصيات:
1. [التوصية الأولى]
2. [التوصية الثانية]

تنبيه: هذا القالب لا يحتوي على أي أرقام مُختلقة. يجب تعبئته من بيانات النظام المحاسبي المعتمد.`;
    },

    agenda(ctx) {
      return `أجندة اجتماع

الموضوع: ${orField(ctx.subject, 'موضوع الاجتماع')}
التاريخ: ${orField(ctx.meetingDate, 'تاريخ الاجتماع')}
الوقت: ${orField(ctx.meetingTime, 'وقت الاجتماع')}
المدة المقررة: ${orField(ctx.duration, 'المدة المتاحة للاجتماع')}
المكان: ${orField(ctx.place, 'مكان الاجتماع')}
الحاضرون: ${orField(ctx.people, 'أسماء الحاضرين')}

جدول الأعمال:
1. ${orField(ctx.subject, 'البند الأول')} — عرض ومناقشة
2. مراجعة ما تم تنفيذه من قرارات الاجتماع السابق
3. [البند الثالث إن وجد]
4. أي مستجدات أخرى

المخرجات المطلوبة من الاجتماع:
- ${orField(ctx.decisions, 'القرارات المطلوب الخروج بها')}
- توزيع المهام وتحديد المسؤول عن كل بند
- تحديد موعد المتابعة

توزيع الوقت المقترح:
- ٥ دقائق: افتتاح ومراجعة
- [الوقت]: مناقشة البند الرئيسي
- ٥ دقائق: تلخيص القرارات`;
    },

    followup_list(ctx) {
      return `قائمة متابعة

الموضوع: ${orField(ctx.subject, 'موضوع المتابعة')}
النطاق: ${orField(ctx.scope, 'نطاق المتابعة (من/إلى)')}
تاريخ الإعداد: ${orField(ctx.dateLabel, 'التاريخ')}

بنود المتابعة:

☐ [البند الأول] — المسؤول: [ ] — الموعد: [ ]
☐ [البند الثاني] — المسؤول: [ ] — الموعد: [ ]
☐ [البند الثالث] — المسؤول: [ ] — الموعد: [ ]
☐ [البند الرابع] — المسؤول: [ ] — الموعد: [ ]

معيار إغلاق البند: [ما الذي يجب أن يتحقق حتى نعتبر البند منتهيًا]
دورية المراجعة: [يوميًا / أسبوعيًا]`;
    },

    email(ctx) {
      return `إلى: ${orField(ctx.recipient, 'الجهة المرسل إليها')}
الموضوع: ${orField(ctx.subject, 'موضوع البريد')}

تحية طيبة،

آمل أن تكونوا بخير.

${ctx.body ? ctx.body : '[أضف نص الرسالة هنا]'}

الطلب الأساسي: ${orField(ctx.demand, 'الطلب الأساسي')}
المهلة المطلوبة: ${orField(ctx.deadline, 'المهلة')}

شاكرًا لكم تعاونكم.

مع التقدير،
${orField(ctx.signer, 'الاسم وصفة المرسل')}`;
    },

    plan(ctx) {
      return `خطة عمل

الهدف: ${orField(ctx.goal, 'الهدف المطلوب تحقيقه')}
المدة: ${orField(ctx.duration, 'المدة الزمنية')}
الموارد المتاحة: ${orField(ctx.resources, 'الموارد المتاحة')}
معيار النجاح: ${orField(ctx.success, 'معايير القياس')}

المراحل:

المرحلة الأولى — التحضير
- المهام: [ ]
- المخرجات: [ ]
- المسؤول: [ ]

المرحلة الثانية — التنفيذ
- المهام: [ ]
- المخرجات: [ ]
- المسؤول: [ ]

المرحلة الثالثة — المراجعة
- المهام: [ ]
- المخرجات: [ ]
- المسؤول: [ ]

المخاطر المحتملة:
1. [المخاطرة] — إجراء التعامل: [ ]

مؤشرات المتابعة:
- [مؤشر أسبوعي]
- [مؤشر شهري]`;
    },

    /* ── تقني ── */
    bug_prompt(ctx) {
      return `# برومبت إصلاح مشكلة برمجية

## السياق
المشروع / المستودع: ${orField(ctx.repo, 'اسم المشروع والمستودع')}
الفرع: ${orField(ctx.branch, 'اسم الفرع')}
بيئة التشغيل: ${orField(ctx.env, 'بيئة التشغيل وإصدارات الأدوات')}

## المشكلة
${orField(ctx.problem, 'وصف المشكلة بدقة')}

## خطوات إعادة الإنتاج
${ctx.steps ? ctx.steps : `1. [الخطوة الأولى]
2. [الخطوة الثانية]
3. [السلوك المرصود]`}

## السلوك المتوقع
[اكتب ما كان يجب أن يحدث]

## السلوك الفعلي
[اكتب ما يحدث فعلًا — مع رسالة الخطأ إن وُجدت]

## الملفات المتوقع تعديلها
${ctx.files ? ctx.files : '- [ملف 1]\n- [ملف 2]'}

## قيود يجب احترامها
- لا تغيّر الواجهات العامة دون ضرورة
- حافظ على سلوك بقية الميزات
- اتبع أسلوب الكود الموجود في المشروع

## الاختبارات المطلوبة
${ctx.tests ? ctx.tests : '- [اختبار الوحدة المطلوب]\n- [اختبار الحالة الطرفية]'}

## معيار القبول
- [ ] المشكلة لم تعد تظهر
- [ ] جميع الاختبارات تمر
- [ ] لا انحدار في الميزات الأخرى

---
تعليمات للوكيل: نفّذ الإصلاح، ثم شغّل الاختبارات، وأبلغني بالنتيجة الفعلية. لا تدّعِ نجاح أي خطوة لم تُنفّذ.`;
    },

    fix_plan(ctx) {
      return `# خطة إصلاح تقنية

## ١. تعريف المشكلة
${orField(ctx.problem, 'وصف المشكلة بدقة')}

## ٢. التشخيص المبدئي
- الموضع المحتمل: ${orField(ctx.files, 'الملفات المتوقع أن يكون فيها الخلل')}
- الفرضية الأولى: [ ]
- الفرضية الثانية: [ ]

## ٣. خطوات الإصلاح المقترحة
1. إعادة إنتاج المشكلة محليًا بشكل موثوق
2. إضافة اختبار يفشل حاليًا ويوضّح الخلل
3. تنفيذ أصغر تعديل يعالج السبب الجذري
4. تشغيل الاختبارات ${ctx.tests ? 'التالية: ' + ctx.tests : '[حدد الاختبارات]'}
5. مراجعة الفرق قبل الدمج

## ٤. مخاطر التعديل
- [المخاطرة] ← إجراء التخفيف: [ ]

## ٥. معيار نجاح
- [ ] تكرار المشكلة لم يعد ممكنًا
- [ ] الاختبارات الجديدة والقائمة تمر جميعها
- [ ] تم التحقق على جهاز/بيئة حقيقية

ملاحظة: هذه خطة مقترحة. لا تُعد الاختبارات مُنفّذة حتى تُشغَّل فعليًا وتُسجَّل نتائجها.`;
    },

    release_note(ctx) {
      return `# ملاحظات الإصدار

الإصدار: ${orField(ctx.version, 'رقم الإصدار')}
التاريخ: ${orField(ctx.dateLabel, 'التاريخ')}

## الميزات الجديدة
${ctx.changes ? ctx.changes : '- [ميزة 1]\n- [ميزة 2]'}

## الإصلاحات
- [الإصلاح 1]
- [الإصلاح 2]

## تغييرات كاسرة
- [لا يوجد / اذكرها]

## خطوات الترقية
1. [الخطوة الأولى]
2. [الخطوة الثانية]

## الاختبارات التي تم تشغيلها
[لا تكتب «تم الاختبار» إلا إذا شُغّل فعلًا — اذكر الأمر والنتيجة]`;
    },

    /* ── شخصي ── */
    daily_plan(ctx) {
      return `خطة اليوم — ${orField(ctx.dateLabel, 'التاريخ')}

الأعمال الأساسية:
${ctx.focus ? ctx.focus : `1. [الأهم اليوم]
2. [التالي]
3. [إن سمح الوقت]`}

الالتزامات الثابتة:
- [موعد ثابت]
- [مهمة متكررة]

الوقت المتاح فعليًا: ${orField(ctx.availableTime, 'الوقت المتاح')}

ملاحظة واقعية: ضع ثلاث مهام فقط في القائمة الأساسية، وأبقِ البقية في الاحتياط.`;
    }
  };

  /* ── التوليد ─────────────────────────────────────────────── */
  function generate(type, ctx) {
    const builder = BUILDERS[type];
    if (!builder) return { error: 'نوع المسودة غير معروف' };

    const enriched = Object.assign({
      today: S().todayISO(),
      dateLabel: ctx.dateLabel || S().todayISO()
    }, ctx);

    let draft;
    try {
      draft = builder(enriched);
    } catch (e) {
      return { error: 'تعذّر توليد المسودة: ' + e.message };
    }

    const missing = collectNeeds(type, enriched);

    // القاعدة الإلزامية: سطر النواقص
    if (missing.length) {
      draft += '\n\n' + '─'.repeat(30) + '\nأحتاج منك:\n' +
               missing.map((m, i) => (i + 1) + '. ' + m).join('\n');
    } else {
      draft += '\n\n' + '─'.repeat(30) + '\nأحتاج منك: لا شيء — كل البيانات الأساسية متوفرة. راجع المسودة قبل الإرسال.';
    }

    const meta = ASSIST_TYPES.find(t => t.id === type);
    return { draft, missing, type, label: meta ? meta.label : type, createdAt: new Date().toISOString() };
  }

  /* ── اكتشاف المهام القابلة للمساعدة ──────────────────────── */
  // يقترح نوع المساعدة بناءً على عنوان المهمة وتصنيفها.
  // ملاحظة مهمة: الأنماط مكتوبة على النص المُطبَّع (بلا همزات/تشكيل/ة)
  // لأن detectAssist يطبّع النص قبل المطابقة.
  const DETECT_RULES = [
    { type: 'bug_prompt',     re: /(برومبت|اصلاح مشكله|اصلاح خلل|وصف مشكله|bug report|تقرير خطا|شكوى خطا)/ },
    { type: 'fix_plan',       re: /(خطه اصلاح|معالجه خطا|حل مشكله برمجيه|خطه معالجه)/ },
    { type: 'release_note',   re: /(ملاحظات اصدار|release note|تحديث الاصدار|ملاحظات الاصدار)/ },
    { type: 'circular_reps',  re: /(تعميم|المندوبين|الموزعين|خط سير|تعليمات للمندوب)/ },
    { type: 'letter_staff',   re: /(خطاب|تعميم للموظف|انذار|تعليمات للموظف|مكافاه)/ },
    { type: 'collection_msg', re: /(تحصيل|مستحق|ديون|متاخرات|رساله للعميل|مطالبه)/ },
    { type: 'sales_report',   re: /(تقرير مبيعات|ملخص مبيعات|تقرير بيع|احصائيه مبيعات)/ },
    { type: 'agenda',         re: /(اجنده|تحضير اجتماع|جدول اعمال|تجهيز اجتماع)/ },
    { type: 'email',          re: /(بريد|ايميل|email|مراسله)/ },
    { type: 'followup_list',  re: /(قائمه متابعه|متابعه شامله|خطه متابعه)/ },
    { type: 'plan',           re: /(خطه عمل|خطه تنفيذيه|استراتيجيه|هدف سنوي)/ },
    { type: 'daily_plan',     re: /(خطه يوم|تنظيم اليوم|ترتيب يومي)/ }
  ];

  function detectAssist(task) {
    if (!task) return null;
    const raw = (task.title || '') + ' ' + (task.notes || '');
    const text = DH.ai.normalize(raw);   // تطبيع: همزات، ة→ه، تشكيل

    for (const r of DETECT_RULES) {
      if (r.re.test(text)) {
        const t = ASSIST_TYPES.find(x => x.id === r.type);
        if (!t) continue;
        // إن لم يكن النوع متاحًا لهذا القسم، جرّب النوع التالي المناسب
        if (t.sections.includes(task.sectionId)) return t;
        // داخل القسم التقني: أي مهمة تقنية معقّدة تستفيد من خطة إصلاح
        if (task.sectionId === 'sec_tech' && t.id === 'bug_prompt') {
          return ASSIST_TYPES.find(x => x.id === 'fix_plan');
        }
      }
    }
    // اجتماع في قسم العمل → أجندة
    if (task.kind === 'meeting' && task.sectionId === 'sec_work') {
      return ASSIST_TYPES.find(x => x.id === 'agenda');
    }
    return null;
  }

  // كل المهام المفتوحة التي لها مساعدة مقترحة
  function assistableTasks(tasks) {
    return tasks
      .filter(t => t.status !== 'done' && !t.canceled && t.kind !== 'meeting')
      .map(t => ({ task: t, assist: detectAssist(t) }))
      .filter(x => !!x.assist);
  }

  /* ── نسخ إلى الحافظة ─────────────────────────────────────── */
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fallback */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  global.DH = global.DH || {};
  global.DH.assist = {
    ASSIST_TYPES, typesFor, generate, collectNeeds,
    detectAssist, assistableTasks, copyToClipboard
  };
})(window);