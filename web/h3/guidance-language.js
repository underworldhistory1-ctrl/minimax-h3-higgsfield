/* Language choice covers contextual workflow explanations; control labels stay English. */
(function(root){
  'use strict';
  const storageKey='h3studio.guidance.language';
  const messages={
  "frames": {
    "en": "These are the opening and closing images of the video. Upload either or both; H3 generates the motion between them. Use References for images defining a character or location."
  },
  "references": {
    "en": "Appearance and identity references: choose each image’s role and mention its name with @. A multi-panel storyboard uses the Storyboard role to guide shot order, without exact timing. Upload structural motion guidance in Motion & region control."
  },
  "keyframes": {
    "en": "For a specific image at a specific time, add each storyboard panel as a separate image and choose its time. These are timed images, not a complete storyboard sheet. Availability and input support are checked on the server."
  },
  "loras": {
    "en": "LoRAs add a style or behavior to the model. Enable only what you need and read each adapter’s requirements. Being installed does not mean every model or acceleration combination has been tested."
  },
  "model": {
    "en": "Start with Original. Choose a model and Text, Frames or References inputs. Installed capabilities gate available choices. Managed Pika/Turbo transitions also apply their required model and sampling settings."
  },
  "sampling": {
    "en": "These are the actual render settings, saved with the project. Start with the original settings; acceleration can change the result. Restore baseline settings resets the sampling settings."
  },
  "style": {
    "en": "This is a prompt preset, not another generation mode. It enables Anime → Realism and writes LumiReal/source instructions while retaining your selected model, method, keyframes and other adapters. You can select the same LoRA manually. Realism → Anime is a prompt-only direction."
  },
  "swap": {
    "en": "Upload a source video and replacement image, then identify the person. This shortcut enables Character Swap and writes a replacement prompt. Your selected model, method and other adapters remain selected. Experimental combinations are available to test."
  },
  "writer": {
    "en": "Automatic formats your words and understands references with AI when a provider is connected. Use my prompt directly sends your description directly."
  },
  "writerUnavailable": {
    "en": "Understanding references with AI requires a connected prompt provider; generation itself still works. Automatic can format locally, or choose Use my prompt directly."
  },
  "controlStill": {
    "en": "One image holds pose, depth, outlines or lighting throughout the clip; it does not supply motion. Choose one storyboard panel. Put a multi-panel sheet in References with the Storyboard role; use Temporal keyframes for timed images."
  },
  "controlMasked": {
    "en": "To edit part of a video, upload the video and a static mask with matching composition. White marks the area to regenerate; black retains source guidance. A static mask does not track a moving person."
  },
  "controlVideo": {
    "en": "This video guides motion or structure; images in References define characters and locations. Example: a character image + a walking video + Follow body motion. Add the same video to References only if you also want it as a reference."
  },
  "controlPrepared": {
    "en": "This input is for a prepared control map such as Pose, Depth, Canny or Scribble. Choose the map’s actual type. Do not use an ordinary video or a multi-panel storyboard sheet as a prepared map."
  },
  "sceneDestination": {
    "en": "Start here. Save or Generate creates a folder automatically. Choosing a project saves this setup there as a new scene."
  },
  "videoHelp1": {
    "en": "Open a project to work with its assets, prompts and takes."
  },
  "videoHelp2": {
    "en": "Video with native audio · 24 fps"
  },
  "videoHelp3": {
    "en": "Reusable assets for this project. Use a file or mention it with @ to attach it to the current shot."
  },
  "videoHelp4": {
    "en": "Storyboards guide composition and shot plans; panels do not automatically become timed shots. The catalog can hold more files than H3 accepts in one shot."
  },
  "videoHelp5": {
    "en": "Choose the video to extend here. Uploading a video in References supplies guidance; it does not select a continuation source."
  },
  "videoHelp6": {
    "en": "To extend an existing project result, use Extend clip on that result below. Storyboard = shot plan in References; keyframe = one image at a chosen time."
  },
  "videoHelp7": {
    "en": "Set the exact first frame, last frame, or both. The first image should match the canvas aspect ratio."
  },
  "videoHelp8": {
    "en": "Original files stay in the project; fitting creates a separate render input."
  },
  "videoHelp9": {
    "en": "Name each asset, then type @name in the prompt. Each asset is bound to its H3 reference input."
  },
  "videoHelp10": {
    "en": "Video references guide a new generation. “Whole scene” asks H3 to follow the full clip while changing the detail in your prompt, but cannot preserve every other frame or pixel. For a multi-panel shot sheet, select Storyboard and mention it in the prompt. Up to 9 images, 3 videos, 3 audio references and 12 files total. Video soundtracks stay paired with their videos and do not consume standalone audio slots. Each video/audio: 2–15 s; each type totals 15 s. Trim longer clips below; oversized video can fit within 1920×1080. Frame rates convert to 24 fps after upload."
  },
  "videoHelp11": {
    "en": "Upload fitting caps the long edge at 2048 px. Native Max caps the short edge at 2048 px, never upscales, and avoids the extra downscale used by Match. It can consume more memory; it cannot recover lost source detail."
  },
  "videoHelp12": {
    "en": "Describe what should happen and what should be heard. Use reference names to clarify what each asset controls."
  },
  "videoHelp13": {
    "en": "Image guides at chosen times. Available when the server has native H3 AddGuide."
  },
  "videoHelp14": {
    "en": "Installed adapters appear here. Enable only the ones you want on this render."
  },
  "videoHelp15": {
    "en": "Connect ComfyUI to load installed LoRAs."
  },
  "videoHelp16": {
    "en": "Realism People supports all three modes; start prompts with r34l1sm. Combat V2 can also be selected in References, but its creator tested FL2VA only, so Ref2VA results are experimental. Both are optional and off by default. Character Swap requires References with a source video and replacement image; select one version. Turbo is optional in Render method; choose the version matching Text/Frames or References."
  },
  "videoHelp17": {
    "en": "Choose the canvas used to generate a new shot. Native detail is the recommended upper baseline."
  },
  "videoHelp18": {
    "en": "Canvas dimensions are rounded for H3, so the ratio is approximate."
  },
  "videoHelp19": {
    "en": "Another sampling pass can change details and motion. To keep an approved shot, upscale the existing video instead."
  },
  "videoHelp20": {
    "en": "42 is the reproducible default, not a quality ranking. Use a whole number; blank or -1 chooses Random when generating."
  },
  "videoHelp21": {
    "en": "Leave empty when this page is served by ComfyUI."
  },
  "videoHelp22": {
    "en": "Videos stay on this server until deleted. Pin favorites, download a copy, or delete."
  },
  "videoHelp23": {
    "en": "Enlarges existing frames with Lanczos and copies the audio. Preserves the shot; does not generate new detail. Aspect ratio is kept, with dimensions rounded to even pixels."
  },
  "videoHelp24": {
    "en": "Ordered accepted takes. Review joins on the GPU test server before approving quality."
  },
  "videoHelp25": {
    "en": "Progress and completed downloads are available on every connected device, including after refresh."
  },
  "videoHelp26": {
    "en": "Enlarge this existing video without regenerating it. Keeps the shot and copies its audio; does not generate new detail."
  },
  "videoHelp27": {
    "en": "Grouping changes the project location in this library. Media, stable identities and saved shots stay intact."
  },
  "videoHelp28": {
    "en": "Folders organize media independently of its reference role."
  },
  "videoHelp29": {
    "en": "Restore the recorded prompt, references and settings into Production. The original take stays unchanged. Reuse does not start a render or guarantee an identical result."
  },
  "imageHelp1": {
    "en": "Create images from a prompt, with optional visual references."
  },
  "imageHelp2": {
    "en": "Add up to 10 images. By default Image 1 sets the output canvas; change Output settings anytime to choose a different size. Other images add visual context. Arrange them below, then name each image in the prompt to say what to keep or combine."
  },
  "imageHelp3": {
    "en": "PNG, JPG or WebP · 25 MB each · 10 maximum"
  },
  "imageHelp4": {
    "en": "The first reference matches the output canvas. This detail setting applies to additional references."
  },
  "imageHelp5": {
    "en": "Qwen Image 2.1 supports native 2K output. Larger canvases take longer and use more memory."
  },
  "imageHelp6": {
    "en": "Change aspect ratio or output size anytime to use your selected canvas. Fitting a different ratio center-crops the first image; uncheck to preserve its proportions and size."
  },
  "imageHelp7": {
    "en": "Jobs continue after refresh. Finished images stay until deleted."
  },
  "configHelp1": {
    "en": "This is a prompt preset, not another generation mode. It enables Anime → Realism and writes LumiReal/source instructions while retaining your selected model, method, keyframes and other adapters. You can select the same LoRA manually. Realism → Anime is a prompt-only direction."
  },
  "configHelp2": {
    "en": "Upload a source video and replacement image, then identify the person. This shortcut enables Character Swap and writes a replacement prompt. Your selected model, method and other adapters remain selected. Experimental combinations are available to test."
  },
  "connectedHelp1": {
    "en": "White = regenerate, black = source guidance. The mask must match the canvas. A static mask suits a fixed region; moving people need a tracked mask workflow."
  },
  "imagePrompt": {
    "en": "Describe the result. For multiple images, name each one and specify what comes from it, for example: “Put the person from @person in the room from @room.”"
  },
  "promptRefs": {
    "en": "Type @ and select a named asset. Its thumbnail and H3 reference number appear below the prompt."
  },
  "promptFrames": {
    "en": "Use @start and @end to refer to uploaded frames. Their thumbnails and H3 picture numbers appear below."
  },
  "promptText": {
    "en": "Sent directly to H3. Describe both the motion and the sound."
  },
  "stepsStandard": {
    "en": "20 is the standard H3 setting. More steps take longer and may not improve quality. Custom range: 8–100."
  },
  "stepsTurboRef": {
    "en": "References Turbo requires exactly 8 Euler/simple steps. Match reference sizing is recommended."
  },
  "stepsTurbo": {
    "en": "Turbo uses 4–8 steps. More steps do not make it equivalent to Original quality."
  },
  "methodsReady": {
    "en": "Ready on this server: {methods}."
  },
  "methodsOriginal": {
    "en": "Original quality is ready. Optional methods are not installed yet."
  },
  "methodsOffline": {
    "en": "Connect ComfyUI to check installed speed methods."
  },
  "refineReady": {
    "en": "Verified on this server. Adds a 10-step second pass."
  },
  "refineUnavailable": {
    "en": "Refine is unavailable. {reasons}"
  },
  "methodsReadyTurbo": {
    "en": "Ready on this server: {methods}. Turbo requires the matching Text/Frames or References method."
  },
  "methodsOriginalTurbo": {
    "en": "Original quality is ready. Optional methods are not installed yet. Turbo requires the matching Text/Frames or References method."
  },
  "methodsOfflineTurbo": {
    "en": "Connect ComfyUI to check installed speed methods. Turbo requires the matching Text/Frames or References method."
  },
  "projectLibrarySummary": {
    "en": "Organize ideas, assets and finished takes."
  },
  "projectLibraryEmpty": {
    "en": "Name a project above to keep its references, shot settings and takes together."
  },
  "projectLibraryNoMatch": {
    "en": "Try another project name or folder."
  }
};
  let language='en';
  function setText(element,key,params={}){
    if(!element||!messages[key])return;
    element.dataset.guidanceKey=key;element.dataset.guidanceParams=JSON.stringify(params);
    element.textContent=messages[key][language].replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??''));
    element.lang=language;element.dir='ltr';
  }
  function apply(scope=root.document){
    if(!scope)return;
    if(scope.dataset?.guidanceKey)setText(scope,scope.dataset.guidanceKey,JSON.parse(scope.dataset.guidanceParams||'{}'));
    for(const element of scope.querySelectorAll('[data-guidance-key]'))setText(element,element.dataset.guidanceKey,JSON.parse(element.dataset.guidanceParams||'{}'));
  }
  function setLanguage(value){
    language='en';
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
