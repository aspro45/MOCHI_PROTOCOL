export type UnityInstance = {
  SendMessage: (gameObjectName: string, methodName: string, value?: string | number) => void;
  SetFullscreen?: (fullscreen: 0 | 1) => void;
  Quit?: () => Promise<void>;
};

let unityInstance: UnityInstance | null = null;

export function setUnityInstance(instance: UnityInstance | null) {
  unityInstance = instance;
}

export function getUnityInstance() {
  return unityInstance;
}

export function sendToUnity(methodName: string, value = '') {
  const instance = getUnityInstance();
  if (!instance) {
    console.info(`[mochiOnchain] Unity not ready for ${methodName}:`, value);
    return false;
  }

  instance.SendMessage('OnchainBridge', methodName, value);
  return true;
}

export function sendUnityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown onchain error.');
  sendToUnity('OnOnchainError', message);
}
