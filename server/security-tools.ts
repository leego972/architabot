/**
 * Security Tools v1.0
 *
 * Built-in security scanning and analysis tools for Archibald Titan.
 * Adapted from VIBA pentest modules for professional security work.
 *
 * Tools:
 * 1. Passive Web Scanner — HTTP security header analysis
 * 2. Code Security Reviewer — AI-powered code vulnerability analysis
 * 3. Security Report Generator — Professional pentest report output
 * 4. Port Scanner — Network port discovery
 * 5. SSL/TLS Checker — Certificate analysis
 * 6. Dependency Auditor — CVE checking for packages
 */

import https from "node:https";
import http from "node:http";
import { invokeLLM } from "./_core/llm";
import { getUserOpenAIKey } from "./user-secrets-router";

// ─── 1. Passive Web Scanner ─────────────────────────────────────────

export type SecurityHeaderResult = {
  url: string;
  statusCode: number | null;
  headers: Record<string, string | string[] | undefined>;
  securityHeaders: {
    hsts: boolean;
    csp: boolean;
    xFrameOptions: boolean;
    xContentTypeOptions: boolean;
    referrerPolicy: boolean;
    permissionsPolicy: boolean;
  };
  cookies: Array<{ raw: string; issues: string[] }>;
  findings: SecurityFinding[];
  score: number; // 0-100
};

export type SecurityFinding = {
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  recommendation: string;
};

function requestHead(
  urlStr: string
): Promise<{ statusCode: number | null; headers: Record<string, any> }> {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "http:" ? http : https;

    const req = lib.request(
      {
        method: "HEAD",
        hostname: url.hostname,
        port: url.port || (url.protocol === "http:" ? 80 : 443),
        path: url.pathname + url.search,
        timeout: 10_000,
        headers: {
          "User-Agent": "Titan-SecurityScanner/1.0 (authorized passive scan)",
          Accept: "*/*",
        },
      },
      (res) => {
        resolve({ statusCode: res.statusCode ?? null, headers: res.headers as any });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ statusCode: null, headers: {} });
    });
    req.on("error", () => resolve({ statusCode: null, headers: {} }));
    req.end();
  });
}

function analyzeCookies(
  setCookie: string[] | string | undefined
): Array<{ raw: string; issues: string[] }> {
  if (!setCookie) return [];
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr.map((raw) => {
    const lower = raw.toLowerCase();
    const issues: string[] = [];
    if (!lower.includes("secure")) issues.push("Missing Secure flag");
    if (!lower.includes("httponly")) issues.push("Missing HttpOnly flag");
    if (!lower.includes("samesite")) issues.push("Missing SameSite attribute");
    return { raw, issues };
  });
}

function toUrl(value: string): string {
  const v = value.trim();
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}

export async function runPassiveWebScan(target: string): Promise<SecurityHeaderResult> {
  const url = toUrl(target);
  const { statusCode, headers } = await requestHead(url);

  const h = Object.fromEntries(
    Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );

  const securityHeaders = {
    hsts: Boolean(h["strict-transport-security"]),
    csp: Boolean(h["content-security-policy"]),
    xFrameOptions: Boolean(h["x-frame-options"]),
    xContentTypeOptions: Boolean(h["x-content-type-options"]),
    referrerPolicy: Boolean(h["referrer-policy"]),
    permissionsPolicy: Boolean(h["permissions-policy"]),
  };

  const findings: SecurityFinding[] = [];

  if (!securityHeaders.hsts) {
    findings.push({
      severity: "high",
      title: "Missing HSTS Header",
      description:
        "The Strict-Transport-Security header is not set. This allows downgrade attacks and cookie hijacking via HTTP.",
      recommendation:
        "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` to all HTTPS responses.",
    });
  }

  if (!securityHeaders.csp) {
    findings.push({
      severity: "high",
      title: "Missing Content-Security-Policy",
      description:
        "No CSP header found. The site is vulnerable to XSS and data injection attacks.",
      recommendation:
        "Implement a Content-Security-Policy header. Start with `default-src 'self'` and add exceptions as needed.",
    });
  }

  if (!securityHeaders.xFrameOptions) {
    findings.push({
      severity: "medium",
      title: "Missing X-Frame-Options",
      description:
        "The X-Frame-Options header is not set. The site may be vulnerable to clickjacking attacks.",
      recommendation: "Add `X-Frame-Options: DENY` or `SAMEORIGIN` to prevent framing.",
    });
  }

  if (!securityHeaders.xContentTypeOptions) {
    findings.push({
      severity: "medium",
      title: "Missing X-Content-Type-Options",
      description:
        "Without this header, browsers may MIME-sniff responses, potentially executing malicious content.",
      recommendation: "Add `X-Content-Type-Options: nosniff` to all responses.",
    });
  }

  if (!securityHeaders.referrerPolicy) {
    findings.push({
      severity: "low",
      title: "Missing Referrer-Policy",
      description:
        "No Referrer-Policy set. Full URLs including query parameters may leak to third-party sites.",
      recommendation:
        "Add `Referrer-Policy: strict-origin-when-cross-origin` or `no-referrer`.",
    });
  }

  if (!securityHeaders.permissionsPolicy) {
    findings.push({
      severity: "low",
      title: "Missing Permissions-Policy",
      description:
        "No Permissions-Policy header. Browser features like camera, microphone, and geolocation are not restricted.",
      recommendation:
        "Add a Permissions-Policy header to restrict unnecessary browser features.",
    });
  }

  const cookies = analyzeCookies(headers?.["set-cookie"] as any);
  for (const cookie of cookies) {
    if (cookie.issues.length > 0) {
      findings.push({
        severity: "medium",
        title: `Insecure Cookie: ${cookie.issues.join(", ")}`,
        description: `Cookie is missing security flags: ${cookie.issues.join(", ")}. Raw: ${cookie.raw.slice(0, 100)}`,
        recommendation:
          "Set Secure, HttpOnly, and SameSite=Strict (or Lax) on all cookies.",
      });
    }
  }

  // Calculate score (100 = all headers present, no cookie issues)
  const headerCount = Object.values(securityHeaders).filter(Boolean).length;
  const headerScore = (headerCount / 6) * 70; // 70% weight for headers
  const cookieScore = cookies.length === 0 || cookies.every((c) => c.issues.length === 0) ? 30 : 15;
  const score = Math.round(headerScore + cookieScore);

  return {
    url,
    statusCode,
    headers,
    securityHeaders,
    cookies,
    findings,
    score,
  };
}

// ─── 2. Code Security Reviewer ──────────────────────────────────────

export type CodeReviewIssue = {
  severity: "critical" | "high" | "medium" | "low";
  category: "security" | "performance" | "best-practices" | "maintainability";
  file: string;
  line?: number;
  title: string;
  description: string;
  suggestion: string;
};

export type CodeReviewReport = {
  overallScore: number;
  issues: CodeReviewIssue[];
  summary: string;
  strengths: string[];
  recommendations: string[];
};

export async function analyzeCodeSecurity(
  files: Array<{ filename: string; content: string }>,
  userId?: number
): Promise<CodeReviewReport> {
  const userApiKey = userId ? (await getUserOpenAIKey(userId) || undefined) : undefined;
  const codeContext = files
    .map((file) => `// File: ${file.filename}\n${file.content}`)
    .join("\n\n---\n\n");

  const response = await invokeLLM({
    systemTag: "misc",
    userApiKey,
    messages: [
      {
        role: "system",
        content: `You are an expert security code reviewer. Analyze the provided code for vulnerabilities and security issues. Focus on:

1. **Security**: SQL injection, XSS, CSRF, authentication bypasses, insecure crypto, hardcoded secrets, path traversal, command injection, SSRF, insecure deserialization
2. **Performance**: N+1 queries, memory leaks, blocking operations, missing indexes
3. **Best Practices**: Error handling, input validation, logging, rate limiting
4. **Maintainability**: Code complexity, duplication, unclear logic

Return a JSON object with this exact structure:
{
  "overallScore": <0-100>,
  "issues": [{"severity": "critical|high|medium|low", "category": "security|performance|best-practices|maintainability", "file": "<filename>", "line": <number or null>, "title": "<short title>", "description": "<detailed description>", "suggestion": "<how to fix>"}],
  "summary": "<2-3 sentence overview>",
  "strengths": ["<good thing 1>", "<good thing 2>"],
  "recommendations": ["<top recommendation 1>", "<top recommendation 2>"]
}`,
      },
      {
        role: "user",
        content: `Review this code for security vulnerabilities:\n\n${codeContext}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "code_review",
        strict: true,
        schema: {
          type: "object",
          properties: {
            overallScore: { type: "integer", description: "Score from 0-100" },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                  category: { type: "string", enum: ["security", "performance", "best-practices", "maintainability"] },
                  file: { type: "string" },
                  line: { type: ["integer", "null"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  suggestion: { type: "string" },
                },
                required: ["severity", "category", "file", "title", "description", "suggestion"],
                additionalProperties: false,
              },
            },
            summary: { type: "string" },
            strengths: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["overallScore", "issues", "summary", "strengths", "recommendations"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response?.choices?.[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : null;
  if (!content) {
    return {
      overallScore: 0,
      issues: [],
      summary: "Failed to analyze code — LLM returned no response.",
      strengths: [],
      recommendations: ["Retry the analysis."],
    };
  }

  try {
    return JSON.parse(content) as CodeReviewReport;
  } catch {
    return {
      overallScore: 0,
      issues: [],
      summary: "Failed to parse code review results.",
      strengths: [],
      recommendations: ["Retry the analysis."],
    };
  }
}

// ─── 3. Security Report Generator ───────────────────────────────────

export function generateSecurityReport(args: {
  target: string;
  scanDate: string;
  scanResult: SecurityHeaderResult;
  codeReview?: CodeReviewReport;
}): string {
  const { target, scanDate, scanResult, codeReview } = args;

  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };

  const sortedFindings = [...scanResult.findings].sort(
    (a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
  );

  const counts = sortedFindings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  let report = `# Security Assessment Report

**Target:** ${target}
**Date:** ${scanDate}
**Scanner:** Archibald Titan Security Scanner v1.0
**Type:** Passive Web Security Assessment

---

## Executive Summary

Security Score: **${scanResult.score}/100**

| Severity | Count |
|----------|-------|
| Critical | ${counts.critical || 0} |
| High | ${counts.high || 0} |
| Medium | ${counts.medium || 0} |
| Low | ${counts.low || 0} |
| Info | ${counts.info || 0} |

**Status Code:** ${scanResult.statusCode ?? "N/A"}

---

## Security Headers Analysis

| Header | Status |
|--------|--------|
| Strict-Transport-Security (HSTS) | ${scanResult.securityHeaders.hsts ? "✅ Present" : "❌ Missing"} |
| Content-Security-Policy (CSP) | ${scanResult.securityHeaders.csp ? "✅ Present" : "❌ Missing"} |
| X-Frame-Options | ${scanResult.securityHeaders.xFrameOptions ? "✅ Present" : "❌ Missing"} |
| X-Content-Type-Options | ${scanResult.securityHeaders.xContentTypeOptions ? "✅ Present" : "❌ Missing"} |
| Referrer-Policy | ${scanResult.securityHeaders.referrerPolicy ? "✅ Present" : "❌ Missing"} |
| Permissions-Policy | ${scanResult.securityHeaders.permissionsPolicy ? "✅ Present" : "❌ Missing"} |

---

## Findings

`;

  for (const [idx, finding] of sortedFindings.entries()) {
    const badge =
      finding.severity === "critical"
        ? "🔴"
        : finding.severity === "high"
          ? "🟠"
          : finding.severity === "medium"
            ? "🟡"
            : "🟢";

    report += `### ${idx + 1}. ${badge} [${finding.severity.toUpperCase()}] ${finding.title}

${finding.description}

**Recommendation:** ${finding.recommendation}

---

`;
  }

  if (scanResult.cookies.length > 0) {
    report += `## Cookie Analysis

| Cookie | Issues |
|--------|--------|
`;
    for (const cookie of scanResult.cookies) {
      const name = cookie.raw.split("=")[0] || "Unknown";
      report += `| ${name} | ${cookie.issues.length > 0 ? cookie.issues.join(", ") : "✅ Secure"} |\n`;
    }
    report += "\n---\n\n";
  }

  if (codeReview) {
    report += `## Code Security Review

**Code Quality Score:** ${codeReview.overallScore}/100

${codeReview.summary}

### Strengths
${codeReview.strengths.map((s) => `- ${s}`).join("\n")}

### Code Issues Found

`;
    for (const issue of codeReview.issues) {
      report += `- **[${issue.severity.toUpperCase()}]** ${issue.title} (${issue.file}${issue.line ? `:${issue.line}` : ""}): ${issue.description}\n`;
    }

    report += `\n### Top Recommendations\n${codeReview.recommendations.map((r) => `- ${r}`).join("\n")}\n\n---\n\n`;
  }

  report += `## Disclaimer

This report was generated by Archibald Titan's automated security scanner. It covers passive analysis only and does not include active exploitation testing. Results should be validated by a qualified security professional before taking remediation action.

---

*Generated by Archibald Titan Security Scanner — ${new Date().toISOString()}*
`;

  return report;
}

// ─── 4. Port Scanner (lightweight) ──────────────────────────────────

export type PortScanResult = {
  host: string;
  openPorts: Array<{ port: number; service: string }>;
  closedPorts: number[];
  scanDuration: number;
};

const COMMON_PORTS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  443: "HTTPS",
  445: "SMB",
  993: "IMAPS",
  995: "POP3S",
  1433: "MSSQL",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5900: "VNC",
  6379: "Redis",
  8080: "HTTP-Alt",
  8443: "HTTPS-Alt",
  27017: "MongoDB",
};

function checkPort(host: string, port: number, timeout: number = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require("net");
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export async function runPortScan(
  host: string,
  ports?: number[]
): Promise<PortScanResult> {
  const targetPorts = ports || Object.keys(COMMON_PORTS).map(Number);
  const startTime = Date.now();

  const openPorts: Array<{ port: number; service: string }> = [];
  const closedPorts: number[] = [];

  // Scan in batches of 10 to avoid overwhelming the target
  const batchSize = 10;
  for (let i = 0; i < targetPorts.length; i += batchSize) {
    const batch = targetPorts.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (port) => ({
        port,
        open: await checkPort(host, port),
      }))
    );

    for (const r of results) {
      if (r.open) {
        openPorts.push({
          port: r.port,
          service: COMMON_PORTS[r.port] || "Unknown",
        });
      } else {
        closedPorts.push(r.port);
      }
    }
  }

  return {
    host,
    openPorts: openPorts.sort((a, b) => a.port - b.port),
    closedPorts: closedPorts.sort((a, b) => a - b),
    scanDuration: Date.now() - startTime,
  };
}

// ─── 5. SSL/TLS Checker ─────────────────────────────────────────────

export type SSLCheckResult = {
  host: string;
  valid: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  protocol: string;
  fingerprint: string;
  altNames: string[];
  issues: string[];
};

export async function checkSSL(host: string): Promise<SSLCheckResult> {
  return new Promise((resolve) => {
    const tls = require("tls");
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const protocol = socket.getProtocol();

        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const daysUntilExpiry = Math.floor(
          (validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        const issues: string[] = [];
        if (!authorized) issues.push("Certificate not trusted by system CA store");
        if (daysUntilExpiry < 0) issues.push("Certificate has expired");
        else if (daysUntilExpiry < 30) issues.push(`Certificate expires in ${daysUntilExpiry} days`);
        if (protocol === "TLSv1" || protocol === "TLSv1.1")
          issues.push(`Outdated TLS version: ${protocol}`);

        const altNames = cert.subjectaltname
          ? cert.subjectaltname.split(",").map((s: string) => s.trim().replace("DNS:", ""))
          : [];

        socket.destroy();

        resolve({
          host,
          valid: authorized && daysUntilExpiry > 0,
          issuer: cert.issuer?.O || cert.issuer?.CN || "Unknown",
          subject: cert.subject?.CN || "Unknown",
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysUntilExpiry,
          protocol: protocol || "Unknown",
          fingerprint: cert.fingerprint || "Unknown",
          altNames,
          issues,
        });
      }
    );

    socket.on("error", (err: Error) => {
      socket.destroy();
      resolve({
        host,
        valid: false,
        issuer: "Unknown",
        subject: "Unknown",
        validFrom: "",
        validTo: "",
        daysUntilExpiry: -1,
        protocol: "Unknown",
        fingerprint: "Unknown",
        altNames: [],
        issues: [`Connection failed: ${err.message}`],
      });
    });

    socket.setTimeout(10_000, () => {
      socket.destroy();
      resolve({
        host,
        valid: false,
        issuer: "Unknown",
        subject: "Unknown",
        validFrom: "",
        validTo: "",
        daysUntilExpiry: -1,
        protocol: "Unknown",
        fingerprint: "Unknown",
        altNames: [],
        issues: ["Connection timed out"],
      });
    });
  });
}

// ─── 6. HTTP Header Analyzer ─────────────────────────────────────────

export type HeaderAnalysis = {
  url: string;
  serverInfo: string | null;
  poweredBy: string | null;
  informationLeaks: string[];
  securityScore: number;
  recommendations: string[];
};

export async function analyzeHeaders(target: string): Promise<HeaderAnalysis> {
  const url = toUrl(target);
  const { headers } = await requestHead(url);

  const h = Object.fromEntries(
    Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );

  const informationLeaks: string[] = [];
  const recommendations: string[] = [];

  const serverInfo = (h["server"] as string) || null;
  const poweredBy = (h["x-powered-by"] as string) || null;

  if (serverInfo) {
    informationLeaks.push(`Server header reveals: ${serverInfo}`);
    recommendations.push("Remove or obfuscate the Server header to prevent version disclosure.");
  }

  if (poweredBy) {
    informationLeaks.push(`X-Powered-By reveals: ${poweredBy}`);
    recommendations.push("Remove the X-Powered-By header to prevent technology disclosure.");
  }

  if (h["x-aspnet-version"]) {
    informationLeaks.push(`ASP.NET version disclosed: ${h["x-aspnet-version"]}`);
  }

  if (h["x-generator"]) {
    informationLeaks.push(`Generator disclosed: ${h["x-generator"]}`);
  }

  // Check for CORS misconfiguration
  if (h["access-control-allow-origin"] === "*") {
    informationLeaks.push("CORS allows all origins (Access-Control-Allow-Origin: *)");
    recommendations.push("Restrict CORS to specific trusted origins.");
  }

  const leakPenalty = informationLeaks.length * 10;
  const securityScore = Math.max(0, 100 - leakPenalty);

  return {
    url,
    serverInfo,
    poweredBy,
    informationLeaks,
    securityScore,
    recommendations,
  };
}
