// Read-only audit of roles and limits. Needs no private key.
//   npx hardhat run scripts/verify-roles.js --network dogeosTestnet
// Optional env:
//   MOONBOUND_ACCOUNT=0x...          print this account's roles
//   MOONBOUND_EXPECTED_MINTER=0x...  exit 1 unless this is the ONLY minter
//   MOONBOUND_FROM_BLOCK=123         event scan start (defaults to deployBlock in deployments file)
const { ethers } = require("hardhat");
const m = require("./lib/moonbound");

const CHUNK = 10_000;

async function scanRoleEvents(nft, fromBlock, toBlock) {
  const filters = [nft.filters.RoleGranted(), nft.filters.RoleRevoked()];
  const events = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, toBlock);
    for (const f of filters) events.push(...(await nft.queryFilter(f, start, end)));
  }
  return events.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
}

async function main() {
  await m.assertDogeOS();
  const nft = await m.getMoonbound();
  const address = await nft.getAddress();
  const [MINTER_ROLE, PAUSER_ROLE, ADMIN_ROLE] = await Promise.all([nft.MINTER_ROLE(), nft.PAUSER_ROLE(), nft.DEFAULT_ADMIN_ROLE()]);

  const [admin, pending, delay, paused, cap, minted] = await Promise.all([
    nft.defaultAdmin(),
    nft.pendingDefaultAdmin(),
    nft.defaultAdminDelay(),
    nft.paused(),
    nft.mintCap(),
    nft.totalMinted(),
  ]);

  let fromBlock = process.env.MOONBOUND_FROM_BLOCK ? Number(process.env.MOONBOUND_FROM_BLOCK) : undefined;
  if (fromBlock === undefined) {
    try { fromBlock = m.readDeployment().deployBlock ?? 0; } catch (_) { fromBlock = 0; }
  }
  const latest = await ethers.provider.getBlockNumber();
  const events = await scanRoleEvents(nft, fromBlock, latest);

  const holders = { [MINTER_ROLE]: new Set(), [PAUSER_ROLE]: new Set() };
  for (const e of events) {
    const [role, account] = e.args;
    if (!holders[role]) continue;
    e.fragment.name === "RoleGranted" ? holders[role].add(account) : holders[role].delete(account);
  }
  // Confirm each with a live hasRole call.
  const live = async (role) => {
    const out = [];
    for (const a of holders[role]) if (await nft.hasRole(role, a)) out.push(a);
    return out;
  };
  const minters = await live(MINTER_ROLE);
  const pausers = await live(PAUSER_ROLE);

  console.log(`=== DogecatMoonbound @ ${address} ===`);
  console.log(`Explorer:        ${m.addressUrl(address)}`);
  console.log(`Admin (owner):   ${admin}`);
  console.log(`Pending admin:   ${pending[0] === ethers.ZeroAddress ? "none" : `${pending[0]} (accept after ${new Date(Number(pending[1]) * 1000).toISOString()})`}`);
  console.log(`Admin delay:     ${delay}s`);
  console.log(`Minters:         ${minters.join(", ") || "none"}`);
  console.log(`Pausers:         ${pausers.join(", ") || "none"}`);
  console.log(`Minting paused:  ${paused}`);
  console.log(`Minted / cap:    ${minted} / ${cap}`);

  const problems = [];
  if (minters.includes(admin) || (await nft.hasRole(MINTER_ROLE, admin))) problems.push("Admin holds MINTER_ROLE");
  if (minters.length > 1) problems.push(`More than one minter (${minters.length}). Revoke stale relayers.`);
  if (pending[0] !== ethers.ZeroAddress) problems.push("An admin transfer is pending. Confirm it is intended.");

  if (process.env.MOONBOUND_EXPECTED_MINTER) {
    const expected = m.envAddress("MOONBOUND_EXPECTED_MINTER");
    if (minters.length !== 1 || minters[0] !== expected) problems.push(`Expected sole minter ${expected}, found [${minters.join(", ")}]`);
  }
  if (process.env.MOONBOUND_ACCOUNT) {
    const acct = m.envAddress("MOONBOUND_ACCOUNT");
    console.log(`\n${acct}: admin=${await nft.hasRole(ADMIN_ROLE, acct)} minter=${await nft.hasRole(MINTER_ROLE, acct)} pauser=${await nft.hasRole(PAUSER_ROLE, acct)}`);
  }

  if (problems.length) {
    console.log("\nWARNINGS:\n - " + problems.join("\n - "));
    process.exitCode = 1;
  } else {
    console.log("\nRole configuration OK.");
  }
}

m.runMain(main);
