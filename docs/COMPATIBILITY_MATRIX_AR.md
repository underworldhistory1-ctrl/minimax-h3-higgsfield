# خريطة اختيارات H3 Studio — 2.2.0

## الموديلات
| الاختيار | المسار | الدليل |
|---|---|---|
| Original Text/Frames | FL2VA + ImageToVideo | الوظائف الأصلية محفوظة؛ صور بداية/نهاية،guides،continuation وrefinement حسب جاهزية النودز |
| Original References | Ref2VA + ReferenceToVideo | صور/فيديو/صوت مسمى،native audio؛ رندر قصير حي مع صورة + static Canny تم التحقق منه |
| Singularity | checkpoint مستقل يختاره المستخدم | الملف مثبت ومتاحة خياراته على السيرفر؛ رندر مستقل غير مختبر |
| Hybrid conditioning | أوزان FL2VA + references conditioning | تجربة مجتمعية منفصلة عن دمج الأوزان، بلا رندر GPU موثق هنا |
| Hybrid loader | overlay tensor loader المثبت | تجربة مجتمعية، لودر متحقق من وجوده؛ بلا رندر GPU موثق هنا |

## المدخلات والتحكم
| المدخل | الوظيفة والحدود |
|---|---|
| References | صور الشخصية/المكان/الستايل/Storyboard،video،audio؛ @alias تتحول إلى native tags حسب الترتيب والدور |
| Frame start/end | صورة بداية/نهاية مع اختيارfit؛ لا تفترض تطابق كل فريم |
| Temporal guides | صور منفصلة بتوقيت محدد؛ لا يتم تقسيم ورقة Storyboard تلقائيًا |
| Control video | استخراج Pose/Depth/Canny/Gray حسب المعالج المثبت، أو خريطة فيديو مجهزة لأحد أنواعالنود المتاحة |
| Control still image | استخراج توجيه ثابت أو استخدام خريطة صورة جاهزة، hold_still خلال المدة؛ لا يُستنتج motion من صورة |
| References + ControlNet | متاح فقط بعد التحقق من دعم ComfyUI PR16020؛ Original Ref2VA + static Canny خضع لرندر قصير فعلي |
| Masked region | فيديو مصدر + قناع ثابت مطابق؛ القناع لا يتتبع جسمًا متحركًا ولا يضمن pixel-locked editing |
| ControlNet + continuation/refinement | غير مختبر؛ يُرفض قبل التوليد |
| Source soundtrack reuse | اختيار صريح للفيديو المرجعي، يتطلب span كافيًا؛ لا يضمن lip-sync |

## الرندر واللورات
| الخيار | التوافق وحدود الدليل |
|---|---|
| Original/native | الافتراضي؛ إنتاج فيديو وصوت متحقق منهما على السيرفر |
| Spectrum/MotionCache | نودpatch مختلفة، متاحة حسب التثبيت؛ الفيديو المثبت في هذه المراجعة native ولا يثبت جميع تركيبات التسريع |
| Realism People | ثلاثة أوضاع،trigger r34l1sm،اختيار صريح |
| Combat V2 | ناشره اختبر FL2VA؛ References مسموح مع إشعار تجريبي |
| Motion Repair V2 | لورا مستقلة اختيارية، ليست تلقائية أو اعتمادًا إلزاميًا |
| Character Swap | Original Ref2VA فقط + video source + replacement image،قوة1 كبداية،لاtrigger؛ تفاصيلها في CHARACTER_SWAP_AR.md؛ رندر مستقل غير مختبر هنا |
| Turbo/Lightx2v | متقاعدان من الاختيار والجرافس والتنزيل؛ الملفات القديمة لا تُحذف |

الإعدادات المتقدمة تبقى محفوظة في المشاريع وتُرسل إلى الجراف، مع فحص توافق الموديل والنودز. وجود وزن أو نود لا يثبت جودة كل prompt أو دقة/مدة/LoRA. اقرأ [دليل السيرفر والدليل الفعلي](SERVER_VERIFICATION_2026_10_13_AR.md) و[دليل التشغيل](LAUNCHER.md).

## الدقة وثبات اللقطة — 2.1.3

| المسار | التأثير |
|---|---|
| Draft / Compact / Native | مقاسات توليد؛ تغييرها يغير شبكة latent ويمكن أن يغير اللقطة حتى بنفس seed |
| 1664×928 / Full HD مباشر | توليد تجريبي أعلى من مساحة H3 الأصلية؛ لا يضمن تفاصيل أو التزامًا أفضل |
| Upscale same take | تكبير CPU للفيديو الموجود مع نسخ الصوت؛ بدون sampling أو تغير إعدادات المشروع؛ لا يضيف تفاصيل مولدة |
| Generative refinement | upscale latent ثم sampler آخر؛ قد يغير تفاصيل أو حركة، ولا يضمن نفس اللقطة |

[شرح واختبارات الدقة](RESOLUTION_AND_SAME_TAKE_AR.md).

## إعدادattention — 2.1.3

التشغيل الجديد يطلبPyTorch dense صراحة معأوزانINT8 ConvRot. الكود يعرضbackend العالمي الفعلي ويحفظه معإعدادات الفيديو،ويفصله عنkernelsالـcheckpoint الأصلية. CK/Sage العالميان يغيران الحسابات تقريبًا؛ لا يُفعّلان تلقائيًا. خدمات خارجية قد تحتفظ بargumentsقديمة،وتظهر قيمتها الحقيقية بدل الادعاء بأنهاbaseline. تغييرbackendقد يغير السرعة والنتيجة،والتحقق ليسمقارنةجودة لكلالبرومبتات.
