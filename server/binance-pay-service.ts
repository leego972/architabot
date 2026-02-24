import crypto from "crypto";
import { createLogger } from "./_core/logger.js";
const log = createLogger("BinancePayService");

// Binance Pay API Configuration
const BINANCE_PAY_API_URL = "https://bpay.binanceapi.com";
const BINANCE_PAY_API_KEY = process.env.BINANCE_PAY_API_KEY || "";
const BINANCE_PAY_API_SECRET = process.env.BINANCE_PAY_API_SECRET || "";

// Platform fee percentage (5% on all crowdfunding contributions)
export const PLATFORM_FEE_PERCENT = 5;

// Supported cryptocurrencies
export const SUPPORTED_CRYPTO = ["USDT", "BTC", "ETH", "BNB"] as const;
export type SupportedCrypto = (typeof SUPPORTED_CRYPTO)[number];

interface BinancePayHeaders {
  "content-type": string;
  "BinancePay-Timestamp": string;
  "BinancePay-Nonce": string;
  "BinancePay-Certificate-SN": string;
  "BinancePay-Signature": string;
}

interface CreateOrderParams {
  merchantTradeNo: string;
  fiatAmount: number;
  fiatCurrency: string;
  goodsName: string;
  goodsDetail: string;
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
  passThroughInfo?: string;
  supportPayCurrency?: string;
}

interface BinancePayOrderResponse {
  status: string;
  code: string;
  data: {
    prepayId: string;
    terminalType: string;
    expireTime: number;
    qrcodeLink: string;
    qrContent: string;
    checkoutUrl: string;
    deeplink: string;
    universalUrl: string;
  };
  errorMessage?: string;
}

interface WebhookPayload {
  bizType: string;
  bizId: string;
  bizIdStr: string;
  data: string;
  bizStatus: "PAY_SUCCESS" | "PAY_CLOSED";
}

/**
 * Generate a random 32-character nonce (a-z, A-Z)
 */
function generateNonce(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

/**
 * Generate Binance Pay API signature using HMAC-SHA512
 */
function generateSignature(
  timestamp: string,
  nonce: string,
  body: string
): string {
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  const hmac = crypto.createHmac("sha512", BINANCE_PAY_API_SECRET);
  hmac.update(payload);
  return hmac.digest("hex").toUpperCase();
}

/**
 * Build authenticated headers for Binance Pay API
 */
function buildHeaders(body: string): BinancePayHeaders {
  const timestamp = Date.now().toString();
  const nonce = generateNonce();
  const signature = generateSignature(timestamp, nonce, body);

  return {
    "content-type": "application/json",
    "BinancePay-Timestamp": timestamp,
    "BinancePay-Nonce": nonce,
    "BinancePay-Certificate-SN": BINANCE_PAY_API_KEY,
    "BinancePay-Signature": signature,
  };
}

/**
 * Check if Binance Pay is configured
 */
export function isBinancePayConfigured(): boolean {
  return !!(BINANCE_PAY_API_KEY && BINANCE_PAY_API_SECRET);
}

/**
 * Generate a unique merchant trade number
 */
export function generateMerchantTradeNo(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString("hex");
  return `AT${timestamp}${random}`.substring(0, 32);
}

/**
 * Calculate platform fee from a contribution amount
 */
export function calculatePlatformFee(amount: number): {
  platformFee: number;
  creatorAmount: number;
  totalAmount: number;
} {
  const platformFee = Math.round(amount * PLATFORM_FEE_PERCENT) / 100;
  const creatorAmount = amount - platformFee;
  return {
    platformFee,
    creatorAmount,
    totalAmount: amount,
  };
}

/**
 * Create a Binance Pay order for a crowdfunding contribution
 */
export async function createCryptoPaymentOrder(
  params: CreateOrderParams
): Promise<BinancePayOrderResponse> {
  if (!isBinancePayConfigured()) {
    throw new Error(
      "Binance Pay is not configured. Set BINANCE_PAY_API_KEY and BINANCE_PAY_API_SECRET environment variables."
    );
  }

  const requestBody = {
    env: {
      terminalType: "WEB",
    },
    merchantTradeNo: params.merchantTradeNo,
    fiatAmount: params.fiatAmount.toFixed(2),
    fiatCurrency: params.fiatCurrency || "USD",
    goodsDetails: [
      {
        goodsType: "02", // Virtual goods
        goodsCategory: "Z000", // Others
        referenceGoodsId: params.merchantTradeNo,
        goodsName: params.goodsName,
        goodsDetail: params.goodsDetail,
        goodsUnitAmount: {
          currency: params.fiatCurrency || "USD",
          amount: params.fiatAmount.toFixed(2),
        },
        goodsQuantity: "1",
      },
    ],
    returnUrl: params.returnUrl,
    cancelUrl: params.cancelUrl,
    webhookUrl: params.webhookUrl,
    supportPayCurrency: params.supportPayCurrency || "USDT,BTC,ETH,BNB",
    orderExpireTime: Date.now() + 3600000, // 1 hour expiry
    passThroughInfo: params.passThroughInfo || "",
  };

  const bodyStr = JSON.stringify(requestBody);
  const headers = buildHeaders(bodyStr);

  try {
    const response = await fetch(
      `${BINANCE_PAY_API_URL}/binancepay/openapi/v3/order`,
      {
        method: "POST",
        headers: headers as any,
        body: bodyStr,
      }
    );

    const result = (await response.json()) as BinancePayOrderResponse;

    if (result.status !== "SUCCESS") {
      log.error("Binance Pay order creation failed:", { detail: result });
      throw new Error(
        `Binance Pay error: ${result.errorMessage || result.code || "Unknown error"}`
      );
    }

    return result;
  } catch (error: any) {
    log.error("Binance Pay API call failed:", { error: String(error) });
    throw new Error(`Failed to create crypto payment: ${error.message}`);
  }
}

/**
 * Query order status from Binance Pay
 */
export async function queryOrderStatus(merchantTradeNo: string): Promise<any> {
  if (!isBinancePayConfigured()) {
    throw new Error("Binance Pay is not configured.");
  }

  const requestBody = { merchantTradeNo };
  const bodyStr = JSON.stringify(requestBody);
  const headers = buildHeaders(bodyStr);

  try {
    const response = await fetch(
      `${BINANCE_PAY_API_URL}/binancepay/openapi/v2/order/query`,
      {
        method: "POST",
        headers: headers as any,
        body: bodyStr,
      }
    );

    return await response.json();
  } catch (error: any) {
    log.error("Binance Pay query failed:", { error: String(error) });
    throw new Error(`Failed to query order: ${error.message}`);
  }
}

/**
 * Verify webhook signature from Binance Pay
 */
export function verifyWebhookSignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string
): boolean {
  const expectedSignature = generateSignature(timestamp, nonce, body);
  return expectedSignature === signature;
}

/**
 * Parse webhook notification data
 */
export function parseWebhookData(payload: WebhookPayload): {
  bizType: string;
  bizId: string;
  bizStatus: string;
  data: any;
} {
  let parsedData: any = {};
  try {
    parsedData = JSON.parse(payload.data);
  } catch {
    parsedData = payload.data;
  }

  return {
    bizType: payload.bizType,
    bizId: payload.bizIdStr || payload.bizId,
    bizStatus: payload.bizStatus,
    data: parsedData,
  };
}

/**
 * Get crypto payment info for display (when Binance Pay is not configured, show wallet addresses)
 */
export function getFallbackCryptoInfo(): {
  configured: boolean;
  walletAddresses: Record<string, string>;
  instructions: string;
} {
  return {
    configured: false,
    walletAddresses: {
      BTC: process.env.BTC_WALLET_ADDRESS || "Not configured",
      ETH: process.env.ETH_WALLET_ADDRESS || "Not configured",
      USDT: process.env.USDT_WALLET_ADDRESS || "Not configured",
      BNB: process.env.BNB_WALLET_ADDRESS || "Not configured",
    },
    instructions:
      "Send crypto to the wallet address above. Include your campaign ID and name in the transaction memo. Contributions will be manually verified within 24 hours.",
  };
}
