// One real test mint, signed by the MINTER (relayer) key, then a duplicate-claim check.
//   PRIVATE_KEY=0xRelayerKey MOONBOUND_TEST_RECIPIENT=0xTestWallet [CONFIRM=yes] \
//   npx hardhat run scripts/test-mint.js --network dogeosTestnet
// Optional: MOONBOUND_TEST_PLAYER_ID (default "dogecat-demo-player-001")
const { ethers } = require("hardhat");
const m = require("./lib/moonbound");

const PLACEHOLDER_METADATA = (tokenLabel) => ({
  name: `Dogecat Moonbound ${tokenLabel}`,
  description: "Awarded for completing the Moon journey in Such Slope.",
  image: "https://dogecat.com/favicon.ico",
  attributes: [
    { trait_type: "Game", value: "Such Slope" },
    { trait_type: "Achievement", value: "moonbound" },
    { trait_type: "Artwork", value: "placeholder-v1" },
  ],
});

async function main() {
  await m.assertDogeOS();
  const recipient = m.envAddress("MOONBOUND_TEST_RECIPIENT");
  const playerId = process.env.MOONBOUND_TEST_PLAYER_ID || "dogecat-demo-player-001";
  const playerKey = ethers.keccak256(ethers.toUtf8Bytes(`${playerId}:moonbound`));

  const signer = await m.getSigner();
  const nft = await m.getMoonbound(signer);
  if (!(await nft.hasRole(await nft.MINTER_ROLE(), signer.address))) {
    throw new Error(`Signer ${signer.address} does not have MINTER_ROLE. Use the relayer key.`);
  }

  console.log(`Contract:  ${await nft.getAddress()}`);
  console.log(`Minter:    ${signer.address}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`playerKey: ${playerKey}  (keccak256("${playerId}:moonbound"))`);

  const existing = await nft.tokenIdByPlayerKey(playerKey);
  if (existing !== 0n) {
    console.log(`Already claimed as token #${existing} (owner ${await nft.ownerOf(existing)}). Not minting again.`);
    return;
  }

  const nextId = (await nft.totalMinted()) + 1n;
  const tokenURI = "data:application/json;base64," +
    Buffer.from(JSON.stringify(PLACEHOLDER_METADATA(`#${nextId}`)), "utf8").toString("base64");

  const receipt = await m.simulateAndSend(nft, "mintTo", [recipient, playerKey, tokenURI], "mintTo");
  if (!receipt) return;

  const event = receipt.logs
    .map((log) => { try { return nft.interface.parseLog(log); } catch (_) { return null; } })
    .find((p) => p && p.name === "MoonboundMinted");
  if (!event) throw new Error("Mint confirmed but MoonboundMinted event not found.");
  const tokenId = event.args.tokenId;
  const owner = await nft.ownerOf(tokenId);
  console.log(`Token #${tokenId} owner: ${owner} ${owner === recipient ? "(correct recipient)" : "(UNEXPECTED)"}`);

  // Duplicate check: simulate only, never sent.
  try {
    await nft.mintTo.staticCall(recipient, playerKey, tokenURI);
    console.log("UNEXPECTED: duplicate mint simulation did not revert.");
    process.exitCode = 1;
  } catch (err) {
    console.log(`Duplicate mint blocked: ${m.describeError(nft, err)}`);
  }

  const record = m.readDeployment();
  record.testMint = {
    txHash: receipt.hash,
    explorer: m.txUrl(receipt.hash),
    blockNumber: receipt.blockNumber,
    tokenId: tokenId.toString(),
    recipient,
    minter: signer.address,
    playerKey,
    tokenURI,
    mintedAt: new Date().toISOString(),
  };
  m.writeDeployment(record);
  console.log("Recorded testMint in deployments/dogeos-testnet.json");
}

m.runMain(main);
