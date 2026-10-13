# H3 Studio V2 — النسخة الأساسية

ابدأ بـ[دليل الترقية والرجوع](docs/V2_UPGRADE_AR.md). نسخة V2 واحدة لكل عملية ComfyUI؛ حافظ على مشاريع ونتائج النسخة الحالية عند التحديث.

# ابدأ من هنا — H3 Higgsfield

للتثبيت المباشر من GitHub: على خادم NVIDIA Linux استخدم `bash install.sh`، وعلى Windows استخدم `install.ps1` من PowerShell مع `-ComfyRoot` لمسار ComfyUI Portable أو ComfyUI العادي، كما في README. طريقة نقل الفولدر بالأسفل متاحة أيضًا لاستعادة مكتبة الفيديوهات الشخصية.

هذا مصدر النسخة النهائية لواجهتي **Video** و**Image** والجرافس وسكربتات التثبيت. واجهة Image تشغل Qwen Image 2.1 في Create أو Edit حتى 10 صور، وتستخدم نفس تسجيل الدخول والطابور. لا توجد كلمة مرور أو توكن داخل الحزمة.

## ما الذي يظهر للمستخدم؟

الواجهة الإنجليزية H3 Studio تعمل من رابط ComfyUI على `/extensions/h3_studio/index.html`. دخول الجذر يحول إلى الواجهة، ومحرر النودز يبقى في `/?view=nodes` للصيانة فقط. ثلاثة أوضاع: Text وFrames بموديل FL2VA، وReferences بموديل Ref2VA. يمكن تسمية الصور والفيديوهات والصوت وذكرها بـ`@name`. يظهر عدد الفيديوهات على الخادم، الثامبنيلز، Show more، تفاصيل إعدادات كل فيديو، الطابور، تقدم الرفع والتوليد، وتقدير الوقت الذي يستفيد من القياسات المحفوظة.

## أسرع تركيب على سيرفر جديد

الخطوات التالية لمسار نقل الفولدر عبر SSH إلى Linux. على Windows اتبع أمر `install.ps1` في README بدلًا منها.

1. تأكد أن ComfyUI موجود على Linux وأن لديك SSH ومساحة كافية ويفضل قرص موديلات دائم. اعرف إن كان هناك رندر شغال قبل أي Restart.
2. في أول مرة فقط ثبّت أداة الاتصال محليًا: `python -m pip install -r requirements-installer.txt`. من فولدر التسليم شغّل `python provision_h3.py --host SERVER_IP --port SSH_PORT`، أو أضف `--identity KEY_FILE` لمفتاح SSH. لو تريد نقل مكتبة الفيديوهات المحفوظة في اللقطة المرفقة أضف `--library-backup library-backup.zip`. سيُطلب الباسورد دون حفظه. إن كان ComfyUI في مسار مختلف، أضف `--comfy-root /path/to/ComfyUI`.
3. السكربت يرفع الأرشيف، يثبت إضافة الواجهة والجرافس، يتحقق من نودز H3، يثبت `ffmpeg` و`git` و`tar` تلقائيًا على Ubuntu/Debian عند الحاجة وصلاحية root، ويجهز Spectrum/MotionCache واللورَات الاختيارية المتوافقة؛ Turbo متقاعد. ملف الموديل الموجود السليم على القرص الدائم يُعاد استخدامه مباشرة؛ الملفات الناقصة تُنزّل من المصادر المثبتة.
4. بعد انتهاء الرندر الجاري إن وجد، أعد تشغيل ComfyUI **مرة واحدة** بالطريقة التي يوفرها مزود السيرفر. ثم شغّل `python verify_h3_server.py --url COMFY_URL` من فولدر التسليم وافتح واجهة H3 في المتصفح.

التجهيز الجديد يثبت ComfyUI revision `3b4c0b0e457cf0a51cf3038e0a6750d8f96ce251`. الفحص يتأكد من نود H3 References، إصلاح تركيب tiles داخل H3 VAE، ونودز Qwen Image 2.1. لو أي علامة ناقصة يتوقف التثبيت بدل بدء رندر بجودة أو جراف غير صحيح.

## ما داخل الأرشيف؟

| المسار | الغرض |
|---|---|
| `__init__.py` | API الرفع والمكتبة والثامبنيلز والوقت والبيانات |
| `web/` | كل تصميم الواجهة ومنطقها |
| `workflows/` | الجرافس الجاهزة للجودة والفحص القصير |
| `deploy/` | تنزيل الأوزان واللورَات والنودز المثبتة وواجهة البداية |
| `docs/` | حدود التوافق وسلوك الواجهة والمراجعة |

الأوزان **ليست جزءًا من أرشيف الكود**. H3 المحضر حوالي 65.8GB، وQwen INT8 يضيف 17.3GB. اختيار BF16 وحده يضيف 32.4GB، واختيار INT8 وBF16 معًا يجعل ملفات Qwen الفريدة 49.0GB. على Salad استخدم 100GB كحد أدنى مع INT8 فقط، و150GB للاحتفاظ بالنسختين. التخزين المؤقت يعني أن تخصيص جهاز جديد يعيد تنزيل الأوزان.

## مراجعة بعد التثبيت

- تحقق من ظهور RTX 5090 أو GPU الجديد، وكل `models_ready=true` و`missing_nodes=[]` في فاحص الخادم.
- تحقق من ملفات LoRA الأربع: Realism People وCombat V2 وMotion Repair V2 وCharacter Swap، ومن نودز Spectrum وMotionCache المنفصلة.
- افتح الرابط الرئيسي: يجب أن تظهر **H3 Studio** لا محرر ComfyUI. جرب ظهور الريفرنسات، مقاسات الكانفس، خطوات 20/30/50، Show more، تفاصيل الفيديوهات، وأزرار الإلغاء/التحميل دون تشغيل رندر تلقائي.
- رندر صوت/صورة جديد على سيرفر أو نسخة ComfyUI مختلفة يحتاج حكم مشاهدة واستماع من المستخدم. فحص جاهزية API لا يحل محل ذلك.

راجع `README.md` و`docs/GRAPH_MAP.md` و`docs/COMPATIBILITY_MATRIX_AR.md` و`docs/UX_FLOW.md` للتفاصيل التقنية.


## Update 2026-10-12

Launch from an official Git clone on `main`: the launcher fetches and fast-forwards to the latest repository version before installing. It preserves local edits and rejects divergent commits. `--no-update` is an explicit offline/custom-checkout option; `--preflight` and `--status` remain read-only. ZIP copies must be downloaded again for source updates. Verified ComfyUI and acceleration-node revisions remain pinned.

The installer now includes the shared queue/cancellation/stage observer, bounded H3 MLP scratch allocations, CPU MotionCache residual storage, a 3 GB VRAM reserve for newly started workers, and the narrowly scoped public Studio document navigation fix. H3 Studio rejects oversized unsupported graphs before submission. Model weights, projects, inputs, and generated outputs are preserved.

Qwen image references persist as original files in this browser's IndexedDB, including names, order, and dimensions. Wait for “saved in this browser” before refresh. Persistence belongs to the same browser and URL origin; changing tunnel hostname creates a separate browser draft. Removing a reference also updates its saved draft.

Validation: 115 JavaScript tests, CPU stage/core patch tests, and real-browser refresh checks. No AI render was submitted for this update. These checks do not prove zero OOMs for every GPU workload.
