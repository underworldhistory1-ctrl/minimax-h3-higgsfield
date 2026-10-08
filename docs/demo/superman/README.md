# Superman above Earth

A storyboard sets the camera journey. A separate character image sets the hero’s appearance. This creator-supplied example shows how to give each reference a clear job in H3 Higgsfield.

[![Watch the supplied Superman excerpt](video-poster.jpg)](superman-excerpt.mp4)

**[Watch the excerpt with audio](superman-excerpt.mp4)** · **[Copy the prompt](prompt.txt)** · **[Back to the studio](../../../README.md)**

The published video is a 4.21-second excerpt supplied by the creator, rather than the complete camera journey requested below. It has been remuxed without re-encoding the video or audio.

## The two references

| Storyboard direction | Character appearance |
| --- | --- |
| [![Six-panel storyboard used for the shot](storyboard-reference-preview.jpg)](storyboard-reference.png) | [![Character image used for the shot](character-reference-preview.jpg)](character-reference.png) |
| Name **1** → **Storyboard · shot guide** | Name **2** → **Character** |
| Shot progression, framing, camera travel and reveal order. | Face, hair, physique and suit identity. |

The colored image above was confirmed by the creator as the character reference used. It is an appearance image; a multi-view character sheet is not required.

## Try the same reference setup

1. Open **Create Video → References**.
2. Upload the [storyboard image](storyboard-reference.png). Set **Mention name** to `1` and **Use as** to **Storyboard · shot guide**.
3. Upload the [character image](character-reference.png). Set **Mention name** to `2` and **Use as** to **Character**.
4. Paste the prompt below. Keep `@1` and `@2` exactly as written so they match the uploaded names.
5. Choose your output settings. For prompt preparation, **Automatic** formats the brief and uses AI only when a provider is configured. **Use my prompt directly** applies the reference mapping and formatting without an AI rewrite.
6. Open **Compiled prompt preview & tags** to inspect the two bindings, then generate.

**The useful distinction:** `@1` controls how the scene unfolds; `@2` controls who appears in it. The prompt explicitly prevents the storyboard’s drawing style and the character image’s background from becoming the target scene.

## The creator’s prompt

Reddit-style mention links in the pasted copy were restored to native `@1` / `@2`. The creative wording is retained; a stray export marker was removed.

```text
@1 defines the storyboard direction only. Use @1 as the sole reference for shot progression, framing logic, camera travel, reveal order, and composition. Follow its visual progression closely: begin in deep space with drifting asteroids and a wide cosmic field, then reveal Earth, then discover the hero from far behind, then continue moving closer and smoothly arc around him until his face is revealed in close-up. Do not show the storyboard sheet, panel borders, numbers, arrows, or sketch style.

@2 defines Superman’s identity and appearance only. Replace the illustrated figure from @1 with Superman from @2. Preserve his recognizable face, hairstyle, physique, and suit identity from @2. Use @2 only for character identity and appearance, not for its original framing, lighting, or background.

Create a fully photorealistic live-action cinematic scene in outer space. The scene is one smooth continuous camera move with no visible cuts. The camera begins drifting through a vast starfield with scattered floating asteroids, moving forward calmly as if searching through space. Earth gradually enters the frame below, majestic and curved. As the camera keeps gliding forward, Superman is revealed in the distance from behind, floating motionless above Earth. He is small against the immense scale of space, suspended in silence, with his cape drifting gently in zero gravity.

The camera keeps advancing and slowly orbits around him in a graceful arc. First hold the distant rear view, then move into a closer rear angle, then a closer side angle, and finally arrive at an intimate frontal close-up. Throughout the move, Superman remains still and deeply focused, not performing action, only listening. His eyes stay closed, his face calm and absorbed, as if he is hearing countless overlapping sounds, frequencies, and distant voices carried through the universe. The emotional tone is contemplative, awe-filled, quiet, and slightly spiritual.

Keep the movement elegant, slow, and controlled. Preserve realistic zero-gravity cape motion and subtle natural stillness in his body. Lighting should feel believable and cinematic in space: soft solar light, gentle rim light shaping his silhouette, and faint reflected light from Earth below. Maintain realistic suit texture, anatomy, and facial detail.

No dialogue. No lip movement. No other characters.

Sound design: layered cosmic ambience, faint low-frequency rumbles, soft resonant hums, subtle solar-wind textures, distant abstract overlapping universe sounds, and delicate celestial vibrations, as if Superman is focusing on the blended soundscape of the cosmos itself. Keep the score extremely minimal or absent.
```

## Production workspace

[![Creator-supplied production workspace showing the references and generated hero](production-workspace-preview.jpg)](production-workspace.png)

This capture shows the interface used for the example, before the current V2 layout refresh.

## About this example

The reference files, prompt, workspace capture and video excerpt were supplied for publication by the project owner. Seed, generation canvas, selected LoRAs and render method were not provided, so this is a worked reference example rather than an exact reproducibility benchmark. Reference guidance influences a new generation; it does not guarantee an identical camera path or every storyboard panel.

Demo media are separate from the repository’s MIT code license. Character and other third-party rights remain with their respective holders.
