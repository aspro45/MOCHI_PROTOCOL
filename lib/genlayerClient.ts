import { abi, createClient } from 'genlayer-js';
import { studionet, testnetBradbury } from 'genlayer-js/chains';
import { ExecutionResult, TransactionStatus, type CalldataEncodable } from 'genlayer-js/types';
import type { Address } from 'viem';

type FixedCategory = 'guardian_oath' | 'final_decision' | 'weekly_speedrun';
type GenLayerNetworkKey = 'bradbury' | 'studionet';

export type EthereumProviderLike = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
};

export type WalletContext = {
  address: Address;
  provider: EthereumProviderLike;
};

export type ProgressData = {
  dashUnlocked: boolean;
  doubleJumpUnlocked: boolean;
  scrapHoundDefeated: boolean;
  reactorTitanDefeated: boolean;
  coreRestored: boolean;
};

export type WeeklyRunData = ProgressData & {
  completionTimeSeconds: number;
  completionTimeCentiseconds?: number;
  weekId: string;
  playerName: string;
  runNote: string;
};

export type MochiJudgmentResult<C extends FixedCategory = FixedCategory> = {
  accepted: boolean;
  score: number;
  category: C;
  reason: string;
  title: string;
  rankEligible?: boolean;
  txHash?: string;
};

export type WeeklyRunResult = MochiJudgmentResult<'weekly_speedrun'> & {
  rankEligible: boolean;
};

export type WeeklyLeaderboardEntry = WeeklyRunData & {
  player: string;
  completionTimeCentiseconds?: number;
  accepted: boolean;
  score: number;
  category: 'weekly_speedrun';
  reason: string;
  rankEligible: boolean;
  title: string;
  progressData?: ProgressData;
};

export type OnchainWriteStatus = 'waitingForSignature' | 'transactionPending';

export type OnchainWriteOptions = {
  onStatus?: (status: OnchainWriteStatus, txHash?: string) => void;
};

const GENLAYER_NETWORKS: Record<
  GenLayerNetworkKey,
  {
    chain: typeof testnetBradbury;
    chainId: number;
    rpcUrl: string;
  }
> = {
  bradbury: {
    chain: testnetBradbury,
    chainId: 4221,
    rpcUrl: 'https://rpc-bradbury.genlayer.com',
  },
  studionet: {
    chain: studionet as typeof testnetBradbury,
    chainId: 61999,
    rpcUrl: 'https://studio.genlayer.com/api',
  },
};

export async function submitGuardianOath(
  oathMessage: string,
  wallet: WalletContext,
  options?: OnchainWriteOptions,
) {
  return writeMochiJudgment('submit_guardian_oath', [oathMessage], 'guardian_oath', wallet, options);
}

export async function submitFinalDecision(
  progressData: ProgressData,
  finalMessage: string,
  wallet: WalletContext,
  options?: OnchainWriteOptions,
) {
  return writeMochiJudgment('submit_final_decision', [progressData, finalMessage], 'final_decision', wallet, options);
}

export async function submitWeeklyRun(runData: WeeklyRunData, wallet: WalletContext, options?: OnchainWriteOptions) {
  return writeMochiJudgment(
    'submit_weekly_run',
    [toCalldataSafeWeeklyRunData(runData)],
    'weekly_speedrun',
    wallet,
    options,
  ) as Promise<WeeklyRunResult>;
}

export async function getWeeklyLeaderboard(weekId: string) {
  const readClient = createReadClient();
  const result = await readClient.readContract({
    address: getContractAddress(),
    functionName: 'get_weekly_leaderboard',
    args: [weekId],
  });

  const plainResult = toPlainJsonSafe(result);
  return normalizeLeaderboardEntries(Array.isArray(plainResult) ? (plainResult as WeeklyLeaderboardEntry[]) : []);
}

export async function getPlayerRecord(player: Address | string) {
  const readClient = createReadClient();
  return toPlainJsonSafe(
    await readClient.readContract({
      address: getContractAddress(),
      functionName: 'get_player_record',
      args: [player],
    }),
  );
}

async function writeMochiJudgment(
  functionName: string,
  args: unknown[],
  category: FixedCategory,
  wallet: WalletContext,
  options?: OnchainWriteOptions,
): Promise<MochiJudgmentResult> {
  const readClient = createReadClient();
  const writeClient = createWriteClient(wallet);

  await ensureWalletOnConfiguredNetwork(wallet.provider);

  options?.onStatus?.('waitingForSignature');
  const txHash = await writeClient.writeContract({
    address: getContractAddress(),
    functionName,
    args: args as CalldataEncodable[],
    value: BigInt(0),
  });

  options?.onStatus?.('transactionPending', txHash);
  let receipt: unknown = null;
  let receiptError: unknown = null;
  try {
    receipt = await readClient.waitForTransactionReceipt({
      hash: txHash,
      status: getReceiptStatus(),
      interval: getReceiptIntervalMs(),
      retries: getReceiptRetries(),
    } as never);
  } catch (error) {
    receiptError = error;
  }

  if (receipt != null) {
    assertTransactionDidNotError(receipt);
  }

  const parsedFromReceipt = findMochiResult(receipt, category);
  if (parsedFromReceipt) {
    return { ...parsedFromReceipt, txHash };
  }

  const parsedFromTransaction = await getResultFromTransaction(readClient, txHash, category);
  if (parsedFromTransaction) {
    return { ...parsedFromTransaction, txHash };
  }

  const parsedFromTrace = await getResultFromDebugTrace(readClient, txHash, category);
  if (parsedFromTrace) {
    return { ...parsedFromTrace, txHash };
  }

  const parsedFromStorage = await getStoredResultAfterWrite(readClient, wallet.address, category, args);
  if (parsedFromStorage) {
    return { ...parsedFromStorage, txHash };
  }

  if (receiptError != null) {
    const message = formatErrorDetail(receiptError);
    if (message.toLowerCase().includes('timed out waiting for transaction')) {
      throw new Error(
        `GenLayer transaction is still processing on Bradbury, not rejected. Wait a little and refresh/check again. Tx: ${txHash}`,
      );
    }

    throw receiptError;
  }

  throw new Error(
    `GenLayer accepted the transaction, but no ${category} judgment was found in return data or accepted contract storage. The submission may have been rejected before storage.`,
  );
}

function createReadClient() {
  return createClient({ chain: getNetworkChain() });
}

function createWriteClient(wallet: WalletContext) {
  return createClient({
    chain: getNetworkChain(),
    account: wallet.address,
    provider: wallet.provider,
  });
}

function getNetworkKey(): GenLayerNetworkKey {
  const configured = process.env.NEXT_PUBLIC_GENLAYER_CHAIN?.trim().toLowerCase();
  if (!configured || configured === 'bradbury' || configured === 'testnet-bradbury' || configured === 'testnet_bradbury') {
    return 'bradbury';
  }

  if (configured === 'studionet') {
    return 'studionet';
  }

  throw new Error(`Unsupported GenLayer network: ${configured}`);
}

function getNetworkConfig() {
  return GENLAYER_NETWORKS[getNetworkKey()];
}

function getNetworkChain() {
  const networkConfig = getNetworkConfig();
  const configuredChainId = process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID?.trim();
  if (configuredChainId && Number(configuredChainId) !== networkConfig.chainId) {
    throw new Error(`GenLayer ${networkConfig.chain.name} chain ID must be ${networkConfig.chainId}.`);
  }

  return {
    ...networkConfig.chain,
    id: networkConfig.chainId,
    rpcUrls: {
      ...networkConfig.chain.rpcUrls,
      default: {
        http: [process.env.NEXT_PUBLIC_GENLAYER_RPC_URL?.trim() || networkConfig.rpcUrl],
      },
    },
  };
}

function getContractAddress() {
  const address = process.env.NEXT_PUBLIC_MOCHI_ADJUDICATOR_ADDRESS?.trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address) || /^0x0{40}$/i.test(address)) {
    throw new Error('MochiProtocolAdjudicator address is not configured.');
  }

  return address as Address;
}

async function ensureWalletOnConfiguredNetwork(provider: EthereumProviderLike) {
  const networkConfig = getNetworkConfig();
  const chain = getNetworkChain();
  const expectedChainIdHex = `0x${networkConfig.chainId.toString(16)}`;
  const currentChainId = await provider.request({ method: 'eth_chainId' });

  if (typeof currentChainId === 'string' && currentChainId.toLowerCase() === expectedChainIdHex.toLowerCase()) {
    return;
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: expectedChainIdHex }],
    });
    return;
  } catch (switchError) {
    const code = getErrorCode(switchError);
    if (code !== 4902 && code !== -32603) {
      throw new Error(`Switch wallet to ${chain.name} (${networkConfig.chainId}) and try again. ${formatErrorDetail(switchError)}`);
    }
  }

  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: expectedChainIdHex,
        chainName: chain.name,
        rpcUrls: chain.rpcUrls.default.http,
        nativeCurrency: chain.nativeCurrency,
        blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : undefined,
      },
    ],
  });

  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: expectedChainIdHex }],
  });
}

function normalizeLeaderboardEntries(entries: WeeklyLeaderboardEntry[]) {
  return entries
    .map((entry) => ({
      ...entry,
      completionTimeSeconds: normalizeCompletionSeconds(entry),
    }))
    .filter((entry) => entry.accepted && entry.rankEligible)
    .sort((a, b) => {
      if (a.completionTimeSeconds !== b.completionTimeSeconds) {
        return a.completionTimeSeconds - b.completionTimeSeconds;
      }

      return b.score - a.score;
    });
}

function toCalldataSafeWeeklyRunData(runData: WeeklyRunData): WeeklyRunData {
  const seconds = Number(runData.completionTimeSeconds);
  const fallbackCentiseconds = Number(runData.completionTimeCentiseconds);
  const completionTimeCentiseconds = Number.isFinite(fallbackCentiseconds) && fallbackCentiseconds > 0
    ? Math.max(1, Math.round(fallbackCentiseconds))
    : Math.max(1, Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 100));

  // Bradbury calldata currently rejects decimal inputs like 731.92, so the
  // legacy seconds field must be a whole number. The centiseconds field keeps
  // the precise run time available for contracts that read it.
  return {
    ...runData,
    completionTimeSeconds: Math.max(1, Math.round(completionTimeCentiseconds / 100)),
    completionTimeCentiseconds,
  };
}

function getReceiptStatus() {
  return process.env.NEXT_PUBLIC_GENLAYER_RECEIPT_STATUS?.trim().toUpperCase() === 'FINALIZED'
    ? TransactionStatus.FINALIZED
    : TransactionStatus.ACCEPTED;
}

function getReceiptIntervalMs() {
  return numberFromEnv('NEXT_PUBLIC_GENLAYER_RECEIPT_INTERVAL_MS', 3000, 500, 30000);
}

function getReceiptRetries() {
  return numberFromEnv('NEXT_PUBLIC_GENLAYER_RECEIPT_RETRIES', 180, 1, 600);
}

function numberFromEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

function assertTransactionDidNotError(receipt: unknown) {
  const executionName = findDeepString(receipt, 'txExecutionResultName');
  if (executionName === ExecutionResult.FINISHED_WITH_ERROR) {
    throw new Error('GenLayer transaction finished with a contract execution error.');
  }

  const resultName = findDeepString(receipt, 'resultName');
  if (resultName === 'FAILURE') {
    throw new Error('GenLayer transaction failed.');
  }
}

async function getResultFromTransaction(readClient: ReturnType<typeof createReadClient>, txHash: string, category: FixedCategory) {
  try {
    const transaction = await readClient.getTransaction({ hash: txHash as never });
    assertTransactionDidNotError(transaction);
    return findMochiResult(transaction, category);
  } catch {
    return null;
  }
}

async function getResultFromDebugTrace(readClient: ReturnType<typeof createReadClient>, txHash: string, category: FixedCategory) {
  try {
    const trace = await readClient.debugTraceTransaction({ hash: txHash as never, round: 0 });
    return findMochiResult(trace, category);
  } catch {
    return null;
  }
}

async function getStoredResultAfterWrite(
  readClient: ReturnType<typeof createReadClient>,
  player: Address,
  category: FixedCategory,
  args: unknown[],
) {
  if (category === 'weekly_speedrun') {
    const runData = args[0] as Partial<WeeklyRunData> | undefined;
    const weekId = typeof runData?.weekId === 'string' ? runData.weekId : '';
    if (!weekId) {
      return null;
    }

    const bestRun = await readStoredBestWeeklyRun(readClient, player, weekId);
    if (bestRun) {
      return bestRun;
    }

    const leaderboardRun = await readStoredLeaderboardRun(readClient, player, weekId, runData);
    if (leaderboardRun) {
      return leaderboardRun;
    }
  }

  const record = await readStoredPlayerRecord(readClient, player);
  if (!record || typeof record !== 'object') {
    return null;
  }

  const key = category === 'guardian_oath' ? 'guardianOath' : category === 'final_decision' ? 'finalDecision' : '';
  if (!key) {
    return null;
  }

  const stored = (record as Record<string, unknown>)[key];
  if (stored && typeof stored === 'object' && isMochiResultObject(stored as Record<string, unknown>, category)) {
    return normalizeMochiResult(stored as Record<string, unknown>, category);
  }

  return null;
}

async function readStoredPlayerRecord(readClient: ReturnType<typeof createReadClient>, player: Address) {
  for (const playerKey of playerLookupKeys(player)) {
    try {
      const record = toPlainJsonSafe(
        await readClient.readContract({
          address: getContractAddress(),
          functionName: 'get_player_record',
          args: [playerKey],
        }),
      );

      if (record && typeof record === 'object') {
        const hasOath = hasNonEmptyObject((record as Record<string, unknown>).guardianOath);
        const hasFinal = hasNonEmptyObject((record as Record<string, unknown>).finalDecision);
        const hasRuns = Array.isArray((record as Record<string, unknown>).bestWeeklyRuns)
          && ((record as Record<string, unknown>).bestWeeklyRuns as unknown[]).length > 0;

        if (hasOath || hasFinal || hasRuns) {
          return record;
        }
      }
    } catch {
      // Try the next address casing. Some early Studio records used a plain sender string.
    }
  }

  return null;
}

async function readStoredBestWeeklyRun(readClient: ReturnType<typeof createReadClient>, player: Address, weekId: string) {
  for (const playerKey of playerLookupKeys(player)) {
    try {
      const record = toPlainJsonSafe(
        await readClient.readContract({
          address: getContractAddress(),
          functionName: 'get_player_best_run',
          args: [playerKey, weekId],
        }),
      );

      if (record && typeof record === 'object' && isMochiResultObject(record as Record<string, unknown>, 'weekly_speedrun')) {
        return normalizeMochiResult(record as Record<string, unknown>, 'weekly_speedrun') as WeeklyRunResult;
      }
    } catch {
      // Try the next address casing.
    }
  }

  return null;
}

async function readStoredLeaderboardRun(
  readClient: ReturnType<typeof createReadClient>,
  player: Address,
  weekId: string,
  runData: Partial<WeeklyRunData> | undefined,
) {
  try {
    const entries = toPlainJsonSafe(
      await readClient.readContract({
        address: getContractAddress(),
        functionName: 'get_weekly_leaderboard',
        args: [weekId],
      }),
    );

    if (!Array.isArray(entries)) {
      return null;
    }

    const playerKeys = new Set(playerLookupKeys(player).map((key) => key.toLowerCase()));
    const expectedTime = Number(runData?.completionTimeSeconds);
    const expectedName = typeof runData?.playerName === 'string' ? runData.playerName.trim().toLowerCase() : '';
    const match = entries.find((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }

      const record = entry as Record<string, unknown>;
      const playerMatches = typeof record.player === 'string' && playerKeys.has(record.player.toLowerCase());
      const nameMatches = expectedName !== '' && typeof record.playerName === 'string' && record.playerName.trim().toLowerCase() === expectedName;
      const timeMatches = Number.isFinite(expectedTime)
        && Math.abs(normalizeCompletionSeconds(record) - expectedTime) < 0.01;

      return playerMatches && (nameMatches || timeMatches);
    });

    if (match && typeof match === 'object' && isMochiResultObject(match as Record<string, unknown>, 'weekly_speedrun')) {
      return normalizeMochiResult(match as Record<string, unknown>, 'weekly_speedrun') as WeeklyRunResult;
    }
  } catch {
    return null;
  }

  return null;
}

function playerLookupKeys(player: Address) {
  return Array.from(new Set([player, player.toLowerCase(), player.toUpperCase()]));
}

function hasNonEmptyObject(value: unknown) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length > 0);
}

function normalizeCompletionSeconds(entry: Partial<WeeklyLeaderboardEntry> | Record<string, unknown>) {
  const centiseconds = Number((entry as Record<string, unknown>).completionTimeCentiseconds);
  if (Number.isFinite(centiseconds) && centiseconds > 0) {
    return centiseconds / 100;
  }

  const seconds = Number((entry as Record<string, unknown>).completionTimeSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function findMochiResult(value: unknown, category: FixedCategory, seen = new WeakSet<object>()): MochiJudgmentResult | null {
  for (const decoded of decodePotentialPayloads(value)) {
    const found = findMochiResult(decoded, category, seen);
    if (found) {
      return found;
    }
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  if (isMochiResultObject(record, category)) {
    return normalizeMochiResult(record, category);
  }

  for (const nested of Object.values(record)) {
    const found = findMochiResult(nested, category, seen);
    if (found) {
      return found;
    }
  }

  return null;
}

function decodePotentialPayloads(value: unknown) {
  if (typeof value !== 'string') {
    return [];
  }

  const candidates: unknown[] = [];
  const trimmed = value.trim();

  const parsedJson = parseJsonCandidate(trimmed);
  if (parsedJson !== null) {
    candidates.push(parsedJson);
  }

  const parsedJsonSlice = parseJsonCandidate(extractJsonSlice(trimmed));
  if (parsedJsonSlice !== null) {
    candidates.push(parsedJsonSlice);
  }

  for (const bytes of decodeStringToBytes(trimmed)) {
    candidates.push(...decodeResultBytes(bytes));
  }

  return candidates;
}

function parseJsonCandidate(value: string) {
  if (!value || (!value.startsWith('{') && !value.startsWith('['))) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractJsonSlice(value: string) {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return '';
  }

  return value.slice(start, end + 1);
}

function decodeStringToBytes(value: string) {
  const bytes: Uint8Array[] = [];
  if (/^0x[a-fA-F0-9]+$/.test(value) && value.length % 2 === 0) {
    bytes.push(hexToBytes(value));
  }

  if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length % 4 === 0) {
    const decoded = base64ToBytes(value);
    if (decoded.length > 0) {
      bytes.push(decoded);
    }
  }

  return bytes;
}

function decodeResultBytes(bytes: Uint8Array) {
  const candidates: unknown[] = [];
  if (bytes.length === 0) {
    return candidates;
  }

  const payload = bytes[0] === 0 || bytes[0] === 1 || bytes[0] === 2 ? bytes.slice(1) : bytes;
  if (bytes[0] === 0) {
    try {
      candidates.push(abi.calldata.decode(payload));
    } catch {
      // Some networks return plain JSON in return_data. The text path below covers that.
    }
  }

  try {
    const text = new TextDecoder('utf-8').decode(payload).trim();
    const parsed = parseJsonCandidate(text) ?? parseJsonCandidate(extractJsonSlice(text));
    if (parsed !== null) {
      candidates.push(parsed);
    }
  } catch {
    // Not a UTF-8 JSON payload.
  }

  return candidates;
}

function hexToBytes(hex: string) {
  const clean = hex.slice(2);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

function base64ToBytes(value: string) {
  try {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  } catch {
    return new Uint8Array();
  }
}

function isMochiResultObject(record: Record<string, unknown>, category: FixedCategory) {
  if (record.category !== category || typeof record.accepted !== 'boolean') {
    return false;
  }

  if (!isFiniteScore(record.score) || typeof record.reason !== 'string' || typeof record.title !== 'string') {
    return false;
  }

  if (category === 'weekly_speedrun' && typeof record.rankEligible !== 'boolean') {
    return false;
  }

  return true;
}

function normalizeMochiResult(record: Record<string, unknown>, category: FixedCategory): MochiJudgmentResult {
  const result: MochiJudgmentResult = {
    accepted: Boolean(record.accepted),
    score: clampScore(record.score),
    category,
    reason: String(record.reason).slice(0, 120),
    title: String(record.title).slice(0, 80),
  };

  if (category === 'weekly_speedrun') {
    result.rankEligible = Boolean(record.rankEligible);
  }

  return result;
}

function isFiniteScore(score: unknown) {
  if (typeof score === 'bigint') {
    return true;
  }

  return Number.isFinite(Number(score));
}

function clampScore(score: unknown) {
  const numeric = typeof score === 'bigint' ? Number(score) : Number(score);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function findDeepString(value: unknown, key: string, seen = new WeakSet<object>()): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  if (typeof record[key] === 'string') {
    return record[key] as string;
  }

  for (const nested of Object.values(record)) {
    const found = findDeepString(nested, key, seen);
    if (found) {
      return found;
    }
  }

  return null;
}

function toPlainJsonSafe(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => toPlainJsonSafe(item, seen));
  }

  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries()).map(([key, item]) => [key, toPlainJsonSafe(item, seen)]));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toPlainJsonSafe(item, seen)]),
  );
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  const code = record.code ?? (record.error as Record<string, unknown> | undefined)?.code;
  return typeof code === 'number' ? code : Number(code);
}

function formatErrorDetail(error: unknown) {
  if (!error) {
    return '';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error !== 'object') {
    return String(error);
  }

  const record = error as Record<string, unknown>;
  const message = record.message ?? (record.error as Record<string, unknown> | undefined)?.message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  try {
    return JSON.stringify(toPlainJsonSafe(error));
  } catch {
    return String(error);
  }
}
