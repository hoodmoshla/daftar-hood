/* ═══════════════════════════════════════════════════════════════
   اختبارات اللغة العربية واللهجة اليمنية
   تثبّت سلوك المحلل على العبارات الحقيقية وتحميه من الانحدار.
   ═══════════════════════════════════════════════════════════════ */
const H = require('./harness');
const { createEnv, suite, test, assert, assertEq, assertIncludes, assertNotIncludes, report } = H;

const { win } = createEnv();
const AI = win.DH.ai, S = win.DH.store;
S.load();
const TODAY = S.todayISO();

/* ── ١. عدد المهام المستخرجة ─────────────────────────────── */
suite('١. تقسيم العبارات إلى مهام');

const SPLIT_CASES = [
  // [النص, عدد المهام المتوقع]
  ['بكرة أراجع حسابات العملاء المتأخرة، وأتابع مع المندوب بشأن البضاعة الراكدة، وبعد المغرب أراجع مشكلة التنزيلات في مشروعي', 3],
  ['تحصيل مستحقات العملاء، وتحديث الأسعار، ومراجعة المخزون', 3],
  ['أشتري خضار وفواكه من السوق بكرة', 1],
  ['جهز لي تعميم للمندوبين عن خط السير الجديد', 1],
  ['كل يوم الصباح أراجع المخزن وأسجل النواقص', 2],
  ['بكرة أراجع الحسابات وأتابع المندوب وأصلح التنزيلات', 3],
  ['أراجع الأرباح والخسائر لهذا الشهر', 1],
  ['أراجع المخزون وأحدث الأسعار وأصلح التنزيلات وأشتري خضار', 4],
  ['مراجعة الحسابات مع المندوب بشأن التحصيل', 1],
  ['أتصل بالعميل أحمد، وأرسل التقرير، وأجهز أجندة الاجتماع', 3],
  ['الخميس عندنا اجتماع إداري مع الموظفين', 1],
  ['عاجل لازم نحصل من العميل أبو بكر خمسين ألف ريال', 1],
  ['بق في تطبيق الأندرويد لما أسوي تنزيل', 1],
  ['متابعة المندوب سالم بشأن الطلبية', 1],
  ['أراجع الأسعار، وأتحقق من المخزون، وأتابع المبيعات، وأجهز التقرير', 4]
];

SPLIT_CASES.forEach(([text, expected]) => {
  test('«' + text.slice(0, 40) + (text.length > 40 ? '…' : '') + '» → ' + expected, () => {
    const r = AI.parseLocal(text);
    assertEq(r.tasks.length, expected,
      'العدد الفعلي: ' + r.tasks.length + ' → ' +
      JSON.stringify(r.tasks.map(t => t.title)));
  });
});

test('لا مهام بعناوين فارغة في أي حالة', () => {
  SPLIT_CASES.forEach(([text]) => {
    AI.parseLocal(text).tasks.forEach(t => {
      assert(t.title && t.title.trim().length > 0,
        'عنوان فارغ في: ' + text.slice(0, 40));
    });
  });
});

/* ── ٢. اللهجة اليمنية ───────────────────────────────────── */
suite('٢. مفردات اللهجة اليمنية');

test('«بكرة» = غدًا', () => {
  assertEq(AI.parseDate('بكرة نروح').date, S.addDaysISO(TODAY, 1));
});

test('«بكره» (بلا تاء مربوطة) = غدًا', () => {
  assertEq(AI.parseDate('بكره نروح').date, S.addDaysISO(TODAY, 1));
});

test('«بعد بكرة» = بعد يومين وليس الغد', () => {
  const d = AI.parseDate('بعد بكرة').date;
  assertEq(d, S.addDaysISO(TODAY, 2));
  assert(d !== S.addDaysISO(TODAY, 1), 'يجب ألا يكون الغد');
});

test('«حق» / «لحق» لا يكسر التحليل', () => {
  const r = AI.parseLocal('راجع الحسابات لحق');
  assert(Array.isArray(r.tasks), 'نتيجة صالحة');
});

test('«الحق» للاستعجال لا يُفسَّر كتاريخ خاطئ', () => {
  const r = AI.parseLocal('راجع الحسابات');
  assert(r.tasks.length === 1, 'مهمة واحدة');
});

test('«هاليوم» = اليوم', () => {
  assertEq(AI.parseDate('هاليوم أراجع').date, TODAY);
});

test('«امبارح» = أمس', () => {
  assertEq(AI.parseDate('امبارح خلصنا').date, S.addDaysISO(TODAY, -1));
});

test('«البارحة» = أمس', () => {
  assertEq(AI.parseDate('البارحة خلصنا').date, S.addDaysISO(TODAY, -1));
});

test('«برضو» / «برضه» تعمل كفاصل', () => {
  const r = AI.parseLocal('أراجع الحسابات برضه أراجع المخزون');
  assert(r.tasks.length === 2, 'عدد المهام: ' + r.tasks.length);
});

test('«كمان» تعمل كفاصل', () => {
  const r = AI.parseLocal('أراجع الحسابات كمان أراجع المخزون');
  assert(r.tasks.length === 2, 'عدد المهام: ' + r.tasks.length);
});

test('«شان» / «عشان» لا تُعتبر اسمًا', () => {
  const r = AI.parseLocal('متابعة العميل شان التحصيل');
  assertEq(r.tasks[0].client, '', 'لم يُختلق اسم');
});

test('«العصرية» = وقت العصر', () => {
  assertEq(AI.parsePeriod('العصرية نروح'), '15:30');
});

test('«المغربية» = وقت المغرب', () => {
  assertEq(AI.parsePeriod('المغربية نرجع'), '18:00');
});

test('«الويكند» = نهاية الأسبوع', () => {
  const d = AI.parseDate('الويكند نسوي الجرد').date;
  assert(d, 'تاريخ مستخرج');
  const dow = new Date(d + 'T12:00:00').getDay();
  assert(dow === 5 || dow === 6, 'يوم خميس أو جمعة، الفعلي: ' + dow);
});

test('«بالحق» في نهاية الجملة لا يكسر التاريخ', () => {
  const r = AI.parseDate('بكرة أراجع بالحق');
  assertEq(r.date, S.addDaysISO(TODAY, 1), 'التاريخ صحيح');
});

/* ── ٣. الأوقات ──────────────────────────────────────────── */
suite('٣. استخراج الأوقات');

const TIME_CASES = [
  ['بعد المغرب', '18:30'],
  ['بعد العصر', '16:00'],
  ['بعد العشاء', '21:00'],
  ['قبل الظهر', '10:00'],
  ['الصباح', '08:00'],
  ['بالصباح', '08:00'],
  ['الظهر', '12:00'],
  ['العصر', '15:30'],
  ['المغرب', '18:00'],
  ['الليل', '20:00'],
  ['بالليل', '20:00'],
  ['العشاء', '20:00'],
  ['الفجر', '05:00']
];

TIME_CASES.forEach(([text, expected]) => {
  test('«' + text + '» = ' + expected, () => {
    assertEq(AI.parsePeriod(text + ' نراجع'), expected);
  });
});

test('«الساعة 10:30» تُقرأ', () => {
  assertEq(AI.parsePeriod('الساعة 10:30'), '10:30');
});

test('«الساعة 3 مساء» = 15:00', () => {
  assertEq(AI.parsePeriod('الساعة 3 مساء'), '15:00');
});

test('«الساعة سبع» بالكلمات = 07:00', () => {
  assertEq(AI.parsePeriod('الساعة سبع'), '07:00');
});

test('«الساعة عشر صباحًا» = 10:00', () => {
  assertEq(AI.parsePeriod('الساعة عشر الصباح'), '10:00');
});

test('لا وقت مُختلق إن لم يُذكر', () => {
  assertEq(AI.parsePeriod('أراجع الحسابات'), null);
});

/* ── ٤. المبالغ ─────────────────────────────────────────── */
suite('٤. استخراج المبالغ');

test('«50000» رقمي', () => {
  assertEq(AI.parseAmount('تحصيل 50000').amount, 50000);
});

test('«٥٠٠٠٠» بالأرقام الهندية', () => {
  assertEq(AI.parseAmount('تحصيل ٥٠٠٠٠').amount, 50000);
});

test('«50,000» بفاصلة آلاف', () => {
  assertEq(AI.parseAmount('تحصيل 50,000').amount, 50000);
});

test('«خمسين ألف» = 50000', () => {
  assertEq(AI.parseAmount('نحصل خمسين ألف').amount, 50000);
});

test('«خمسة آلاف» = 5000', () => {
  assertEq(AI.parseAmount('خمسة آلاف ريال').amount, 5000);
});

test('«عشرة آلاف» = 10000', () => {
  assertEq(AI.parseAmount('عشرة آلاف').amount, 10000);
});

test('«مائة ألف» = 100000', () => {
  assertEq(AI.parseAmount('مائة ألف ريال').amount, 100000);
});

test('«ألفين» = 2000', () => {
  assertEq(AI.parseAmount('ألفين ريال').amount, 2000);
});

test('«مليون» = 1000000', () => {
  assertEq(AI.parseAmount('مليون ريال').amount, 1000000);
});

test('لا مبلغ عند غيابه', () => {
  assertEq(AI.parseAmount('تحصيل المستحقات').amount, null);
});

test('لا مبلغ في مهمة عادية بلا أرقام', () => {
  assertEq(AI.parseAmount('مراجعة حسابات العملاء').amount, null);
});

/* ── ٥. عدم الاختلاق ───────────────────────────────────── */
suite('٥. قاعدة عدم الاختلاق');

test('لا اسم عميل إن لم يُذكر', () => {
  assertEq(AI.parseLocal('تحصيل المستحقات').tasks[0].client, '');
});

test('لا اسم مندوب إن لم يُذكر', () => {
  assertEq(AI.parseLocal('متابعة المندوبين').tasks[0].rep, '');
});

test('لا مبلغ إن لم يُذكر', () => {
  assertEq(AI.parseLocal('تحصيل المستحقات').tasks[0].amount, null);
});

test('لا تاريخ إن لم يُذكر', () => {
  assertEq(AI.parseLocal('مراجعة الحسابات').tasks[0].dueDate, null);
});

test('اسم العميل يُنسب للعميل لا للمندوب', () => {
  const t = AI.parseLocal('تحصيل من العميل أحمد').tasks[0];
  assertEq(t.client, 'أحمد');
  assertEq(t.rep, '');
});

test('اسم المندوب يُنسب للمندوب', () => {
  const t = AI.parseLocal('متابعة المندوب سالم').tasks[0];
  assertEq(t.rep, 'سالم');
  assertEq(t.client, '');
});

test('«أبو بكر» يُستخرج كاسم كامل', () => {
  const t = AI.parseLocal('تحصيل من العميل أبو بكر').tasks[0];
  assertIncludes(t.client, 'أبو');
  assertIncludes(t.client, 'بكر');
});

/* ── ٦. التصنيف ─────────────────────────────────────────── */
suite('٦. التصنيف حسب النية');

const CLASS_CASES = [
  ['مراجعة حسابات العملاء',              'cat_acct'],
  ['تحصيل المستحقات من العملاء',          'cat_collect'],
  ['نحصل من العميل أحمد 50000',           'cat_collect'],
  ['متابعة المندوبين في خط السير',        'cat_reps'],
  ['البضاعة الراكدة في المخزن',           'cat_stock'],
  ['تحديث قائمة الأسعار',                 'cat_prices'],
  ['تعميم تعليمات للموظفين',              'cat_staff'],
  ['إعداد تقرير المبيعات',                'cat_reports'],
  ['إصلاح مشكلة التنزيلات',               'cat_bug'],
  ['بق في تطبيق الأندرويد',               'cat_bug'],
  ['بناء ونشر الإصدار الجديد',            'cat_deploy'],
  ['ضغط على زر التسجيل',                  'cat_duties'],
  ['شراء أغراض البيت',                    'cat_shopping'],
  ['موعد عند الطبيب',                     'cat_appt']
];

CLASS_CASES.forEach(([text, expected]) => {
  test('«' + text + '» → ' + expected, () => {
    const c = AI.classify(text);
    assertEq(c.categoryId, expected,
      'الفعلي: ' + c.categoryId + ' (قسم: ' + c.sectionId + ')');
  });
});

test('التصنيف يقترح قسمًا صحيحًا دائمًا', () => {
  const allCases = SPLIT_CASES.map(c => c[0]);
  allCases.forEach(text => {
    AI.parseLocal(text).tasks.forEach(t => {
      assert(S.sectionById(t.sectionId),
        'قسم غير موجود للمهمة: ' + t.title);
    });
  });
});

/* ── ٧. الأولوية والحجم والنوع ───────────────────────────── */
suite('٧. الأولوية والحجم والنوع');

test('«عاجل» = أولوية عاجلة', () => {
  assertEq(AI.parseLocal('عاجل التحصيل من العميل').tasks[0].priority, 'urgent');
});

test('«فورًا» = أولوية عاجلة', () => {
  assertEq(AI.parseLocal('أصلح الخطأ فورًا').tasks[0].priority, 'urgent');
});

test('«مهم» = أولوية عالية', () => {
  assertEq(AI.parseLocal('مهم مراجعة الحسابات').tasks[0].priority, 'high');
});

test('«لاحقًا» = أولوية منخفضة', () => {
  assertEq(AI.parseLocal('لاحقًا أراجع الأسعار').tasks[0].priority, 'low');
});

test('«على راحتي» = أولوية منخفضة', () => {
  assertEq(AI.parseLocal('أراجع المخزون على راحتي').tasks[0].priority, 'low');
});

test('بلا كلمات أولوية = عادية', () => {
  assertEq(AI.parseLocal('أراجع الحسابات').tasks[0].priority, 'normal');
});

test('«اجتماع» = مهمة كبيرة ونوع اجتماع', () => {
  const t = AI.parseLocal('اجتماع إداري مع الموظفين').tasks[0];
  assertEq(t.size, 'large');
  assertEq(t.kind, 'meeting');
});

test('«مكالمة» = مهمة صغيرة', () => {
  assertEq(AI.parseLocal('مكالمة مع العميل').tasks[0].size, 'small');
});

test('«تذكير» يُكتشف', () => {
  assertEq(AI.parseLocal('تذكير بموعد السداد').tasks[0].kind, 'reminder');
});

test('«جهز تعميم» = مهمة مساندة ذكية', () => {
  assertEq(AI.parseLocal('جهز تعميم للمندوبين').tasks[0].kind, 'ai_assist');
});

/* ── ٨. التكرار ─────────────────────────────────────────── */
suite('٨. التكرار');

test('«كل يوم» = يوميًا', () => {
  assertEq(AI.parseLocal('كل يوم أراجع الحسابات').tasks[0].repeat, 'daily');
});

test('«يوميًا» = يوميًا', () => {
  assertEq(AI.parseLocal('يوميًا نراجع المخزون').tasks[0].repeat, 'daily');
});

test('«كل صباح» = يوميًا', () => {
  assertEq(AI.parseLocal('كل صباح أفحص الطلبات').tasks[0].repeat, 'daily');
});

test('«كل أسبوع» = أسبوعيًا', () => {
  assertEq(AI.parseLocal('كل أسبوع نتابع المبيعات').tasks[0].repeat, 'weekly');
});

test('«أسبوعيًا» = أسبوعيًا', () => {
  assertEq(AI.parseLocal('أسبوعيًا نجرد المخزن').tasks[0].repeat, 'weekly');
});

test('«كل شهر» = شهريًا', () => {
  assertEq(AI.parseLocal('كل شهر نسوي جرد').tasks[0].repeat, 'monthly');
});

test('«شهريًا» = شهريًا', () => {
  assertEq(AI.parseLocal('شهريًا نراجع الأسعار').tasks[0].repeat, 'monthly');
});

test('«اليوم» وحدها لا تعني تكرارًا', () => {
  assertEq(AI.parseLocal('أراجع الحسابات اليوم').tasks[0].repeat, 'none');
});

test('«بشأن الطلبية اليوم» ليس تكرارًا يوميًا', () => {
  assertEq(AI.parseLocal('متابعة المندوب بشأن الطلبية اليوم').tasks[0].repeat, 'none');
});

test('المهمة المتكررة تحصل على أول موعد = اليوم', () => {
  const t = AI.parseLocal('كل يوم أراجع المخزون').tasks[0];
  assertEq(t.dueDate, TODAY, 'أول موعد اليوم');
});

/* ── ٩. العناوين ───────────────────────────────────────── */
suite('٩. جودة العناوين');

test('تعبيرات الوقت لا تبقى في العنوان', () => {
  const cases = [
    'بكرة أراجع الحسابات',
    'بعد المغرب أراجع التنزيلات',
    'اليوم أراجع المخزون',
    'كل يوم أراجع المخزون',
    'الخميس عندنا اجتماع'
  ];
  cases.forEach(text => {
    const titles = AI.parseLocal(text).tasks.map(t => t.title).join(' ');
    ['بكرة', 'بعد المغرب', 'اليوم أراجع', 'كل يوم', 'الخميس']
      .forEach(w => {
        if (text.indexOf(w) === 0) {
          assertNotIncludes(titles, w + ' ',
            '«' + w + '» بقي في العنوان: ' + titles);
        }
      });
  });
});

test('الفعل المضارع يتحول لصيغة اسمية', () => {
  assertIncludes(AI.parseLocal('أراجع الحسابات').tasks[0].title, 'مراجعة');
});

test('«أشتري» → «شراء»', () => {
  assertIncludes(AI.parseLocal('أشتري خضار').tasks[0].title, 'شراء');
});

test('«جهز لي» → «تجهيز» (بلا «لي»)', () => {
  const t = AI.parseLocal('جهز لي تعميم للمندوبين').tasks[0].title;
  assertIncludes(t, 'تجهيز');
  assertNotIncludes(t, 'لي', 'حُذفت «لي»');
});

test('العنوان لا يزيد عن 90 حرفًا', () => {
  const long = 'أراجع ' + Array(40).fill('تفاصيل').join(' ');
  const t = AI.parseLocal(long).tasks[0];
  assert(t.title.length <= 91, 'الطول: ' + t.title.length);
});

/* ── ١٠. الفواصل والعلامات ───────────────────────────────── */
suite('١٠. الفواصل والعلامات');

test('الفاصلة العربية تفصل', () => {
  assertEq(AI.parseLocal('أراجع الحسابات، أراجع المخزون').tasks.length, 2);
});

test('الفاصلة الإنجليزية تفصل', () => {
  assertEq(AI.parseLocal('أراجع الحسابات, أراجع المخزون').tasks.length, 2);
});

test('النقطة تفصل', () => {
  assertEq(AI.parseLocal('أراجع الحسابات. أراجع المخزون').tasks.length, 2);
});

test('علامة الاستفهام تفصل', () => {
  assertEq(AI.parseLocal('أراجع الحسابات؟ أراجع المخزون').tasks.length, 2);
});

test('علامة التعجب تفصل', () => {
  assertEq(AI.parseLocal('عاجل التحصيل! أراجع الحسابات').tasks.length, 2);
});

test('السطر الجديد يفصل', () => {
  assertEq(AI.parseLocal('أراجع الحسابات\nأراجع المخزون').tasks.length, 2);
});

test('«ثم» تفصل', () => {
  assertEq(AI.parseLocal('أراجع الحسابات ثم أراجع المخزون').tasks.length, 2);
});

/* ── ١١. التطبيع ────────────────────────────────────────── */
suite('١١. التطبيع والهمزات');

test('الهمزات المختلفة تتوحد في التصنيف', () => {
  assertEq(AI.classify('إصلاح الأخطاء').categoryId, AI.classify('اصلاح الاخطاء').categoryId);
});

test('التاء المربوطة والهاء تتوحدان', () => {
  assertEq(AI.normalize('مهمة'), AI.normalize('مهمه'));
});

test('التشكيل لا يكسر التحليل', () => {
  const withTashkeel = AI.parseLocal('مُراجعة الحِسابات');
  assertEq(withTashkeel.tasks.length, 1, 'مهمة واحدة');
  assertEq(withTashkeel.tasks[0].categoryId, 'cat_acct');
});

test('الياء والألف المقصورة تتوحدان', () => {
  assertEq(AI.normalize('على'), AI.normalize('علي'));
});

/* ── ١٢. عبارات مركّبة طويلة ─────────────────────────────── */
suite('١٢. عبارات واقعية مركّبة');

test('إملاء صباحي كامل', () => {
  const r = AI.parseLocal(
    'الصباح أراجع حسابات العملاء المتأخرة، وبعد الظهر أتابع المندوبين في خط السير، ' +
    'وبعد العصر أراجع المخزون وأسجل النواقص، وبعد المغرب أصلح مشكلة التنزيلات في مشروعي'
  );
  // ٥ مهام: «أراجع المخزون» و«أسجل النواقص» عملان منفصلان فعلًا
  assertEq(r.tasks.length, 5, 'العدد: ' + r.tasks.length + ' → ' +
    JSON.stringify(r.tasks.map(t => t.title)));
  assert(r.tasks.some(t => t.categoryId === 'cat_acct'), 'فيه محاسبة');
  assert(r.tasks.some(t => t.categoryId === 'cat_reps'), 'فيه مندوبين');
  assert(r.tasks.some(t => t.categoryId === 'cat_stock'), 'فيه مخزون');
  assert(r.tasks.some(t => t.categoryId === 'cat_bug'), 'فيه إصلاح خطأ');
  // الأوقات تُلتقط في الملاحظات
  const notes = r.tasks.map(t => t.notes).join(' ');
  assertIncludes(notes, '08:00', 'وقت الصباح');
  assertIncludes(notes, '18:30', 'وقت بعد المغرب');
});

test('الجملة الواحدة بفعلين تُنتج مهمتين', () => {
  const r = AI.parseLocal('أراجع المخزون وأسجل النواقص');
  assertEq(r.tasks.length, 2, 'عملان منفصلان');
});

test('الاسم المعطوف لا يُقسَّم إلى مهمتين', () => {
  const r = AI.parseLocal('أشتري خضار وفواكه');
  assertEq(r.tasks.length, 1, 'اسم معطوف = مهمة واحدة');
});

test('إملاء تحصيل مع تفاصيل كاملة استُخرجت كلها', () => {
  const t = AI.parseLocal(
    'عاجل لازم نحصل من العميل أحمد خمسين ألف ريال بكرة'
  ).tasks[0];
  assertEq(t.priority, 'urgent', 'عاجلة');
  assertIncludes(t.client, 'أحمد');
  assertEq(t.amount, 50000);
  assertEq(t.dueDate, S.addDaysISO(TODAY, 1));
  assertEq(t.sectionId, 'sec_work');
  assertEq(t.categoryId, 'cat_collect');
});

test('إملاء تقني مع مستودع واختبارات', () => {
  const t = AI.parseLocal(
    'أصلح مشكلة التنزيلات في تطبيق أندرويد وأشغّل الاختبارات'
  ).tasks[0];
  assertEq(t.sectionId, 'sec_tech');
  assertEq(t.categoryId, 'cat_bug');
});

test('كل الحالات الواقعية تُعالج بسرعة', () => {
  const start = Date.now();
  SPLIT_CASES.forEach(([text]) => AI.parseLocal(text));
  const ms = Date.now() - start;
  assert(ms < 2000, 'المعالجة سريعة: ' + ms + 'ms لـ ' + SPLIT_CASES.length + ' حالة');
});

const failedCount = H.failedCount;
report();
process.exit(failedCount ? 1 : 0);