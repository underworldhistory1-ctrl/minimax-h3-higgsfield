# رفع ريفيرنسات الفيديو — 2.5.4

واجهة الفيديو كانت لا تزال ترسل multipart رغم إصلاح JSON في واجهة الصور. تم توحيد صور/فيديو/صوت وكي فريمز وcontrol uploads على نقل binary streaming بنفس endpoint وفحص الامتدادات والبايتات ومحتوى الصور/الفيديو/الصوت الأصلي. حدود25/500/100MiB محفوظة، ولا يتم تحويل الفيديو إلىbase64 أو تحميله كله في ذاكرة Python. JSON للصور وmultipart للعملاء القدامى مستمران. الاسم يمر كـquery مشفّر؛ أسماء الملفات الفعلية UUID داخل مجلد input.

التقدم، الإلغاء، resize وtrim مستمرون؛ المهلة تعرض رسالة واضحة ولا تمسح المدخلات.

## التركيبة المطلوبة

- Anime2Realism: Original Ref2VA + فيديو مرجعي، باستخدام trigger `LumiReal` كما في [المصدر](https://huggingface.co/LiseTY/Minimax-H3-ref2v_Anime_2_Realism).
- صور الشخصية/البيئة تدخلref_images؛ الفيديو يدخلref_videos؛ timed keyframes تمر عبرMiniMaxH3AddGuide إلىpositive المستخدم فيsampler؛ اللورتان تتسلسلان قبلSigmaShift دون استبدال إحداهما بالأخرى.
- اختبار الجراف يجمعAnime2Realism وCombat V2 مع فيديو+صورة وكي فريم عند0 و123 عبرOriginal/MotionCache/Spectrum. هذا إثبات توصيل وليس إثبات جودة الدمج.
- Combat V2 فيRef2VA ما زال experimental؛ لا توجد نتيجة موثقة هنا لجودة دمجه معAnime2Realism. [المؤلف](https://huggingface.co/JOKER141/MiniMax-H3-Combat-Base-V2) يوصيres_multistep/simple أوeuler/beta. لا نفرض تغييرات خفية علىoverride المستخدم.
- استخدمTemporal keyframes داخلReferences؛ صورStart/End الخاصة بتابFrames مسارFL2VA مختلف، وليست بديلًا يتم دمجه تلقائيًا معRef2VA.

## التحقق والرجوع

اختبارات النقل تغطي كل الأنواع، حجمContent-Length والتدفقchunked، رفض الملفات غير السليمة، وفشل/إلغاء/مهلة الرفع. اختبارات التوصيل مستقلة عن جودةGPU. نتائج الخادم تسجل منفصلة؛ لا يشغّل فحص الرفع رندرًا للمستخدم.

التحديث باللانشر مع طابور فارغ، وsnapshot يسمح بالرجوع؛ المشاريع والنتائج لا تتغير. لا موديلات جديدة مطلوبة.
