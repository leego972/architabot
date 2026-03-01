// Storage helpers — supports both standalone AWS S3 and Manus Forge proxy
// Railway migration: Uses AWS S3 SDK when AWS credentials are available,
// falls back to Manus Forge storage proxy otherwise.

import { ENV } from './_core/env';

type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    // Check for AWS S3 credentials
    if (process.env.AWS_S3_BUCKET) {
      return { baseUrl: "s3", apiKey: "s3" };
    }
    throw new Error(
      "Storage credentials missing: set AWS_S3_BUCKET + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, or BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY"
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function isS3Mode(): boolean {
  return !!process.env.AWS_S3_BUCKET;
}

// ---- AWS S3 Direct Mode ----

async function s3Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
  originalFileName?: string
): Promise<{ key: string; url: string }> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  
  const bucket = process.env.AWS_S3_BUCKET!;
  const region = process.env.AWS_S3_REGION || "us-east-1";
  
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });

  const key = relKey.replace(/^\/+/, "");
  const body = typeof data === "string" ? Buffer.from(data) : data;

  // Derive filename for Content-Disposition from the original filename or the S3 key
  const dispositionName = originalFileName || key.split("/").pop() || "file";

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentDisposition: `attachment; filename="${dispositionName}"`,
    ACL: "public-read",
  }));

  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  return { key, url };
}

async function s3Get(relKey: string): Promise<{ key: string; url: string }> {
  const bucket = process.env.AWS_S3_BUCKET!;
  const region = process.env.AWS_S3_REGION || "us-east-1";
  const key = relKey.replace(/^\/+/, "");
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  return { key, url };
}

// ---- Manus Forge Proxy Mode ----

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

// ---- Public API ----

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  originalFileName?: string
): Promise<{ key: string; url: string }> {
  // Use S3 direct if AWS credentials are available
  if (isS3Mode()) {
    return s3Put(relKey, data, contentType, originalFileName);
  }

  // Fall back to Manus Forge proxy
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  // Use S3 direct if AWS credentials are available
  if (isS3Mode()) {
    return s3Get(relKey);
  }

  // Fall back to Manus Forge proxy
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}

export async function storageDelete(relKey: string): Promise<void> {
  // Use S3 direct if AWS credentials are available
  if (isS3Mode()) {
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const bucket = process.env.AWS_S3_BUCKET!;
    const region = process.env.AWS_S3_REGION || "us-east-1";
    const client = new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
    const key = relKey.replace(/^\/+/, "");
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }

  // For Manus Forge proxy mode, deletion is not supported — silently skip
  // The file will be orphaned in storage but removed from the database
}
