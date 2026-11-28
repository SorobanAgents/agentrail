import {
  Keypair,
  Horizon,
  Networks,
  TransactionBuilder,
  Asset,
  Operation,
} from "@stellar/stellar-sdk";
import * as fs from "fs";
import * as path from "path";

const ENV_PATH = path.join("d:", "PersonalAI", "agentrail", ".env.agent");
const rawEnv = fs.readFileSync(ENV_PATH, "utf-8");
const secret = rawEnv.match(/AGENT_SECRET_KEY=(S[A-Z2-7]{55})/)?.[1];
const issuerKeypair = Keypair.fromSecret(secret);
const issuerAddress = issuerKeypair.publicKey();

const horizonUrl = "https://horizon.stellar.org";
const server = new Horizon.Server(horizonUrl);

async function main() {
  console.log("Issuer:", issuerAddress);
  const asset = new Asset("ARBADGE", issuerAddress);

  // Generate a holder keypair
  const holderKeypair = Keypair.random();
  console.log("Holder Public Key:", holderKeypair.publicKey());

  // 1. Create and fund holder account with 1.5 XLM from issuer
  console.log("1. Creating and funding holder account...");
  const issuerAccount = await server.loadAccount(issuerAddress);
  const baseFee = await server.fetchBaseFee();

  const createTx = new TransactionBuilder(issuerAccount, {
    fee: baseFee.toString(),
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(
      Operation.createAccount({
        destination: holderKeypair.publicKey(),
        startingBalance: "1.5",
      })
    )
    .setTimeout(30)
    .build();

  createTx.sign(issuerKeypair);
  const createRes = await server.submitTransaction(createTx);
  console.log("Holder account created! Tx:", createRes.hash);

  // 2. Holder adds trustline for ARBADGE
  console.log("2. Adding trustline for ARBADGE on holder account...");
  const holderAccount = await server.loadAccount(holderKeypair.publicKey());

  const trustTx = new TransactionBuilder(holderAccount, {
    fee: baseFee.toString(),
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(
      Operation.changeTrust({
        asset: asset,
        limit: "1000000",
      })
    )
    .setTimeout(30)
    .build();

  trustTx.sign(holderKeypair);
  const trustRes = await server.submitTransaction(trustTx);
  console.log("Trustline created! Tx:", trustRes.hash);

  // 3. Issuer mints / pays 3333 ARBADGE to holder
  console.log("3. Minting initial 3333 ARBADGE to holder...");
  const reloadedIssuer = await server.loadAccount(issuerAddress);

  const payTx = new TransactionBuilder(reloadedIssuer, {
    fee: baseFee.toString(),
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(
      Operation.payment({
        destination: holderKeypair.publicKey(),
        asset: asset,
        amount: "3333",
      })
    )
    .setTimeout(30)
    .build();

  payTx.sign(issuerKeypair);
  const payRes = await server.submitTransaction(payTx);
  console.log("🎉 Successfully minted 3333 ARBADGE! Tx:", payRes.hash);
  console.log("Ledger:", payRes.ledger);
  console.log("Check StellarExpert now: https://stellar.expert/explorer/public/asset/ARBADGE-" + issuerAddress);
}

main().catch((err) => {
  console.error("Error:", err);
});
