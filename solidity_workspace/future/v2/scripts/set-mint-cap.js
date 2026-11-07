// Change the total mint cap. Signer must be the admin.
//   MOONBOUND_MINT_CAP=2000 LEDGER_ACCOUNT=0xAdmin [CONFIRM=yes] \
//   npx hardhat run scripts/set-mint-cap.js --network dogeosTestnet
const m = require("./lib/moonbound");

async function main() {
  await m.assertDogeOS();
  if (!process.env.MOONBOUND_MINT_CAP) throw new Error("Set MOONBOUND_MINT_CAP.");
  const newCap = BigInt(process.env.MOONBOUND_MINT_CAP);
  const signer = await m.getSigner();
  const nft = await m.getMoonbound(signer);
  console.log(`Minted ${await nft.totalMinted()}, cap ${await nft.mintCap()} -> ${newCap}`);
  await m.simulateAndSend(nft, "setMintCap", [newCap], `setMintCap(${newCap})`);
}

m.runMain(main);
