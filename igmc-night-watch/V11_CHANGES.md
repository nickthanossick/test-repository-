# IGMC: Night Watch — V11: a new opening, and the Consultant

Everything else in the game is unchanged from V10.1: floors, items, missions, saves, Naina, the TVs, the
rats, the dead, lights and exposure. The V11 code is one block right after V10's. Search the file for
`V11 —`.

## 1. The opening

- **The storyboard intro is gone.** That was the "Raat 2:00 baje… ek aurat ko IGMC laya gaya" captions,
  the sketch frames and their narration. Its 20 embedded images were removed (4.1 MB).
- **New Game / Play Again** goes straight into the game. Pandit is standing outside IGMC, in the rain,
  facing the hospital.
- **The supplied dialogue plays (`gemini_tts_output.wav`, 28.5 s).** It is in the file as a 64 kbps
  mp3 (about 230 KB) and plays through WebAudio, so it also works on phones after the same tap.
  There are no subtitles.
  - A small "SUNO…" indicator shows while it plays. The objective reads *Suno… · IGMC ke bahar ·
    baat poori hone do*. The build's English UI layer shows these as *Listen… · Outside IGMC ·
    let the call finish*.
  - You can walk and look around outside, but the entrance stays locked. The "E — IGMC KE ANDAR
    JAAO" prompt does not appear, even standing at the door, and the guide arrow does not point
    to it.
  - Pause stops the dialogue, and Resume carries on from the same word.
  - When it ends you see "AB IGMC KE ANDAR JA SAKTE HO", the usual objective comes back, and the
    door opens.
  - If the sound cannot play at all, the door opens anyway, so you are never stuck:
    - a decode error opens it at once;
    - audio that never starts opens it after about 34 s.
- The old "IGMC. Raat ke do bajkar chalis minute…" line no longer plays on a new run. **Retry** and
  **Continue** skip the dialogue and put you back as before.
- Inside, the scripted first meeting with Naina (`OpeningScare`) is unchanged.

## 2. The Consultant (`V11Doc`)

The man nobody was supposed to call that night. He is a stalker who only frightens you. He never
touches you, never chases you and never kills you. He is just *there*, and when you look properly,
he is not.

### Model and skin

- **Model:** `consultant.obj` as supplied (20k triangles). It is packed at build time into a
  compact quantized binary (16k vertices, 340 KB) holding positions, normals, UVs, plus a
  per-vertex "cavity" value computed from the mesh's own creases. It is scaled to 1.85 m.
- **Smooth normals:** the export's normals were split at almost every vertex, so the face looked
  faceted. They are rebuilt smooth: faces are averaged only where they lie within 60° of each
  other, so the real hard edges (lapels, cuffs, soles) stay sharp.
- **No textures came with the model.** The MTL names `texture_diffuse/normal/roughness/metallic.png`,
  but only the OBJ and MTL were uploaded. Everything is painted on the GPU by body region instead:
  - **Skin** (face, ears, neck, hands): the same scattering skin as the dead, with soft wrap
    diffuse that is wider in red, pores, and a dry lobe plus an oily specular lobe. His skin is an
    old brown face gone sallow and ashen under the tube lights, blotched. The nostrils, the
    corners of the mouth and the folds are darkened by the cavity of his own mesh.
  - **The face**, painted onto the head's rest pose so it turns with him:
    - wet eyes with yellowed whites, veins at the corners, a clouded dark iris and the upper
      lid's shadow;
    - sunken, bruised skin around the eyes;
    - sparse grey-black brows in a hard frown;
    - bloodless lips with a dark line between them;
    - grey stubble on the jaw.
  - **White coat:** cotton weave, a hem gone grey, old brown blood down the front and on the cuffs,
    and folds darkened by cavity.
  - Shirt, a dark red tie, dark trousers, slightly glossy shoes, and thin grey hair.
  - A very faint pale self-light and rim, like Naina's, so the coat reads as a shape in a dark
    corridor. No extra lamp is added.
- **Motion:** the OBJ has no skeleton, so it is all done in the vertex shader, and his shadow
  matches:
  - breathing;
  - a stiff walk (legs swinging, the hem following, bob and sway);
  - leaning in toward you;
  - a head that turns on the neck further than a neck should, and cocks;
  - small twitches.

### What he does (missions 2–6)

| Scene | |
|---|---|
| **End of the corridor** | Stands 8.5–14 m away, facing you. When the torch catches him, or you come within about 6 m, the lamps near you blink once and he is gone. |
| **Behind you** | Walks slowly behind you, out of view, with heavy footsteps. When you turn round he stops, his head cocks, and after 0.85 s he vanishes in a flicker. |
| **Doorway** | In a room's doorway ahead, watching you. If the door is shut, he stands in front of it, and when he goes you hear the latch click, as if he had gone through. He goes when you get close or hold the torch on him. |
| **Crossing** | Walks slowly across the corridor ahead, from one side to the other. |

- **First appearance** is 60–90 s into a mission; after that, every 95–150 s (80–130 s from
  mission 4).
- He only comes in a quiet stretch:
  - the horror director has been silent for over 6 s;
  - Naina has been gone for at least 4 s.
- **Naina always wins.** If she comes while he is there, he is simply gone; she often cuts his
  scene short, and that is intended. In an 8-minute test on mission 2 he appeared 4 times, and
  each time she came in a few seconds later and he went.
- **Never** during cutscenes, tapes, flashbacks, notes, vents, `OpeningScare`, `RitualTerror`, a
  door peek, a TV scare or any other scripted scare.

### He and Naina are never there at the same time

1. He only appears when nothing of Naina is showing anywhere. That covers the hunter, a glimpse,
   a door peek, a scare, a silhouette, her face on the TVs, the opening and the ritual.
2. Every way she can arrive through the ghost (`Ghost.set`, `Ghost.place`, `Ghost.appear`)
   removes him **on that same call**, before she is placed.
3. Some scares show her directly, without going through the ghost. For those, a check runs just
   before he is drawn (and before his shadow is drawn): if she is visible in that frame, his
   geometry collapses so nothing of him is drawn, and he is removed on the next update.
4. The TV scare and the single-frame face flashes are refused while he is on the floor.
5. When he is cleared for her, he goes silently, without the flicker, and the horror director's
   timing is left alone.

## Verification (headless Chromium, SwiftShader)

Verification ran in headless Chromium with SwiftShader. The hospital GLB and Naina's rigged
model are on fal.media, which this build machine could not reach, so a stand-in was used for the
building and the game's own fallback for Naina.

**Opening**
- New Game: no storyboard, Pandit is outside, and the objective reads "Listen…".
- At the door there is no prompt, and pressing E does nothing.
- Paused 3.45 s into the clip. After Resume, the door unlocked 25.6 s later (28.5 − 3.45 =
  25.0 s, plus test overhead), so playback resumes where it stopped.
- Pressing E then enters, and `OpeningScare` starts.
- Retry keeps the old behaviour.
- If the audio is broken, the door opens anyway.

**Consultant, in renders**
- Front, side and back views, with a region-debug overlay.
- Close-ups of the face, eyes, brows and lips.
- Head turn, walk pose, and far shots with the torch on and off.

**Consultant, scenes**
- Every scene starts and ends as designed:
  - end of the corridor: gone 0.35 s after the beam lands, two lamps blink;
  - behind you: caught, head cocks, gone after 0.8 s;
  - doorway: found in corridors, open and shut doors; gone after 1.2 s in the beam;
  - crossing: walks the 8 m across and leaves.
- Shut doors are handled as described above.

**Never with Naina**
- `Ghost.set` while he is there: he is gone in the same call.
- Her model made visible directly: the draw-time guard collapses him in that frame, and he is
  removed next update.
- A TV scare while he is there: refused.
- Over 24 simulated minutes, there were **0 frames** with both of them visible.

**Cost**
- His per-frame update: 0.002–0.004 ms.
- Draw cost while he is visible: one draw call, plus one shadow draw on desktop.
- Draw calls on the 4 test views: 180–264 (V10: 182–268).
- No shader compiles when he first appears; both programs are built behind the loading bar.

**Shaders:** 0 failed programs on desktop and in phone mode (`TOUCH`).

**Brightness** (8 test views, mean frame brightness 0–255):

| | desktop | phone mode |
|---|---|---|
| V10.1 | 106–159 | 107–160 |
| V11 | 101–159 | 112–163 |

V11 does not touch lights or exposure. Single views move by a few points with the random lamp
flicker and TV state.

**Size:** 19.6 MB → 16.2 MB. The 20 storyboard images were removed (−4.1 MB). Added: the dialogue
(+0.30 MB), the Consultant's mesh (+0.46 MB) and the code (+0.04 MB).

## Not done here / notes

- **Textures:** `consultant.mtl` names `texture_diffuse.png`, `texture_normal.png`,
  `texture_roughness.png` and `texture_metallic.png`, but those files were not uploaded. The
  model's UVs are kept in the build, so if you upload the PNGs they can replace the painted
  colours. The shading (skin scattering, cavity, face details) stays.
- **Naina's rig:** Naina's rigged model could not be loaded on this machine (fal.media is
  blocked). Without it, the game's auto-summon shows her model while her mode stays "off". The
  Consultant treats any visible Naina as present, so in that fallback he simply appears less.
  With the rig loaded, as in normal play, her mode tracks her presence exactly.
