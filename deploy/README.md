# Bradbury Deployment Notes

Mochi Protocol uses browser wallet signing only. Do not put private keys in this repository.

## Network

```text
Network: GenLayer Bradbury
RPC: https://rpc-bradbury.genlayer.com
Chain ID: 4221
Currency: GEN
Explorer: https://explorer-bradbury.genlayer.com/
```

## Safe Deploy Flow

1. Open GenLayer Studio.
2. Import or create a contract.
3. Paste `contracts/MochiProtocolAdjudicator_DEPLOY_THIS.py` or `contracts/MochiProtocolAdjudicator.py`.
4. Deploy using the browser wallet.
5. Wait for the transaction to reach `ACCEPTED`.
6. Copy the deployed contract address.
7. Set it in Vercel:

```text
NEXT_PUBLIC_MOCHI_ADJUDICATOR_ADDRESS=0xYourBradburyContract
```

8. Redeploy the website.

## Do Not Commit

- private keys
- seed phrases
- `.env.local`
- wallet export files
- Unity asset source folders
- large WebGL build binaries

## Current Deploy Evidence

```text
Contract: 0x8808bfBABcE825FeADC6C287F1e8Fb3f58731ed9
TX: https://explorer-bradbury.genlayer.com/tx/0x4118a69760990668a349d5471380ae9af4528a8446d56e20fd276a06894d55f6
```
