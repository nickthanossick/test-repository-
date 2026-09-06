# Audio

## Abhi kya hai

**Procedural WebAudio.** Koi audio file repo mein nahi — isliye repo
self-contained rehta hai aur licensing saaf.

- **Engine** — do oscillator (sawtooth + square, −12 cent detune). RPM ke saath
 pitch badalta hai, aur 4 fake gears hain: `f = 52 + local*95 + gear*12`.
 Gear change sunai deta hai.
- **Siren** — sine carrier 700 Hz, 1.6 Hz LFO se ±190 Hz. Do-sur wali HP Police wali awaaz.
- **Blips** — mission start (880 Hz), poora (1180 Hz), pickup (1320 Hz),
 checkpoint (990 Hz), fail (220 Hz).

Browser autoplay policy ki wajah se audio pehle user gesture (gaadi mein baithna)
pe hi shuru hota hai.

`web/src/audio.js`

## Aage ka plan

### Music — Himachali

Shimla ka apna sangeet hai, aur usse generic "Bollywood chase" se badalna
zaroori hai:

- **Nati** — Himachal ka folk dance-form. Dhol, nagara, karnal, shehnai.
 Ek 6/8 nati groove Cart Road chase ke liye perfect hai.
- **Pahari folk** — dheemi, ek aadmi ki awaaz, kirtan-jaisi. Act 1 ke shaant
 moments ke liye.
- **Colonial echo** — Gaiety Theatre 1887 ka hai. Mall Road ke liye ek halka
 piano/string motif jo British-era ko chhoo kar nikal jaaye.

Radio stations gaadi mein: ek nati station, ek Hindi film station, ek "All India
Radio Shimla" style news station jo kahani ke saath badalti khabrein padhe.

### Ambience

| Jagah | Awaaz |
|---|---|
| Mall Road | bheed, kadam, door se ghanti |
| Lakkar Bazaar | dukandaron ki awaazein, lakdi katne ki |
| Jakhoo | bandar, hawa, mandir ki ghanti |
| Sanjauli | tang gali, TV, pressure cooker, bike |
| Catchment | ghana jungle, parinde, door se chainsaw |
| Railway Station | toy train ki whistle (narrow gauge — patli, oonchi) |
| Barf mein | sab kuch muffled, kadam ki chuk-chuk |

### Awaaz — Hinglish

`data/dialogue.json` mein 21 beats, 57 lines hain. Har line mein `speaker` id
hai, isliye voice files `audio/vo/<mission>_<beat>_<n>.ogg` naming se seedha
map ho jaayengi.

Hinglish mein perform karna zaroori hai — likhi hui line ka mizaaj tabhi aata
hai. Pahari lehja Chhotu aur Guru ke liye, saaf Hindi Devinder ke liye (wo padha-likha
lagna chahiye), aur Nafisa ka Urdu-inflected Hindi.
