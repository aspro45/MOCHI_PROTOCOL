# Mochi Protocol Web Wrapper

React / Next.js wrapper for the Unity WebGL game.

Current scope:

- RainbowKit wallet connection.
- wagmi / viem provider setup.
- Unity WebGL loader shell.
- Real GenLayerJS calls for MochiProtocolAdjudicator.
- Optional wallet flow; gameplay still runs without wallet.
- No private keys or secrets.

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

For WalletConnect QR/mobile wallets, set a real `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `.env.local`.
Injected browser wallets can still be used for local smoke tests.

Set the deployed or Studio-connected contract address before testing real submissions:

```text
NEXT_PUBLIC_GENLAYER_CHAIN=bradbury
NEXT_PUBLIC_GENLAYER_RPC_URL=https://rpc-bradbury.genlayer.com
NEXT_PUBLIC_GENLAYER_CHAIN_ID=4221
NEXT_PUBLIC_MOCHI_ADJUDICATOR_ADDRESS=0xYourMochiProtocolAdjudicatorAddress
NEXT_PUBLIC_GENLAYER_RECEIPT_STATUS=ACCEPTED
```

## Bradbury Deployment

Network:

```text
GenLayer Bradbury Testnet
RPC: https://rpc-bradbury.genlayer.com
Chain ID: 4221
Currency: GEN
Explorer: https://explorer-bradbury.genlayer.com/
```

Funding:

1. Add/switch MetaMask or Rabby to GenLayer Bradbury Testnet.
2. Fund the connected browser wallet with Bradbury testnet GEN.
3. Wait until the GEN balance appears on chain before sending writes.

Deploy:

1. In GenLayer Studio, create/import an Intelligent Contract.
2. Paste `contracts/MochiProtocolAdjudicator.py`.
3. Deploy on Bradbury using browser wallet signing.
4. Copy the deployed contract address.
5. Put it in `.env.local` as `NEXT_PUBLIC_MOCHI_ADJUDICATOR_ADDRESS`.

Do not test real submissions until that deployed Bradbury contract address exists.

## Unity WebGL Build Location

Put Unity WebGL output files here:

```text
public/unity/Build/
```

Default expected base name:

```text
MochiProtocol.loader.js
MochiProtocol.data
MochiProtocol.framework.js
MochiProtocol.wasm
```

You can override the base name with:

```text
NEXT_PUBLIC_UNITY_BUILD_NAME=YourBuildName
```

For the public GitHub repository, Unity WebGL build files are intentionally excluded because
`MochiProtocol.data` is larger than GitHub/Vercel's direct file limits. Host the generated
Unity build separately, or set `NEXT_PUBLIC_UNITY_BUILD_BASE` to the hosted build URL in Vercel.

## GenLayer Bridge

The page exposes:

```ts
window.mochiOnchain.connectWallet()
window.mochiOnchain.submitGuardianOath(oathMessage)
window.mochiOnchain.submitFinalDecision(finalMessage, progressJson)
window.mochiOnchain.submitWeeklyRun(runJson)
window.mochiOnchain.getWeeklyLeaderboard(weekId)
```

Callbacks sent to Unity:

```text
OnWalletConnected(address)
OnWalletDisconnected()
OnOathResult(json)
OnFinalDecisionResult(json)
OnWeeklyRunResult(json)
OnLeaderboardResult(json)
OnOnchainError(error)
```
