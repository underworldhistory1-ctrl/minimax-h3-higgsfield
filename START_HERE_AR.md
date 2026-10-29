# ابدأ من هنا — H3 Higgsfield 2.5.8

واجهة واحدة لتوليد فيديو MiniMax H3 بصوته الأصلي، وإنشاء الصور وتعديلها عبر Qwen Image2.1. الاسم الحالي للمشروع هو **H3 Higgsfield**؛ H3 Studio اسم مساحة العمل، وV2 اسم ترقية قديمة وليس إصدارًا موازيًا مطلوبًا للتثبيت الجديد.

## التثبيت

من نسخة Git منفصلة عن custom_nodes، على NVIDIA Linux:

~~~bash
git clone https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git
cd minimax-h3-higgsfield
bash launcher.sh --comfy-root /path/to/ComfyUI --models-root /path/to/models
~~~

على Windows استخدم launcher.ps1 مع -ComfyRoot لمسار ComfyUI Portable أو المصدر. راجع [دليل التثبيت](docs/INSTALL.md) للأوامر والاحتياجات. إعادة نفس الأمر تتابع التنزيلات وتعيد استخدام الأوزان السليمة. الأوزان ليست داخل الريبو، وخطة اللانشر تعرض الحجم الناقص الفعلي.

يحتاج مسار NVIDIA الحالي إلى driver متوافق مع CUDA 13، وPyTorch CUDA 13+ وbackend CUDA أصلي مفعّل. رؤيةGPU وحدها لا تثبت ذلك. اللانشر يتحقق من العامل الجاري فعليًا. التحديث التلقائي لفرع main هو الافتراضي، مع رفض الكتابة فوق تعديلاتك المحلية.

## أسماء الموديلات والخيارات

| الاسم | المعنى |
|---|---|
| Original quality | أوزان H3 INT8 ConvRot؛ FL2VA لـText/Frames وRef2VA لـReferences |
| Singularity v1.3 INT8 | checkpoint مستقل اختياري لـReferences؛ اكتمل رندر مع Anime → Realism وفك الفيديو والصوت كاملين |
| Hybrid conditioning / Hybrid loader | مساران تجريبيان مختلفان؛ لا يوجد دليل جودةGPU شامل لهما |
| PyTorch / CK INT8 attention | اختيار سيرفر مستقل عن دقة الموديل؛ CK تقريبي واختياري |
| Spectrum / MotionCache | طريقتا تسريع تقريبيتان مستقلتان عن Attention، ولا تعملان معًا |
| Qwen Image2.1 | مساحة الصور؛ INT8 افتراضي في التثبيت وBF16 اختياري |

بقاء عمليات BF16/FP16 مع موديل INT8 طبيعي. في اختبار مطابق علىRTX 5090، نزل ريندر1024×576،362 فريم،20 خطوة من20:01 إلى9:43 باستخدام CK INT8 attention. القياس لعبء واحد ولا يضمن نفس السرعة أو النتيجة لكل مشروع. [تفاصيل القياس](docs/LAUNCHER.md#attention-selection-and-supervised-workers).

## بعد التشغيل

افتح /extensions/h3_studio/index.html على سيرفرك؛ الجذر يحوّلك إلى الواجهة، ومحرر النودز للصيانة في /?view=nodes. Text وFrames يستخدمان FL2VA، وReferences يستخدم Ref2VA افتراضيًا. يمكن تسمية الصور والفيديو والصوت وذكرها بـ@name، وحفظ المشاريع واللقطات وإعادة استخدامها.

شغّل python deploy/verify_h3_server.py --url COMFY_URL للتحقق من الموديلات والنودز واللورَات وbackend الحقيقي. نجاحAPI لا يثبت جودة كل لقطة. [خريطة التوافق](docs/COMPATIBILITY_MATRIX_AR.md) و[المراجعة الحالية](docs/PRODUCTION_READINESS_2026_10_15.md) يفصلان الدليل التقني عن الحكم البصري.

## التحديث والتعافي

Updates يفحص main؛ تحديث الواجهة يتطلب مصدرًا رسميًا معروفًا وطابورًا وعمليات تحضير فارغة، ولا يشغّل GPU تلقائيًا. تغييرات البيئة تتطلب اللانشر الكامل. لا تعِد التشغيل أثناء ريندر نشط.

على Linux يوجد مشرف منفصل يعيد تشغيل العامل. تُحفظ نتيجة sampler كاملة قبل فك الفيديو، والتعافي المدعوم عملية decode متتبعة تحترم الإلغاء. لا يوجد استكمال من منتصف sampling، ولا ضمان ضد إيقاف مزود السيرفر. الرام40 GB اقتربت من حدها في الاختبارات؛ الإعدادات الأكبر تحتاج هامشًا إضافيًا.

[فهرس الأدلة](docs/README.md) · [اللانشر](docs/LAUNCHER.md) · [ترقية تثبيت قديم والرجوع](docs/V2_UPGRADE_AR.md) · [تاريخ الإصدارات](CHANGELOG.md).
