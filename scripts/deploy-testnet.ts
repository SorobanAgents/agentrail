import {
  Keypair,
  rpc,
  Operation,
  TransactionBuilder,
  Networks,
  Address,
  xdr,
} from "@stellar/stellar-sdk";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const WASM_PATH = path.resolve(
  __dirname,
  "../contracts/agentrail/target/wasm32v1-none/release/agentrail_contract.wasm"
);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fundWithFriendbot(publicKey: string): Promise<void> {
  console.log(`[1/5] Funding deployer address via Friendbot: ${publicKey}...`);
  const response = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!response.ok) {
    const text = await response.text();
    console.warn(`Friendbot notice: ${text}`);
  } else {
    console.log(`[1/5] Deployer funded with 10,000 Testnet XLM!`);
  }
}

async function pollRawTransaction(txHash: string): Promise<any> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: { hash: txHash },
      }),
    });
    const data: any = await res.json();
    if (data.result) {
      if (data.result.status === "SUCCESS") {
        return data.result;
      }
      if (data.result.status === "FAILED") {
        throw new Error(`Transaction failed: ${JSON.stringify(data.result)}`);
      }
    }
    await sleep(2000);
  }
  throw new Error(`Transaction timed out: ${txHash}`);
}

async function main() {
  console.log("==================================================");
  console.log("🚀 AGENTRAIL PROTOCOL — SOROBAN TESTNET DEPLOYER");
  console.log("==================================================");

  // 1. Prepare Keypair
  const keyPath = path.resolve(__dirname, "../.deployer_key.json");
  if (!fs.existsSync(keyPath)) {
    throw new Error("Missing deployer key at " + keyPath);
  }
  const rawKey = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  const deployerKeypair = Keypair.fromSecret(rawKey.secretKey);
  console.log(`[1/5] Deployer Address: ${deployerKeypair.publicKey()}`);

  await fundWithFriendbot(deployerKeypair.publicKey());

  const server = new rpc.Server(RPC_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  // 2. Read and Hash WASM
  const wasmBuffer = fs.readFileSync(WASM_PATH);
  const wasmHashBuffer = crypto.createHash("sha256").update(wasmBuffer).digest();
  const wasmHashHex = wasmHashBuffer.toString("hex");
  console.log(`[2/5] Contract WASM Size: ${(wasmBuffer.length / 1024).toFixed(2)} KB`);
  console.log(`[2/5] Computed WASM SHA256: ${wasmHashHex}`);

  // 3. Upload WASM
  console.log(`[3/5] Uploading Contract WASM to Stellar Testnet...`);
  let account = await server.getAccount(deployerKeypair.publicKey());

  const uploadOp = Operation.uploadContractWasm({
    wasm: wasmBuffer,
  });

  const uploadTx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(uploadOp)
    .setTimeout(30)
    .build();

  console.log("Simulating WASM upload transaction...");
  const simUpload = await server.simulateTransaction(uploadTx);
  if (rpc.Api.isSimulationError(simUpload)) {
    console.log(`Simulation note (WASM may already exist): ${simUpload.error}`);
  } else {
    const preparedUploadTx = rpc.assembleTransaction(uploadTx, simUpload).build();
    preparedUploadTx.sign(deployerKeypair);
    const uploadSend = await server.sendTransaction(preparedUploadTx);
    if (uploadSend.status === "ERROR") {
      throw new Error(`Upload tx send error: ${JSON.stringify(uploadSend)}`);
    }
    console.log(`Sent WASM upload tx (${uploadSend.hash}), waiting for ledger inclusion...`);
    await pollRawTransaction(uploadSend.hash);
    console.log(`WASM successfully uploaded and anchored in ledger!`);
  }

  // 4. Instantiate Contract
  console.log(`[4/5] Instantiating Smart Contract Instance on Testnet...`);
  account = await server.getAccount(deployerKeypair.publicKey());

  const createOp = Operation.createCustomContract({
    address: Address.fromString(deployerKeypair.publicKey()),
    wasmHash: wasmHashBuffer,
  });

  const createTx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(createOp)
    .setTimeout(30)
    .build();

  console.log("Simulating contract instantiation...");
  const simCreate = await server.simulateTransaction(createTx);
  if (rpc.Api.isSimulationError(simCreate)) {
    throw new Error(`Contract creation simulation failed: ${simCreate.error}`);
  }

  const preparedCreateTx = rpc.assembleTransaction(createTx, simCreate).build();
  preparedCreateTx.sign(deployerKeypair);

  const createSend = await server.sendTransaction(preparedCreateTx);
  if (createSend.status === "ERROR") {
    throw new Error(`Failed to send contract creation tx: ${JSON.stringify(createSend)}`);
  }
  console.log(`Sent contract creation tx (${createSend.hash}), waiting for ledger inclusion...`);
  const createResult = await pollRawTransaction(createSend.hash);

  // Derive contractId from simulation result
  const contractAddress = Address.fromScVal(simCreate.result.retval);
  const contractId = contractAddress.toString();

  console.log("==================================================");
  console.log(`🎉 AGENTRAIL CONTRACT DEPLOYED ON STELLAR TESTNET!`);
  console.log(`Contract ID: ${contractId}`);
  console.log(`Explorer Link: https://stellar.expert/explorer/testnet/contract/${contractId}`);
  console.log("==================================================");

  // 5. Initialize Contract with Admin, Mock Token, Treasury & Protocol Fee
  const TREASURY_WALLET = "GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT";
  const DEFAULT_FEE_BPS = 20; // 0.20% protocol monetization fee

  console.log(`[5/5] Initializing contract with Admin, Token, Treasury (${TREASURY_WALLET}), and ${DEFAULT_FEE_BPS} bps fee...`);
  account = await server.getAccount(deployerKeypair.publicKey());

  const contractInstance = new (require("@stellar/stellar-sdk").Contract)(contractId);
  const initOp = contractInstance.call(
    "initialize",
    Address.fromString(deployerKeypair.publicKey()).toScVal(),
    Address.fromString(deployerKeypair.publicKey()).toScVal(),
    Address.fromString(TREASURY_WALLET).toScVal(),
    xdr.ScVal.scvU32(DEFAULT_FEE_BPS)
  );

  const initTx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(initOp)
    .setTimeout(30)
    .build();

  const simInit = await server.simulateTransaction(initTx);
  if (rpc.Api.isSimulationError(simInit)) {
    console.warn(`Init simulation note: ${simInit.error} (proceeding)`);
  } else {
    const preparedInitTx = rpc.assembleTransaction(initTx, simInit).build();
    preparedInitTx.sign(deployerKeypair);
    const initSend = await server.sendTransaction(preparedInitTx);
    console.log(`Sent initialize tx (${initSend.hash}), waiting for confirmation...`);
    await pollRawTransaction(initSend.hash);
    console.log(`✅ Contract initialized successfully with active monetization fee!`);
  }

  // 6. Save Deployment Metadata
  const deploymentInfo = {
    network: "Stellar Testnet",
    rpcUrl: RPC_URL,
    deployerAddress: deployerKeypair.publicKey(),
    wasmHash: wasmHashHex,
    contractId: contractId,
    treasuryAddress: TREASURY_WALLET,
    protocolFeeBps: DEFAULT_FEE_BPS,
    explorerUrl: `https://stellar.expert/explorer/testnet/contract/${contractId}`,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.resolve(__dirname, "../deployment.testnet.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("✅ Wrote deployment.testnet.json successfully!");

  return deploymentInfo;
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
