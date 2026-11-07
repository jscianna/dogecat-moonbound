// Intentional guard for the existing V1 deployment. No signer or RPC is loaded.
throw new Error("The V1 contract is already deployed. This repository does not redeploy it. V2 is archived under future/v2 and is not deployed.");
