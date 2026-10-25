import { LIVE_DETECT_MS } from './constants.js';

let mediaStream = null;
let activeRAF = 0;
let liveDetectInterval = null;
let liveDetectInProgress = false;
// Bumped on every stop so an in-flight detection can tell its results are
// stale (e.g. the player just snapped a photo) and not draw them.
let liveDetectGeneration = 0;
// Bumped on every stop so a startCamera() still awaiting permission can tell
// it was superseded (e.g. the player left the screen) and release the camera.
let cameraGeneration = 0;

function cancelRAF() {
  if (activeRAF) {
    cancelAnimationFrame(activeRAF);
    activeRAF = 0;
  }
}

export function stopLiveDetect() {
  liveDetectGeneration++;
  if (liveDetectInterval) {
    clearInterval(liveDetectInterval);
    liveDetectInterval = null;
  }
  liveDetectInProgress = false;
}

export function stopCamera() {
  cameraGeneration++;
  cancelRAF();
  stopLiveDetect();
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
}

export async function checkCameraPermissions() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { supported: false, error: 'getUserMedia stöds inte i denna webbläsare' };
    }
    if (navigator.permissions) {
      try {
        const permission = await navigator.permissions.query({ name: 'camera' });
        if (permission.state === 'denied') {
          return { supported: true, error: 'Kamerabehörighet nekades. Klicka på kameran-ikonen i adressfältet och tillåt kameran.' };
        }
      } catch {
        // ignore
      }
    }
    return { supported: true, error: null };
  } catch (error) {
    return { supported: false, error: error.message };
  }
}

// Thrown when the camera was stopped while starting; callers should bail out
// silently since the screen that wanted it is gone.
export class CameraAbortedError extends Error {
  constructor() {
    super('Kameran stoppades');
    this.name = 'CameraAbortedError';
  }
}

export async function startCamera(videoEl, facingMode = 'environment') {
  stopCamera();
  const generation = cameraGeneration;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia stöds inte i denna webbläsare');
    }
    const constraints = {
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (!stream) throw new Error('Ingen mediaström mottagen');
    if (generation !== cameraGeneration) {
      stream.getTracks().forEach(t => t.stop());
      throw new CameraAbortedError();
    }
    mediaStream = stream;
    videoEl.srcObject = mediaStream;
    return new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = () => videoEl.play().then(resolve).catch(reject);
      videoEl.onerror = () => reject(new Error('Kunde inte spela upp video'));
    });
  } catch (error) {
    if (error instanceof CameraAbortedError) throw error;
    let msg = 'Kunde inte starta kamera. ';
    if (error.name === 'NotAllowedError') {
      msg += 'Kamerabehörighet nekades. Klicka på kameran-ikonen i adressfältet och tillåt kameran.';
    } else if (error.name === 'NotFoundError') {
      msg += 'Ingen kamera hittades. Kontrollera att en kamera är ansluten.';
    } else if (error.name === 'NotReadableError') {
      msg += 'Kameran används av en annan applikation. Stäng andra appar som använder kameran.';
    } else if (error.name === 'OverconstrainedError') {
      msg += 'Kamerainställningar stöds inte. Försök med en annan kamera.';
    } else {
      msg += `Fel: ${error.message}`;
    }
    throw new Error(msg);
  }
}

// fn receives isLive(): false once live detection has been stopped since this
// call, so fn can drop results that arrive after the screen moved on.
export function startLiveDetect(fn) {
  stopLiveDetect();
  const generation = liveDetectGeneration;
  const isLive = () => generation === liveDetectGeneration;
  liveDetectInterval = setInterval(async () => {
    if (liveDetectInProgress) return;
    liveDetectInProgress = true;
    try {
      await fn(isLive);
    } catch {
      // ignore transient errors
    } finally {
      liveDetectInProgress = false;
    }
  }, LIVE_DETECT_MS);
}
