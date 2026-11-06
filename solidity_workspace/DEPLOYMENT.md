# DogecatMoonbound: Security & Deployment Runbook

Network: **DogeOS Chikyū testnet only**. Chain ID `6281971`, RPC `https://rpc.testnet.dogeos.com`, explorer `https://dogeos-testnet.l2scan.co`. Every script refuses to run on any other chain.

Every script that changes state is a **dry run by default**. It simulates the call and prints the plan. Nothing is broadcast unless `CONFIRM=yes` is set.

---

## 1. Roles

| Role | Holder | Powers | Key location |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` (`owner()`) | Cold / hardware wallet | Grant/revoke minter & pauser, `setMintCap`, `unpause`, start admin transfer | Hardware device only. Never in Vercel or CI |
| `MINTER_ROLE` | Vercel relayer hot wallet | `mintTo` only | Vercel server env (`MOONBOUND_RELAYER_PRIVATE_KEY`) |
| `PAUSER_ROLE` | Admin by default, or an ops key | `pause` minting only | Ops device |

Enforced onchain:
- An address can never hold both admin and minter. The contract reverts with `RoleSeparation` at deploy, on `grantRole`, and on admin transfer.
- There is exactly one admin. Admin handover is two-step: `beginDefaultAdminTransfer` then `acceptDefaultAdminTransfer`, with a delay of `MOONBOUND_ADMIN_DELAY_SECONDS` in between. Admin cannot be granted directly or renounced by accident.
- A minter cannot grant roles, change the cap, pause, unpause, or touch the admin.
- `playerKey` claims are permanent. There is no burn function and no reset.
- A token's URI can't be changed after it is minted. Each mint passes its own URI, so future artwork needs no redeploy.

## 2. Damage limits if the relayer is compromised

The contract can't tell a real `playerKey` from an invented one. So a stolen minter key could mint junk NFTs until it is stopped. It can't steal or alter existing NFTs, and it can't escalate privileges. Limits:

| Control | Implemented | Effect |
|---|---|---|
| `mintCap` (admin-adjustable, never below minted) | Yes | Hard ceiling on total junk. Raise it in batches (e.g. +500) as real claims come in |
| `pause()` by pauser, `unpause()` admin-only | Yes | Stops all minting in one transaction. Transfers keep working |
| `revokeRole(MINTER_ROLE)` | Yes | Removes the compromised relayer permanently |
| Low relayer DOGE balance | Ops | Gas budget limits how many mints an attacker can afford |
| Per-day onchain rate limit | No | Adds failure modes for legitimate spikes. The cap plus a small gas balance already bound damage |
| Onchain EIP-712 authorization from a 2nd signer | No (optional v2) | Would need a second key. Only useful if that key is held outside Vercel. Changes the `mintTo` signature |
| Admin burn of fraudulent tokens | No | Would let the admin seize player NFTs and weaken provenance. Use `playerKeyOf` plus your backend records to flag junk offchain instead |

Junk tokens are identifiable after the fact. Every `MoonboundMinted` event carries its `playerKey`, and the Dogecat backend knows which keys are real.

## 3. Environment variables (Hardhat workspace only)

| Var | Used by | Notes |
|---|---|---|
| `LEDGER_ACCOUNT` | admin scripts | Hardware admin address. Requires `@nomicfoundation/hardhat-ledger` |
| `PRIVATE_KEY` | relayer / throwaway signer | Never set together with `LEDGER_ACCOUNT` |
| `DOGEOS_RPC_URL` | all | Optional RPC override |
| `MOONBOUND_ADMIN` | deploy | Required |
| `MOONBOUND_MINTER` | deploy | Required. Relayer **address**, not its key |
| `MOONBOUND_PAUSER` | deploy | Defaults to admin. Must not be the minter |
| `MOONBOUND_ADMIN_DELAY_SECONDS` | deploy | Default `86400` |
| `MOONBOUND_MINT_CAP` | deploy, set-mint-cap | Default `1000` |
| `MOONBOUND_ACCOUNT` | grant/revoke/verify | Target address |
| `MOONBOUND_EXPECTED_MINTER` | verify | Exit code 1 unless this is the only minter |
| `MOONBOUND_TEST_RECIPIENT` | test-mint | Test wallet that receives the NFT |
| `MOONBOUND_TEST_PLAYER_ID` | test-mint | Default `dogecat-demo-player-001` |
| `MOONBOUND_CONTRACT_ADDRESS` | all post-deploy | Optional. Otherwise read from `deployments/dogeos-testnet.json` |
| `MOONBOUND_ACTION` | pause | `pause` or `unpause` |
| `CONFIRM` | all writes | `yes` to broadcast |

The **admin key never goes into Vercel**. Vercel only needs the relayer key, the contract address and the RPC URL.

## 4. Deployment steps

```bash
cd solidity_workspace
npm install
npx hardhat test                 # local only, no keys, no network
```

**A. Prepare wallets**
1. Admin: a hardware wallet (Ledger) account, e.g. `0xADMIN`. Fund it with ~0.5 testnet DOGE for deploy and role changes.
2. Relayer: a fresh hot key generated for Vercel, e.g. `0xRELAYER`. Fund it with only a small amount, e.g. ~0.2 DOGE.

**B. Hardware-secured deploy (recommended: deployer = admin, best provenance)**
```bash
npm i -D @nomicfoundation/hardhat-ledger
# Ledger connected, unlocked, Ethereum app open, "Blind signing" enabled
export LEDGER_ACCOUNT=0xADMIN MOONBOUND_ADMIN=0xADMIN MOONBOUND_MINTER=0xRELAYER
npm run deploy:dogeos                        # dry run: review the plan + gas
CONFIRM=yes npm run deploy:dogeos            # approve on the device
```
If Ledger can't sign for this custom chain, use **Option C**.

**C. Alternative: throwaway deployer, cold admin**
Use a disposable funded key as `PRIVATE_KEY`, keeping `MOONBOUND_ADMIN=0xADMIN` and `MOONBOUND_MINTER=0xRELAYER`. The deployer gets **no roles**, and the script verifies this. The explorer "creator" shows the throwaway address, while `owner()` shows the admin. Discard the throwaway key afterwards.

**D. Verify roles (no key needed)**
```bash
unset LEDGER_ACCOUNT PRIVATE_KEY
MOONBOUND_EXPECTED_MINTER=0xRELAYER npm run roles:verify
```

**E. Real test mint, signed by the relayer**
```bash
PRIVATE_KEY=0xRELAYER_KEY MOONBOUND_TEST_RECIPIENT=0xTESTWALLET npm run mint:test            # dry run
PRIVATE_KEY=0xRELAYER_KEY MOONBOUND_TEST_RECIPIENT=0xTESTWALLET CONFIRM=yes npm run mint:test
```
This mints to the test wallet, checks the owner, simulates a duplicate (expects `PlayerAlreadyClaimed`), and records the tx in `deployments/dogeos-testnet.json`.

**F. Commit**: `deployments/dogeos-testnet.json`, `deployments/DogecatMoonbound.abi.json`, `contracts/interfaces/metadata.json`. Never commit keys.

## 5. Operations

| Task | Command (signer) |
|---|---|
| Rotate relayer | `MOONBOUND_ACCOUNT=0xNEW npm run minter:grant` (admin), update Vercel, then `MOONBOUND_ACCOUNT=0xOLD npm run minter:revoke` (admin), then `roles:verify` |
| Raise cap | `MOONBOUND_MINT_CAP=2000 npm run cap:set` (admin) |
| Emergency stop | `MOONBOUND_ACTION=pause npm run mint:pause` (pauser) |
| Resume | `MOONBOUND_ACTION=unpause npm run mint:pause` (admin) |

Prefix each with `CONFIRM=yes` to broadcast.

**Incident (relayer key leaked):** pause, revoke the old minter, sweep the remaining DOGE if possible, then generate a new relayer, grant it, update Vercel, and unpause. Then list junk tokens: `MoonboundMinted` events whose `playerKey` your backend never authorized.

## 6. Monorepo integration notes (for the relayer implementer)

- ABI: `deployments/DogecatMoonbound.abi.json` (a plain ABI array, written by deploy).
- Server-only env: `MOONBOUND_CONTRACT_ADDRESS`, `DOGEOS_RPC_URL`, `MOONBOUND_RELAYER_PRIVATE_KEY`. Never use `NEXT_PUBLIC_`.
- `playerKey = keccak256(utf8("<stablePlayerId>:moonbound"))`. Use the immutable internal player ID, never the wallet address, so a wallet change can't produce a second claim.
- Check `tokenIdByPlayerKey(playerKey)` before sending. Handle the reverts `PlayerAlreadyClaimed`, `MintCapReached` and `Pausable: paused` as non-retryable states.
