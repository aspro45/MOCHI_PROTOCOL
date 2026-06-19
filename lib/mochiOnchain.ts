import type { WeeklyLeaderboardEntry } from './genlayerClient';

export type MochiOnchainApi = {
  connectWallet: () => Promise<void> | void;
  submitGuardianOath: (oathMessage: string) => Promise<void> | void;
  submitFinalDecision: (finalMessage: string, progressJson: string) => Promise<void> | void;
  submitWeeklyRun: (runJson: string) => Promise<void> | void;
  getWeeklyLeaderboard: (weekId: string) => Promise<WeeklyLeaderboardEntry[]>;
};

export function installMochiOnchainGlobals(api: MochiOnchainApi) {
  if (typeof window === 'undefined') {
    return;
  }

  Object.defineProperty(window, 'mochiOnchain', {
    value: Object.freeze(api),
    configurable: true,
    enumerable: false,
    writable: false,
  });
}

export function clearMochiOnchainGlobals(api: MochiOnchainApi) {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.mochiOnchain === api) {
    delete window.mochiOnchain;
  }
}

declare global {
  interface Window {
    mochiOnchain?: MochiOnchainApi;
  }
}
