// Deploy DogecatMoonbound to DogeOS Chikyu testnet. Deploy only: no minting.
//
//   MOONBOUND_ADMIN=0xCold MOONBOUND_MINTER=0xRelayer \
//   LEDGER_ACCOUNT=0xCold npx hardhat run scripts/deploy.js --network dogeosTestnet       # dry run
//   ... CONFIRM=yes npx hardhat run scripts/deploy.js --network dogeosTestnet             # broadcast
//
// The signer pays gas only. Roles go to the addresses in env, so the relayer
// key and the admin key never need to be in the same place.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const m = require("./lib/moonbound");

const MAX_UINT48 = 2n ** 48n - 1n;

async function main() {
  await m.assertDogeOS();

  const admin = m.envAddress("MOONBOUND_ADMIN");
  const minter = m.envAddress("MOONBOUND_MINTER");
  const pauser = m.envAddress("MOONBOUND_PAUSER", admin);
  const adminDelay = BigInt(process.env.MOONBOUND_ADMIN_DELAY_SECONDS ?? "86400");
  const mintCap = BigInt(process.env.MOONBOUND_MINT_CAP ?? "1000");

  if (admin === minter) throw new Error("MOONBOUND_ADMIN and MOONBOUND_MINTER must be different addresses.");
  if (pauser === minter) throw new Error("MOONBOUND_PAUSER must not be the minter (relayer).");
  if (adminDelay > MAX_UINT48) throw new Error("MOONBOUND_ADMIN_DELAY_SECONDS exceeds uint48.");

  const deployer = await m.getSigner();
  if (deployer.address === minter) throw new Error("Do not deploy with the relayer key. Use the admin (recommended) or a throwaway deployer.");
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=== DogecatMoonbound deployment plan (DogeOS Chikyu testnet, chain 6281971) ===");
  console.log(`Deployer (gas payer):  ${deployer.address}  [${ethers.formatEther(balance)} DOGE]`);
  console.log(`Admin (owner):         ${admin}`);
  console.log(`Minter (relayer):      ${minter}`);
  console.log(`Pauser:                ${pauser}`);
  console.log(`Admin transfer delay:  ${adminDelay}s`);
  console.log(`Initial mint cap:      ${mintCap}`);
  if (deployer.address !== admin) {
    console.log("NOTE: deployer != admin. The deployer gets NO roles; explorer 'creator' will be the deployer, owner() will be the admin.");
  }

  const Factory = await ethers.getContractFactory("DogecatMoonbound", deployer);
  const args = [admin, minter, pauser, adminDelay, mintCap];
  const deployReq = await Factory.getDeployTransaction(...args);
  const gas = await ethers.provider.estimateGas({ ...deployReq, from: deployer.address });
  const feeData = await ethers.provider.getFeeData();
  const price = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  console.log(`Estimated gas: ${gas} (~${ethers.formatEther(gas * price)} DOGE max)`);
  if (balance < gas * price) throw new Error(`Deployer ${deployer.address} has insufficient testnet DOGE.`);

  if (!m.isConfirmed()) {
    console.log("DRY RUN. Nothing was sent. Re-run with CONFIRM=yes to deploy.");
    return;
  }

  const nft = await Factory.deploy(...args);
  const deployTx = nft.deploymentTransaction();
  console.log(`Deploy tx sent: ${deployTx.hash}`);
  const receipt = await deployTx.wait(1);
  if (receipt.status !== 1) throw new Error(`Deployment failed: ${m.txUrl(deployTx.hash)}`);
  const address = await nft.getAddress();

  // Verify onchain state matches the plan.
  const [MINTER_ROLE, PAUSER_ROLE, ADMIN_ROLE] = await Promise.all([nft.MINTER_ROLE(), nft.PAUSER_ROLE(), nft.DEFAULT_ADMIN_ROLE()]);
  const checks = {
    owner: (await nft.owner()) === admin,
    adminHasAdmin: await nft.hasRole(ADMIN_ROLE, admin),
    minterHasMinter: await nft.hasRole(MINTER_ROLE, minter),
    pauserHasPauser: await nft.hasRole(PAUSER_ROLE, pauser),
    adminNotMinter: !(await nft.hasRole(MINTER_ROLE, admin)),
    minterNotAdmin: !(await nft.hasRole(ADMIN_ROLE, minter)),
    mintCap: (await nft.mintCap()) === mintCap,
  };
  if (deployer.address !== admin) checks.deployerHasNoAdmin = !(await nft.hasRole(ADMIN_ROLE, deployer.address));
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);

  console.log(`DogecatMoonbound deployed at: ${address}`);
  console.log(`Deploy tx: ${m.txUrl(deployTx.hash)} (block ${receipt.blockNumber})`);
  console.log(`Post-deploy checks: ${failed.length ? "FAILED " + failed.join(", ") : "all passed"}`);

  // Write records.
  const { abi } = await hre.artifacts.readArtifact("DogecatMoonbound");
  m.writeDeployment({
    contractName: "DogecatMoonbound",
    address,
    chainId: Number(m.EXPECTED_CHAIN_ID),
    network: m.NETWORK_NAME,
    rpcUrl: m.RPC_URL,
    explorer: m.addressUrl(address),
    deployer: deployer.address,
    admin,
    minter,
    pauser,
    adminTransferDelaySeconds: Number(adminDelay),
    initialMintCap: mintCap.toString(),
    deployTxHash: deployTx.hash,
    deployBlock: receipt.blockNumber,
    deployedAt: new Date().toISOString(),
    testMint: null,
  });
  const deploymentsDir = path.dirname(m.DEPLOYMENT_FILE);
  fs.writeFileSync(path.join(deploymentsDir, "DogecatMoonbound.abi.json"), JSON.stringify(abi, null, 2) + "\n");

  const interfacesDir = path.join(m.ROOT, "contracts", "interfaces");
  fs.mkdirSync(interfacesDir, { recursive: true });
  fs.writeFileSync(
    path.join(interfacesDir, "metadata.json"),
    JSON.stringify({ address, network: m.NETWORK_NAME, chainId: Number(m.EXPECTED_CHAIN_ID) }, null, 2) + "\n"
  );
  console.log("Wrote deployments/dogeos-testnet.json, deployments/DogecatMoonbound.abi.json, contracts/interfaces/metadata.json");
  if (failed.length) process.exitCode = 1;
}

m.runMain(main);
