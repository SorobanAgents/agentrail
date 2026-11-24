import { Keypair } from "@stellar/stellar-sdk";
import fs from "fs";
import path from "path";

const keyPath = path.resolve(".mainnet_agent_key.json");
if (fs.existsSync(keyPath)) {
  const existing = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  console.log("EXISTING_KEY_FOUND");
  console.log("PUBLIC_KEY:", existing.publicKey);
} else {
  const kp = Keypair.random();
  fs.writeFileSync(keyPath, JSON.stringify({
    publicKey: kp.publicKey(),
    secretKey: kp.secret()
  }, null, 2));
  console.log("NEW_KEY_GENERATED");
  console.log("PUBLIC_KEY:", kp.publicKey());
}
