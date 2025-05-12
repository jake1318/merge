// routes/bluefin.js
import express from "express";
import * as bluefinService from "../services/bluefinService.js";

const router = express.Router();

// Get pool details
router.get("/pool/:poolId", async (req, res) => {
  try {
    const { poolId } = req.params;
    const pool = await bluefinService.getPoolDetails(poolId);

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: "Pool not found",
      });
    }

    res.json({
      success: true,
      data: pool,
    });
  } catch (error) {
    console.error("Error fetching pool:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user positions
router.get("/positions/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const positions = await bluefinService.getPositionsByOwner(walletAddress);

    res.json({
      success: true,
      data: positions,
    });
  } catch (error) {
    console.error("Error fetching positions:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create deposit transaction
router.post("/create-deposit-tx", async (req, res) => {
  try {
    const { poolId, amountA, amountB } = req.body;

    if (!poolId || typeof amountA !== "number") {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      });
    }

    const txData = await bluefinService.createDepositTransaction(
      poolId,
      amountA,
      amountB || 0
    );

    res.json({
      success: true,
      ...txData,
    });
  } catch (error) {
    console.error("Error creating deposit transaction:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create remove liquidity transaction
router.post("/create-remove-liquidity-tx", async (req, res) => {
  try {
    const { poolId, positionId, percent = 100 } = req.body;

    if (!poolId || !positionId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      });
    }

    const txData = await bluefinService.createRemoveLiquidityTransaction(
      poolId,
      positionId,
      percent
    );

    res.json({
      success: true,
      ...txData,
    });
  } catch (error) {
    console.error("Error creating remove liquidity transaction:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create collect fees transaction
router.post("/create-collect-fees-tx", async (req, res) => {
  try {
    const { poolId, positionId } = req.body;

    if (!poolId || !positionId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      });
    }

    const txData = await bluefinService.createCollectFeesTransaction(
      poolId,
      positionId
    );

    res.json({
      success: true,
      ...txData,
    });
  } catch (error) {
    console.error("Error creating collect fees transaction:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create close position transaction
router.post("/create-close-position-tx", async (req, res) => {
  try {
    const { poolId, positionId, walletAddress } = req.body;

    if (!poolId || !positionId || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      });
    }

    const txData = await bluefinService.createClosePositionTransaction(
      poolId,
      positionId,
      walletAddress
    );

    res.json({
      success: true,
      ...txData,
    });
  } catch (error) {
    console.error("Error creating close position transaction:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
