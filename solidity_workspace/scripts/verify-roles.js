// Read-only V1 audit. Uses the pinned deployed ABI; never compiles or signs.
const { ethers } = require("hardhat");
const m = require("./lib/moonbound");
async function main() {
  await m.assertDogeOS();
  const nft = await m.getMoonbound();
  const record = m.readDeployment();
  const [ADMIN, MINTER, latest] = await Promise.all([nft.DEFAULT_ADMIN_ROLE(), nft.MINTER_ROLE(), ethers.provider.getBlockNumber()]);
  const holders = { [ADMIN]: new Set(), [MINTER]: new Set() };
  for (let start = record.deployBlock; start <= latest; start += 10000) {
    const end = Math.min(start + 9999, latest);
    const events = [...await nft.queryFilter(nft.filters.RoleGranted(), start, end), ...await nft.queryFilter(nft.filters.RoleRevoked(), start, end)].sort((a,b) => a.blockNumber-b.blockNumber || a.index-b.index);
    for (const event of events) {
      const [role, account] = event.args;
      if (holders[role]) event.fragment.name === "RoleGranted" ? holders[role].add(account) : holders[role].delete(account);
    }
  }
  const live = async role => { const result=[];for(const account of holders[role])if(await nft.hasRole(role,account))result.push(account);return result; };
  const [admins,minters,minted] = await Promise.all([live(ADMIN),live(MINTER),nft.totalMinted()]);
  console.log(JSON.stringify({ version:"V1", address:record.address, admins, minters, totalMinted:minted.toString(), paused:"unsupported", mintCap:"unsupported", delayedAdminTransfer:"unsupported" },null,2));
  const expected = process.env.MOONBOUND_EXPECTED_MINTER || record.minter;
  if (admins.length !== 1 || minters.length !== 1 || minters[0].toLowerCase() !== expected.toLowerCase() || admins.some(a => minters.includes(a))) {
    throw new Error("Unexpected V1 role configuration. Review before enabling claims.");
  }
}
m.runMain(main);
