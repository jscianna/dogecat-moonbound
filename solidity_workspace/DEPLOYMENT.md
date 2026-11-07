# Dogecat Moonbound: deployed V1 operations

## The active contract

- DogeOS Chikyū testnet, chain **6281971**.
- Address: `0x4A828C409C3c399Cc5fF996B6702c6Bc5Bdf0B8D`.
- Verified deployment record and ABI: `deployments/dogeos-testnet.json` and `deployments/DogecatMoonbound.abi.json`, preserved from commit `10f20d31de90a01cad2c733215329d1c1c6d0385`.
- Admin at deployment: `0xE78D25b40F2139Ebb1954AC7002000d6643CfC5a`.
- Minter at deployment: `0x4a432fe7610C71c12ac500a27064142550527AA6`.
- Explorer: https://blockscout.testnet.dogeos.com/address/0x4A828C409C3c399Cc5fF996B6702c6Bc5Bdf0B8D

V1 has `mintTo(address,bytes32,string)`, `hasClaimed`, `tokenIdByPlayerKey`, `totalMinted`, ERC-721 functions and AccessControl. The constructor accepts **admin and minter only**. It has **no pause, mint cap, owner(), defaultAdmin(), delayed admin transfer, or enforced role separation**. Role holders must be checked with `hasRole` and role-event history.

`contracts/DogecatMoonbound.sol` is restored to the original V1 source from `4cf577f19cb402ab0dd1790d16c9910203b5dbde`. The later source and runbook are preserved under `future/v2`, outside the build. Operational scripts always load the pinned deployment ABI and check the on-chain runtime hash. Compiling cannot overwrite these files. Tests deploy the recorded creation bytecode to Hardhat's isolated local chain only.

## Read-only verification

From `solidity_workspace`, using Node 22:

```sh
npm ci
npm test
npm run roles:verify
```

No signer is needed for `roles:verify`. It checks chain and bytecode, replays grant/revoke events from the deployment block, checks live membership, and reports the sole admin and minter. A missing key or RPC timeout fails the check; it is never treated as a successful audit.

## Gasless claims belong to Dogecat

The website's `/api/rewards/moonbound` checks the signed session, permanent server-side Moonbound achievement, and verified EVM identity. `playerKey = keccak256(utf8(lowercasePlayerUuid + ":moonbound"))`; XP claim state is irrelevant. It persists the signed transaction before broadcasting and serializes this dedicated relayer through the shared player database. Pending transactions are retried with the exact same signed bytes. Do not use this relayer for any parallel CLI, wallet, other deployment, or application transactions. Do not add other minters while claims are enabled: metadata's token number is assigned under that serialization.

Metadata is an immutable base64 JSON data URI. The website checks the approved, versioned image at its permanent public dogecat.com URL before signing. All tokens use the same artwork; the name includes the assigned token ID. **No placeholder metadata or favicon mint is permitted.** `mint:test` intentionally refuses: test through the authenticated website endpoint after the owner explicitly approves a real testnet mint.

Website-only server secrets/configuration: `MOONBOUND_CONTRACT_ADDRESS`, `DOGEOS_RPC_URL`, `MOONBOUND_RELAYER_PRIVATE_KEY`, and `MOONBOUND_CLAIMS_ENABLED=true`. The latter defaults off. Never use NEXT_PUBLIC_ for the relayer key. The website needs the same player Redis used by Such Slope, exact allowed player origins, and the public image deployed first. See Dogecat `docs/MOONBOUND.md` for setup, recovery and acceptance checks.

## Role changes and emergency response

An operator with the admin hardware account can simulate a minter grant/revoke using `minter:grant` or `minter:revoke`, with `LEDGER_ACCOUNT` and `MOONBOUND_ACCOUNT`. A transaction requires both `CONFIRM=yes` and `MOONBOUND_V1_ACK=yes` after explicit human approval. Never set a software PRIVATE_KEY alongside LEDGER_ACCOUNT. No role transaction was made as part of integration.

If the relayer is compromised, disable website claims and revoke that minter with the admin. The website switch cannot stop someone holding the stolen private key, and cannot retract transactions already broadcast. V1 has no on-chain pause or cap. Keep a small dedicated gas balance and review pending journal entries before rotation. V1 admin transfers are ordinary AccessControl changes, not delayed/two-step transfers; no automatic admin-transfer script is provided.

`deploy:dogeos`, `mint:pause`, and `cap:set` explicitly refuse. They do not silently invoke V2 or redeploy anything. Restoring V2 is a separate future project requiring a new address and approval.

## Record handling

Preserve deployment records, ABI, and approved artwork versions. No keys, seeds, real environment files, caches, or new compiler output belong in commits. A legacy root `.env` was already tracked before this work and contains a public WalletConnect project identifier; it is unrelated to the relayer. Do not add secrets to it. The website's claim journal is private player storage, not a Git artifact.
