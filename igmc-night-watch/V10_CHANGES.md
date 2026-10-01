# IGMC: Night Watch — V10 horror pass

`IGMC_Night_Watch.html` is still one self-contained file. Open it in a browser. The first
launch still needs internet once, as V6 did, because the hospital exterior GLB is cached into
IndexedDB on that first run. All V10 code sits in one block: search for `V10 —` inside the
file. It hooks into the game through the same wrapper pattern V6–V9 already use, so floor
layouts, items, missions and saves roll exactly as before.

## 1. Haunted wall TVs on every floor (`V10TV`, `V10Feed`, `V10Audio`)

- **Model:** an old CRT set built in the game's own PBR prop kit. It has a front shell, a
  tapering tube housing, vent slots, a speaker grille, a badge, buttons and a red standby LED.
  It sits on a steel shelf with a wall plate, a swivel post and arms. A mains lead and an
  aerial cable sag off the back and run down the wall to a socket and up to the ceiling. The
  set swivels on its bracket towards the longer run of corridor so you see it as you walk.
  The screen is curved glass that reflects the torch.
- **Placement:** up to 3 sets per floor (33 in all). The first slot is the wall facing the
  stairwell door, so it is the first thing you see on a new floor. The rest go on the corridor
  ring or cross corridor. Sets never sit on doors, openings, notice boards, the blood writing,
  extinguishers or the stair run.
- **Idle:** about half the sets are on, showing one of the three supplied loops: grey snow,
  the green monitor interference or the blue NO SIGNAL card. The loops are packed into one
  1536×1728 JPEG atlas (18 frames each, 336 KB). Each set that is on buzzes with the supplied
  loop (re-encoded to a 32 KB mp3, looped gap-free through WebAudio). The sound is panned to
  the set and fades with distance. A pooled light throws the screen's colour onto the walls.
  When the power is cut, the sets go dark.
- **The scare:** without warning, every set on the floor turns on together:
  1. CRT turn-on: a bright line opens wide, then tall. You hear the degauss thump, the 50 Hz
     hum and the 15.6 kHz flyback whine, and the lamps near you die.
  2. Snow, then a **night-vision CCTV feed** (`CAM 07 · W-3`, timestamp, blinking REC). Naina
     stands at the end of a corridor, then charges the camera.
  3. She screams. The scream plays clean in the room, and also through every small speaker,
     distorted. The phone vibrates.
  4. Hard cut to her face filling every screen, with tearing, a red flash, a camera shake and
     a spike in your pulse.
  5. Signal lost, the CRT collapses to a dot, the lamps come back one by one. Sometimes she
     laughs a few seconds later.

  The feed is a real 3D render at 256×192 and 20 fps, drawn only while a TV shows it. It uses
  a skeleton clone of her real rigged model with its own mixer, playing the `charge`,
  `killgrab` and `alert` clips. If the fal rig has not loaded, it falls back to the inlined
  mesh.
- **When it fires:** never during cutscenes, tapes, notes, vents, the opening, the ritual or
  a live Naina hunt on your floor, and never within 9 s of another director scare. The first
  one comes 38–62 s into a mission, then every 95–160 s (70–120 s from mission 4). Each time
  it needs a set in front of you with a clear line of sight, or one up to 7.5 m behind you, so
  you hear it before you turn round. Rarely, an idle set flashes a single 0.11 s frame of her
  face (a subliminal frame).

## 2. Rats you can see (`V10Rat`, replaces `V8Rat`)

- The old rat was about 10 cm, dark brown on a dark floor, and left at 3.4–4.6 m/s. The new
  one is a bandicoot-sized brown rat, about 1.5–1.75× a lab rat. It has agouti fur noise, a
  fur sheen that catches the torch at the edges, pink ears, paws and nose, a ringed tail, and
  eyes that send the torch beam back red.
- It is animated on the GPU in a single draw: the spine ripples, the four legs trot in
  diagonal pairs, the head turns and sniffs, it rears up, and the tail swings.
- **Behaviour:** caught in the beam (or if you come close or run), it freezes for 0.3–0.5 s,
  rears a little, looks at you and squeals. Then it runs along the wall at 2.2–2.9 m/s,
  sometimes stops halfway to sniff, and leaves through a doorway rather than vanishing on the
  sill. You hear its patter. Sometimes one shoots across the corridor in front of you inside
  the beam. On most floors one is feeding at one of the dead.

## 3. The dead have skin (`V10Skin`, replaces `V9Dead.mat`)

- Skin is found in the supplied texture by its hue. The gowns are blue, white or green, so
  only skin texels are changed.
- **Wrap diffuse:** the scattering is wider in red than in blue, so the shadow line is soft
  and warm. This is patched into three's `RE_Direct_Physical` for these materials only.
- **Pores and fine creases** in the normal. They fade out at distances where they would
  shimmer.
- **Two specular lobes:** the dull one of dry skin plus a tight, oily one.
- **Death:** pallor and a waxy yellow tone, a greenish belly, livor mortis where the blood has
  settled on surfaces facing down, cyanosed hands, feet and lips, faint marbled veins, and
  small marks. The blood and gore stay as they were.

## 4. Camera realism

- **Volumetric torch beam (desktop):** ray-marched at half resolution through drifting dust,
  using the torch's real cone, reflector cookie, fall-off **and shadow map**, so beds and
  doorframes cut dark wedges out of the beam.
- **Torch beam on phones:** an analytic cone solved on a mesh attached to the torch (one
  additive draw).
- **Contrast-adaptive sharpening** in the final pass (desktop).
- The exposure and the lamps are the game's own. Nothing in V10 dims the picture (see V10.1).

## 5. Fixes

- **Phones and Safari had black walls.** `riPatch` forced `highp` in the fragment stage only.
  On a mediump phone renderer the vertex stage declared the shadow uniforms at mediump.
  ANGLE-based browsers (Chrome/Android, Safari) refuse to link that ("precisions of uniform
  differ"), so every wall, floor, ceiling and prop went black. 98 programs failed in testing.
  The vertex stage now matches, and 0 programs fail.

## V10.1 — lights back to how they were

The first V10 build added "eye adaptation": automatic exposure that stopped the image down
in bright places. On the same 8 test views (floors 1, 3 and 7), average frame brightness
(0–255) came out like this:

| | desktop | phone mode |
|---|---|---|
| V6.15 (original) | 108–157 | black (the shader bug in section 5) |
| V10 (first push) | **45–68** | 112–150 |
| V10.1 | 106–159 | 107–160 |

On desktop the whole game ran at about a third of its brightness, and on phones it was about
10% dimmer. V10.1 removes eye adaptation completely. The idle TVs also no longer light the
wall, because on a phone (5 lamp slots) that light could take a ceiling tube's slot. The TV
light now switches on only during a scare.

## Performance

These figures come from the same 4 viewpoints on floor 3 (headless Chromium, SwiftShader).
GPU time cannot be measured meaningfully on that renderer, so these are workload counts and
CPU time.

| | draw calls / frame | JS per frame |
|---|---|---|
| V6.15 | 174–246 | 0.11–0.29 ms |
| V10 | 182–268 | 0.15–0.39 ms |

- V10's own per-frame work: TVs 0.02 ms, rats 0.07 ms, beam and eye ≈ 0 ms.
- Every new shader is compiled behind the loading bar together with the rest of the game:
  TV screens, rats, skin, the feed stage, the post passes and the phone beam.
- No new lights change the light count, so nothing recompiles during play.
- TV bodies do not cast shadows.
- If the frame rate drops, the volumetric beam is the first thing the existing V9 budget
  drops.

## Not done here

- The fal TV GLB in the effects pack is on `v3b.fal.media`, which this build machine could not
  reach. The set is therefore modelled procedurally in the game's own prop kit. Upload the
  `.glb` file itself if you want that exact model inlined.
- The fal-rigged Naina could not be fetched offline, so the CCTV feed was verified with the
  inlined fallback mesh. The rig path clones the same model the game already loads and plays
  clips that are already cached.
