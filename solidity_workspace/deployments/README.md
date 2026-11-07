# Existing DogeOS testnet deployment

This directory records the existing contract at `0x4A828C409C3c399Cc5fF996B6702c6Bc5Bdf0B8D` on chain `6281971`. Nothing was deployed, minted, or changed on-chain when these records were created.

## Provenance and verification

The original local deployment directory was unavailable. The record was reconstructed from the public RPC transaction, successful receipt, constructor arguments, role-grant logs, and deployment block timestamp. It is not the original deploy-script output. The ABI was exported without modification from the committed artifact at `645ead32c8abd162ac670b08977dd6508e3ea1bb`.

Both creation bytecode (before constructor arguments) and all 6,937 bytes of live runtime bytecode match that artifact exactly, including compiler metadata. The receipt creates the recorded address. The verification object records the observation block, read-only calls, bytecode hash, and exported ABI file hash. No explorer source-verification or fresh compiler build is claimed.

- Deployment: [transaction](https://dogeos-testnet.l2scan.co/tx/0x10d8f231646bd81d0d23ceb3ff68784b6d837984a2faa7a02a6fb8913dd18adb)
- Contract: [address](https://dogeos-testnet.l2scan.co/address/0x4A828C409C3c399Cc5fF996B6702c6Bc5Bdf0B8D)
- Historical source: [original version](https://github.com/jscianna/dogecat-moonbound/blob/4cf577f19cb402ab0dd1790d16c9910203b5dbde/solidity_workspace/contracts/DogecatMoonbound.sol)

The top-level admin and minter fields are constructor-time assignments, not a complete inventory of current role holders. The read-only checks show whether those original addresses still hold their roles at the observation block. No test-mint result was reconstructed or assumed.

## Integration compatibility

Use `DogecatMoonbound.abi.json` and `dogeos-testnet.json` together for this existing testnet address. The exported ABI contains 41 entries and a two-address constructor.

**V1 has no pause controls, mint cap, delayed admin transfer, enforced role separation, owner() or defaultAdmin().** Query `hasRole(DEFAULT_ADMIN_ROLE, address)` for membership.

At record creation, current source and the runbook described incompatible V2. The deployment JSON preserves that historical verification finding. The follow-up restored original V1 source and pinned V1 operational scripts; V2 now lives outside the build under `future/v2`. Compiled output uses a separate ignored directory and cannot overwrite the deployed ABI. Read `../DEPLOYMENT.md` for current V1 integration and its operational limits.

The exported interface supports `mintTo(address,bytes32,string)`, `tokenIdByPlayerKey(bytes32)`, `hasClaimed(bytes32)`, standard ERC-721 operations, and AccessControl role operations. No wallet signing, integration implementation, or minting test was performed in this verification.

Only public deployment data and an ABI are included. No environment files, private keys, seed phrases, caches, build output, or unrelated generated artifacts were added.

## V1 reconciliation follow-up

The source and operations now target the original V1 contract. The newer source, tests and historical runbook have moved to `future/v2`. The mismatch described above is the finding at record creation; it remains here as provenance. Use `../DEPLOYMENT.md` for current V1 operations. The deployment JSON and ABI are unchanged.
