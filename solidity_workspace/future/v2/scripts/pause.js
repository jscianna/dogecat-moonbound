// Emergency stop / resume minting.
//   pause:   MOONBOUND_ACTION=pause   (signer: PAUSER_ROLE)
//   unpause: MOONBOUND_ACTION=unpause (signer: admin)
//   [CONFIRM=yes] npx hardhat run scripts/pause.js --network dogeosTestnet
const m = require("./lib/moonbound");

async function main() {
  await m.assertDogeOS();
  const action = process.env.MOONBOUND_ACTION;
  if (action !== "pause" && action !== "unpause") throw new Error("Set MOONBOUND_ACTION=pause or unpause.");
  const signer = await m.getSigner();
  const nft = await m.getMoonbound(signer);
  console.log(`Currently paused: ${await nft.paused()}. Signer: ${signer.address}`);
  await m.simulateAndSend(nft, action, [], `${action}()`);
}

m.runMain(main);
