/* Language choice covers contextual workflow explanations; control labels stay English. */
(function(root){
  'use strict';
  const storageKey='h3studio.guidance.language';
  const messages={
    frames:{en:'These are the opening and closing images of the video. Upload either or both; H3 generates the motion between them. Use References for images defining a character or location.',ar:'هذه صور بداية ونهاية الفيديو. ارفع واحدة أو الاثنتين؛ يكوّن H3 الحركة بينهما. للصور التي تحدد شكل الشخصية أو المكان استخدم References.'},
    references:{en:'Appearance and identity references: choose each image’s role and mention its name with @. A multi-panel storyboard uses the Storyboard role to guide shot order, without exact timing. Upload structural motion guidance in Motion & region control.',ar:'مراجع الشكل والهوية: حدّد دور كل صورة واكتب اسمها باستخدام @. ورقة الستوري بورد متعددة اللوحات تستخدم دور Storyboard لتوجيه ترتيب اللقطات، ولا تفرض توقيتًا دقيقًا. فيديو توجيه الحركة يرفع في Motion & region control.'},
    keyframes:{en:'For a specific image at a specific time, add each storyboard panel as a separate image and choose its time. These are timed images, not a complete storyboard sheet. Availability and input support are checked on the server.',ar:'لصورة محددة عند وقت محدد: أضف كل لوحة من الستوري بورد كصورة منفصلة وحدد وقتها. هذه صور زمنية، وليست ورقة لوحات كاملة. التوفر ونوع المدخل يُفحصان على السيرفر.'},
    loras:{en:'LoRAs add a style or behavior to the model. Enable only what you need and read each adapter’s requirements. Being installed does not mean every model or acceleration combination has been tested.',ar:'اللورا تضيف أسلوبًا أو سلوكًا للموديل. فعّل فقط ما تحتاجه، واقرأ شروط كل لورا؛ وجودها على القرص لا يعني أن خلطها مع أي موديل أو تسريع مختبر.'},
    model:{en:'Start with Original. Choose the model here, then the input below: Text for a description, Frames for opening/closing images, or References for characters, locations and storyboards. Missing options are disabled. Changing the model does not automatically change your canvas or steps.',ar:'ابدأ بـOriginal. اختَر الموديل هنا، ثم نوع المدخل أسفل: Text للوصف، Frames لبداية/نهاية، References للشخصية والمكان والستوري بورد. خيارات غير مثبتة تظهر معطلة؛ تغيير الموديل لا يغيّر مقاسك أو خطواتك تلقائيًا.'},
    sampling:{en:'These are the actual render settings, saved with the project. Start with the original settings; acceleration can change the result. Restore baseline settings resets the sampling settings.',ar:'هذه إعدادات الرندر الفعلية، وتُحفظ مع المشروع. اترك الإعدادات الأصلية كبداية؛ التسريع قد يغيّر النتيجة. Restore baseline settings يرجع إعدادات العينة الأصلية.'},
    style:{"en":"This is a prompt preset, not another generation mode. It enables Anime → Realism and writes LumiReal/source instructions while retaining your selected model, method, keyframes and other adapters. You can select the same LoRA manually. Realism → Anime is a prompt-only direction.","ar":"ده إعداد جاهز للبرومبت مش وضع توليد منفصل. بيفعّل لورا Anime → Realism وبيكتب LumiReal وتعليمات المصدر، مع الحفاظ على الموديل وطريقة الرندر والكي فريمز وباقي اللورات المختارة. تقدر تختار نفس اللورا يدويًا. Realism → Anime توجيه بالبرومبت فقط."},
    swap:{"en":"Upload a source video and replacement image, then identify the person. This shortcut enables Character Swap and writes a replacement prompt. Your selected model, method and other adapters remain selected. Experimental combinations are available to test.","ar":"ارفع فيديو المصدر وصورة البديل وحدد الشخص. الاختصار بيفعّل Character Swap وبيكتب برومبت الاستبدال. الموديل وطريقة الرندر وباقي اللورات المختارة بتفضل زي ما هي. التركيبات التجريبية متاحة للتجربة."},
    writer:{en:'Automatic formats your words and understands references with AI when a provider is connected. Use my prompt directly sends your description directly.',ar:'Automatic ينسّق كلامك ويستخدم فهم المراجع عندما تكون خدمة الذكاء الاصطناعي متصلة. Use my prompt directly يرسل وصفك مباشرة.'},
    writerUnavailable:{en:'Understanding references with AI requires a connected prompt provider; generation itself still works. Automatic can format locally, or choose Use my prompt directly.',ar:'فهم المراجع بالذكاء الاصطناعي يحتاج خدمة كتابة متصلة؛ التوليد نفسه يعمل. Automatic متاح للتنسيق المحلي، أو اختَر Use my prompt directly.'},
    controlStill:{en:'One image holds pose, depth, outlines or lighting throughout the clip; it does not supply motion. Choose one storyboard panel. Put a multi-panel sheet in References with the Storyboard role; use Temporal keyframes for timed images.',ar:'صورة واحدة تثبّت الوضعية أو العمق أو الحواف أو الإضاءة طوال المقطع؛ لا تستخرج حركة. اختَر لوحة واحدة من الستوري بورد. الورقة متعددة اللوحات مكانها References بدور Storyboard، وللتوقيت استخدم Temporal keyframes.'},
    controlMasked:{en:'To edit part of a video, upload the video and a static mask with matching composition. White marks the area to regenerate; black retains source guidance. A static mask does not track a moving person.',ar:'لتعديل منطقة من فيديو: ارفع الفيديو وقناعًا ثابتًا بنفس التكوين. الأبيض منطقة التغيير، والأسود يحافظ على توجيه المصدر. القناع الثابت لا يتتبع شخصًا متحركًا.'},
    controlVideo:{en:'This video guides motion or structure; images in References define characters and locations. Example: a character image + a walking video + Follow body motion. Add the same video to References only if you also want it as a reference.',ar:'الفيديو هنا يحدد الحركة أو البنية، والصور في References تحدد الشخصية والمكان. مثال: صورة شخصيتك + فيديو مشي + Follow body motion. لا تحتاج رفع نفس الفيديو في References إلا لو أردته مرجعًا أيضًا.'},
    controlPrepared:{en:'This input is for a prepared control map such as Pose, Depth, Canny or Scribble. Choose the map’s actual type. Do not use an ordinary video or a multi-panel storyboard sheet as a prepared map.',ar:'هذا المدخل لخريطة تحكم جاهزة، مثل Pose أو Depth أو Canny أو Scribble؛ اختر نوع الخريطة الحقيقي. لا تستخدم فيديو عادي أو ورقة ستوري بورد متعددة اللوحات كخريطة جاهزة.'}
  };
  Object.assign(messages,{
  "videoHelp1": {
    "en": "Open a project to work with its assets, prompts and takes.",
    "ar": "افتح مشروعًا للعمل على مواده وأوصافه ولقطاته."
  },
  "videoHelp2": {
    "en": "Video with native audio · 24 fps",
    "ar": "فيديو بصوت أصلي · 24 إطارًا في الثانية"
  },
  "videoHelp3": {
    "en": "Reusable assets for this project. Use a file or mention it with @ to attach it to the current shot.",
    "ar": "مواد قابلة لإعادة الاستخدام داخل هذا المشروع. استخدم الملف أو اذكره باستخدام @ لإرفاقه باللقطة الحالية."
  },
  "videoHelp4": {
    "en": "Storyboards guide composition and shot plans; panels do not automatically become timed shots. The catalog can hold more files than H3 accepts in one shot.",
    "ar": "الستوري بورد يوجّه التكوين وخطة اللقطات؛ لا تتحول اللوحات تلقائيًا إلى لقطات بتوقيت محدد. يمكن للكتالوج حفظ ملفات أكثر مما يقبله H3 في لقطة واحدة."
  },
  "videoHelp5": {
    "en": "Choose the video to extend here. Uploading a video in References supplies guidance; it does not select a continuation source.",
    "ar": "اختر هنا الفيديو المراد تمديده. رفع فيديو في References يضيف مرجعًا ولا يختاره مصدرًا للتمديد."
  },
  "videoHelp6": {
    "en": "To extend an existing project result, use Extend clip on that result below. Storyboard = shot plan in References; keyframe = one image at a chosen time.",
    "ar": "لتمديد نتيجة موجودة، استخدم Extend clip عليها أدناه. Storyboard خطة لقطات في References؛ وkeyframe صورة واحدة عند وقت محدد."
  },
  "videoHelp7": {
    "en": "Set the exact first frame, last frame, or both. The first image should match the canvas aspect ratio.",
    "ar": "حدّد صورة البداية أو النهاية أو الاثنتين. ينبغي أن تطابق الصورة الأولى نسبة أبعاد مساحة الإخراج."
  },
  "videoHelp8": {
    "en": "Original files stay in the project; fitting creates a separate render input.",
    "ar": "تبقى الملفات الأصلية في المشروع؛ وينشئ ضبط المقاس مدخلًا منفصلًا للرندر."
  },
  "videoHelp9": {
    "en": "Name each asset, then type @name in the prompt. Each asset is bound to its H3 reference input.",
    "ar": "سمّ كل ملف ثم اكتب @name في الوصف. يرتبط كل ملف بمدخله المرجعي في H3."
  },
  "videoHelp10": {
    "en": "Video references guide a new generation. “Whole scene” asks H3 to follow the full clip while changing the detail in your prompt, but cannot preserve every other frame or pixel. For a multi-panel shot sheet, select Storyboard and mention it in the prompt. Up to 9 images, 3 videos, 3 audio references and 12 files total. A selected video soundtrack counts as audio. Each video/audio: 2–15 s; each type totals 15 s. Trim longer clips below; oversized video can fit within 1920×1080. Frame rates convert to 24 fps after upload.",
    "ar": "مراجع الفيديو توجّه توليد فيديو جديد. يطلب Whole scene اتباع المقطع مع تغيير ما وصفته، لكنه لا يحافظ على كل إطار أو بكسل. للستوري بورد متعدد اللوحات اختر Storyboard واذكره في الوصف. الحد الأقصى 9 صور و3 فيديوهات و3 ملفات صوتية و12 ملفًا إجمالًا. صوت الفيديو المختار يُحتسب ملفًا صوتيًا. كل فيديو أو صوت 2–15 ثانية؛ ومجموع كل نوع 15 ثانية. قصّ المقاطع الأطول أدناه؛ ويمكن ضبط الفيديو الكبير داخل 1920×1080. يتحول المعدل إلى 24 إطارًا في الثانية بعد الرفع."
  },
  "videoHelp11": {
    "en": "Upload fitting caps the long edge at 2048 px. Native Max caps the short edge at 2048 px, never upscales, and avoids the extra downscale used by Match. It can consume more memory; it cannot recover lost source detail.",
    "ar": "ضبط الرفع يحد الضلع الطويل عند 2048 بكسل. Native Max يحد الضلع القصير عند 2048 بكسل ولا يكبّر الصورة ويتجنب التصغير الإضافي في Match. قد يستهلك ذاكرة أكثر ولا يستعيد تفاصيل المصدر المفقودة."
  },
  "videoHelp12": {
    "en": "Describe what should happen and what should be heard. Use reference names to clarify what each asset controls.",
    "ar": "صف ما سيحدث وما سيُسمع. استخدم أسماء المراجع لتوضيح ما يوجّهه كل ملف."
  },
  "videoHelp13": {
    "en": "Image guides at chosen times. Available when the server has native H3 AddGuide.",
    "ar": "صور إرشادية عند أوقات تختارها. تتاح عندما يدعم السيرفر H3 AddGuide الأصلي."
  },
  "videoHelp14": {
    "en": "Installed adapters appear here. Enable only the ones you want on this render.",
    "ar": "تظهر هنا اللورات المثبتة. فعّل فقط ما تريده لهذا الرندر."
  },
  "videoHelp15": {
    "en": "Connect ComfyUI to load installed LoRAs.",
    "ar": "اتصل بـComfyUI لتحميل اللورات المثبتة."
  },
  "videoHelp16": {
    "en": "Realism People supports all three modes; start prompts with r34l1sm. Combat V2 can also be selected in References, but its creator tested FL2VA only, so Ref2VA results are experimental. Both are optional and off by default. Character Swap requires Original Ref2VA with a source video and replacement image. Turbo is optional in Render method; choose the version matching Text/Frames or References.",
    "ar": "Realism People يدعم الأنماط الثلاثة؛ ابدأ الوصف بـr34l1sm. يمكن اختيار Combat V2 في References لكن منشئه اختبر FL2VA فقط، لذا نتائج Ref2VA تجريبية. كلاهما اختياري ومتوقف افتراضيًا. Character Swap يحتاج Original Ref2VA وفيديو مصدر وصورة بديلة. Turbo اختياري في Render method؛ اختر النسخة المطابقة لـText/Frames أو References."
  },
  "videoHelp17": {
    "en": "Choose the canvas used to generate a new shot. Native detail is the recommended upper baseline.",
    "ar": "اختر مساحة توليد لقطة جديدة. Native detail هو الحد الأساسي العلوي الموصى به."
  },
  "videoHelp18": {
    "en": "Canvas dimensions are rounded for H3, so the ratio is approximate.",
    "ar": "تُقرّب الأبعاد لتناسب H3، لذا نسبة الأبعاد تقريبية."
  },
  "videoHelp19": {
    "en": "Another sampling pass can change details and motion. To keep an approved shot, upscale the existing video instead.",
    "ar": "قد تغير جولة أخذ عينات إضافية التفاصيل والحركة. للحفاظ على لقطة معتمدة كبّر الفيديو الموجود بدلًا من إعادة توليده."
  },
  "videoHelp20": {
    "en": "42 is the reproducible default, not a quality ranking. Use a whole number; blank or -1 chooses Random when generating.",
    "ar": "42 هي القيمة الافتراضية القابلة للتكرار وليست ترتيب جودة. استخدم عددًا صحيحًا؛ الفراغ أو -1 يختار Random عند التوليد."
  },
  "videoHelp21": {
    "en": "Leave empty when this page is served by ComfyUI.",
    "ar": "اتركه فارغًا عندما تُفتح هذه الصفحة من ComfyUI."
  },
  "videoHelp22": {
    "en": "Videos stay on this server until deleted. Pin favorites, download a copy, or delete.",
    "ar": "تبقى الفيديوهات على هذا السيرفر حتى حذفها. ثبّت المفضلة أو نزّل نسخة أو احذفها."
  },
  "videoHelp23": {
    "en": "Enlarges existing frames with Lanczos and copies the audio. Preserves the shot; does not generate new detail. Aspect ratio is kept, with dimensions rounded to even pixels.",
    "ar": "يكبّر الإطارات الموجودة باستخدام Lanczos وينسخ الصوت. يحافظ على اللقطة ولا يولّد تفاصيل جديدة. تبقى نسبة الأبعاد مع تقريب الأبعاد إلى أعداد زوجية."
  },
  "videoHelp24": {
    "en": "Ordered accepted takes. Review joins on the GPU test server before approving quality.",
    "ar": "لقطات معتمدة مرتبة. راجع الوصلات على سيرفر اختبار GPU قبل اعتماد الجودة."
  },
  "videoHelp25": {
    "en": "Progress and completed downloads are available on every connected device, including after refresh.",
    "ar": "يتاح التقدم والتنزيلات المكتملة لكل الأجهزة المتصلة، حتى بعد تحديث الصفحة."
  },
  "videoHelp26": {
    "en": "Enlarge this existing video without regenerating it. Keeps the shot and copies its audio; does not generate new detail.",
    "ar": "كبّر هذا الفيديو الموجود دون إعادة توليده. يحافظ على اللقطة وينسخ صوتها ولا يولّد تفاصيل جديدة."
  },
  "videoHelp27": {
    "en": "Grouping changes the project location in this library. Media, stable identities and saved shots stay intact.",
    "ar": "يغير التجميع مكان المشروع في هذه المكتبة. تبقى الوسائط والهويات الثابتة واللقطات المحفوظة كما هي."
  },
  "videoHelp28": {
    "en": "Folders organize media independently of its reference role.",
    "ar": "تنظم المجلدات الوسائط بصورة مستقلة عن دورها المرجعي."
  },
  "videoHelp29": {
    "en": "Restore the recorded prompt, references and settings into Production. The original take stays unchanged. Reuse does not start a render or guarantee an identical result.",
    "ar": "استعد الوصف والمراجع والإعدادات المسجلة إلى Production. تبقى اللقطة الأصلية كما هي. لا تبدأ Reuse رندرًا ولا تضمن نتيجة مطابقة."
  },
  "imageHelp1": {
    "en": "Create images from a prompt, with optional visual references.",
    "ar": "أنشئ صورًا من وصف، مع مراجع بصرية اختيارية."
  },
  "imageHelp2": {
    "en": "Add up to 10 images. By default Image 1 sets the output canvas; change Output settings anytime to choose a different size. Other images add visual context. Arrange them below, then name each image in the prompt to say what to keep or combine.",
    "ar": "أضف حتى 10 صور. افتراضيًا تحدد Image 1 مساحة الإخراج؛ غيّر Output settings في أي وقت لاختيار مقاس مختلف. تضيف الصور الأخرى سياقًا بصريًا. رتّبها أدناه ثم اذكر اسم كل صورة في الوصف لتحديد ما تريد الاحتفاظ به أو دمجه."
  },
  "imageHelp3": {
    "en": "PNG, JPG or WebP · 25 MB each · 10 maximum",
    "ar": "PNG أو JPG أو WebP · 25 ميجابايت لكل صورة · 10 صور كحد أقصى"
  },
  "imageHelp4": {
    "en": "The first reference matches the output canvas. This detail setting applies to additional references.",
    "ar": "تطابق الصورة المرجعية الأولى مساحة الإخراج. إعداد التفاصيل هذا ينطبق على المراجع الإضافية."
  },
  "imageHelp5": {
    "en": "Qwen Image 2.1 supports native 2K output. Larger canvases take longer and use more memory.",
    "ar": "يدعم Qwen Image 2.1 إخراج 2K أصليًا. المساحات الأكبر تستغرق وقتًا وتستهلك ذاكرة أكثر."
  },
  "imageHelp6": {
    "en": "Change aspect ratio or output size anytime to use your selected canvas. Fitting a different ratio center-crops the first image; uncheck to preserve its proportions and size.",
    "ar": "غيّر نسبة الأبعاد أو مقاس الإخراج في أي وقت لاستخدام المساحة المختارة. تغيير النسبة يقص الصورة الأولى من المنتصف؛ ألغِ التحديد للحفاظ على نسبتها ومقاسها."
  },
  "imageHelp7": {
    "en": "Jobs continue after refresh. Finished images stay until deleted.",
    "ar": "تستمر المهام بعد تحديث الصفحة. تبقى الصور المكتملة حتى حذفها."
  },
  "configHelp1": {"en":"This is a prompt preset, not another generation mode. It enables Anime → Realism and writes LumiReal/source instructions while retaining your selected model, method, keyframes and other adapters. You can select the same LoRA manually. Realism → Anime is a prompt-only direction.","ar":"ده إعداد جاهز للبرومبت مش وضع توليد منفصل. بيفعّل لورا Anime → Realism وبيكتب LumiReal وتعليمات المصدر، مع الحفاظ على الموديل وطريقة الرندر والكي فريمز وباقي اللورات المختارة. تقدر تختار نفس اللورا يدويًا. Realism → Anime توجيه بالبرومبت فقط."},
  "configHelp2": {"en":"Upload a source video and replacement image, then identify the person. This shortcut enables Character Swap and writes a replacement prompt. Your selected model, method and other adapters remain selected. Experimental combinations are available to test.","ar":"ارفع فيديو المصدر وصورة البديل وحدد الشخص. الاختصار بيفعّل Character Swap وبيكتب برومبت الاستبدال. الموديل وطريقة الرندر وباقي اللورات المختارة بتفضل زي ما هي. التركيبات التجريبية متاحة للتجربة."},
  "connectedHelp1": {
    "en": "White = regenerate, black = source guidance. The mask must match the canvas. A static mask suits a fixed region; moving people need a tracked mask workflow.",
    "ar": "الأبيض لإعادة التوليد والأسود لتوجيه المصدر. يجب أن يطابق القناع مساحة الإخراج. القناع الثابت مناسب لمنطقة ثابتة؛ الأشخاص المتحركون يحتاجون قناعًا متتبّعًا."
  },
  "imagePrompt": {
    "en": "Describe the result. For multiple images, name each one and specify what comes from it, for example: “Put the person from @person in the room from @room.”",
    "ar": "صف النتيجة. عند استخدام عدة صور، اذكر اسم كل صورة وحدد ما تأخذه منها؛ مثلًا: ضع الشخص من @person في الغرفة من @room."
  }
});
  Object.assign(messages,{
  "promptRefs": {
    "en": "Type @ and select a named asset. Its thumbnail and H3 reference number appear below the prompt.",
    "ar": "اكتب @ واختر ملفًا مسمى. تظهر صورته المصغرة ورقمه المرجعي في H3 أسفل الوصف."
  },
  "promptFrames": {
    "en": "Use @start and @end to refer to uploaded frames. Their thumbnails and H3 picture numbers appear below.",
    "ar": "استخدم @start و@end للإشارة إلى الصور المرفوعة. تظهر صورها المصغرة وأرقامها في H3 أدناه."
  },
  "promptText": {
    "en": "Sent directly to H3. Describe both the motion and the sound.",
    "ar": "يُرسل مباشرة إلى H3. صف الحركة والصوت معًا."
  },
  "stepsStandard": {
    "en": "20 is the standard H3 setting. More steps take longer and may not improve quality. Custom range: 8–100.",
    "ar": "20 هو إعداد H3 القياسي. الخطوات الأكثر تستغرق وقتًا أطول وقد لا تحسن الجودة. النطاق المخصص: 8–100."
  },
  "stepsTurboRef": {"en":"References Turbo requires exactly 8 Euler/simple steps. Match reference sizing is recommended.","ar":"References Turbo يحتاج 8 خطوات Euler/simple بالضبط. يُنصح باختيار Match لحجم المراجع."},
  "stepsTurbo": {
    "en": "Turbo uses 4–8 steps. More steps do not make it equivalent to Original quality.",
    "ar": "يستخدم Turbo عدد 4–8 خطوات. الخطوات الأكثر لا تجعله مساويًا لجودة Original."
  },
  "methodsReady": {
    "en": "Ready on this server: {methods}.",
    "ar": "المتاح على هذا السيرفر: {methods}."
  },
  "methodsOriginal": {
    "en": "Original quality is ready. Optional methods are not installed yet.",
    "ar": "جودة Original جاهزة. لم تُثبّت طرق الرندر الاختيارية بعد."
  },
  "methodsOffline": {
    "en": "Connect ComfyUI to check installed speed methods.",
    "ar": "اتصل بـComfyUI للتحقق من طرق التسريع المثبتة."
  },
  "refineReady": {
    "en": "Verified on this server. Adds a 10-step second pass.",
    "ar": "تم التحقق منه على هذا السيرفر. يضيف جولة ثانية من 10 خطوات."
  },
  "refineUnavailable": {
    "en": "Refine is unavailable. {reasons}",
    "ar": "Refine غير متاح. {reasons}"
  },
  "methodsReadyTurbo": {
    "en": "Ready on this server: {methods}. Turbo is FL2VA-only; use Text or Frames.",
    "ar": "المتاح على هذا السيرفر: {methods}. Turbo مخصص لـFL2VA؛ استخدم Text أو Frames."
  },
  "methodsOriginalTurbo": {
    "en": "Original quality is ready. Optional methods are not installed yet. Turbo is FL2VA-only; use Text or Frames.",
    "ar": "جودة Original جاهزة. لم تُثبّت طرق الرندر الاختيارية بعد. Turbo مخصص لـFL2VA؛ استخدم Text أو Frames."
  },
  "methodsOfflineTurbo": {
    "en": "Connect ComfyUI to check installed speed methods. Turbo is FL2VA-only; use Text or Frames.",
    "ar": "اتصل بـComfyUI للتحقق من طرق التسريع المثبتة. Turbo مخصص لـFL2VA؛ استخدم Text أو Frames."
  }
});
  Object.assign(messages,{
  "projectLibrarySummary": {
    "en": "Organize ideas, assets and finished takes.",
    "ar": "نظّم الأفكار والمواد واللقطات المكتملة."
  },
  "projectLibraryEmpty": {
    "en": "Name a project above to keep its references, shot settings and takes together.",
    "ar": "سمّ مشروعًا أعلاه لحفظ مراجعه وإعدادات لقطاته ونتائجه معًا."
  },
  "projectLibraryNoMatch": {
    "en": "Try another project name or folder.",
    "ar": "جرّب اسم مشروع أو مجلدًا آخر."
  }
});
  let language='en';
  try{if(root.localStorage.getItem(storageKey)==='ar')language='ar';}catch(_){/* Storage can be unavailable in private or embedded contexts. */}
  function setText(element,key,params={}){
    if(!element||!messages[key])return;
    element.dataset.guidanceKey=key;element.dataset.guidanceParams=JSON.stringify(params);
    element.textContent=messages[key][language].replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??''));
    element.lang=language;element.dir=language==='ar'?'rtl':'ltr';
  }
  function apply(scope=root.document){
    if(!scope)return;
    if(scope.dataset?.guidanceKey)setText(scope,scope.dataset.guidanceKey,JSON.parse(scope.dataset.guidanceParams||'{}'));
    for(const element of scope.querySelectorAll('[data-guidance-key]'))setText(element,element.dataset.guidanceKey,JSON.parse(element.dataset.guidanceParams||'{}'));
  }
  function setLanguage(value){
    language=value==='ar'?'ar':'en';
    try{root.localStorage.setItem(storageKey,language);}catch(_){}
    apply();
    const select=root.document?.getElementById('guidanceLanguage');if(select)select.value=language;
    if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new root.CustomEvent('h3guidancechange',{detail:{language}}));
  }
  root.H3Guidance={setText,apply,setLanguage,getLanguage:()=>language};
  apply();
  if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>apply(),{once:true});
  const select=root.document?.getElementById('guidanceLanguage');
  if(select){select.value=language;select.addEventListener('change',()=>setLanguage(select.value));}
})(globalThis);
