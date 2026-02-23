/**
 * Binance Pay Webhook Handler
 * Processes payment notifications from Binance Pay and updates campaign contributions.
 */

import type { Express, Request, Response } from "express";
import { verifyWebhookSignature, parseWebhookData, isBinancePayConfigured } from "./binance-pay-service";
import { getDb } from "./db";
import { cryptoPayments } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export function registerBinancePayWebhook(app: Express): void {
  // Register BEFORE express.json() for raw body access (same pattern as Stripe)
  app.post(
    "/api/webhooks/binance-pay",
    (req: Request, res: Response, next) => {
      if (Buffer.isBuffer(req.body)) {
        return next();
      }
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => (data += chunk));
      req.on("end", () => {
        (req as any).rawBody = data;
        try {
          req.body = JSON.parse(data);
        } catch {
          req.body = data;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        if (!isBinancePayConfigured()) {
          console.warn("[BinancePay Webhook] Received webhook but Binance Pay not configured");
          res.json({ returnCode: "SUCCESS", returnMessage: null });
          return;
        }

        // Verify signature
        const timestamp = req.headers["binancepay-timestamp"] as string;
        const nonce = req.headers["binancepay-nonce"] as string;
        const signature = req.headers["binancepay-signature"] as string;
        const rawBody = (req as any).rawBody || JSON.stringify(req.body);

        if (!timestamp || !nonce || !signature) {
          console.error("[BinancePay Webhook] Missing signature headers");
          res.status(400).json({ returnCode: "FAIL", returnMessage: "Missing headers" });
          return;
        }

        const isValid = verifyWebhookSignature(timestamp, nonce, rawBody, signature);
        if (!isValid) {
          console.error("[BinancePay Webhook] Invalid signature");
          res.status(401).json({ returnCode: "FAIL", returnMessage: "Invalid signature" });
          return;
        }

        // Parse the webhook payload
        const payload = req.body;
        const { bizType, bizStatus, data } = parseWebhookData(payload);

        console.log(`[BinancePay Webhook] Received: bizType=${bizType}, bizStatus=${bizStatus}`);

        if (bizType === "PAY" && bizStatus === "PAY_SUCCESS") {
          // Payment successful — update crypto_payments record and campaign
          const merchantTradeNo = data.merchantTradeNo;
          if (!merchantTradeNo) {
            console.error("[BinancePay Webhook] No merchantTradeNo in webhook data");
            res.json({ returnCode: "SUCCESS", returnMessage: null });
            return;
          }

          const db = await getDb();
          if (!db) {
            console.error("[BinancePay Webhook] Database not available");
            res.json({ returnCode: "SUCCESS", returnMessage: null });
            return;
          }

          // Update crypto payment record
          await db.update(cryptoPayments)
            .set({
              status: "completed",
              cryptoCurrency: data.currency || data.paymentInfo?.currency,
              cryptoAmount: String(data.orderAmount || data.paymentInfo?.orderAmount || "0"),
              paidAt: new Date(),
              webhookData: JSON.stringify(data),
            })
            .where(eq(cryptoPayments.merchantTradeNo, merchantTradeNo));

          // Get the payment record to find campaign and update it
          const [payment] = await db.select()
            .from(cryptoPayments)
            .where(eq(cryptoPayments.merchantTradeNo, merchantTradeNo))
            .limit(1);

          if (payment && payment.campaignId) {
            // Update campaign currentAmount and backerCount
            const { crowdfundingCampaigns } = await import("../drizzle/schema.js");
            const [campaign] = await db.select()
              .from(crowdfundingCampaigns)
              .where(eq(crowdfundingCampaigns.id, payment.campaignId))
              .limit(1);

            if (campaign) {
              const newAmount = (campaign.currentAmount || 0) + Math.round(parseFloat(payment.creatorAmount || "0") * 100) / 100;
              const newBackers = (campaign.backerCount || 0) + 1;
              await db.update(crowdfundingCampaigns)
                .set({
                  currentAmount: Math.round(newAmount),
                  backerCount: newBackers,
                })
                .where(eq(crowdfundingCampaigns.id, payment.campaignId));

              console.log(`[BinancePay Webhook] Campaign #${payment.campaignId} updated: +$${payment.creatorAmount}, backers=${newBackers}`);
            }

            // Record platform revenue
            try {
              const { platformRevenue } = await import("../drizzle/schema.js");
              await db.insert(platformRevenue).values({
                source: "binance_pay",
                sourceId: merchantTradeNo,
                type: "crowdfunding_platform_fee",
                amount: payment.platformFee || "0",
                currency: payment.fiatCurrency || "USD",
                description: `Platform fee from crypto contribution to campaign #${payment.campaignId}`,
              });
            } catch (err) {
              console.error("[BinancePay Webhook] Failed to record revenue:", err);
            }
          }

          console.log(`[BinancePay Webhook] Payment ${merchantTradeNo} completed successfully`);
        } else if (bizType === "PAY" && bizStatus === "PAY_CLOSED") {
          // Payment expired or cancelled
          const merchantTradeNo = data.merchantTradeNo;
          if (merchantTradeNo) {
            const db = await getDb();
            if (db) {
              await db.update(cryptoPayments)
                .set({ status: "expired", webhookData: JSON.stringify(data) })
                .where(eq(cryptoPayments.merchantTradeNo, merchantTradeNo));
            }
          }
          console.log(`[BinancePay Webhook] Payment closed/expired`);
        }

        // Always return SUCCESS to acknowledge receipt
        res.json({ returnCode: "SUCCESS", returnMessage: null });
      } catch (err: any) {
        console.error("[BinancePay Webhook] Error:", err.message);
        // Still return SUCCESS to prevent Binance from retrying endlessly
        res.json({ returnCode: "SUCCESS", returnMessage: null });
      }
    }
  );

  console.log("[BinancePay] Webhook registered at /api/webhooks/binance-pay");
}
