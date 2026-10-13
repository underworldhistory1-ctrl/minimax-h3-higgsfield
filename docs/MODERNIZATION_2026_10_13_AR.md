# H3 Studio — مراجعة وتحديث 13 أكتوبر 2026

النسخة دي فرع تطوير قابل للمراجعة. الاختبارات هنا على CPU والمتصفح؛ ما اتشغلش رندر GPU جديد، لأن مفيش سيرفر متاح وقت التنفيذ. ما بنقولش إن كل توليفة مضمونة أو إن Singularity أحسن من Original في كل مشهد.

## المشاكل اللي اتصلحت

| قبل التحديث | بعد التحديث |
|---|---|
| منع References مع Fun ControlNet في الواجهة والجراف وفحص السيرفر | دعم الصور والشخصيات والمكان مع الكنترول، بشرط التحقق من تطبيق PR #16020 على السيرفر؛ التحقق يحصل في الواجهة والـbackend |
| Checkpoint ثابت حسب Text/Frames/References | Original، وSingularity مستقل، وHybrid conditioning، وHybrid tensor loader اختيارات منفصلة |
| إعدادات sampler/scheduler/CFG/denoise/shifts/precision مخفية أو ثابتة | إعدادات متقدمة مبنية على اختيارات runtime؛ العقد المشترك يربطها بالجراف، والـbackend يرفض اختلاف الطلب عن الجراف |
| إعدادات التسريع ثابتة داخل الكود | widgets فعلية من schema النود الموجودة؛ لا تسمح باستبدال وصلات MODEL/media |
| Refine ثابت ومعلوماته ممكن تختلف عن الرندر | scale وsteps وdenoise وCFG وsampler/scheduler محفوظين مع المشروع، والجراف، والتوقيت، وبيانات النتيجة |
| شريط إعدادات 390px | 740px افتراضي على desktop، قابل لتغيير العرض بالمؤشر والكيبورد؛ الشاشات الأصغر تستخدم التخطيط السابق |
| صورة واحدة في كل عملية اختيار وكروت طويلة | اختيار عدة صور، صفوف thumbnails مختصرة، preview قابل للفتح، الاسم والدور والترتيب محفوظين في نفس المسار الحالي |
| Turbo قابل للاختيار والتنزيل | اتشال من طرق الرندر ومن الجراف والتنزيل؛ المشاريع القديمة تتحول لـOriginal/20 مع رسالة واضحة؛ الملفات القديمة الموجودة محفوظة |
| تحميل Hybrid لا يحفظ سياق التكملة | حفظ base/overlay/preset في توقيع السياق؛ `none` لا يطلب وزن Ref2VA غير مستخدم |
| تحديث مصدر main تلقائي حتى لو غير معتمد | `notify` افتراضي؛ `verified` يطبق فقط commits موجودة في manifest اعتماد محلي، مع حفظ ref للرجوع وفحص الطابور قبل التغيير |

## مصفوفة التوافق والأدلة

| المسار | Text/Frames | References | الكنترول | Spectrum/MotionCache | دليل التحديث الحالي |
|---|---|---|---|---|---|
| Original FL2VA / Ref2VA | FL2VA | Ref2VA | Native Union 2.0؛ المراجع تتطلب PR16020 | كل طريقة مستقلة، وإعدادات native audio محفوظة | بناء جراف وCPU regression؛ تاريخ الريبو يحتوي رندرات سابقة، لكنها لا تثبت النسخة الجديدة |
| Singularity v1.3 INT8، full أو pruned | تحميل مستقل عبر UNETLoader | نفس checkpoint | مسار patch native مع المراجع عند توفر capability | تجريبي، غير مثبت الجودة هنا | metadata ناشر + size/header discovery + اختبارات اختيار وجراف؛ لا GPU |
| Hybrid conditioning | FL2VA بدون دمج أوزان | FL2VA مع native Ref node | نفس المسار native | تجريبي | ادعاء مجتمعي ومراجعة المصدر + اختبارات جراف؛ لا GPU |
| Hybrid tensor loader | FL2VA base | نفس conditioning حسب الوضع | same native patch | تجريبي | loader ANe5s مثبت revision؛ `none`، و45–49، وall_adaln؛ لا GPU |
| Anime → realism | workflow References مستقل الاتجاه | فيديو مصدر + وصف realism؛ LoRA اختيار المستخدم | ممكن مع source structural control | نفس إعدادات المستخدم | prompt/state/graph/source-audio contracts؛ لا تقييم بصري |
| Realism → anime | workflow References مستقل الاتجاه | فيديو مصدر + وصف anime؛ LoRA اختيار المستخدم | ممكن مع source structural control | نفس إعدادات المستخدم | prompt/state/graph/source-audio contracts؛ لا تقييم بصري |

Original defaults محفوظة: 20 steps، `res_multistep/simple`، CFG 1، video/audio shifts 12/3، native stereo audio، 24fps، و5+17k frames. اختيار family لا يغيّر resolution أو خطوات المستخدم تلقائيًا. إعدادات جديدة لا تفرض وصفة أسرع أو دقة أقل.

`Reuse source soundtrack` يوصل الصوت المقطوع من فيديو المصدر مباشرة إلى CreateVideo، بدل صوت H3 الناتج. المصدر لازم يغطي طول الناتج؛ مفيش صمت أو تمديد تلقائي. تصدير MP4 يعيد ترميز الصوت حسب مسار الحفظ الموجود، فلا ندّعي تطابق ملف الصوت bit-for-bit أو تطابق lip-sync مع مشهد اتغير.

## LoRAs

المسارات القائمة لـRealism People وCombat V2 وMotion Repair V2 محفوظة؛ القوة وترتيب السلسلة وقوة مرحلة Refine محفوظين. Combat مع Ref2VA يظل تجريبي، لأن دليل الناشر يخص FL2VA. أي LoRA غير معروف يظل محتاج تحقق من model card؛ اسم الملف وحده مش دليل تدريب أو جودة. Turbo/Lightx2v لا يدخلوا سلسلة التوليد الجديدة ولا manifest التنزيل. الملفات القديمة لا تتحذف من تخزين المستخدم أو من مشاريع/نتائج تاريخية.

لم يتم تنزيل Anime-Motion LoRA تلقائيًا: الناشر يصف تجربة I2V بأوزان Fast وبخطوات 4–6، وده مش دليل توافق مع non-Turbo Ref2VA transformation. السماح بها تلقائيًا كان هيخالف طلب التكامل الصحيح. اختار style LoRA مثبتة ومتوافقة مع المسار اللي بتستخدمه؛ التوليد بدون LoRA ممكن عبر prompt الفيديو المرجعي، لكنه مش pixel-locked conversion.

## التشغيل والتحديث والرجوع

استخدم checkout منفصل للفرع؛ ما تستبدلش production أثناء الرندر. الأوامر دي أمثلة على السيرفر، لم تُنفذ على GPU وقت المراجعة:

```bash
git clone --branch dev/h3-modernization https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git h3-development
cd h3-development
bash launcher.sh --no-update --comfy-root /path/to/ComfyUI --video-only --preflight
bash launcher.sh --no-update --comfy-root /path/to/ComfyUI --video-only
```

Windows: استخدم `./launcher.ps1` بنفس الخيارات وبمسار ComfyUI الحالي؛ ممكن تحتاج `--comfy-python` لو interpreter غير قابل للاكتشاف. الخيارات تمر إلى Python launcher.

Singularity اختياري، ويضيف 20,967,647,456 bytes قبل overhead. اعرض خطة المساحة أولًا، وبعدها فعّل التنزيل بنفسك:

```bash
bash launcher.sh --no-update --comfy-root /path/to/ComfyUI --video-only --checkpoint singularity-int8 --hybrid --preflight
bash launcher.sh --no-update --comfy-root /path/to/ComfyUI --video-only --checkpoint singularity-int8 --hybrid
```

اللانشر يعيد استخدام الوزن اللي hash بتاعه متحقق منه، يكمل التنزيل، ويعمل replacement ذري. Singularity checksum وrevision مثبتين في `deploy/compatibility.json`. Hybrid loader ليس نسخة من الكود داخل الريبو؛ dependency اختيارية مستقلة مثبتة على commit، وتحت رخصتها الخاصة.

تقرير `.h3-launcher/report.json` يسجل Python/packages/CUDA/GPU، consistency، files/API/GPU validation منفصلين. `pip check` لا يصلح اختلاف حزم عشوائي أو يستبدل CUDA stack تلقائيًا. الإصلاحات المعروفة تتم في مرحلة installer قبل بدء الخدمة. smoke المعتاد يثبت Original فقط؛ لا يعتبر Singularity أو overlays أو كل LoRA مختبرين لمجرد إن `gpu_validated=true`.

سياسة `notify` تبلغ عن update بدون تغيير المصدر. `verified` ما يثبتش commit جديد إلا لو موجود في `approved_source_commits`؛ القائمة فارغة في فرع المراجعة لأن النسخة لسه محتاجة acceptance GPU. dependencies الحالية مثبتة في ملفات التثبيت/lock القائمة؛ versions الفعلية تسجل في التقرير. الحزم الانتقالية ليست wheel lock كاملًا لكل OS/CUDA.

للرجوع: انتظر إن الطابور يبقى فاضي؛ احتفظ بالـinput/output والمشاريع. استرجع backup runtime اللي التقرير مسجله، أو ثبت checkout للمراجعة الأصلية `15102365e08cb061c299b1f071a1570351f50f96` بنفس installer. نسخة المصدر القديمة قبل أي تحديث معتمد موجودة في `refs/h3-launcher/previous-source`. لا تشغل نسختين بتسجيل نفس النودز والمسارات في عملية ComfyUI واحدة.

## اختبارات التسليم

التفاصيل والعدد النهائي في `MODERNIZATION_TEST_RESULTS.json`. الاختبارات تشمل baseline regression، بناء الجراف عبر كل family/mode، settings routing، live-schema scalar validation، aliases/order، reference ControlNet من JS إلى Python admission، hybrid context signatures، رفض Turbo، downloader manifests، resume/hash/atomic installation القائمة، سياسة updates، والمشاريع القديمة.

اختبارات Chromium تستخدم API fixtures مصرح إنها fixtures؛ هي تختبر الواجهة الفعلية وتزامن الجراف، ولا تدعي وجود موديلات أو GPU. الصور في `modernization/` screenshots للواجهة الحقيقية مع fixtures.

## حدود لسه مفتوحة

- لا رندر GPU أو benchmark جودة/VRAM/audio-sync جديد. لا ضمان إن المستخدم لن يقابل أي مشكلة؛ اختبار launch ثم render acceptance على جهازه ضروري.
- GGUF/W4A8 مش مفعّلين كاختيارات جاهزة: وجود ملف أو node name لا يثبت دعم H3 في نسخ loaders الحالية؛ دعم GGUF الرسمي ما زال له PRs مفتوحة. INT8 Singularity مسار واضح، وW4A8 يحتاج loader/runtime مثبتين وتقييم GPU مستقل.
- لا automatic shot segmentation/batch scene transformation. trimming الموجود يحدد الجزء المراد توليده؛ تقسيم مشاهد تلقائي سليم وتقييم joins لم يتم تنفيذه هنا.
- لا ادعاء إن كل LoRA على القرص متوافق؛ ولا إن أسماء camera/motion roles تخلق قنوات conditioning مستقلة.
- ControlNet مع continuation أو Refine يظل ممنوعًا لعدم وجود تحقق end-to-end لهذه التوليفة. مصادر masks الديناميكية/tracked ليست جاهزة؛ static mask فقط.
- سلاسل Hybrid وتفاعلها مع LoRAs أو accélération غير مثبتة الجودة محليًا. loader preset `none` baseline مجتمعي؛ tensor overlays ليست مضمونة التحسين.

## المصادر التي راجعناها

- [MiniMax official model](https://huggingface.co/MiniMaxAI/MiniMax-H3)
- [ComfyUI native H3 source](https://github.com/Comfy-Org/ComfyUI/blob/3b4c0b0e457cf0a51cf3038e0a6750d8f96ce251/comfy_extras/nodes_minimax_h3.py)
- [PR #16020 — native reference/keyframe ControlNet](https://github.com/Comfy-Org/ComfyUI/pull/16020)
- [Singularity publisher](https://huggingface.co/WarmBloodAban/Minimax-h3_Singularity)
- [ANe5s Hybrid loader and validation paper](https://github.com/ANe5s/ComfyUI-MiniMax-H3-Hybrid)
- [Earlier hybrid loader analysis](https://github.com/scottmudge/ComfyUI_MinimaxH3HybridLoader)
- [Anime-Motion publisher](https://huggingface.co/prithivMLmods/MiniMax-H3-I2V-Anime-Motion-LoRA)
- [GGUF H3 architecture PR](https://github.com/city96/ComfyUI-GGUF/pull/476)
