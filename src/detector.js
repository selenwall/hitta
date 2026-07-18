// Object detection runs fully in the browser via TensorFlow.js COCO-SSD.
// The 'mobilenet_v2' base (SSDLite MobileNetV2) is noticeably more accurate
// than the default 'lite_mobilenet_v2' while still running in real time on
// mobile. The model is downloaded once and cached by the browser; inference
// never leaves the device.
let model = null;
let modelPromise = null;

function waitForScripts() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 50;
    const check = () => {
      attempts++;
      if (typeof cocoSsd !== 'undefined') {
        resolve();
      } else if (attempts >= maxAttempts) {
        reject(new Error('Skript laddades inte inom 5 sekunder. Kontrollera din internetanslutning.'));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

export async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      console.log('Laddar COCO-SSD (mobilenet_v2)...');
      await waitForScripts();
      const m = await cocoSsd.load({ base: 'mobilenet_v2' });
      console.log('Objektigenkänningsmodell laddad');
      model = m;
      return m;
    })().catch((err) => {
      console.error('Modelladdning misslyckades:', err);
      // Allow a retry on the next call instead of caching the failure forever.
      modelPromise = null;
      throw new Error('Kunde inte ladda objektigenkänningsmodellen. Kontrollera din internetanslutning och försök igen.');
    });
  }
  return modelPromise;
}

export async function detectObjects(model, input) {
  return model.detect(input);
}

export function getModel() {
  return model;
}

export function parseBbox(p) {
  if (p.bbox && Array.isArray(p.bbox)) return p.bbox;
  return [p.x, p.y, p.width, p.height];
}

export function getLabel(p) {
  return p.label || p.class || '';
}

export function getScore(p) {
  return p.confidence || p.score || 0;
}
