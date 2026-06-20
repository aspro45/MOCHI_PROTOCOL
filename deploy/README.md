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
NEXT_PUBLIC_MOCHI_ADJUDICATOR_ADDRESS=0x27607E65Ec5B0Db9a87bAfCc816E1C112ff48A41
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
Contract: 0x27607E65Ec5B0Db9a87bAfCc816E1C112ff48A41
TX: https://explorer-bradbury.genlayer.com/tx/0xb65357735bee1ca393dbe7553c9cd01d8f63cd1cee2b16addca2e7e9311add7e
```
