// Usage: PRIVATE_KEY=0x... npx hardhat run scripts/deploy.js --network dogeosTestnet
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const EXPECTED_CHAIN_ID = 6281971n;
const NETWORK_NAME = "dogeos-chikyu-testnet";
const PLAYER_KEY_SEED = "dogecat-demo-player-001:moonbound";
const TOKEN_JSON = {
  name: "Dogecat Moonbound #1",
  description: "Awarded for completing the Moon journey in Such Slope.",
  image: "https://dogecat.com/favicon.ico",
  attributes: [
    { trait_type: "Game", value: "Such Slope" },
    { trait_type: "Achievement", value: "moonbound" },
    { trait_type: "Artwork", value: "placeholder-v1" },
  ],
};

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Refusing to deploy: connected to chainId ${chainId}, expected ${EXPECTED_CHAIN_ID} (DogeOS Chikyu testnet)`);
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account. Set PRIVATE_KEY env var.");
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} DOGE`);
  if (balance === 0n) throw new Error(`Deployer ${deployer.address} has 0 testnet DOGE. Fund it and retry.`);

  // ---- Deploy ----
  const Factory = await ethers.getContractFactory("DogecatMoonbound");
  const nft = await Factory.deploy(deployer.address, deployer.address);
  const deployTx = nft.deploymentTransaction();
  console.log(`Deploy tx sent: ${deployTx.hash}`);
  await deployTx.wait(1);
  await nft.waitForDeployment();
  const address = await nft.getAddress();
  console.log(`DogecatMoonbound deployed at: ${address}`);
  console.log(`Deploy tx hash: ${deployTx.hash}`);

  // ---- Test mint ----
  const playerKey = ethers.keccak256(ethers.toUtf8Bytes(PLAYER_KEY_SEED));
  const tokenURI =
    "data:application/json;base64," + Buffer.from(JSON.stringify(TOKEN_JSON), "utf8").toString("base64");

  const mintTx = await nft.mintTo(deployer.address, playerKey, tokenURI);
  console.log(`Mint tx sent: ${mintTx.hash}`);
  const receipt = await mintTx.wait(1);

  let tokenId = null;
  let recipient = null;
  for (const log of receipt.logs) {
    try {
      const parsed = nft.interface.parseLog(log);
      if (parsed && parsed.name === "MoonboundMinted") {
        tokenId = parsed.args.tokenId.toString();
        recipient = parsed.args.recipient;
        break;
      }
    } catch (_) {
      // not our event
    }
  }
  console.log(`Mint tx hash:  ${receipt.hash}`);
  console.log(`Block number:  ${receipt.blockNumber}`);
  console.log(`Token ID:      ${tokenId}`);
  console.log(`Recipient:     ${recipient}`);

  // ---- Duplicate claim check (staticCall only, no tx) ----
  try {
    await nft.mintTo.staticCall(deployer.address, playerKey, tokenURI);
    console.log("UNEXPECTED: duplicate mint staticCall did not revert");
  } catch (err) {
    let decoded = null;
    try {
      const data = err.data || (err.error && err.error.data) || (err.info && err.info.error && err.info.error.data);
      if (data) decoded = nft.interface.parseError(data);
    } catch (_) {}
    if (decoded) {
      console.log(`Duplicate mint reverted as expected: ${decoded.name}(${decoded.args.map(String).join(", ")})`);
    } else {
      console.log(`Duplicate mint reverted: ${err.shortMessage || err.message}`);
    }
  }

  // ---- Write artifacts ----
  const artifact = await hre.artifacts.readArtifact("DogecatMoonbound");
  const root = path.join(__dirname, "..");

  const interfacesDir = path.join(root, "contracts", "interfaces");
  fs.mkdirSync(interfacesDir, { recursive: true });
  fs.writeFileSync(
    path.join(interfacesDir, "metadata.json"),
    JSON.stringify(
      {
        contract_name: "DogecatMoonbound",
        contract_address: address,
        network: NETWORK_NAME,
        chain_id: Number(EXPECTED_CHAIN_ID),
        rpc_url: "https://rpc.testnet.dogeos.com",
        transaction_hash: deployTx.hash,
        constructor_args: [deployer.address, deployer.address],
        abi: artifact.abi,
      },
      null,
      2
    )
  );

  const deploymentsDir = path.join(root, "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, "dogeos-testnet.json"),
    JSON.stringify(
      {
        contractName: "DogecatMoonbound",
        address,
        chainId: Number(EXPECTED_CHAIN_ID),
        network: NETWORK_NAME,
        deployer: deployer.address,
        admin: deployer.address,
        minter: deployer.address,
        deployTxHash: deployTx.hash,
        testMint: {
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          tokenId,
          recipient,
          playerKey,
          tokenURI,
        },
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log("Wrote contracts/interfaces/metadata.json and deployments/dogeos-testnet.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
