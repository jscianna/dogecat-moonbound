// Shared helpers for DogecatMoonbound operational scripts.
// Every state-changing script is a DRY RUN unless CONFIRM=yes is set.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const EXPECTED_CHAIN_ID = 6281971n;
const NETWORK_NAME = "dogeos-chikyu-testnet";
const RPC_URL = "https://rpc.testnet.dogeos.com";
const EXPLORER_URL = "https://blockscout.testnet.dogeos.com";
const ROOT = path.join(__dirname, "..", "..");
const DEPLOYMENT_FILE = path.join(ROOT, "deployments", "dogeos-testnet.json");

const txUrl = (hash) => `${EXPLORER_URL}/tx/${hash}`;
const addressUrl = (addr) => `${EXPLORER_URL}/address/${addr}`;
const isConfirmed = () => process.env.CONFIRM === "yes";

/** Abort unless connected to DogeOS Chikyu testnet. */
async function assertDogeOS() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Refusing to run: connected to chainId ${chainId}, expected ${EXPECTED_CHAIN_ID} (DogeOS Chikyu testnet). Use --network dogeosTestnet.`);
  }
}

/** Read a checksummed address from env. `fallback` is used when unset. */
function envAddress(name, fallback) {
  const value = process.env[name];
  if (!value) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing env var ${name} (expected an EVM address).`);
  }
  if (!ethers.isAddress(value)) throw new Error(`${name}=${value} is not a valid EVM address.`);
  return ethers.getAddress(value);
}

async function getSigner() {
  const signers = await ethers.getSigners();
  if (!signers.length) throw new Error("No signer configured. Set PRIVATE_KEY or LEDGER_ACCOUNT.");
  return signers[0];
}

function readDeployment() {
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    throw new Error(`No deployment record at ${DEPLOYMENT_FILE}. Deploy first or set MOONBOUND_CONTRACT_ADDRESS.`);
  }
  return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
}

function writeDeployment(data) {
  fs.mkdirSync(path.dirname(DEPLOYMENT_FILE), { recursive: true });
  fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify(data, null, 2) + "\n");
}

/** Contract instance bound to `runner` (signer or provider). */
async function getMoonbound(runner = ethers.provider) {
  const address = process.env.MOONBOUND_CONTRACT_ADDRESS
    ? envAddress("MOONBOUND_CONTRACT_ADDRESS")
    : readDeployment().address;
  const deployment = readDeployment();
  if (address.toLowerCase() !== deployment.address.toLowerCase()) throw new Error("Only the recorded V1 contract is supported.");
  const code = await ethers.provider.getCode(address);
  if (ethers.keccak256(code) !== deployment.verification.runtimeBytecodeKeccak256) throw new Error("Deployed V1 bytecode mismatch.");
  // Never load an ABI from compilation output for an existing deployment.
  const abi = JSON.parse(fs.readFileSync(path.join(ROOT, "deployments", "DogecatMoonbound.abi.json"), "utf8"));
  return new ethers.Contract(address, abi, runner);
}

/** Decode a revert into a readable string using the contract interface. */
function describeError(contract, err) {
  const data = err?.data || err?.error?.data || err?.info?.error?.data;
  if (data) {
    try {
      const parsed = contract.interface.parseError(data);
      if (parsed) return `${parsed.name}(${parsed.args.map(String).join(", ")})`;
    } catch (_) {}
  }
  return err?.shortMessage || err?.reason || err?.message || String(err);
}

/** Simulate, then (only with CONFIRM=yes) send a tx and wait for 1 confirmation. */
async function simulateAndSend(contract, method, args, label) {
  try {
    await contract[method].staticCall(...args);
  } catch (err) {
    throw new Error(`${label} would revert: ${describeError(contract, err)}`);
  }
  console.log(`Simulation OK: ${label}`);
  if (!isConfirmed()) {
    console.log("DRY RUN. Nothing was sent. Re-run with CONFIRM=yes to broadcast.");
    return null;
  }
  if (process.env.MOONBOUND_V1_ACK !== "yes") throw new Error("Read DEPLOYMENT.md and explicitly set MOONBOUND_V1_ACK=yes for V1 role changes.");
  const tx = await contract[method](...args);
  console.log(`Sent ${label}: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (receipt.status !== 1) throw new Error(`${label} failed onchain: ${txUrl(tx.hash)}`);
  console.log(`Confirmed in block ${receipt.blockNumber}: ${txUrl(receipt.hash)}`);
  return receipt;
}

/** Grant or revoke MINTER_ROLE. Signer must be the admin. */
async function runMinterRoleChange(action) {
  await assertDogeOS();
  const account = envAddress("MOONBOUND_ACCOUNT");
  const signer = await getSigner();
  const nft = await getMoonbound(signer);
  const [MINTER_ROLE, ADMIN_ROLE] = await Promise.all([nft.MINTER_ROLE(), nft.DEFAULT_ADMIN_ROLE()]);

  console.log(`Contract: ${await nft.getAddress()}`);
  console.log(`Signer:   ${signer.address}`);
  console.log(`Account:  ${account}`);

  if (!(await nft.hasRole(ADMIN_ROLE, signer.address))) {
    throw new Error(`Signer ${signer.address} does not hold DEFAULT_ADMIN_ROLE.`);
  }
  const isMinter = await nft.hasRole(MINTER_ROLE, account);

  if (action === "grant") {
    if (await nft.hasRole(ADMIN_ROLE, account)) throw new Error("Refusing: account is the admin. Admin and minter must be separate.");
    if (isMinter) return console.log("Account already has MINTER_ROLE. Nothing to do.");
    const receipt = await simulateAndSend(nft, "grantRole", [MINTER_ROLE, account], `grantRole(MINTER_ROLE, ${account})`);
    if (receipt) console.log(`MINTER_ROLE now: ${await nft.hasRole(MINTER_ROLE, account)}`);
  } else {
    if (!isMinter) return console.log("Account does not have MINTER_ROLE. Nothing to do.");
    const receipt = await simulateAndSend(nft, "revokeRole", [MINTER_ROLE, account], `revokeRole(MINTER_ROLE, ${account})`);
    if (receipt) console.log(`MINTER_ROLE now: ${await nft.hasRole(MINTER_ROLE, account)}`);
  }
}

function runMain(fn) {
  fn().catch((err) => {
    console.error(`ERROR: ${err.message || err}`);
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_CHAIN_ID,
  NETWORK_NAME,
  RPC_URL,
  EXPLORER_URL,
  ROOT,
  DEPLOYMENT_FILE,
  txUrl,
  addressUrl,
  isConfirmed,
  assertDogeOS,
  envAddress,
  getSigner,
  readDeployment,
  writeDeployment,
  getMoonbound,
  describeError,
  simulateAndSend,
  runMinterRoleChange,
  runMain,
};
