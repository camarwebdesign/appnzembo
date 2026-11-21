// musicStylesDictionary.browser.js
// Dictionnaire d'Authenticité Culturelle, Instruments Phares & Styles Étendus pour le Moteur Audio nZembo

(function(globalScope) {
  const MUSIC_STYLES_DICTIONARY = {
    "rumba_congolaise": {
      name: "Rumba congolaise",
      instruments: "Guitare sebene, congas & cuivres",
      bpm: "92-98 BPM",
      mandatoryTags: "congolese rumba, soukous sebene, intricate acoustic guitar, sensual rhythm, congas, warm bassline, brass section",
      forbiddenTags: "No heavy electronic synths, no amapiano log drums, no trap 808s",
      vocalStyle: "sensual romantic melodic vocals, rich harmonies, expressive sebene cheers",
      sunoStylePrompt: "Congolese rumba, intricate sebene solo guitar, warm bass, congas, brass horns, sensual vocal harmonies",
      structureType: "rumba"
    },
    "afrobeat": {
      name: "Afrobeat",
      instruments: "Cuivres, percussions & guitare",
      bpm: "108-115 BPM",
      mandatoryTags: "afrobeat, west african groove, brass section, rhythmic electric guitar, energetic congas, groovy drums",
      forbiddenTags: "No slow ambient pads, no country instruments",
      vocalStyle: "rhythmic groovy vocals, call and response chorus, energetic dynamic delivery",
      sunoStylePrompt: "Afrobeat, vibrant brass section, syncopated guitars, energetic percussions, call and response chorus",
      structureType: "afrobeat"
    },
    "ndombolo": {
      name: "Ndombolo",
      instruments: "Guitare solo rapide, tam-tam & basse",
      bpm: "125-132 BPM",
      mandatoryTags: "ndombolo, high tempo congolese dance, sebene electric guitar solo, snare rolls, animated atalaku shouts",
      forbiddenTags: "No slow tempo, no dull acoustic",
      vocalStyle: "animated shouts, exuberant singing, joyful party harmonies",
      sunoStylePrompt: "Ndombolo, high energy Congolese sebene fast guitars, lively drums, bass guitar, festive dance vocals",
      structureType: "ndombolo"
    },
    "coupe_decale": {
      name: "Coupé-Décalé",
      instruments: "Synthés, caisse claire & percussions",
      bpm: "126-130 BPM",
      mandatoryTags: "coupe decale, ivorian dance music, bright percussive synth, rolling snares, dance club beat, heavy kicks",
      forbiddenTags: "No slow ballads, no jazz saxophone",
      vocalStyle: "energetic upbeat vocals, charismatic club chanting, rhythmic hype delivery",
      sunoStylePrompt: "Coupe-Decale, Ivorian infectious party groove, vibrant club synths, bright snare percussions, hype vocals",
      structureType: "coupe_decale"
    },
    "amapiano": {
      name: "Amapiano",
      instruments: "Log drum, piano jazz & shakers",
      bpm: "112 BPM",
      mandatoryTags: "amapiano, deep log drum, south african house, warm sliding bass, jazz piano chords, gentle shakers",
      forbiddenTags: "No aggressive distortion, no rock guitar",
      vocalStyle: "smooth airy soulful vocals, ethereal harmonies, chill groove vibe",
      sunoStylePrompt: "Amapiano, deep log drums, lush jazz piano keys, rolling shakers, soulful airy vocals",
      structureType: "amapiano"
    },
    "rb_soul": {
      name: "R&B / Soul",
      instruments: "Piano Rhodes, basse chaude & cordes",
      bpm: "72-84 BPM",
      mandatoryTags: "contemporary R&B, smooth rhodes piano, velvety chords, warm synth bass, crisp finger snaps, orchestral strings",
      forbiddenTags: "No fast dance tempo, no harsh EDM drops",
      vocalStyle: "silky soulful melisma, rich backing harmonies, expressive intimate vocals",
      sunoStylePrompt: "Smooth R&B Soul, lush Rhodes keyboards, strings, mellow groove, passionate romantic vocal delivery",
      structureType: "rb_soul"
    },
    "acoustique_soul": {
      name: "Acoustique / Soul",
      instruments: "Guitare acoustique, contrebasse & cajón",
      bpm: "80 BPM",
      mandatoryTags: "intimate acoustic soul, warm acoustic fingerstyle guitar, upright double bass, gentle cajon percussion",
      forbiddenTags: "No electric distortion, no heavy drums, no autotune",
      vocalStyle: "raw expressive soulful vocals, close-mic warmth, emotional vibrato",
      sunoStylePrompt: "Acoustic soul, intimate fingerpicking acoustic guitar, upright bass, soft cajon, heartfelt clean vocals",
      structureType: "acoustique"
    },
    "gospel_urbain": {
      name: "Gospel Urbain",
      instruments: "Orgue Hammond, piano & batterie",
      bpm: "85-98 BPM",
      mandatoryTags: "urban gospel praise, soulful piano chords, Hammond B3 organ swell, powerful gospel choir harmonies, dynamic live drums",
      forbiddenTags: "No dark trap themes, no aggressive metallic guitar",
      vocalStyle: "passionate worship singing, soaring choir chorus, uplifting harmonies",
      sunoStylePrompt: "Urban Gospel, soulful choir harmonies, Hammond organ, grand piano, uplifting groove and heartfelt lead vocals",
      structureType: "gospel"
    },
    "makossa": {
      name: "Makossa",
      instruments: "Basse slappée, cuivres & guitare",
      bpm: "114-122 BPM",
      mandatoryTags: "makossa, cameroonian dance groove, slapped funky bass guitar, brass horn riffs, syncopated electric guitar",
      forbiddenTags: "No trap 808 bass, no dark synths",
      vocalStyle: "rich resonant vocals, joyful chorus harmonies, warm African rhythm",
      sunoStylePrompt: "Makossa, Cameroonian funky slap bass, lively brass horns, upbeat electric guitar, joyful groove",
      structureType: "makossa"
    },
    "bikutsi": {
      name: "Bikutsi",
      instruments: "Balafon, guitare picking & tambour",
      bpm: "130-140 BPM",
      mandatoryTags: "bikutsi, cameroonian 6/8 percussive rhythm, wooden balafon melody, fast clean electric guitar, energetic drums",
      forbiddenTags: "No slow lo-fi beat, no dubstep drops",
      vocalStyle: "powerful festive chant, vibrant rapid vocal harmonies",
      sunoStylePrompt: "Bikutsi, 6/8 fast Cameroonian groove, wooden balafon, intricate guitars, pounding ethnic drums",
      structureType: "bikutsi"
    },
    "reggae_dancehall": {
      name: "Reggae / Dancehall",
      instruments: "Guitare skank, basse profonde & batterie",
      bpm: "88-96 BPM",
      mandatoryTags: "roots reggae, sunny dancehall groove, offbeat skank guitar, deep sub bassline, crisp one drop drums",
      forbiddenTags: "No techno synths, no fast rock",
      vocalStyle: "relaxed melodic patois/French fusion, positive vibrations, sunny harmonies",
      sunoStylePrompt: "Reggae Dancehall, deep warm sub bass, offbeat skank guitar, groovy drum beat, sunny island vibe",
      structureType: "reggae"
    },
    "zouk_kizomba": {
      name: "Zouk / Kizomba",
      instruments: "Synthé suave, basse ronde & guitare",
      bpm: "90-96 BPM",
      mandatoryTags: "zouk love, sensual kizomba beat, smooth synth leads, round warm bass, soft guitar arpeggios",
      forbiddenTags: "No aggressive trap hats, no heavy distortion",
      vocalStyle: "soft tender vocals, intimate whispers, romantic melody",
      sunoStylePrompt: "Zouk Love Kizomba, warm sensual bass, sweet tropical synth leads, acoustic guitar, romantic flow",
      structureType: "zouk"
    },
    "afro_trap": {
      name: "Afro-Trap",
      instruments: "Basses 808, charleston & guitare",
      bpm: "118-124 BPM",
      mandatoryTags: "afro-trap, bouncing 808 sub bass, crisp trap hi-hats, african plucks guitar, upbeat urban groove",
      forbiddenTags: "No country banjo, no rock ballads",
      vocalStyle: "melodic urban flow, charismatic chanting, catchy anthemic chorus",
      sunoStylePrompt: "Afro-Trap, punchy 808 bass, fast trap hi-hats, afro melodic guitar plucks, catchy French urban vocals",
      structureType: "afro_trap"
    },
    "pop_moderne": {
      name: "Pop Moderne",
      instruments: "Synthétiseur, piano & batterie pop",
      bpm: "110-120 BPM",
      mandatoryTags: "modern pop, catchy bright synths, piano hooks, polished pop drums, radio mix clarity, uplifting chords",
      forbiddenTags: "No lo-fi grit, no metal scream",
      vocalStyle: "polished clear lead vocals, radio-ready harmonies, energetic chorus",
      sunoStylePrompt: "Modern Pop, radio-ready mix, bright uplifting synths, piano, tight drums, charismatic vocals",
      structureType: "pop"
    },
    "hip_hop_rap": {
      name: "Hip-Hop / Rap",
      instruments: "Batterie boom-bap, basse & samples",
      bpm: "90-96 BPM",
      mandatoryTags: "hip hop rap, punchy boom bap drums, warm deep bassline, soulful sample loop, crisp snare",
      forbiddenTags: "No overly sweet pop keys",
      vocalStyle: "confident rhythmic rap flow, sharp lyricism, soulful vocal hook",
      sunoStylePrompt: "Hip-Hop Rap, classic boom-bap beat, soulful sampled chords, deep bass, sharp flow",
      structureType: "hip_hop"
    },
    "trap_drill": {
      name: "Trap / Drill",
      instruments: "808 glissées, hi-hats & nappes sombres",
      bpm: "136-144 BPM",
      mandatoryTags: "melodic drill, sliding 808 bass, sharp triplet hi-hats, dark cinematic piano, atmospheric synths",
      forbiddenTags: "No acoustic folk strumming, no disco strings",
      vocalStyle: "melodic drill cadence, confident rhythmic delivery, crisp doubles",
      sunoStylePrompt: "Melodic Trap Drill, heavy sliding 808 bass, crisp fast hi-hats, dark piano pads, intense rap vocals",
      structureType: "trap_drill"
    },
    "bongo_flava": {
      name: "Bongo Flava",
      instruments: "Guitare taarab, percussions & basse",
      bpm: "96-104 BPM",
      mandatoryTags: "bongo flava, east african swahili afro pop, melodic taarab acoustic guitar, soft afro beats, smooth bass",
      forbiddenTags: "No heavy industrial noise",
      vocalStyle: "sweet melodic swahili/french blend, soulful heartfelt crooning",
      sunoStylePrompt: "Bongo Flava, East African coastal groove, gentle acoustic guitars, warm bass, sweet romantic vocals",
      structureType: "bongo_flava"
    },
    "jazz_blues": {
      name: "Jazz / Blues",
      instruments: "Saxophone, contrebasse & batterie balais",
      bpm: "78-92 BPM",
      mandatoryTags: "smooth jazz blues, tenor saxophone solo, brushed snare drums, upright walking bass, expressive blues guitar",
      forbiddenTags: "No electronic bassdrops, no 808s",
      vocalStyle: "velvety soulful voice, jazz swing phrasing, lounge intimacy",
      sunoStylePrompt: "Jazz Blues, smooth saxophone, warm hollowbody guitar, walking upright bass, brushed drums",
      structureType: "jazz"
    },
    "lo_fi": {
      name: "Lo-Fi Hip-Hop",
      instruments: "Piano doux, vinyle & beat chill",
      bpm: "72-80 BPM",
      mandatoryTags: "lo-fi chill beats, warm dusty Rhodes piano, soft vinyl crackle, mellow boom bap beat, ambient synth",
      forbiddenTags: "No high volume screeching synths",
      vocalStyle: "soft intimate spoken-sung voice, mellow cozy tone",
      sunoStylePrompt: "Lo-Fi Hip-Hop, mellow dusty chords, soft chill beat, cozy warm atmosphere, subtle intimate vocals",
      structureType: "lofi"
    },

    // ================= STYLES ÉTENDUS (SECTION "AUTRE STYLE") =================
    "soukous": { name: "Soukous / Kwassa-Kwassa", instruments: "Guitare solo soukous, caisse claire & basse", bpm: "132 BPM", mandatoryTags: "soukous, kwassa kwassa, bright congolese lead guitar, fast dance groove, crisp snare, lively bass", sunoStylePrompt: "Classic Soukous Kwassa-Kwassa, sparkling Congolese lead guitars, energetic African dance rhythm" },
    "mutuashi": { name: "Mutuashi (Kasaï)", instruments: "Tambour traditionnel, guitare kasaïenne & grelots", bpm: "118 BPM", mandatoryTags: "mutuashi, traditional kasai congolese percussion, polyrhythmic drums, rhythmic guitar picking", sunoStylePrompt: "Mutuashi Congolese Kasai groove, authentic talking drums, rhythmic guitar and joyful choral singing" },
    "highlife": { name: "Highlife", instruments: "Guitare palm-wine, trompette & congas", bpm: "106 BPM", mandatoryTags: "ghanaian highlife, melodic palm-wine electric guitar, warm brass horns, congas groove", sunoStylePrompt: "West African Highlife, sunny brass horn melodies, fluid clean electric guitar, upbeat percussion" },
    "mbalax": { name: "Mbalax (Sénégal)", instruments: "Tama (talking drum), sabar & claviers", bpm: "128 BPM", mandatoryTags: "mbalax, senegalese sabar percussion, tama talking drum, bright keyboard riffs, groovy bass", sunoStylePrompt: "Senegalese Mbalax, rapid sabar and tama talking drum rhythms, energetic keyboards, soulful vocals" },
    "zouglou": { name: "Zouglou", instruments: "Guitare acoustique, percussions & chœurs", bpm: "104 BPM", mandatoryTags: "zouglou, ivorian storytelling groove, rhythmic acoustic guitar, traditional shaker percussion, crowd chorus", sunoStylePrompt: "Ivorian Zouglou, expressive narrative vocals, warm acoustic guitar, lively percussion and vocal harmonies" },
    "kuduro": { name: "Kuduro", instruments: "Percussions électroniques, basse & synthé club", bpm: "138 BPM", mandatoryTags: "kuduro, angolan carnival electro, heavy syncopated tribal drums, driving bass, party chant", sunoStylePrompt: "Angolan Kuduro, high energy tribal electronic percussion, club bass and carnival chants" },
    "gqom": { name: "Gqom", instruments: "Basses lourdes, tambours sombres & synthés", bpm: "126 BPM", mandatoryTags: "gqom, dark south african club beat, broken percussive drums, deep sub bass hits, hypnotic chant", sunoStylePrompt: "South African Gqom, hypnotic heavy broken drums, deep sub bass and club vocals" },
    "gengetone": { name: "Gengetone", instruments: "808 percutantes, synthé club & flûte", bpm: "112 BPM", mandatoryTags: "gengetone, kenyan urban dancehall, bouncy bassline, infectious synth hook, energetic chant", sunoStylePrompt: "Kenyan Gengetone, bouncy dancehall drums, heavy club bass and charismatic Afro-urban vocals" },
    "rai": { name: "Raï Moderne", instruments: "Accordéon, darbouka & synthé", bpm: "102 BPM", mandatoryTags: "modern rai, expressive accordion, darbuka percussion, gasba flute, emotional North African vocals", sunoStylePrompt: "Modern Rai, North African darbuka rhythm, accordion melody, emotional vibrato vocals" },
    "gnawa": { name: "Gnawa Fusion", instruments: "Guembri, qraqeb & batterie", bpm: "100 BPM", mandatoryTags: "gnawa, guembri deep acoustic bass lute, metallic qraqeb castanets, hypnotic trance groove", sunoStylePrompt: "Gnawa Fusion, deep earthy guembri bass lute, metallic qraqeb rhythm, mystical call and response" },
    "sega": { name: "Séga", instruments: "Ravanne, kayamb & guitare", bpm: "122 BPM", mandatoryTags: "sega music, island ravanne drum, kayamb shaker, cheerful tropical guitar and accordion", sunoStylePrompt: "Tropical Sega, festive ravanne percussion, kayamb shaker, cheerful guitar and sunny island vocals" },
    "compas": { name: "Compas / Kompa", instruments: "Guitare konpa, synthé cuivre & cloche", bpm: "102 BPM", mandatoryTags: "haitian kompa, romantic groove guitar, warm synth brass, steady cowbell and bass rhythm", sunoStylePrompt: "Romantic Kompa, smooth Haitian electric guitar groove, lush synth keys and warm sensual rhythm" },
    "shatta": { name: "Shatta / Dancehall Caribéen", instruments: "Basses 808 lourdes, caisse claire & synthé", bpm: "100 BPM", mandatoryTags: "shatta, martinique dancehall, crisp stripped back drums, heavy 808 bass, energetic Caribbean groove", sunoStylePrompt: "Caribbean Shatta Dancehall, punchy minimal drums, sub heavy bassline and infectious flow" },
    "soca": { name: "Soca", instruments: "Steelpan, cuivres & batterie carnaval", bpm: "152 BPM", mandatoryTags: "soca carnival music, bright steelpan drums, brass horns, fast joyful Caribbean party beat", sunoStylePrompt: "Carnival Soca, vibrant steelpan melodies, energetic brass horns and fast festival rhythm" },
    "salsa": { name: "Salsa", instruments: "Trombones, piano montuno & timbales", bpm: "104 BPM", mandatoryTags: "salsa dura, piano montuno, punchy trombones and trumpets, congas, bongo and timbales", sunoStylePrompt: "Classic Salsa, energetic brass section, piano montuno, vibrant congas and timbales" },
    "bachata": { name: "Bachata", instruments: "Guitare requinto, güira & bongo", bpm: "126 BPM", mandatoryTags: "romantic bachata, crisp clean requinto lead guitar arpeggios, bongos, metallic guira shaker", sunoStylePrompt: "Romantic Bachata, melodic requinto guitar arpeggios, warm bass, bongos and passionate vocals" },
    "reggaeton": { name: "Reggaeton", instruments: "Rythme dembow, basses & synthés latins", bpm: "96 BPM", mandatoryTags: "reggaeton, classic dembow drum beat, heavy Latin sub bass, catchy synth melody", sunoStylePrompt: "Modern Reggaeton, punchy dembow beat, deep bass and catchy melodic Latin vocals" },
    "bossa_nova": { name: "Bossa Nova", instruments: "Guitare nylon, piano doux & percussions", bpm: "118 BPM", mandatoryTags: "bossa nova, warm nylon string acoustic guitar syncopation, soft brushed drums, mellow jazz piano", sunoStylePrompt: "Brazilian Bossa Nova, smooth nylon string guitar, soft jazz chords and intimate relaxed vocals" },
    "samba": { name: "Samba", instruments: "Cavaquinho, surdo & pandeiro", bpm: "102 BPM", mandatoryTags: "brazilian samba, crisp cavaquinho ukulele, surdo bass drum, pandeiro tambourine, joyful chorus", sunoStylePrompt: "Joyful Brazilian Samba, upbeat cavaquinho, surdo drums, pandeiro percussion and festive singing" },
    "semba": { name: "Semba (Angola)", instruments: "Guitare dikanza, basse & puíta", bpm: "114 BPM", mandatoryTags: "angolan semba, lively acoustic guitar riffs, dikanza scraper, warm bass and festive rhythm", sunoStylePrompt: "Angolan Semba, vibrant guitar groove, warm tropical rhythm and celebratory vocals" },
    "afro_house": { name: "Afro-House", instruments: "Percussions tribales, synthé organique & kicks", bpm: "122 BPM", mandatoryTags: "afro house, organic tribal drums, warm analog synth chords, deep four-on-the-floor kick", sunoStylePrompt: "Afro-House, organic African percussions, deep driving house groove and soulful atmospheric vocals" },
    "deep_house": { name: "Deep House", instruments: "Basse analogique, accords piano & pads", bpm: "122 BPM", mandatoryTags: "deep house, warm analog bassline, lush chord pads, crisp house hi-hats, soulful hook", sunoStylePrompt: "Deep House, hypnotic warm bass, lush atmospheric synth chords and smooth house groove" },
    "synthwave": { name: "Synthwave / Rétro 80s", instruments: "Synthés analogiques, boîte à rythmes & basse", bpm: "116 BPM", mandatoryTags: "synthwave, retro 80s analog synthesizers, gated reverb snare drums, driving synth bass", sunoStylePrompt: "80s Synthwave, nostalgic analog synth leads, warm bass arpeggios and punchy retro drums" },
    "rock_acoustique": { name: "Pop-Rock / Acoustique", instruments: "Guitare électrique, basse & batterie live", bpm: "120 BPM", mandatoryTags: "acoustic pop rock, crisp live drum kit, warm overdriven rhythm guitars, melodic bassline", sunoStylePrompt: "Melodic Pop Rock, live acoustic and electric guitars, driving live drums and anthemic chorus" },
    "country_folk": { name: "Folk / Country Acoustique", instruments: "Guitare folk, violon & harmonica", bpm: "98 BPM", mandatoryTags: "warm folk country, acoustic steel-string guitar strumming, melodic fiddle violin, soft drums", sunoStylePrompt: "Warm Folk Acoustic, rich acoustic guitar strumming, heartfelt storytelling vocals and violin" },
    "classique_orchestre": { name: "Classique / Orchestre Cinématique", instruments: "Violons, violoncelle, piano & cuivres", bpm: "76 BPM", mandatoryTags: "cinematic orchestral score, lush string ensemble, grand piano, French horns and timpani", sunoStylePrompt: "Cinematic Classical Orchestra, sweeping strings, grand piano and majestic emotional arrangement" },
    "chorale_acappella": { name: "Chorale / A Cappella", instruments: "Voix polyphoniques & claquements de mains", bpm: "86 BPM", mandatoryTags: "a cappella vocal choir, rich four-part polyphonic harmonies, no instruments, natural room acoustics", sunoStylePrompt: "Rich A Cappella Vocal Choir, pure multi-part vocal harmonies with subtle handclaps" }
  };

  function buildLyricsFallback(styleKey, params) {
    const recipient = params?.recipient || 'toi';
    const userMessage = params?.userMessage || '';
    const occasionName = params?.occasionName || 'Célébration';
    const primaryLang = params?.primaryLang || 'Français';
    if (typeof window !== 'undefined' && typeof window.generatePlaceholderLyrics === 'function') {
      return window.generatePlaceholderLyrics(occasionName, styleKey, recipient, userMessage, primaryLang, params?.relationship || '', params?.secondaryLang || '', params?.keywords || '');
    }
    return `[Couplet 1]\nPour ${recipient}, cette mélodie résonne aujourd'hui.\n${userMessage}\n\n[Refrain]\n${occasionName} en musique et en harmonie pour toujours.`;
  }

  for (const k in MUSIC_STYLES_DICTIONARY) {
    if (!MUSIC_STYLES_DICTIONARY[k].buildLyrics) {
      MUSIC_STYLES_DICTIONARY[k].buildLyrics = function(params) {
        return buildLyricsFallback(k, params);
      };
    }
    if (!MUSIC_STYLES_DICTIONARY[k].forbiddenTags) MUSIC_STYLES_DICTIONARY[k].forbiddenTags = '';
    if (!MUSIC_STYLES_DICTIONARY[k].vocalStyle) MUSIC_STYLES_DICTIONARY[k].vocalStyle = 'expressive soulful melodic vocals, authentic phrasing';
    if (!MUSIC_STYLES_DICTIONARY[k].structureType) MUSIC_STYLES_DICTIONARY[k].structureType = k;
  }

  function getMusicStyleConfig(styleKeyOrLabel) {
    if (!styleKeyOrLabel) return MUSIC_STYLES_DICTIONARY["rumba_congolaise"];
    const rawStr = String(styleKeyOrLabel).trim();
    const key = rawStr.toLowerCase();

    if (MUSIC_STYLES_DICTIONARY[key]) {
      return MUSIC_STYLES_DICTIONARY[key];
    }

    const aliasMap = {
      "rumba": "rumba_congolaise",
      "rumba congolaise": "rumba_congolaise",
      "ndombolo": "ndombolo",
      "afrobeat": "afrobeat",
      "coupe decale": "coupe_decale",
      "coupé-décalé": "coupe_decale",
      "coupe-decale": "coupe_decale",
      "amapiano": "amapiano",
      "rb": "rb_soul",
      "r&b": "rb_soul",
      "r&b / soul": "rb_soul",
      "rnb": "rb_soul",
      "acoustique": "acoustique_soul",
      "acoustique / soul": "acoustique_soul",
      "gospel": "gospel_urbain",
      "gospel urbain": "gospel_urbain",
      "makossa": "makossa",
      "bikutsi": "bikutsi",
      "reggae": "reggae_dancehall",
      "dancehall": "reggae_dancehall",
      "reggae / dancehall": "reggae_dancehall",
      "zouk": "zouk_kizomba",
      "kizomba": "zouk_kizomba",
      "zouk / kizomba": "zouk_kizomba",
      "afrotrap": "afro_trap",
      "afro-trap": "afro_trap",
      "hip hop": "hip_hop_rap",
      "hip-hop": "hip_hop_rap",
      "hip-hop / rap": "hip_hop_rap",
      "trap": "trap_drill",
      "drill": "trap_drill",
      "trap / drill": "trap_drill",
      "bongo": "bongo_flava",
      "bongo flava": "bongo_flava",
      "jazz": "jazz_blues",
      "blues": "jazz_blues",
      "jazz / blues": "jazz_blues",
      "lofi": "lo_fi",
      "lo-fi": "lo_fi",
      "lo-fi hip-hop": "lo_fi",
      "pop": "pop_moderne",
      "pop moderne": "pop_moderne",
      "kompa": "compas",
      "compas": "compas",
      "bossa": "bossa_nova"
    };

    if (aliasMap[key] && MUSIC_STYLES_DICTIONARY[aliasMap[key]]) {
      return MUSIC_STYLES_DICTIONARY[aliasMap[key]];
    }

    for (const styleId in MUSIC_STYLES_DICTIONARY) {
      const s = MUSIC_STYLES_DICTIONARY[styleId];
      if (s.name.toLowerCase() === key || key === styleId) {
        return s;
      }
    }

    // Style personnalisé saisi manuellement par l'utilisateur : préserver fidèlement le genre demandé
    if (key !== 'autre') {
      return {
        name: rawStr,
        instruments: "Instrumentation authentique du style " + rawStr,
        bpm: "100-115 BPM",
        mandatoryTags: `${rawStr}, authentic live instruments, rich arrangement, crisp studio mix`,
        forbiddenTags: "",
        vocalStyle: "expressive authentic vocals matching " + rawStr,
        sunoStylePrompt: `${rawStr}, authentic musical arrangement, warm instrumentation, professional studio mastering`,
        structureType: "custom",
        isCustom: true,
        buildLyrics: (params) => buildLyricsFallback(rawStr, params)
      };
    }

    return MUSIC_STYLES_DICTIONARY["rumba_congolaise"];
  }

  globalScope.MUSIC_STYLES_DICTIONARY = MUSIC_STYLES_DICTIONARY;
  globalScope.getMusicStyleConfig = getMusicStyleConfig;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global));
