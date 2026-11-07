import '@nomicfoundation/hardhat-toolbox';
import { HardhatUserConfig } from 'hardhat/config';
import type { HttpNetworkUserConfig } from 'hardhat/types';

// Signer selection for DogeOS testnet (pick ONE):
//   LEDGER_ACCOUNT=0x...  hardware-secured admin (requires @nomicfoundation/hardhat-ledger)
//   PRIVATE_KEY=0x...     software key (relayer, throwaway deployer, or testnet-only admin)
// No signer is needed for `hardhat test` or scripts/verify-roles.js.
const ledgerAccount = process.env.LEDGER_ACCOUNT;
const privateKey = process.env.PRIVATE_KEY;
if (ledgerAccount && privateKey) {
    throw new Error('Set either LEDGER_ACCOUNT or PRIVATE_KEY, not both.');
}
if (ledgerAccount) {
    // Loaded only when needed so tests and read-only scripts don't require the plugin.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@nomicfoundation/hardhat-ledger');
}

const dogeosSigner: Record<string, unknown> = ledgerAccount
    ? { ledgerAccounts: [ledgerAccount] }
    : { accounts: privateKey ? [privateKey] : [] };

const compiler = (version: string) => ({
    version,
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
});

const config: HardhatUserConfig = {
    // Preserve committed deployment artifacts; compiler output is disposable.
    paths: { artifacts: "./.artifacts-v1-build", cache: "./.cache-v1-build" },
    solidity: {
        compilers: [compiler('0.8.28'), compiler('0.8.20'), compiler('0.8.19')],
    },
    networks: {
        dogeosTestnet: {
            url: process.env.DOGEOS_RPC_URL || 'https://rpc.testnet.dogeos.com',
            chainId: 6281971,
            ...dogeosSigner,
        } as HttpNetworkUserConfig,
    },
};

export default config;
