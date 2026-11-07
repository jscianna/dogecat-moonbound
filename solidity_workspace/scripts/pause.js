// Intentional guard for the existing V1 deployment. No signer or RPC is loaded.
throw new Error("V1 has no pause function. Disable MOONBOUND_CLAIMS_ENABLED and, if needed, use the reviewed admin minter-revocation workflow.");
