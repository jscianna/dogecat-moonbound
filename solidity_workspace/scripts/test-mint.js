// Intentional guard for the existing V1 deployment. No signer or RPC is loaded.
throw new Error("Mint through the authenticated Dogecat Moonbound claim API after explicit approval. Direct script mints bypass the persistent nonce coordinator and are disabled.");
