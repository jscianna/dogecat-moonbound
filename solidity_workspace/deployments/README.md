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

**Current source, tests, and DEPLOYMENT.md describe a different, newer contract.** The deployed version does not implement pause controls, a mint cap, delayed admin transfer, or enforced admin/minter role separation. Do not rely on those protections for this deployment. It also has no `owner()` or `defaultAdmin()` getter. Query `hasRole(DEFAULT_ADMIN_ROLE, address)` for role membership.

Compiling current source replaces the working artifact with the newer version. Do not use that rebuilt ABI or assume the current operational scripts work with this address. This export is pinned independently so integration can use the deployed interface. Source and script reconciliation remains outstanding; the repository is not ready for integration under the newer runbook's security assumptions.

The exported interface supports `mintTo(address,bytes32,string)`, `tokenIdByPlayerKey(bytes32)`, `hasClaimed(bytes32)`, standard ERC-721 operations, and AccessControl role operations. No wallet signing, integration implementation, or minting test was performed in this verification.

Only public deployment data and an ABI are included. No environment files, private keys, seed phrases, caches, build output, or unrelated generated artifacts were added.
