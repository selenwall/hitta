let mediaStream = null;
let activeRAF = 0;
let liveDetectInterval = null;
let liveDetectInProgress = false;

function cancelRAF() {
  if (activeRAF) {
    cancelAnimationFrame(activeRAF);
    activeRAF = 0;
  }
}

export function stopLiveDetect() {
  if (liveDetectInterval) {
    clearInterval(liveDetectInterval);
    liveDetectInterval = null;
  }
  liveDetectInProgress = false;
}

export function stopCamera() {
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

export async function startCamera(videoEl, facingMode = 'environment') {
  stopCamera();
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia stöds inte i denna webbläsare');
    }
    const constraints = {
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (!mediaStream) throw new Error('Ingen mediaström mottagen');
    videoEl.srcObject = mediaStream;
    return new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = () => videoEl.play().then(resolve).catch(reject);
      videoEl.onerror = () => reject(new Error('Kunde inte spela upp video'));
    });
  } catch (error) {
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

export function startLiveDetect(fn) {
  stopLiveDetect();
  liveDetectInterval = setInterval(async () => {
    if (liveDetectInProgress) return;
    liveDetectInProgress = true;
    try {
      await fn();
    } catch {
      // ignore transient errors
    } finally {
      liveDetectInProgress = false;
    }
  }, 600);
}
