const COCO_SV = {
  person: 'person',
  bicycle: 'cykel',
  car: 'bil',
  motorcycle: 'motorcykel',
  airplane: 'flygplan',
  bus: 'buss',
  train: 'tåg',
  truck: 'lastbil',
  boat: 'båt',
  'traffic light': 'trafikljus',
  'fire hydrant': 'brandpost',
  'stop sign': 'stoppskylt',
  'parking meter': 'parkeringsautomat',
  bench: 'bänk',
  bird: 'fågel',
  cat: 'katt',
  dog: 'hund',
  horse: 'häst',
  sheep: 'får',
  cow: 'ko',
  elephant: 'elefant',
  bear: 'björn',
  zebra: 'zebra',
  giraffe: 'giraff',
  backpack: 'ryggsäck',
  umbrella: 'paraply',
  handbag: 'handväska',
  tie: 'slips',
  suitcase: 'resväska',
  frisbee: 'frisbee',
  skis: 'skidor',
  snowboard: 'snowboard',
  'sports ball': 'boll',
  kite: 'drake',
  'baseball bat': 'basebollträ',
  'baseball glove': 'basebollhandske',
  skateboard: 'skateboard',
  surfboard: 'surfbräda',
  'tennis racket': 'tennisracket',
  bottle: 'flaska',
  'wine glass': 'vinglas',
  cup: 'kopp',
  fork: 'gaffel',
  knife: 'kniv',
  spoon: 'sked',
  bowl: 'skål',
  banana: 'banan',
  apple: 'äpple',
  sandwich: 'smörgås',
  orange: 'apelsin',
  broccoli: 'broccoli',
  carrot: 'morot',
  'hot dog': 'varmkorv',
  pizza: 'pizza',
  donut: 'munk',
  cake: 'tårta',
  chair: 'stol',
  couch: 'soffa',
  'potted plant': 'krukväxt',
  bed: 'säng',
  'dining table': 'matbord',
  toilet: 'toalett',
  tv: 'tv',
  laptop: 'laptop',
  mouse: 'mus',
  remote: 'fjärrkontroll',
  keyboard: 'tangentbord',
  'cell phone': 'mobiltelefon',
  microwave: 'mikrovågsugn',
  oven: 'ugn',
  toaster: 'brödrost',
  sink: 'diskho',
  refrigerator: 'kylskåp',
  book: 'bok',
  clock: 'klocka',
  vase: 'vas',
  scissors: 'sax',
  'teddy bear': 'nallebjörn',
  'hair drier': 'hårtork',
  toothbrush: 'tandborste',
};

const translateCache = new Map();
const inflightTranslate = new Map();

export async function translateLabelToSv(label) {
  try {
    const key = (label || '').trim().toLowerCase();
    if (!key) return label;
    if (translateCache.has(key)) return translateCache.get(key);
    if (COCO_SV[key]) {
      translateCache.set(key, COCO_SV[key]);
      return COCO_SV[key];
    }
    if (inflightTranslate.has(key)) return inflightTranslate.get(key);
    const p = fetch('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: key, source: 'en', target: 'sv', format: 'text' }),
    }).then(r => r.json()).then(j => {
      const out = (j && j.translatedText) ? j.translatedText : label;
      translateCache.set(key, out);
      inflightTranslate.delete(key);
      return out;
    }).catch(() => {
      inflightTranslate.delete(key);
      return label;
    });
    inflightTranslate.set(key, p);
    return p;
  } catch {
    return label;
  }
}
