// Revoke MINTER_ROLE from a relayer wallet. Signer must be the admin.
//   MOONBOUND_ACCOUNT=0xRelayer LEDGER_ACCOUNT=0xAdmin [CONFIRM=yes] \
//   npx hardhat run scripts/revoke-minter.js --network dogeosTestnet
const { runMinterRoleChange, runMain } = require("./lib/moonbound");

runMain(() => runMinterRoleChange("revoke"));
