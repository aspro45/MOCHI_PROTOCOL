'use client';

import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import {
  clearMochiOnchainGlobals,
  installMochiOnchainGlobals,
  type MochiOnchainApi,
} from '../lib/mochiOnchain';
import {
  getWeeklyLeaderboard,
  type OnchainWriteStatus,
  submitFinalDecision as submitFinalDecisionOnchain,
  submitGuardianOath as submitGuardianOathOnchain,
  submitWeeklyRun as submitWeeklyRunOnchain,
  type EthereumProviderLike,
  type ProgressData,
  type WalletContext,
  type WeeklyLeaderboardEntry,
  type WeeklyRunData,
} from '../lib/genlayerClient';
import { getUnityInstance, sendToUnity, sendUnityError, setUnityInstance, type UnityInstance } from '../lib/unityBridge';

type UnityLoaderStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'failed';

type UnityCreateConfig = {
  dataUrl: string;
  frameworkUrl: string;
  codeUrl: string;
  streamingAssetsUrl: string;
  companyName: string;
  productName: string;
  productVersion: string;
  devicePixelRatio?: number;
  matchWebGLToCanvasSize?: boolean;
};

type StatBlock = {
  value: string;
  label: string;
};

type ControlHint = {
  keyName: string;
  action: string;
  note: string;
};

type LinkItem = {
  label: string;
  href: string;
};

type ProofMetric = {
  value: string;
  label: string;
  note: string;
};

type PassportStep = {
  label: string;
  status: string;
  description: string;
};

type EvidenceLink = LinkItem & {
  description: string;
  meta: string;
  cta: string;
};

type WeeklyRunForm = {
  completionTimeSeconds: string;
  weekId: string;
  playerName: string;
  runNote: string;
  dashUnlocked: boolean;
  doubleJumpUnlocked: boolean;
  scrapHoundDefeated: boolean;
  reactorTitanDefeated: boolean;
  coreRestored: boolean;
};

declare global {
  interface Window {
    createUnityInstance?: (
      canvas: HTMLCanvasElement,
      config: UnityCreateConfig,
      onProgress?: (progress: number) => void,
    ) => Promise<UnityInstance>;
    mochiDebugFinalDecision?: () => boolean;
  }
}

const defaultUnityBuildBase = 'https://pub-8eeae0f71eed47c698ccbf03daeb9f6d.r2.dev/Build';
const defaultUnityStreamingAssetsUrl = 'https://pub-8eeae0f71eed47c698ccbf03daeb9f6d.r2.dev/StreamingAssets';
const configuredUnityBuildBase = normalizeUnityBuildBase(process.env.NEXT_PUBLIC_UNITY_BUILD_BASE || defaultUnityBuildBase);
const unityBuildBaseCandidates = uniqueUnityBuildBases([
  configuredUnityBuildBase,
  defaultUnityBuildBase,
  '/unity/Build',
]);
const unityStreamingAssetsUrl = normalizeUnityBuildBase(process.env.NEXT_PUBLIC_UNITY_STREAMING_ASSETS_BASE || defaultUnityStreamingAssetsUrl);
const unityBuildName = process.env.NEXT_PUBLIC_UNITY_BUILD_NAME || 'MochiProtocol';
const defaultUnityBuildVersion = 'r2-completion-layout-20260620-01';
const configuredUnityBuildVersion = process.env.NEXT_PUBLIC_UNITY_BUILD_VERSION?.trim();
const staleUnityBuildVersions = new Set(['premium-2048-source-20260619-01', 'r2-under300-20260620-02']);
const unityBuildVersion = configuredUnityBuildVersion && !staleUnityBuildVersions.has(configuredUnityBuildVersion)
  ? configuredUnityBuildVersion
  : defaultUnityBuildVersion;
const connectionTimeoutMs = 45000;
const endGameFlowObjectName = 'Mochi_EndGameFlow';
const leaderboardDisplayNameStorageKey = 'mochiProtocol.leaderboardDisplayName';
const mochiLeaderboardSeasonStartUtc = Date.UTC(2026, 5, 19);
const enableBrowserEndgameDebug = process.env.NODE_ENV !== 'production';

const heroStats: StatBlock[] = [
  { value: 'Unity 2D', label: 'local gameplay' },
  { value: 'WebGL', label: 'browser demo' },
  { value: 'GenLayer', label: 'optional onchain layer' },
];

const controls: ControlHint[] = [
  { keyName: 'A / D', action: 'Move', note: 'Use Left and Right arrows too.' },
  { keyName: 'Space', action: 'Jump', note: 'Tap for a short hop. Hold for full height.' },
  { keyName: 'Left Shift', action: 'Dash', note: 'Unlocked after the Dash module.' },
  { keyName: 'J / Mouse 0', action: 'Melee', note: 'Close-range hit with a larger VFX arc.' },
  { keyName: 'K / Mouse 1', action: 'Fire', note: 'Ranged shot when the energy module is ready.' },
  { keyName: 'E', action: 'Interact', note: 'Doors, save stations, keys, and ability platforms.' },
  { keyName: 'Tab', action: 'Mochi System', note: 'Status, enemy data, keys, and modules.' },
  { keyName: 'Esc', action: 'Pause', note: 'Pause menu. Leaderboard lives on this website.' },
];

const playerTips = [
  'Save stations restore health. Stand beside the station and press E.',
  'Boss doors are meant to trap the fight until the boss is defeated.',
  'If a trap hits Mochi, the last safe standing spot matters.',
  'Dash gates and Double Jump gates need their matching keys or modules.',
  'Hold Space only as long as you need. Small jumps help in tight trap rooms.',
  'Use the Mochi System menu to check keys, modules, objectives, and enemy data.',
];

const genLayerLinks: LinkItem[] = [
  { label: 'GenLayer Docs', href: 'https://docs.genlayer.com/' },
  { label: 'GenLayer Studio', href: 'https://studio.genlayer.com/' },
  { label: 'Bradbury Explorer', href: 'https://explorer-bradbury.genlayer.com/' },
];

const proofMetrics: ProofMetric[] = [
  {
    value: 'Bradbury',
    label: 'Network',
    note: 'The public deployment runs on GenLayer Bradbury.',
  },
  {
    value: '3',
    label: 'Judgment paths',
    note: 'Guardian Oath, Final Decision, and Weekly Speedrun.',
  },
  {
    value: 'JSON',
    label: 'Decision output',
    note: 'accepted, score, category, title, and reason.',
  },
  {
    value: 'Best run',
    label: 'Leaderboard rule',
    note: 'A better accepted run updates the player record.',
  },
];

const passportSteps: PassportStep[] = [
  {
    label: 'Guardian Oath',
    status: 'JUDGED',
    description: 'The contract checks if the oath fits Mochi restoring the Core and consensus.',
  },
  {
    label: 'Final Decision',
    status: 'VERIFIED',
    description: 'The contract reads the boss and module flags plus the final restoration message.',
  },
  {
    label: 'Weekly Run',
    status: 'RANKED',
    description: 'The contract accepts rank-eligible runs and keeps the best player record for the week.',
  },
];

const asproEvidenceLinks: EvidenceLink[] = [
  {
    label: 'Mochi Protocol Adjudicator',
    href: 'https://explorer-bradbury.genlayer.com/tx/0xb65357735bee1ca393dbe7553c9cd01d8f63cd1cee2b16addca2e7e9311add7e',
    description: 'Our Bradbury Intelligent Contract for Guardian Oath, Final Decision, and Weekly Speedrun judgments.',
    meta: 'CA 0x2760...8A41 - Bradbury accepted',
    cta: 'Open deploy proof',
  },
  {
    label: 'Contract source',
    href: 'https://github.com/aspro45/MOCHI_PROTOCOL/blob/main/contracts/MochiProtocolAdjudicator.py',
    description: 'Public source for the Intelligent Contract used by the website integration.',
    meta: 'Python contract - GenLayer',
    cta: 'Open source',
  },
  {
    label: 'Contract tests',
    href: 'https://github.com/aspro45/MOCHI_PROTOCOL/blob/main/contracts/test_mochi_protocol_adjudicator.py',
    description: 'Local contract validation for oath, final decision, weekly runs, and leaderboard sorting.',
    meta: '12 checks - structured fields',
    cta: 'Open tests',
  },
];

const defaultLeaderboardWeekId = getCurrentWeekId();

const defaultWeeklyRunForm: WeeklyRunForm = {
  completionTimeSeconds: '',
  weekId: defaultLeaderboardWeekId,
  playerName: '',
  runNote: 'Clean run. Core restored.',
  dashUnlocked: true,
  doubleJumpUnlocked: true,
  scrapHoundDefeated: true,
  reactorTitanDefeated: true,
  coreRestored: true,
};

export default function GamePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const unityFrameRef = useRef<HTMLElement | null>(null);
  const playerNameInputRef = useRef<HTMLInputElement | null>(null);
  const latestAddressRef = useRef<string | undefined>(undefined);
  const connectRequestedRef = useRef(false);
  const wasConnectedRef = useRef(false);
  const connectionTimerRef = useRef<number | undefined>(undefined);
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();
  const [unityStatus, setUnityStatus] = useState<UnityLoaderStatus>('idle');
  const [unityProgress, setUnityProgress] = useState(0);
  const [unityTriedBuildUrls, setUnityTriedBuildUrls] = useState<string[]>([]);
  const [, setBridgeStatus] = useState('Onchain bridge ready.');
  const [leaderboardWeekId, setLeaderboardWeekId] = useState(defaultLeaderboardWeekId);
  const [leaderboardEntries, setLeaderboardEntries] = useState<WeeklyLeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardStatus, setLeaderboardStatus] = useState('Ready to load the onchain weekly leaderboard.');
  const [weeklyRunForm, setWeeklyRunForm] = useState<WeeklyRunForm>(defaultWeeklyRunForm);
  const [weeklyRunResult, setWeeklyRunResult] = useState<string | null>(null);
  const [isGameFullscreen, setIsGameFullscreen] = useState(false);
  const [unityRequested, setUnityRequested] = useState(false);

  useEffect(() => {
    const savedDisplayName = readSavedLeaderboardDisplayName();
    if (!savedDisplayName) {
      return;
    }

    setWeeklyRunForm((current) => ({ ...current, playerName: savedDisplayName }));
  }, []);

  useEffect(() => {
    if (isConnected && address) {
      latestAddressRef.current = address;
      wasConnectedRef.current = true;
      connectRequestedRef.current = false;
      window.clearTimeout(connectionTimerRef.current);
      setBridgeStatus(`Connected: ${shortAddress(address)}`);
      sendToUnity('OnWalletConnected', address);
      return;
    }

    if (!isConnected && wasConnectedRef.current) {
      latestAddressRef.current = undefined;
      wasConnectedRef.current = false;
      setBridgeStatus('Onchain bridge ready.');
      sendToUnity('OnWalletDisconnected');
    }
  }, [address, isConnected]);

  const requestWalletConnection = useCallback(() => {
    if (latestAddressRef.current) {
      sendToUnity('OnWalletConnected', latestAddressRef.current);
      setBridgeStatus(`Connected: ${shortAddress(latestAddressRef.current)}`);
      return;
    }

    if (!openConnectModal) {
      const error = 'Wallet connection is not available in this browser.';
      setBridgeStatus(`Failed: ${error}`);
      sendToUnity('OnOnchainError', error);
      return;
    }

    connectRequestedRef.current = true;
    setBridgeStatus('Connecting wallet...');
    openConnectModal();

    window.clearTimeout(connectionTimerRef.current);
    connectionTimerRef.current = window.setTimeout(() => {
      if (connectRequestedRef.current && !latestAddressRef.current) {
        connectRequestedRef.current = false;
        const error = 'Wallet connection was not completed.';
        setBridgeStatus(`Failed: ${error}`);
        sendToUnity('OnOnchainError', error);
      }
    }, connectionTimeoutMs);
  }, [openConnectModal]);

  const getWalletForSubmit = useCallback((): WalletContext | null => {
    const currentAddress = latestAddressRef.current;
    if (!currentAddress) {
      requestWalletConnection();
      const error = 'Connect wallet first to submit optional onchain records.';
      setBridgeStatus(error);
      sendToUnity('OnOnchainError', error);
      return null;
    }

    const provider = resolveWalletProvider(walletClient);
    if (!provider) {
      const error = 'Wallet provider is unavailable. Reconnect your wallet and try again.';
      setBridgeStatus(`Failed: ${error}`);
      sendToUnity('OnOnchainError', error);
      return null;
    }

    return { address: currentAddress as `0x${string}`, provider };
  }, [requestWalletConnection, walletClient]);

  const handleOnchainFailure = useCallback((error: unknown) => {
    const message = errorMessage(error);
    console.error('Mochi onchain call failed:', error);
    setBridgeStatus(`Failed: ${message}`);
    setLeaderboardStatus(`Failed: ${message}`);
    sendToUnity('OnOnchainError', message);
  }, []);

  const updateWriteStatus = useCallback((status: OnchainWriteStatus, txHash?: string) => {
    if (status === 'waitingForSignature') {
      setBridgeStatus('Waiting for wallet signature...');
      setLeaderboardStatus('Waiting for wallet signature...');
      return;
    }

    setBridgeStatus(txHash ? `Transaction pending: ${shortAddress(txHash)}` : 'Transaction pending...');
    setLeaderboardStatus(txHash ? `Transaction pending: ${shortAddress(txHash)}` : 'Transaction pending...');
  }, []);

  const loadWebsiteLeaderboard = useCallback(async (weekId?: string) => {
    const targetWeekId = normalizeWeekId(weekId || leaderboardWeekId || defaultLeaderboardWeekId);
    setLeaderboardLoading(true);
    setLeaderboardStatus(`Loading ${targetWeekId} from GenLayer...`);

    try {
      const entries = await getWeeklyLeaderboard(targetWeekId);
      setLeaderboardEntries(entries);
      setLeaderboardWeekId(targetWeekId);
      setWeeklyRunForm((current) => ({ ...current, weekId: targetWeekId }));
      setLeaderboardStatus(entries.length > 0 ? `Loaded ${entries.length} accepted onchain entries.` : 'No accepted onchain entries for this week yet.');
      sendToUnity('OnLeaderboardResult', JSON.stringify(entries));
      return entries;
    } catch (error) {
      const message = errorMessage(error);
      setLeaderboardStatus(`Failed: ${message}`);
      sendToUnity('OnOnchainError', message);
      return [];
    } finally {
      setLeaderboardLoading(false);
    }
  }, [leaderboardWeekId]);

  const focusLeaderboardDisplayName = useCallback((message: string) => {
    setLeaderboardStatus(message);
    setBridgeStatus(message);
    setWeeklyRunResult(message);
    sendToUnity('OnOnchainError', message);

    document.getElementById('leaderboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => playerNameInputRef.current?.focus(), 300);
  }, []);

  const hydrateWeeklyRunFormFromGame = useCallback((runData: WeeklyRunData) => {
    const completionTimeSeconds = Number(runData.completionTimeSeconds);
    const weekId = normalizeWeekId(runData.weekId || defaultLeaderboardWeekId);
    const incomingDisplayName = normalizeLeaderboardDisplayName(runData.playerName);
    const incomingRunNote = normalizeRunNote(runData.runNote);

    setLeaderboardWeekId(weekId);
    setWeeklyRunForm((current) => ({
      ...current,
      completionTimeSeconds: Number.isFinite(completionTimeSeconds) && completionTimeSeconds > 0
        ? completionTimeSeconds.toFixed(2)
        : current.completionTimeSeconds,
      weekId,
      playerName: normalizeLeaderboardDisplayName(current.playerName) || incomingDisplayName,
      runNote: incomingRunNote || current.runNote,
      dashUnlocked: Boolean(runData.dashUnlocked),
      doubleJumpUnlocked: Boolean(runData.doubleJumpUnlocked),
      scrapHoundDefeated: Boolean(runData.scrapHoundDefeated),
      reactorTitanDefeated: Boolean(runData.reactorTitanDefeated),
      coreRestored: Boolean(runData.coreRestored),
    }));
  }, []);

  const withLeaderboardDisplayName = useCallback((runData: WeeklyRunData): WeeklyRunData | null => {
    hydrateWeeklyRunFormFromGame(runData);

    const websiteDisplayName = normalizeLeaderboardDisplayName(weeklyRunForm.playerName);
    const incomingDisplayName = normalizeLeaderboardDisplayName(runData.playerName);
    let displayName = websiteDisplayName || incomingDisplayName;

    if (!isValidLeaderboardDisplayName(displayName) && typeof window !== 'undefined') {
      const fallbackName = latestAddressRef.current ? shortAddress(latestAddressRef.current).replace(/\./g, '') : 'aspro';
      const promptedName = normalizeLeaderboardDisplayName(
        window.prompt('Choose leaderboard display name', fallbackName) || '',
      );

      if (isValidLeaderboardDisplayName(promptedName)) {
        displayName = promptedName;
      }
    }

    if (!isValidLeaderboardDisplayName(displayName)) {
      focusLeaderboardDisplayName('Choose the leaderboard display name first, then submit again.');
      return null;
    }

    const weekId = normalizeWeekId(runData.weekId || defaultLeaderboardWeekId);
    const runNote = normalizeRunNote(runData.runNote);
    if (!runNote) {
      setLeaderboardStatus('Run note is required before submitting.');
      sendToUnity('OnOnchainError', 'Run note is required before submitting.');
      return null;
    }

    persistLeaderboardDisplayName(displayName);
    setWeeklyRunForm((current) => ({ ...current, playerName: displayName }));
    return { ...runData, weekId, playerName: displayName, runNote };
  }, [focusLeaderboardDisplayName, hydrateWeeklyRunFormFromGame, weeklyRunForm.playerName]);

  const submitWebsiteWeeklyRun = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const wallet = getWalletForSubmit();
    if (!wallet) {
      setLeaderboardStatus('Connect wallet first to submit a weekly run.');
      return;
    }

    const completionTimeSeconds = Number(weeklyRunForm.completionTimeSeconds);
    if (!Number.isFinite(completionTimeSeconds) || completionTimeSeconds <= 0) {
      setLeaderboardStatus('Enter a real completion time in seconds before submitting.');
      return;
    }

    const weekId = normalizeWeekId(weeklyRunForm.weekId);
    const playerName = normalizeLeaderboardDisplayName(weeklyRunForm.playerName);
    const runNote = normalizeRunNote(weeklyRunForm.runNote);
    if (!weekId || !runNote) {
      setLeaderboardStatus('Week ID, player name, and run note are required.');
      return;
    }

    if (!isValidLeaderboardDisplayName(playerName)) {
      focusLeaderboardDisplayName('Choose a leaderboard display name before submitting.');
      return;
    }

    persistLeaderboardDisplayName(playerName);
    setWeeklyRunForm((current) => ({ ...current, playerName }));

    const runData: WeeklyRunData = {
      completionTimeSeconds,
      dashUnlocked: weeklyRunForm.dashUnlocked,
      doubleJumpUnlocked: weeklyRunForm.doubleJumpUnlocked,
      scrapHoundDefeated: weeklyRunForm.scrapHoundDefeated,
      reactorTitanDefeated: weeklyRunForm.reactorTitanDefeated,
      coreRestored: weeklyRunForm.coreRestored,
      weekId,
      playerName,
      runNote,
    };

    try {
      setLeaderboardStatus('Submitting weekly run to GenLayer...');
      setWeeklyRunResult(null);
      const result = await submitWeeklyRunOnchain(runData, wallet, { onStatus: updateWriteStatus });
      const status = result.accepted && result.rankEligible ? 'Accepted' : 'Rejected';
      const resultText = `${status}: ${result.reason}`;
      setWeeklyRunResult(resultText);
      setLeaderboardStatus(resultText);
      sendToUnity('OnWeeklyRunResult', JSON.stringify(result));

      if (result.accepted && result.rankEligible) {
        await loadWebsiteLeaderboard(weekId);
      }
    } catch (error) {
      const message = errorMessage(error);
      setWeeklyRunResult(`Failed: ${message}`);
      setLeaderboardStatus(`Failed: ${message}`);
      sendToUnity('OnOnchainError', message);
    }
  }, [focusLeaderboardDisplayName, getWalletForSubmit, loadWebsiteLeaderboard, updateWriteStatus, weeklyRunForm]);

  const mochiOnchainApi = useMemo<MochiOnchainApi>(
    () => ({
      connectWallet: requestWalletConnection,
      submitGuardianOath: async (oathMessage: string) => {
        const wallet = getWalletForSubmit();
        if (!wallet) {
          return;
        }

        try {
          const cleanOathMessage = normalizeOnchainMessage(oathMessage, 180);
          if (!cleanOathMessage) {
            throw new Error('Guardian oath is empty.');
          }

          const result = await submitGuardianOathOnchain(cleanOathMessage, wallet, { onStatus: updateWriteStatus });
          setBridgeStatus(result.accepted ? `Accepted: ${result.reason}` : `Rejected: ${result.reason}`);
          sendToUnity('OnOathResult', JSON.stringify(result));
        } catch (error) {
          handleOnchainFailure(error);
        }
      },
      submitFinalDecision: async (finalMessage: string, progressJson: string) => {
        const wallet = getWalletForSubmit();
        if (!wallet) {
          return;
        }

        try {
          const progressData = parseJsonPayload<ProgressData>(progressJson, 'final progress');
          const cleanFinalMessage = normalizeOnchainMessage(finalMessage, 220);
          if (!cleanFinalMessage) {
            throw new Error('Final decision message is empty.');
          }

          const result = await submitFinalDecisionOnchain(progressData, cleanFinalMessage, wallet, {
            onStatus: updateWriteStatus,
          });
          setBridgeStatus(result.accepted ? `Accepted: ${result.reason}` : `Rejected: ${result.reason}`);
          sendToUnity('OnFinalDecisionResult', JSON.stringify(result));
        } catch (error) {
          handleOnchainFailure(error);
        }
      },
      submitWeeklyRun: async (runJson: string) => {
        const wallet = getWalletForSubmit();
        if (!wallet) {
          return;
        }

        try {
          const runData = withLeaderboardDisplayName(parseJsonPayload<WeeklyRunData>(runJson, 'weekly run'));
          if (!runData) {
            return;
          }

          const result = await submitWeeklyRunOnchain(runData, wallet, { onStatus: updateWriteStatus });
          const accepted = result.accepted && result.rankEligible;
          setBridgeStatus(accepted ? `Accepted: ${result.reason}` : `Rejected: ${result.reason}`);
          setWeeklyRunResult(accepted ? `Accepted: ${result.reason}` : `Rejected: ${result.reason}`);
          setLeaderboardStatus(accepted ? `Accepted: ${result.reason}` : `Rejected: ${result.reason}`);
          sendToUnity('OnWeeklyRunResult', JSON.stringify(result));
          if (accepted) {
            await loadWebsiteLeaderboard(runData.weekId);
          }
        } catch (error) {
          handleOnchainFailure(error);
        }
      },
      getWeeklyLeaderboard: async (weekId: string) => {
        const entries = await loadWebsiteLeaderboard(weekId);
        setBridgeStatus(`Leaderboard loaded: ${entries.length} entries.`);
        return entries;
      },
    }),
    [getWalletForSubmit, handleOnchainFailure, loadWebsiteLeaderboard, requestWalletConnection, updateWriteStatus, withLeaderboardDisplayName],
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreen = document.fullscreenElement === unityFrameRef.current;
      setIsGameFullscreen(fullscreen);
      getUnityInstance()?.SetFullscreen?.(fullscreen ? 1 : 0);

      window.requestAnimationFrame(() => {
        if (canvasRef.current) {
          syncUnityCanvasResolution(canvasRef.current);
        }
        window.dispatchEvent(new Event('resize'));
        canvasRef.current?.focus();
      });
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleGameFullscreen = useCallback(async () => {
    const frame = unityFrameRef.current;
    if (!frame) {
      return;
    }

    try {
      if (document.fullscreenElement === frame) {
        await document.exitFullscreen();
        return;
      }

      if (!document.fullscreenEnabled || !frame.requestFullscreen) {
        setBridgeStatus('Fullscreen is not available in this browser.');
        return;
      }

      await frame.requestFullscreen();
      if (canvasRef.current) {
        syncUnityCanvasResolution(canvasRef.current);
      }
      canvasRef.current?.focus();
      window.dispatchEvent(new Event('resize'));
    } catch (error) {
      setBridgeStatus(`Fullscreen failed: ${errorMessage(error)}`);
    }
  }, []);

  const startUnityGame = useCallback(() => {
    if (unityStatus === 'ready') {
      canvasRef.current?.focus();
      return;
    }

    if (unityStatus === 'loading') {
      return;
    }

    setUnityProgress(0);
    setUnityTriedBuildUrls([]);
    setUnityStatus('idle');
    setUnityRequested(true);
    setBridgeStatus('Starting Mochi Protocol...');
  }, [unityStatus]);

  useEffect(() => {
    installMochiOnchainGlobals(mochiOnchainApi);
    return () => clearMochiOnchainGlobals(mochiOnchainApi);
  }, [mochiOnchainApi]);

  useEffect(() => {
    if (!enableBrowserEndgameDebug) {
      delete window.mochiDebugFinalDecision;
      return;
    }

    const triggerFinalDecisionDebug = () => {
      const instance = getUnityInstance();
      if (!instance) {
        setBridgeStatus('Unity is still loading. Try F10 again after the game appears.');
        return false;
      }

      instance.SendMessage(endGameFlowObjectName, 'DebugShowFinalDecisionPanel');
      setBridgeStatus('Debug final decision panel opened.');
      return true;
    };

    window.mochiDebugFinalDecision = triggerFinalDecisionDebug;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F10' && event.code !== 'F10') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      triggerFinalDecisionDebug();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (window.mochiDebugFinalDecision === triggerFinalDecisionDebug) {
        delete window.mochiDebugFinalDecision;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const scriptElements: HTMLScriptElement[] = [];

    function removeUnityScript(script: HTMLScriptElement) {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    function loadUnityLoaderScript(loaderUrl: string) {
      return new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = loaderUrl;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          removeUnityScript(script);
          reject(new Error(`Unity loader not found at ${loaderUrl}`));
        };
        scriptElements.push(script);
        document.body.appendChild(script);
      });
    }

    async function loadUnity() {
      if (!unityRequested || !canvasRef.current || unityStatus !== 'idle') {
        return;
      }

      setUnityStatus('loading');

      const attemptedUrls: string[] = [];
      for (const buildBase of unityBuildBaseCandidates) {
        if (cancelled) {
          return;
        }

        const loaderUrl = withUnityBuildVersion(`${buildBase}/${unityBuildName}.loader.js`);
        attemptedUrls.push(loaderUrl);
        setUnityTriedBuildUrls([...attemptedUrls]);

        try {
          await loadUnityLoaderScript(loaderUrl);
        } catch (error) {
          console.warn(error);
          continue;
        }

        if (cancelled || !canvasRef.current || !window.createUnityInstance) {
          return;
        }

        try {
          const activeCanvas = canvasRef.current;
          syncUnityCanvasResolution(activeCanvas);

          const instance = await window.createUnityInstance(
            activeCanvas,
            {
              dataUrl: withUnityBuildVersion(`${buildBase}/${unityBuildName}.data`),
              frameworkUrl: withUnityBuildVersion(`${buildBase}/${unityBuildName}.framework.js`),
              codeUrl: withUnityBuildVersion(`${buildBase}/${unityBuildName}.wasm`),
              streamingAssetsUrl: unityStreamingAssetsUrl,
              companyName: 'Mochi Protocol',
              productName: 'Mochi Protocol',
              productVersion: '0.1',
              devicePixelRatio: getUnityDevicePixelRatio(),
              matchWebGLToCanvasSize: true,
            },
            (progress) => setUnityProgress(progress),
          );

          if (cancelled) {
            return;
          }

          setUnityInstance(instance);
          setUnityStatus('ready');
          setBridgeStatus(latestAddressRef.current ? `Connected: ${shortAddress(latestAddressRef.current)}` : 'Onchain bridge ready.');

          if (latestAddressRef.current) {
            sendToUnity('OnWalletConnected', latestAddressRef.current);
          }
          return;
        } catch (error) {
          setUnityStatus('failed');
          setUnityRequested(false);
          sendUnityError(error);
          return;
        }
      }

      if (!cancelled) {
        setUnityStatus('missing');
        setUnityRequested(false);
      }
    }

    loadUnity();

    return () => {
      cancelled = true;
      for (const script of scriptElements) {
        removeUnityScript(script);
      }
      setUnityInstance(null);
    };
  }, [unityRequested]);

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand-lockup" href="#home" aria-label="Mochi Protocol home">
          <img src="/site/mochi-face.png" alt="" />
          <span>
            <strong>MOCHI PROTOCOL</strong>
            <small>Robot cat Metroidvania demo</small>
          </span>
        </a>

        <nav className="site-nav" aria-label="Mochi website sections">
          <a href="#play">Play</a>
          <a href="#leaderboard">Leaderboard</a>
          <a href="#mission">Story</a>
          <a href="#controls">Controls</a>
          <a href="#genlayer">GenLayer</a>
          <a href="#community">Links</a>
        </nav>

        <div className="wallet-tools">
          <ConnectButton />
        </div>
      </header>

      <section className="hero" id="home">
        <div className="hero-backdrop" />
        <div className="hero-content">
          <img className="hero-logo" src="/site/mochi-logo.png" alt="Mochi Protocol" />
          <p className="hero-kicker">Cute sci-fi robot cat Metroidvania</p>
          <h1>Restore the Core. Reconnect consensus. Survive the Broken Core.</h1>
          <p className="hero-copy">
            Mochi is a tiny robot cat guardian inside a fractured network. This WebGL build is a playable demo with local gameplay, handcrafted Unity rooms, and optional GenLayer onchain moments.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#play">Play demo</a>
            <a className="secondary-link" href="#leaderboard">Leaderboard</a>
            <a className="secondary-link" href="#genlayer">Read GenLayer tech</a>
            <a className="ghost-link" href="https://x.com/ASPRO_22" target="_blank" rel="noreferrer">Follow ASPRO</a>
          </div>
          <div className="hero-stats" aria-label="Project stack">
            {heroStats.map((stat) => (
              <div className="stat-block" key={stat.value}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="play-section" id="play">
        <div className="section-heading">
          <span>PLAYABLE BUILD</span>
          <h2>Run the current demo in browser.</h2>
          <p>
            Wallet is not required. Connect only if you want to submit Guardian Oath, Final Decision, or weekly speedrun records through GenLayer.
          </p>
        </div>

        <section ref={unityFrameRef} className="unity-frame" aria-label="Mochi Protocol Unity WebGL game">
          <canvas ref={canvasRef} className="unity-canvas" id="unity-canvas" tabIndex={0} />
          <button
            className="fullscreen-button"
            type="button"
            onClick={toggleGameFullscreen}
            aria-label={isGameFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            <span aria-hidden="true">{isGameFullscreen ? 'EXIT' : 'FULL'}</span>
            <small>{isGameFullscreen ? 'SCREEN' : 'SCREEN'}</small>
          </button>
          {unityStatus !== 'ready' ? (
            <div className="unity-message">
              <div className="unity-message-inner">
                <h2>{unityStatusTitle(unityStatus)}</h2>
                <p>{unityStatusMessage(unityStatus, unityBuildName, unityProgress, unityTriedBuildUrls)}</p>
                {unityStatus === 'idle' || unityStatus === 'missing' || unityStatus === 'failed' ? (
                  <button className="start-game-button" type="button" onClick={startUnityGame}>
                    {unityStatus === 'idle' ? 'START GAME' : 'TRY AGAIN'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </section>

      <section className="leaderboard-section" id="leaderboard">
        <div className="section-heading">
          <span>ONCHAIN LEADERBOARD</span>
          <h2>Weekly Speedrun records now live on the website.</h2>
          <p>
            The pause menu stays focused on gameplay. The leaderboard uses RainbowKit wallet signing and GenLayerJS here, where onchain reads and submissions belong.
          </p>
        </div>

        <div className="leaderboard-shell">
          <article className="leaderboard-panel">
            <div className="leaderboard-toolbar">
              <label>
                <span>Week ID</span>
                <input
                  value={leaderboardWeekId}
                  onChange={(event) => {
                    setLeaderboardWeekId(event.target.value);
                    setWeeklyRunForm((current) => ({ ...current, weekId: event.target.value }));
                  }}
                  placeholder={defaultLeaderboardWeekId}
                />
              </label>
              <button type="button" onClick={() => loadWebsiteLeaderboard()} disabled={leaderboardLoading}>
                {leaderboardLoading ? 'LOADING' : 'REFRESH'}
              </button>
            </div>

            <div className="leaderboard-status">{leaderboardStatus}</div>

            <div className="leaderboard-table" aria-label="Weekly speedrun leaderboard">
              <div className="leaderboard-head">
                <span>Rank</span>
                <span>Player</span>
                <span>Time</span>
                <span>Score</span>
                <span>Status</span>
              </div>
              {leaderboardEntries.length > 0 ? (
                leaderboardEntries.map((entry, index) => (
                  <div className="leaderboard-row" key={`${entry.player}-${entry.playerName}-${entry.completionTimeSeconds}-${index}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{entry.playerName || shortAddress(entry.player || '0x')}</strong>
                    <span>{formatLeaderboardTime(entry.completionTimeSeconds)}</span>
                    <span>{entry.score}</span>
                    <span>{entry.rankEligible ? 'ACCEPTED' : 'REJECTED'}</span>
                  </div>
                ))
              ) : (
                <div className="leaderboard-empty">
                  No accepted onchain entries loaded for this week.
                </div>
              )}
            </div>
          </article>

          <form className="run-submit-card" onSubmit={submitWebsiteWeeklyRun}>
            <div>
              <span>SUBMIT RUN</span>
              <h3>Send a real demo completion to GenLayer.</h3>
              <p>Wallet is required only for this write transaction. Gameplay still works without connecting.</p>
            </div>

            <label>
              <span>Leaderboard display name</span>
              <input
                ref={playerNameInputRef}
                value={weeklyRunForm.playerName}
                onChange={(event) => setWeeklyRunForm((current) => ({ ...current, playerName: event.target.value.slice(0, 24) }))}
                placeholder="aspro"
                maxLength={24}
                autoComplete="nickname"
              />
              <small className="field-hint">This is the name shown on the leaderboard and reused for in-game submits.</small>
            </label>

            <div className="form-pair">
              <label>
                <span>Time in seconds</span>
                <input
                  value={weeklyRunForm.completionTimeSeconds}
                  onChange={(event) => setWeeklyRunForm((current) => ({ ...current, completionTimeSeconds: event.target.value }))}
                  placeholder="462.18"
                  inputMode="decimal"
                />
              </label>
              <label>
                <span>Week ID</span>
                <input
                  value={weeklyRunForm.weekId}
                  onChange={(event) => {
                    setWeeklyRunForm((current) => ({ ...current, weekId: event.target.value }));
                    setLeaderboardWeekId(event.target.value);
                  }}
                  placeholder={defaultLeaderboardWeekId}
                />
              </label>
            </div>

            <label>
              <span>Run note</span>
              <textarea
                value={weeklyRunForm.runNote}
                onChange={(event) => setWeeklyRunForm((current) => ({ ...current, runNote: event.target.value }))}
                placeholder="Clean run. Core restored."
                rows={3}
                maxLength={140}
              />
            </label>

            <div className="progress-checks" aria-label="Run progress flags">
              {([
                ['dashUnlocked', 'Dash'],
                ['doubleJumpUnlocked', 'Double Jump'],
                ['scrapHoundDefeated', 'Scrap Hound'],
                ['reactorTitanDefeated', 'Reactor Titan'],
                ['coreRestored', 'Core Restored'],
              ] as const).map(([key, label]) => (
                <label className="progress-check" key={key}>
                  <input
                    type="checkbox"
                    checked={weeklyRunForm[key]}
                    onChange={(event) => setWeeklyRunForm((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="submit-actions">
              <button type="button" onClick={requestWalletConnection}>
                {isConnected && address ? shortAddress(address) : 'CONNECT WALLET'}
              </button>
              <button type="submit">SUBMIT TO GENLAYER</button>
            </div>
            {weeklyRunResult ? <div className="weekly-result">{weeklyRunResult}</div> : null}
          </form>
        </div>
      </section>

      <section className="mission-grid" id="mission">
        <article className="story-panel feature-panel">
          <span>THE STORY</span>
          <h2>A fractured Intelligent Layer needs one stubborn little guardian.</h2>
          <p>
            Validators stopped agreeing. The Core fractured. Mochi enters the Broken Core to restore consensus, collect the Dash and Double Jump modules, defeat Scrap Hound, defeat Reactor Titan, and bring the network back online.
          </p>
          <p>
            This demo is still a slice of the full idea. Movement, combat, doors, save stations, traps, enemy data, bosses, and map art are built locally in Unity so the game stays fast.
          </p>
        </article>

        <article className="work-panel feature-panel">
          <span>HAND BUILT</span>
          <h2>Built with real Unity work, not a generated map.</h2>
          <p>
            The rooms are placed manually. Colliders are gameplay truth. Visual art is separate from physics. A lot of the work went into jump feel, trap recovery, boss doors, UI, sound balance, WebGL loading, and the GenLayer bridge.
          </p>
          <div className="mini-terminal">
            <code>ManualMap_Workspace.unity</code>
            <code>Unity 2D + C#</code>
            <code>Optional onchain records</code>
          </div>
        </article>
      </section>

      <section className="tips-section">
        <div className="section-heading compact">
          <span>PLAYER NOTES</span>
          <h2>Tips before entering the lab.</h2>
        </div>
        <div className="tips-grid">
          {playerTips.map((tip) => (
            <article className="tip-card" key={tip}>
              <p>{tip}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="controls-section" id="controls">
        <div className="section-heading compact">
          <span>CONTROLS</span>
          <h2>Keyboard and mouse controls.</h2>
        </div>
        <div className="controls-grid">
          {controls.map((control) => (
            <article className="control-row" key={`${control.keyName}-${control.action}`}>
              <kbd>{control.keyName}</kbd>
              <div>
                <strong>{control.action}</strong>
                <span>{control.note}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="boss-section" aria-label="Boss records">
        <div className="boss-copy">
          <span>DEMO BOSSES</span>
          <h2>Scrap Hound and Reactor Titan guard the route to restoration.</h2>
          <p>
            Boss fights lock the room, test your movement, and feed the enemy journal. Defeat state, keys, and final progress stay local unless you choose to submit an optional onchain record.
          </p>
        </div>
        <div className="boss-gallery">
          <article>
            <img src="/site/scrap-hound.png" alt="Scrap Hound boss record" />
            <strong>Scrap Hound</strong>
            <span>Boss door key check</span>
          </article>
          <article>
            <img src="/site/reactor-titan.png" alt="Reactor Titan boss record" />
            <strong>Reactor Titan</strong>
            <span>Core restoration gate</span>
          </article>
        </div>
      </section>

      <section className="genlayer-section" id="genlayer">
        <div className="section-heading">
          <span>GENLAYER TECH</span>
          <h2>Onchain where judgment matters. Local where gameplay must be fast.</h2>
          <p>
            Mochi Protocol uses GenLayer for optional Intelligent Contract moments. The contract can judge short natural-language submissions and run data, then return structured results like accepted, score, category, title, and reason.
          </p>
        </div>

        <div className="genlayer-grid">
          <article>
            <strong>Guardian Oath</strong>
            <p>At the beginning, a player can submit a short oath. The contract judges if it fits Mochi's mission to restore the Core and reconnect consensus.</p>
          </article>
          <article>
            <strong>Final Decision</strong>
            <p>At the end, the player can submit final progress plus a restoration message. The contract checks completion flags and story fit.</p>
          </article>
          <article>
            <strong>Weekly Speedrun</strong>
            <p>The website leaderboard submits completion time, progress flags, player name, and a run note. GenLayer decides if the entry is rank eligible.</p>
          </article>
        </div>

        <div className="proof-metrics-grid" aria-label="Live GenLayer proof metrics">
          {proofMetrics.map((metric) => (
            <article className="proof-metric" key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
              <p>{metric.note}</p>
            </article>
          ))}
        </div>

        <div className="proof-showcase">
          <article className="passport-panel">
            <span>MOCHI RESTORATION PASSPORT</span>
            <h3>One player path from story oath to ranked run.</h3>
            <p>
              The passport idea is simple: the game stays playable first, and every onchain submit becomes a readable player proof when the user chooses to sign it.
            </p>
            <div className="passport-steps">
              {passportSteps.map((step) => (
                <div className="passport-step" key={step.label}>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.description}</p>
                  </div>
                  <span>{step.status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="demo-video-panel">
            <span>DEMO VIDEO SLOT</span>
            <div className="video-placeholder" aria-label="Reserved space for Mochi Protocol demo video">
              <strong>16:9 gameplay capture</strong>
              <p>Drop the trailer or walkthrough here when the video is ready.</p>
            </div>
            <p>
              Suggested flow: intro, movement, one trap room, one boss moment, final completion screen, then the GenLayer submit result.
            </p>
          </article>
        </div>

        <div className="aspro-evidence-board">
          <div>
            <span>ASPRO ONCHAIN CONTRACT</span>
            <h3>The live GenLayer contract used by Mochi Protocol.</h3>
            <p>This is the contract connected to the website and Unity bridge. It judges player messages and run submissions, then returns accepted, score, category, title, and reason.</p>
          </div>
          <div className="aspro-evidence-grid">
            {asproEvidenceLinks.map((link) => (
              <a href={link.href} target="_blank" rel="noreferrer" key={link.href}>
                <strong>{link.label}</strong>
                <span>{link.description}</span>
                <span className="evidence-meta">{link.meta}</span>
                <small>{link.cta}</small>
              </a>
            ))}
          </div>
        </div>

        <div className="local-rule">
          <strong>What stays local:</strong>
          <span>movement, dash, double jump, traps, doors, enemies, bosses, checkpoints, and save data.</span>
        </div>
      </section>

      <section className="links-section" id="community">
        <div>
          <span>COMMUNITY</span>
          <h2>Follow the build and the tech.</h2>
          <p>
            Questions about Mochi Protocol, the Unity build, or the onchain experiment? Reach ASPRO on X or Discord.
          </p>
        </div>
        <div className="link-cluster">
          <a href="https://x.com/ASPRO_22" target="_blank" rel="noreferrer">ASPRO on X</a>
          <a href="https://x.com/GenLayer" target="_blank" rel="noreferrer">GenLayer on X</a>
          <span>Discord: aspro.02</span>
          {genLayerLinks.map((link) => (
            <a href={link.href} target="_blank" rel="noreferrer" key={link.href}>{link.label}</a>
          ))}
        </div>
      </section>
    </main>
  );
}

function normalizeUnityBuildBase(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function uniqueUnityBuildBases(values: string[]) {
  return values.map(normalizeUnityBuildBase).filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
}

function withUnityBuildVersion(url: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(unityBuildVersion)}`;
}

function getUnityDevicePixelRatio() {
  if (typeof window === 'undefined') {
    return 1;
  }

  return Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
}

function syncUnityCanvasResolution(canvas: HTMLCanvasElement) {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return;
  }

  const pixelRatio = getUnityDevicePixelRatio();
  let targetWidth = Math.round(bounds.width * pixelRatio);
  let targetHeight = Math.round(bounds.height * pixelRatio);
  const maxWidth = 2560;
  const maxHeight = 1440;
  const downscale = Math.min(1, maxWidth / targetWidth, maxHeight / targetHeight);

  targetWidth = Math.max(1280, Math.round(targetWidth * downscale));
  targetHeight = Math.max(720, Math.round(targetHeight * downscale));

  if (Math.abs(canvas.width - targetWidth) > 2 || Math.abs(canvas.height - targetHeight) > 2) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
}

function unityStatusTitle(status: UnityLoaderStatus) {
  if (status === 'loading') {
    return 'LOADING UNITY';
  }

  if (status === 'missing') {
    return 'UNITY BUILD NOT FOUND';
  }

  if (status === 'failed') {
    return 'UNITY LOAD FAILED';
  }

  return 'READY TO START';
}

function unityStatusMessage(status: UnityLoaderStatus, buildName: string, progress: number, attemptedUrls: string[] = []) {
  const latestAttempt = attemptedUrls[attemptedUrls.length - 1];

  if (status === 'loading') {
    return latestAttempt
      ? `Loading WebGL build ${Math.round(progress * 100)}% from ${stripUnityVersionForDisplay(latestAttempt)}.`
      : `Loading WebGL build ${Math.round(progress * 100)}%.`;
  }

  if (status === 'missing') {
    const attempted = attemptedUrls.length > 0
      ? ` Tried: ${attemptedUrls.map(stripUnityVersionForDisplay).join(' | ')}`
      : '';
    return `Unity build is not available at any configured Build URL. Expected ${buildName}.loader.js, ${buildName}.data, ${buildName}.framework.js, and ${buildName}.wasm.${attempted}`;
  }

  if (status === 'failed') {
    return 'The Unity loader reported an error. Wallet and GenLayer bridge testing stays available and gameplay is not blocked.';
  }

  return 'Press START GAME when you want to load the Unity demo. Wallet stays optional.';
}

function stripUnityVersionForDisplay(url: string) {
  return url.replace(/[?&]v=[^&]+/, '');
}

function shortAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getCurrentWeekId() {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const elapsedDays = Math.floor((todayUtc - mochiLeaderboardSeasonStartUtc) / 86400000);
  const week = Math.max(1, Math.floor(elapsedDays / 7) + 1);
  return `WEEK-${String(week).padStart(2, '0')}`;
}

function formatLeaderboardTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--:--.--';
  }

  const centiseconds = Math.round(seconds * 100);
  const minutes = Math.floor(centiseconds / 6000);
  const remaining = centiseconds % 6000;
  const wholeSeconds = Math.floor(remaining / 100);
  const hundredths = remaining % 100;
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function resolveWalletProvider(walletClient: unknown): EthereumProviderLike | null {
  const transport = (walletClient as { transport?: EthereumProviderLike } | undefined)?.transport;
  if (transport?.request) {
    return transport;
  }

  const injected = typeof window !== 'undefined' ? (window.ethereum as EthereumProviderLike | undefined) : undefined;
  if (injected?.request) {
    return injected;
  }

  return null;
}

function parseJsonPayload<T>(json: string, label: string): T {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Expected a JSON object.');
    }

    return parsed as T;
  } catch (error) {
    throw new Error(`Invalid ${label} JSON from Unity: ${errorMessage(error)}`);
  }
}

function readSavedLeaderboardDisplayName() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return normalizeLeaderboardDisplayName(window.localStorage.getItem(leaderboardDisplayNameStorageKey) || '');
  } catch {
    return '';
  }
}

function persistLeaderboardDisplayName(displayName: string) {
  const normalized = normalizeLeaderboardDisplayName(displayName);
  if (!normalized || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(leaderboardDisplayNameStorageKey, normalized);
  } catch {
    // Local storage can be disabled in strict browser modes. Submissions can still continue.
  }
}

function normalizeLeaderboardDisplayName(displayName: string | undefined) {
  return (displayName || '')
    .replace(/[^\w .-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}

function normalizeWeekId(weekId: string | undefined) {
  const cleaned = (weekId || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_.-]/g, '')
    .slice(0, 24);

  if (!cleaned || /^\d{4}-W\d{2}$/.test(cleaned)) {
    return getCurrentWeekId();
  }

  return cleaned;
}

function normalizeRunNote(runNote: string | undefined) {
  return normalizeOnchainMessage(runNote, 140);
}

function normalizeOnchainMessage(message: string | undefined, maxLength: number) {
  return (message || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isValidLeaderboardDisplayName(displayName: string) {
  return /^[A-Za-z0-9_. -]{1,24}$/.test(displayName.trim());
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (!error || typeof error !== 'object') {
    return String(error);
  }

  const record = error as Record<string, unknown>;
  const message = record.message ?? (record.error as Record<string, unknown> | undefined)?.message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  const details = [
    typeof record.code !== 'undefined' ? `code ${String(record.code)}` : '',
    typeof record.data === 'string' ? record.data : '',
  ].filter(Boolean);

  if (details.length > 0) {
    return details.join(': ');
  }

  try {
    return JSON.stringify(record);
  } catch {
    return String(error);
  }
}








