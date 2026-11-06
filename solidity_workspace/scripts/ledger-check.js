// Pre-deployment Ledger check on DogeOS Chikyu testnet.
//   LEDGER_ACCOUNT=0xAdmin npm run ledger:check               # read-only: address, balance, nonce
//   LEDGER_ACCOUNT=0xAdmin CONFIRM=yes npm run ledger:check   # sends a 0-DOGE self-transfer, signed on the device
// The self-transfer proves the device signs for chain 6281971 and DogeOS accepts the tx, before deploying.
const { ethers } = require("hardhat");
const m = require("./lib/moonbound");

async function main() {
  await m.assertDogeOS();
  if (!process.env.LEDGER_ACCOUNT) throw new Error("Set LEDGER_ACCOUNT to the hardware admin address.");
  const expected = m.envAddress("LEDGER_ACCOUNT");

  const signer = await m.getSigner();
  if (signer.address !== expected) throw new Error(`Signer ${signer.address} does not match LEDGER_ACCOUNT ${expected}.`);

  const [balance, nonce, feeData] = await Promise.all([
    ethers.provider.getBalance(signer.address),
    ethers.provider.getTransactionCount(signer.address),
    ethers.provider.getFeeData(),
  ]);
  console.log(`Ledger account: ${signer.address}`);
  console.log(`Balance:        ${ethers.formatEther(balance)} DOGE`);
  console.log(`Nonce:          ${nonce}`);
  console.log(`Fee data:       gasPrice=${feeData.gasPrice} maxFeePerGas=${feeData.maxFeePerGas}`);
  if (balance === 0n) throw new Error("Account has no testnet DOGE. Fund it before deploying.");

  if (!m.isConfirmed()) {
    console.log("READ-ONLY. Re-run with CONFIRM=yes to sign a 0-DOGE self-transfer on the device.");
    return;
  }
  console.log("Check the device: chain ID 6281971, recipient = your own address, amount 0. Then approve.");
  const tx = await signer.sendTransaction({ to: signer.address, value: 0n });
  console.log(`Sent: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (receipt.status !== 1) throw new Error(`Self-transfer failed: ${m.txUrl(tx.hash)}`);
  console.log(`Confirmed in block ${receipt.blockNumber}: ${m.txUrl(receipt.hash)}`);
  console.log("Ledger signing on DogeOS works. Safe to proceed with the deploy dry run.");
}

m.runMain(main);
