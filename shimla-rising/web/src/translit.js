/**
 * Hinglish -> Devanagari.
 *
 * Nikhil: *"jo voices tune di h wo ajeeb lgri, koi aur way out nikal yr jisse
 * hindi ki voice mile"*.
 *
 * Awaaz ka asli masla voice nahi tha, **likhawat** thi. Hum `"Bedelo, dekh ke
 * chal"` jaisa roman text speech engine ko de rahe the. Engine ke liye wo
 * angrezi hai -- wo "chal" ko "chall", "hai" ko "hay" aur "gaadi" ko "gaddy"
 * padhta hai. Isi se sab robotic aur galat lagta tha.
 *
 * Wahi line Devanagari mein (`"बेदेलो, देख के चल"`) dete hi Hindi voice ka
 * uchcharan theek ho jaata hai -- kyunki ab wo apni hi lipi padh rahi hai.
 *
 * Do parat:
 *   1. **Shabdkosh** -- game ki apni bolchaal ke shabd, haath se likhe.
 *      Roman lipi mein `t/ट` aur `t/त`, `d/ड` aur `d/द`, `n/न` aur `ण` ka
 *      koi farak hi nahi hota, isliye niyam se ye kabhi theek nahi honge.
 *      "gaadi" niyam se "गादि" banta hai, chahiye "गाड़ी".
 *   2. **Niyam** -- jo shabd kosh mein nahi, unka akshar-dar-akshar anuvaad.
 *      Naye naam aur jagah bina kosh badle theek-thaak bol jaate hain.
 *
 * ## Jo ye NAHI karta
 *
 * **Pahadi lehja isse nahi aata.** Kisi bhi TTS engine mein Himachali accent
 * hota hi nahi -- Hindi mil jaati hai, lehja nahi. Uske sabse paas jo ho sakta
 * hai wo hai lehja *likhawat* mein (lines pehle se `bawa`, `bedafu`, `bendaga`
 * jaise shabdon mein hain) aur pitch/rate thoda neeche. Isse zyada ka jhootha
 * vaada nahi hai.
 */

/** Jo shabd niyam se theek nahi bante -- ya jinme retroflex/nukta hai. */
const DICT = {
  // ---- sarvanaam, kriya, aam bolchaal ----
  aa: "आ", aadhi: "आधी", aadmi: "आदमी", aage: "आगे", aaj: "आज", aaja: "आजा",
  aankhein: "आँखें", aata: "आता", aati: "आती", aaya: "आया", aayega: "आयेगा",
  ab: "अब", abhi: "अभी", agar: "अगर", aise: "ऐसे", akele: "अकेले",
  andar: "अंदर", arre: "अरे", aur: "और",
  baap: "बाप", baar: "बार", baat: "बात", bach: "बच", baithega: "बैठेगा",
  barf: "बर्फ़", bas: "बस", batana: "बताना", beta: "बेटा",
  bhaag: "भाग", bhaagna: "भागना", bhaagta: "भागता", bhai: "भाई", bhar: "भर",
  bharne: "भरने", bheed: "भीड़", bhi: "भी", bulaunga: "बुलाऊँगा",
  chahiye: "चाहिए", chal: "चल", chalana: "चलाना", chalani: "चलानी",
  chhod: "छोड़", chhotu: "छोटू",
  das: "दस", de: "दे", dega: "देगा", dekh: "देख", dekhenge: "देखेंगे",
  dekhna: "देखना", dekho: "देखो", dekhte: "देखते", dena: "देना", denge: "देंगे",
  dhoondta: "ढूँढता", dhyan: "ध्यान", di: "दी", dikha: "दिखा", din: "दिन",
  diya: "दिया", do: "दो", dobara: "दोबारा", dunga: "दूँगा",
  ek: "एक", farak: "फ़र्क",
  gaadi: "गाड़ी", gaya: "गया", gaye: "गए", ghanta: "घंटा", ghar: "घर",
  ghuma: "घुमा", gira: "गिरा",
  haath: "हाथ", hafte: "हफ़्ते", hai: "है", hain: "हैं", hamare: "हमारे",
  har: "हर", hi: "ही", hilaya: "हिलाया", ho: "हो", hoga: "होगा",
  honge: "होंगे", honi: "होनी", hoon: "हूँ", hoti: "होती", hua: "हुआ",
  is: "इस", isne: "इसने", itni: "इतनी", intezaar: "इंतज़ार",
  ja: "जा", jaana: "जाना", jaanta: "जानता", jaante: "जानते", jaayega: "जाएगा",
  jaayenge: "जाएंगे", janta: "जनता", jao: "जाओ", jeet: "जीत", jidhar: "जिधर",
  jisne: "जिसने", jo: "जो", julus: "जुलूस",
  ka: "का", kal: "कल", kar: "कर", kaun: "कौन", ke: "के", keh: "कह",
  khada: "खड़ा", khade: "खड़े", khinchti: "खींचती", ki: "की", kisi: "किसी",
  kitne: "कितने", ko: "को", koi: "कोई", kuch: "कुछ", kya: "क्या",
  ladka: "लड़का", ladke: "लड़के", ladta: "लड़ता", laga: "लगा", lagata: "लगता",
  lage: "लगे", lagi: "लगी", lagti: "लगती", le: "ले", lene: "लेने",
  lete: "लेते", liye: "लिए",
  maara: "मारा", main: "मैं", mat: "मत", marwayega: "मरवाएगा", mein: "में",
  mera: "मेरा", meri: "मेरी", mil: "मिल", mujhe: "मुझे",
  na: "ना", naam: "नाम", nahi: "नहीं", naya: "नया", neeche: "नीचे",
  nikaal: "निकाल", nikal: "निकल", nikalna: "निकलना",
  oye: "ओए",
  paanch: "पाँच", paani: "पानी", pad: "पड़", pada: "पड़ा", padega: "पड़ेगा",
  paise: "पैसे", pakde: "पकड़े", pakka: "पक्का", panga: "पंगा", par: "पर",
  parche: "पर्चे", pata: "पता", patak: "पटक", pe: "पे", peeche: "पीछे",
  pehli: "पहली", phaad: "फाड़", phir: "फिर", pichhli: "पिछली",
  poochhta: "पूछता", poora: "पूरा", purani: "पुरानी",
  raasta: "रास्ता", raat: "रात", raha: "रहा", rahe: "रहे", rahi: "रही",
  rakh: "रख", rakhta: "रखता", rakhunga: "रखूँगा", rehne: "रहने",
  rehte: "रहते", roz: "रोज़", rozana: "रोज़ाना", ruk: "रुक", rukta: "रुकता",
  saal: "साल", saamaan: "सामान", saamne: "सामने", saara: "सारा",
  saath: "साथ", sab: "सब", safed: "सफ़ेद", sambhal: "सँभाल", sau: "सौ",
  sawal: "सवाल", se: "से", seedha: "सीधा", shart: "शर्त", sheher: "शहर",
  sirf: "सिर्फ़",
  tak: "तक", taraf: "तरफ़", tasveer: "तस्वीर", tay: "तय", teesre: "तीसरे",
  tere: "तेरे", teri: "तेरी", tha: "था", the: "थे", thi: "थी",
  thoda: "थोड़ा", to: "तो", tod: "तोड़", tu: "तू", tujhse: "तुझसे",
  tum: "तुम",
  unhone: "उन्होंने", upar: "ऊपर", us: "उस", usi: "उसी", usko: "उसको",
  uspe: "उसपे", usse: "उससे", utha: "उठा",
  wahan: "वहाँ", wahi: "वही", wale: "वाले", wo: "वो",
  ya: "या", yaad: "याद", yahan: "यहाँ", yahin: "यहीं", ye: "ये",

  // ---- Himachali gaali aur takiya-kalaam ----
  bawa: "बावा", bedafu: "बेदफ़ू", bedelo: "बेदेलो", bendaga: "बेंदगा",
  betiyachu: "बेटियाचु", baudi: "बौड़ी", macho: "माचो", be: "बे",

  // ---- naam ----
  vicky: "विक्की", deepika: "दीपिका", sameer: "समीर", thakur: "ठाकुर",
  chotu: "छोटू", sir: "सर",

  // ---- Shimla ki jagahein ----
  shimla: "शिमला", sanjauli: "संजौली", jakhoo: "जाखू", navbahar: "नवबहार",
  dhalli: "ढल्ली", chowk: "चौक", mall: "मॉल", bazaar: "बाज़ार",
  lakkar: "लक्कड़", ridge: "रिज", igmc: "आई जी एम सी", isbt: "आई एस बी टी",
  vidhan: "विधान", sabha: "सभा", kufri: "कुफ़री", annandale: "एनांडेल",
  kasumpti: "कसुम्पटी", chhota: "छोटा", hpu: "एच पी यू",

  // ---- roz ki cheezein (idle lines yahin se bolti hain) ----
  chai: "चाय", topi: "टोपी", danda: "डंडा", beedi: "बीड़ी", pathar: "पत्थर",
  chudail: "चुड़ैल", bandar: "बंदर", kutta: "कुत्ता", thand: "ठंड",
  thanda: "ठंडा", garam: "गरम", dhoop: "धूप", barish: "बारिश",
  baadal: "बादल", pahad: "पहाड़", deodar: "देवदार", sadak: "सड़क",
  seedhi: "सीढ़ी", seedhiyan: "सीढ़ियाँ", dukan: "दुकान", dukaan: "दुकान",
  paisa: "पैसा", pet: "पेट", bhookh: "भूख", neend: "नींद", thak: "थक",
  thak_gaya: "थक गया", jeb: "जेब", khaali: "खाली", bhaari: "भारी",
  jhagda: "झगड़ा", chhat: "छत", peth: "पेठ", ghadi: "घड़ी", waqt: "वक़्त",
  subah: "सुबह", shaam: "शाम", raatein: "रातें", mandir: "मंदिर",
  ghanti: "घंटी", bhajan: "भजन", station: "स्टेशन", bus: "बस",
  taxi: "टैक्सी", scooter: "स्कूटर", truck: "ट्रक", horn: "हॉर्न",

  // ---- angrezi udhaar ke shabd ----
  police: "पुलिस", college: "कॉलेज", campus: "कैंपस", gate: "गेट",
  court: "कोर्ट", union: "यूनियन", vote: "वोट", licence: "लाइसेंस",
  license: "लाइसेंस", seat: "सीट", side: "साइड", ambulance: "एम्बुलेंस",
  attendance: "अटेंडेंस", photocopy: "फ़ोटोकॉपी", finally: "फ़ाइनली",
  naka: "नाका", library: "लाइब्रेरी", canteen: "कैंटीन", hostel: "हॉस्टल",
  mission: "मिशन", game: "गेम", ok: "ओके", road: "रोड", khatam: "ख़त्म",
  // ---- Vicky ke apne-aap bolne wale (idle) shabd ----
  aankhon: "आँखों", aayegi: "आएगी", achha: "अच्छा", andhera: "अँधेरा",
  ant: "अंत", baithna: "बैठना", band: "बंद", bewakoofi: "बेवकूफ़ी",
  bhaunk: "भौंक", chadhai: "चढ़ाई", chalti: "चलती", chhoti: "छोटी",
  chowki: "चौकी", class: "क्लास", doosre: "दूसरे", galti: "ग़लती",
  garage: "गैराज", gayi: "गई", haddi: "हड्डी", hatega: "हटेगा",
  hogi: "होगी", jaati: "जाती", jaayegi: "जाएगी", jalani: "जलानी",
  kahan: "कहाँ", khuli: "खुली", lambi: "लंबी", legi: "लेगी",
  mahina: "महीना", marker: "मार्कर", matlab: "मतलब", minute: "मिनट",
  mod: "मोड़", padegi: "पड़ेगी", padhai: "पढ़ाई", pahunchna: "पहुँचना",
  peeni: "पीनी", politics: "पॉलिटिक्स", rate: "रेट", saans: "साँस",
  sardi: "सर्दी", shuru: "शुरू", yahi: "यही", zyada: "ज़्यादा",
  amma: "अम्मा", bhaiya: "भैया", waale: "वाले", warna: "वरना",
  adhoora: "अधूरा", baahar: "बाहर", bura: "बुरा", jeb: "जेब",
  kutte: "कुत्ते", aadha: "आधा", hamesha: "हमेशा",

  // ---- Sanjauli ki apni bolchaal (Nikhil ki di hui) ----
  macho: "माचो", benduga: "बेंदुगा", bendaga: "बेंदगा", bendiyaba: "बेंदियाबा",
  bedufu: "बेदफ़ू", pataka: "पटाका", rkmv: "आर के एम वी", shilpa: "शिल्पा",
  kat: "कट", kata: "काटा", katni: "काटनी", ganda: "गंदा",
  vishwas: "विश्वास", wishwas: "विश्वास", yaar: "यार", wala: "वाला", wali: "वाली",

  // ---- baaki jo niyam se theek nahi bante ----
  aaye: "आए", andhere: "अँधेरे", badha: "बढ़ा", baith: "बैठ", baithe: "बैठे",
  battery: "बैटरी", board: "बोर्ड", bolun: "बोलूँ", chabhi: "चाबी",
  chehra: "चेहरा", chhed: "छेड़", kahin: "कहीं", khadi: "खड़ी",
  kirane: "किराने", kismat: "किस्मत", layak: "लायक", maangne: "माँगने",
  mann: "मन", notes: "नोट्स", padenge: "पड़ेंगे", phone: "फ़ोन",
  planning: "प्लानिंग", shayad: "शायद", sorry: "सॉरी", sunn: "सुन्न",
  sweater: "स्वेटर", wapas: "वापस", zaroori: "ज़रूरी", li: "ली",
  hisaab: "हिसाब", udhaar: "उधार", chakkar: "चक्कर", politics: "पॉलिटिक्स",

};

/** Vyanjan -- lambe pehle, taaki "chh" ko "ch"+"h" na padha jaaye. */
const CONS = [
  ["chh", "छ"], ["shh", "श"],
  ["kh", "ख"], ["gh", "घ"], ["ch", "च"], ["jh", "झ"], ["th", "थ"],
  ["dh", "ध"], ["ph", "फ"], ["bh", "भ"], ["sh", "श"], ["ny", "ञ"],
  ["k", "क"], ["g", "ग"], ["c", "क"], ["j", "ज"], ["t", "त"], ["d", "द"],
  ["n", "न"], ["p", "प"], ["b", "ब"], ["m", "म"], ["y", "य"], ["r", "र"],
  ["l", "ल"], ["v", "व"], ["w", "व"], ["s", "स"], ["h", "ह"],
  ["f", "फ़"], ["z", "ज़"], ["q", "क़"], ["x", "क्स"],
];

/** Swar -- [swatantra roop, matra]. */
const VOW = [
  ["aa", "आ", "ा"], ["ai", "ऐ", "ै"], ["au", "औ", "ौ"], ["ou", "औ", "ौ"],
  ["ee", "ई", "ी"], ["ii", "ई", "ी"], ["oo", "ऊ", "ू"], ["uu", "ऊ", "ू"],
  ["a", "अ", ""], ["e", "ए", "े"], ["i", "इ", "ि"], ["o", "ओ", "ो"],
  ["u", "उ", "ु"],
];

const DIGITS = { 0: "०", 1: "१", 2: "२", 3: "३", 4: "४", 5: "५",
                 6: "६", 7: "७", 8: "८", 9: "९" };

const match = (table, s, i) => {
  for (const row of table) if (s.startsWith(row[0], i)) return row;
  return null;
};

/** Jinke saath asli sanyukt akshar bante hain -- क्य, प्र, द्व, क्ल. */
const CLUSTER_2ND = new Set(["y", "r", "v", "w", "l"]);

/**
 * Ek shabd ka akshar-dar-akshar anuvaad.
 *
 * Sabse tedhi cheez yahan **halant** hai, aur wo isliye ki roman Hinglish
 * andar wala schwa likhti hi nahi. "sakte" asal mein *sa-ka-te* (सकते) hai,
 * par likha "sakte" jaata hai -- seedha halant lagane par "सक्ते" ban jaata
 * hai, jo galat hai. Isliye default **halant nahi** (khaali vyanjan apne aap
 * 'a' rakhta hai), aur halant sirf do haalat mein:
 *
 *   1. wahi vyanjan dobara -- `pakka` -> `पक्का`
 *   2. y/r/v/l jinke baad swar ho -- `kya` -> `क्या`
 *
 * Shabd ke ant ka `a` `ा` banta hai (`laga` -> `लगा`), kyunki Hinglish shabd
 * ke ant mein bina bole schwa likhti hi nahi -- wahan "chal" likha jaata hai,
 * "chala" nahi.
 */
function ruleWord(w) {
  let out = "";
  let i = 0;
  while (i < w.length) {
    const c = match(CONS, w, i);
    if (c) {
      out += c[1];
      i += c[0].length;
      const v = match(VOW, w, i);
      if (v) {
        // shabd ke ant ka 'a' lamba hota hai: laga -> लगा
        const atEnd = i + v[0].length >= w.length;
        out += (v[0] === "a" && atEnd) ? "ा" : v[2];
        i += v[0].length;
        continue;
      }
      if (i >= w.length) continue;                  // ant ka vyanjan -- schwa lop
      const nxt = match(CONS, w, i);
      if (nxt) {
        const same = nxt[0] === c[0];
        const joins = CLUSTER_2ND.has(nxt[0]) && match(VOW, w, i + nxt[0].length);
        if (same || joins) out += "्";
      }
      continue;
    }
    const v = match(VOW, w, i);
    if (v) {
      // beech mein akela 'a' chup rehta hai: road -> रोड (रोअद nahi)
      if (v[0] !== "a" || i === 0) out += v[1];
      else if (i + 1 >= w.length) out += "आ";       // hua -> हुआ
      i += v[0].length;
      continue;
    }
    if (DIGITS[w[i]]) { out += DIGITS[w[i]]; i++; continue; }
    i++;                                            // jo samajh na aaye, chhod do
  }
  return out;
}

/** Ek shabd -- pehle kosh, phir niyam. */
export function word(w) {
  const key = w.toLowerCase();
  if (DICT[key]) return DICT[key];
  return ruleWord(key) || w;
}

/**
 * Poori line Devanagari mein. Viraam-chinh aur ank jaise the waise rehte hain.
 *
 * Jo line pehle se Devanagari mein hai use haath nahi lagta -- isliye aage
 * chal kar `dialogue.json` mein seedha Hindi likhna bhi chalega.
 */
export function toDevanagari(text) {
  if (!text) return "";
  if (/[ऀ-ॿ]/.test(text)) return text;
  return String(text).replace(/[A-Za-z][A-Za-z']*/g, (m) => word(m));
}

/** Test/debug ke liye. */
export const dictSize = Object.keys(DICT).length;
