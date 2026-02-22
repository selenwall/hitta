import { MIN_SCORE } from './constants.js';

let yoloModel = null;

function waitForScripts() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 50;
    const check = () => {
      attempts++;
      if (typeof ml5 !== 'undefined' || typeof cocoSsd !== 'undefined') {
        console.log('Skript laddade efter', attempts * 100, 'ms');
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
  if (yoloModel) return yoloModel;

  console.log('Försöker ladda objektigenkänningsmodell...');
  await waitForScripts();

  if (typeof ml5 !== 'undefined' && ml5.objectDetector) {
    try {
      console.log('Laddar YOLO-modell...');
      yoloModel = await ml5.objectDetector('YOLO', {
        filterBoxesThreshold: 0.01,
        IOUThreshold: 0.4,
        classProbThreshold: MIN_SCORE,
      });
      console.log('YOLO-modell laddad framgångsrikt');
      return yoloModel;
    } catch (error) {
      console.warn('YOLO-modell misslyckades, försöker COCO-SSD:', error);
    }
  } else {
    console.warn('ml5.js inte tillgängligt, försöker COCO-SSD');
  }

  if (typeof cocoSsd !== 'undefined') {
    try {
      console.log('Laddar COCO-SSD-modell som fallback...');
      yoloModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      console.log('COCO-SSD-modell laddad framgångsrikt');
      return yoloModel;
    } catch (error) {
      console.error('COCO-SSD-modell misslyckades:', error);
    }
  }

  throw new Error('Kunde inte ladda någon objektigenkänningsmodell. Kontrollera din internetanslutning och ladda om sidan.');
}

export async function detectObjects(model, input) {
  if (model.detect && typeof model.detect === 'function' && model.detect.length === 2) {
    return new Promise((resolve, reject) => {
      model.detect(input, (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    });
  }
  return model.detect(input);
}

export function getModel() {
  return yoloModel;
}
