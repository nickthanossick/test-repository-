# Legal aur attribution

## Ye GTA nahi hai

*Shimla Rising* ek **GTA-type** game hai — matlab open-world, third-person,
mission-driven crime drama. Rockstar Games ka koi asset, code, model, texture,
audio, kirdaar, jagah ya IP isme **nahi** hai.

Kahani, kirdaar, dialogue, missions aur naksha sab original hain. "GTA-type" ek
genre ka naam hai, jaise "Doom-clone" ya "Souls-like".

Agar kabhi ye publish karo, to naam mein "GTA" mat use karna, aur Rockstar ki
branding, font, ya UI ki nakal mat karna.

---

## Third-party data

### OpenStreetMap — **ODbL 1.0**

`tools/shimla_pipeline/` OSM se sadkein, imaaratein aur POIs laata hai
(`data/roads.json`, `data/footprints.json`).

ODbL mein **attribution zaroori hai.** Agar tum OSM-derived data ke saath build
distribute karte ho, to game mein (credits screen, ya loading screen) ye dikhna
chahiye:

> Map data © OpenStreetMap contributors, available under the Open Database
> Licence. https://www.openstreetmap.org/copyright

Aur agar tum OSM data ko modify karke *database* distribute karte ho, to ODbL ki
share-alike shart lag sakti hai. Sirf game ke andar render karna aam taur pe
"produced work" maana jaata hai, par agar commercial release kar rahe ho to ek
baar padh lena: https://osmfoundation.org/wiki/Licence

### Copernicus GLO-30 DEM — ESA Copernicus licence

`tools/shimla_pipeline/fetch_dem.py` OpenTopography ke through Copernicus DEM
laata hai (`data/heightmap.png`).

Free hai, commercial use bhi allowed hai, par attribution chahiye:

> © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided
> under COPERNICUS by the European Union and ESA; all rights reserved.

Aur OpenTopography ko bhi credit dena achha hai:

> Data accessed via OpenTopography (https://opentopography.org), supported by
> the National Science Foundation.

### three.js — MIT

`web/vendor/three.module.min.js` aur `three.core.min.js`.
© three.js authors. License: `web/vendor/THREE-LICENSE.txt`.

### Godot Engine — MIT

Godot khud repo mein nahi hai (alag se download hota hai), par agar tum Godot se
export karke build distribute karte ho, to Godot ke license aur uske third-party
components ka attribution shamil karna chahiye. Godot editor mein
**Project → Tools → Export → Licenses** se ye text mil jaata hai.

---

## Is repo ka apna license

**Code (web/, godot/, tools/) — MIT.** Details: [LICENSE](../LICENSE)

**Narrative content — all rights reserved.** design/ ke docs, aur
`data/missions.json`, `data/dialogue.json`, `data/characters.json` mein jo
kahani, kirdaar aur dialogue hain, wo © 2026 author hain. MIT unpe lagoo nahi hota.

Wajah: code ko log reuse karein, achhi baat hai. Par kahani ek creative work hai
aur uska control author ke paas rehna chahiye.

---

## Asli jagah aur asli log

Naksha asli Shimla ka hai — Christ Church, Gaiety Theatre, Viceregal Lodge,
Jakhoo Mandir, HPU, Vidhan Sabha, ISBT Tutikandi. Ye sarvajanik jagah hain aur
inhe naam se dikhana theek hai.

**Par sab kirdaar kalpanik hain.** Devinder Sahab, Bali, DSP Karan, Nafisa,
Vicky — koi bhi asli vyakti nahi hai, aur na hi kisi asli vyakti par based hai.
Timber-mafia aur illegal-construction ki kahani Himachal ki asli samasyaon se
prerit hai, par isme dikhaye gaye ghatnayein, sansthaayein aur log poori tarah
kalpanik hain.

Kisi asli sarkari adhikari, police officer, hotel-maalik ya patrakar ko
antagonist ke roop mein mat dikhana. Kisi asli hotel ya company ka naam mat
use karna.
