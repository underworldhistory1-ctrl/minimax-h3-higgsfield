# خريطة اختيارات H3 Studio — 2.5.9

الـSeed الافتراضي42 للتكرار، مش ترتيب جودة. الأرقام الصحيحة حتى الحد الأصلي64-bit محفوظة بدقة؛ العشوائي يتحدد مرة قبل الإرسال. Text/Frames/References بيسمحوا5–362 فريم على شبكة5+17k؛ تحت124 فريم خارج نطاق التدريب المعتاد وجودةGPUغير مختبرة هنا. [التفاصيل والحدود](SEED_AND_DURATION_AR.md).

## الموديلات
| الاختيار | المسار | الدليل |
|---|---|---|
| Original Text/Frames | FL2VA + ImageToVideo | الوظائف الأصلية محفوظة؛ صور بداية/نهاية،guides،continuation وrefinement حسب جاهزية النودز |
| Original References | Ref2VA + ReferenceToVideo | صور/فيديو/صوت مسمى،native audio؛ رندر قصير حي مع صورة + static Canny تم التحقق منه |
| Singularity | checkpoint مستقل يختاره المستخدم | v1.3 INT8؛ اكتمل رندر 209 فريم بدقة1024×576 مع Anime → Realism، ونجح فك الفيديو والصوت كاملين؛ لا يثبت كل التركيبات |
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
| Combat V2 | ناشره اختبر FL2VA؛ اكتمل محليًا Ref2VA INT8 + Combat V2 بقوة1،362 فريم1024×576 مع صوت؛ يظل الحكم البصري لكل لقطة |
| Motion Repair V2 | لورا مستقلة اختيارية، ليست تلقائية أو اعتمادًا إلزاميًا |
| Character Swap | References مع الموديل المختار + video source + replacement image،قوة1 كبداية،لاtrigger؛ تفاصيلها في CHARACTER_SWAP_AR.md؛ رندر مستقل غير مختبر هنا |
| Turbo v4 EMA | اختياري لـOriginal Text/Frames، 4–8 خطوات، نود وسامبلر الناشر؛ راجع TURBO_V4.md. References لها LightX2V8stepv1.0 منفصلة؛ نجح اختبار 124فريم 864×480 مع صوت ومراجعة ثلاث لقطات للهوية |

الإعدادات المتقدمة تبقى محفوظة في المشاريع وتُرسل إلى الجراف، مع فحص توافق الموديل والنودز. وجود وزن أو نود لا يثبت جودة كل prompt أو دقة/مدة/LoRA. اقرأ [المراجعة الحالية والدليل الفعلي](PRODUCTION_READINESS_2026_10_15.md) و[دليل التشغيل](LAUNCHER.md).

## الدقة وثبات اللقطة — 2.1.3

| المسار | التأثير |
|---|---|
| Draft / Compact / Native | مقاسات توليد؛ تغييرها يغير شبكة latent ويمكن أن يغير اللقطة حتى بنفس seed |
| 1664×928 / Full HD مباشر | توليد تجريبي أعلى من مساحة H3 الأصلية؛ لا يضمن تفاصيل أو التزامًا أفضل |
| Upscale same take | تكبير CPU للفيديو الموجود مع نسخ الصوت؛ بدون sampling أو تغير إعدادات المشروع؛ لا يضيف تفاصيل مولدة |
| Generative refinement | upscale latent ثم sampler آخر؛ قد يغير تفاصيل أو حركة، ولا يضمن نفس اللقطة |

[شرح واختبارات الدقة](RESOLUTION_AND_SAME_TAKE_AR.md).

## دقة الأوزان وAttention

الموديل INT8 ConvRot لا يجعل كل العمليات INT8؛ بقاء BF16/FP16 للعمليات المناسبة طبيعي. اللانشر يتطلب CUDA 13+ وbackend CUDA أصليًا، ويتحقق من العامل المحمّل فعلًا. PyTorch fused SDPA هو الافتراضي؛ Kitchen INT8 attention اختيار صريح عبر --attention-backend ck-int8، مستقل عن Spectrum/MotionCache ودقة الأوزان.

في مقارنة مطابقة على RTX 5090، استغرق Ref2VA1024×576،362 فريم،20 خطوة نحو20:01 مع PyTorch Flash مقابل9:43 مع CK INT8. هذا قياس لعبء واحد، والتقريب قد يغير النتيجة. [إعدادات المقارنة وحدودها](LAUNCHER.md#attention-selection-and-supervised-workers).

## مرحلة الصوت 2.5.0

[مصفوفة الصوت والدليل المنشور والاختبارات](AUDIO_ENHANCEMENT_AR.md#التوافق). خيار مستقل يحافظ على الفيديو النهائي، يتجاوز نفسه عند حفظ صوت المصدر، ويدعم حماية صوت التكملة. التوصيل المحلي متحقق؛ تحسن الصوت مع كل checkpoint/LoRA غير مثبت.


### Anime → Realism — 2.5.2

| المكوّن | التوافق وحدود الدليل |
|---|---|
| LiseTY `Anime2Realsim__H3.safetensors` | تدريب Ref2VA؛ References مع فيديو مصدر وTrigger `LumiReal`، مع إتاحة الموديل المختار |
| Singularity v1.3 INT8 | اكتمل رندر References مع Anime → Realism وفيديو/صوت ومراجع؛ نجاح تقني وفك ملف كامل، وليس ضمانًا لجودة كل تحويل |
| FL2VA / Hybrid | متاحة للتجربة مع المراجع والكي فريمز واللورات؛ الدليل الحالي لا يثبت جودة GPU لهذه التركيبات |
| Native rendering | مسار Prepare؛ المقاس والسيد والعينة يُحفظون، قوة 1 بداية قابلة للتعديل وليست أفضل قيمة مثبتة |
| MotionCache / Spectrum / Refine / ControlNet / LoRA stacking | تظل خيارات متقدمة؛ لا يوجد اختبار جودة محلي لهذه التركيبات |
| Realism → Anime | قالب prompt-guided؛ لا يستخدم اللورا أحادية الاتجاه |
| الصوت | Native H3 أو حفظ صوت المصدر؛ اللورا ليست تحسينًا مخصصًا للصوت |

[مصدر الناشر](https://huggingface.co/LiseTY/Minimax-H3-ref2v_Anime_2_Realism) · [التحقق والتعليمات](ANIME_TO_REALISM_AR.md).
