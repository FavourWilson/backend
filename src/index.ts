import express from "express";
import { ethers } from "ethers";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import vaultAbi from "../abis/CorporateVault.json";
import usdxAbi from "../abis/USDx.json";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(bodyParser.json());

// --- Blockchain setup ---
const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

// --- Contract ABIs & Addresses ---


const vaultAddress = process.env.VAULT_ADDRESS!;
const usdXAddress = process.env.USDX_ADDRESS!;

const vaultContract = new ethers.Contract(vaultAddress, vaultAbi, wallet);
const usdxContract = new ethers.Contract(usdXAddress, usdxAbi, wallet);

// --- API Endpoints ---

// 1. Get vault balance
app.get("/vault-balance", async (req, res) => {
  try {
    const balance = await usdxContract.balanceOf(wallet.address);
    res.json({ balance: ethers.formatUnits(balance, 6) }); // 6 decimals
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Deposit USDx into vault
app.post("/deposit-usdx", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || Number(amount) <= 0) throw new Error("Invalid deposit amount");

    const parsedAmount = ethers.parseUnits(amount.toString(), 6);

    // 2a. Mint USDx to backend wallet (owner)
    const mintTx = await usdxContract.mint(wallet.address, parsedAmount);
    await mintTx.wait();

    // 2b. Approve the vault to pull USDx
    const approveTx = await usdxContract.approve(vaultAddress, parsedAmount);
    await approveTx.wait();

    // 2c. Deposit into vault
    const depositTx = await vaultContract.depositUSDx(parsedAmount);
    await depositTx.wait();

    res.json({
      txHash: depositTx.hash,
      message: `${amount} USDx deposited successfully into the vault!`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Submit batch payment
app.post("/submit-batch-payment", async (req, res) => {
  try {
    const { recipients, amounts } = req.body;

    if (!recipients || !amounts) throw new Error("Missing recipients or amounts");
    if (recipients.length !== amounts.length) throw new Error("Recipients and amounts mismatch");

    const parsedAmounts = amounts.map((a: string) => ethers.parseUnits(a.toString(), 6));

    const tx = await vaultContract.submitBatchPayment(recipients, parsedAmounts);
    await tx.wait();

    res.json({ txHash: tx.hash, message: "Batch payment submitted!" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Approve payment
app.post("/approve-payment", async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (paymentId === undefined) throw new Error("Missing paymentId");

    const tx = await vaultContract.approvePayment(paymentId);
    await tx.wait();

    res.json({ txHash: tx.hash, message: `Payment ${paymentId} approved!` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
