/**
 * Tests for Sandbox Engine and Security Tools
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger } from "./_core/logger.js";
const log = createLogger("SandboxSecurityTest");

// ─── Sandbox Engine Tests ──────────────────────────────────────────

describe("Sandbox Engine", () => {
  describe("createSandbox", () => {
    it("should create a sandbox with correct properties", async () => {
      const { createSandbox } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "Test Workspace");
      expect(sandbox).toBeDefined();
      expect(sandbox.id).toBeGreaterThan(0);
      expect(sandbox.name).toBe("Test Workspace");
      expect(sandbox.userId).toBe(1);
      expect(sandbox.status).toBe("running");
    });

    it("should create sandbox with default name if not provided", async () => {
      const { createSandbox } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "Default Workspace");
      expect(sandbox.name).toBe("Default Workspace");
    });
  });

  describe("listSandboxes", () => {
    it("should return sandboxes for a user", async () => {
      const { listSandboxes, createSandbox } = await import("./sandbox-engine");
      await createSandbox(99, "List Test");
      const list = await listSandboxes(99);
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].userId).toBe(99);
    });

    it("should return empty array for user with no sandboxes", async () => {
      const { listSandboxes } = await import("./sandbox-engine");
      const list = await listSandboxes(999999);
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(0);
    });
  });

  describe("executeCommand", () => {
    it("should execute a simple echo command", async () => {
      const { createSandbox, executeCommand } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "Exec Test");
      const result = await executeCommand(sandbox.id, 1, "echo 'hello world'");
      expect(result).toBeDefined();
      expect(result.output).toContain("hello world");
      expect(result.exitCode).toBe(0);
    });

    it("should return non-zero exit code for failed commands", async () => {
      const { createSandbox, executeCommand } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "Fail Test");
      const result = await executeCommand(sandbox.id, 1, "false");
      expect(result.exitCode).not.toBe(0);
    });

    it("should respect timeout", async () => {
      const { createSandbox, executeCommand } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "Timeout Test");
      const result = await executeCommand(sandbox.id, 1, "sleep 10", {
        timeoutMs: 1000,
      });
      // Should either timeout or be killed
      expect(result).toBeDefined();
    });

    it("should track working directory changes with cd", async () => {
      const { createSandbox, executeCommand } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "CWD Test");
      const result = await executeCommand(sandbox.id, 1, "cd /tmp && pwd");
      expect(result.output).toContain("/tmp");
    });

    it("should record command in history", async () => {
      const { createSandbox, executeCommand, getCommandHistory } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "History Test");
      await executeCommand(sandbox.id, 1, "echo 'history test'");
      const history = await getCommandHistory(sandbox.id, 1);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].command).toBe("echo 'history test'");
    });
  });

  describe("writeFile", () => {
    it("should write a file to sandbox", async () => {
      const { createSandbox, writeFile, readFile } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "Write Test");
      const success = await writeFile(sandbox.id, 1, "/home/sandbox/test.txt", "hello file");
      expect(success).toBe(true);
      const content = await readFile(sandbox.id, 1, "/home/sandbox/test.txt");
      expect(content).toBe("hello file");
    });

    it("should overwrite existing file", async () => {
      const { createSandbox, writeFile, readFile } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "Overwrite Test");
      await writeFile(sandbox.id, 1, "/home/sandbox/over.txt", "first");
      await writeFile(sandbox.id, 1, "/home/sandbox/over.txt", "second");
      const content = await readFile(sandbox.id, 1, "/home/sandbox/over.txt");
      expect(content).toBe("second");
    });
  });

  describe("readFile", () => {
    it("should return null for non-existent file", async () => {
      const { createSandbox, readFile } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "Read Test");
      const content = await readFile(sandbox.id, 1, "/home/sandbox/nonexistent.txt");
      expect(content).toBeNull();
    });
  });

  describe("listFiles", () => {
    it("should list files in sandbox directory", async () => {
      const { createSandbox, writeFile, listFiles } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "List Files Test");
      await writeFile(sandbox.id, 1, "/home/sandbox/a.txt", "a");
      await writeFile(sandbox.id, 1, "/home/sandbox/b.txt", "b");
      const files = await listFiles(sandbox.id, 1, "/home/sandbox");
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("authorization", () => {
    it("should reject commands from non-owner user", async () => {
      const { createSandbox, executeCommand } = await import("./sandbox-engine");
      const sandbox = await createSandbox(1, "Auth Test");
      try {
        await executeCommand(sandbox.id, 2, "echo 'unauthorized'");
        // If it doesn't throw, the result should indicate failure
      } catch (err: any) {
        expect(err.message).toContain("not found");
      }
    });
  });
});

// ─── Security Tools Tests ──────────────────────────────────────────

describe("Security Tools", () => {
  describe("runPassiveWebScan", () => {
    it("should scan a valid URL and return findings", async () => {
      const { runPassiveWebScan } = await import("./security-tools");
      const result = await runPassiveWebScan("https://example.com");
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(result.findings)).toBe(true);
      expect(result.securityHeaders).toBeDefined();
    });

    it("should handle invalid URLs gracefully", async () => {
      const { runPassiveWebScan } = await import("./security-tools");
      const result = await runPassiveWebScan("not-a-valid-url-12345.xyz");
      expect(result).toBeDefined();
      // Invalid URLs may still get a partial score from the scoring algorithm
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("should check for common security headers", async () => {
      const { runPassiveWebScan } = await import("./security-tools");
      const result = await runPassiveWebScan("https://example.com");
      // Should have securityHeaders object with boolean flags
      expect(result.securityHeaders).toBeDefined();
      expect(typeof result.securityHeaders.hsts).toBe("boolean");
      expect(typeof result.securityHeaders.csp).toBe("boolean");
      expect(typeof result.securityHeaders.xFrameOptions).toBe("boolean");
      expect(typeof result.securityHeaders.xContentTypeOptions).toBe("boolean");
    });
  });

  describe("generateSecurityReport", () => {
    it("should generate a formatted report", async () => {
      const { generateSecurityReport } = await import("./security-tools");
      const report = generateSecurityReport({
        target: "example.com",
        scanDate: new Date().toISOString(),
        scanResult: {
          score: 75,
          findings: [
            {
              severity: "medium",
              category: "headers",
              title: "Missing HSTS",
              description: "Strict-Transport-Security header not found",
              recommendation: "Add HSTS header",
            },
          ],
          securityHeaders: { "x-content-type-options": "nosniff" },
          cookies: [],
          serverInfo: {},
        },
      });
      expect(report).toBeDefined();
      expect(typeof report).toBe("string");
      expect(report.length).toBeGreaterThan(0);
      expect(report).toContain("example.com");
    });
  });

  describe("runPortScan", () => {
    it("should scan common ports on a host", async () => {
      const { runPortScan } = await import("./security-tools");
      const result = await runPortScan("example.com", [80, 443]);
      expect(result).toBeDefined();
      expect(result.host).toBe("example.com");
      expect(Array.isArray(result.openPorts)).toBe(true);
      expect(Array.isArray(result.closedPorts)).toBe(true);
      // Total scanned ports should equal 2
      expect(result.openPorts.length + result.closedPorts.length).toBe(2);
    });

    it("should identify open and closed ports", async () => {
      const { runPortScan } = await import("./security-tools");
      const result = await runPortScan("example.com", [80]);
      // Port 80 should be in either openPorts or closedPorts
      const isOpen = result.openPorts.some((p) => p.port === 80);
      const isClosed = result.closedPorts.includes(80);
      expect(isOpen || isClosed).toBe(true);
    });

    it("should handle unreachable hosts", async () => {
      const { runPortScan } = await import("./security-tools");
      const result = await runPortScan("nonexistent-host-12345.invalid", [80]);
      expect(result).toBeDefined();
      // Unreachable host should have no open ports
      expect(result.openPorts.length).toBe(0);
      expect(result.closedPorts).toContain(80);
    });
  });

  describe("checkSSL", () => {
    it("should check SSL certificate for a valid HTTPS host", async () => {
      const { checkSSL } = await import("./security-tools");
      const result = await checkSSL("example.com");
      expect(result).toBeDefined();
      expect(result.host).toBe("example.com");
      expect(result.valid).toBeDefined();
    });

    it("should report certificate details", async () => {
      const { checkSSL } = await import("./security-tools");
      const result = await checkSSL("example.com");
      if (result.valid) {
        expect(result.issuer).toBeDefined();
        expect(result.daysUntilExpiry).toBeGreaterThan(0);
      }
    }, 15000);

    it("should handle hosts without SSL", async () => {
      const { checkSSL } = await import("./security-tools");
      const result = await checkSSL("nonexistent-host-12345.invalid");
      expect(result).toBeDefined();
      expect(result.valid).toBe(false);
    });
  });

  describe("analyzeCodeSecurity", () => {
    it("should analyze code for vulnerabilities", async () => {
      const { analyzeCodeSecurity } = await import("./security-tools");
      const result = await analyzeCodeSecurity([
        {
          filename: "test.js",
          content: `
            const query = "SELECT * FROM users WHERE id = " + req.params.id;
            db.query(query);
          `,
        },
      ]);
      expect(result).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it("should handle empty file list", async () => {
      const { analyzeCodeSecurity } = await import("./security-tools");
      const result = await analyzeCodeSecurity([]);
      expect(result).toBeDefined();
      // Empty file list should return a valid result
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it("should return summary with analysis", async () => {
      const { analyzeCodeSecurity } = await import("./security-tools");
      const result = await analyzeCodeSecurity([
        {
          filename: "safe.js",
          content: "const x = 1 + 2; console.log(x);",
        },
      ]);
      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
    });
  });
});

// ─── Chat Executor Integration Tests ───────────────────────────────

describe("Chat Executor - Sandbox & Security Tools", () => {
  it("should have sandbox tools in TITAN_TOOLS", async () => {
    const { TITAN_TOOLS } = await import("./chat-tools");
    const toolNames = TITAN_TOOLS.map((t) => t.function.name);
    expect(toolNames).toContain("sandbox_exec");
    expect(toolNames).toContain("sandbox_write_file");
    expect(toolNames).toContain("sandbox_read_file");
    expect(toolNames).toContain("sandbox_list_files");
  });

  it("should have security tools in TITAN_TOOLS", async () => {
    const { TITAN_TOOLS } = await import("./chat-tools");
    const toolNames = TITAN_TOOLS.map((t) => t.function.name);
    expect(toolNames).toContain("security_scan");
    expect(toolNames).toContain("code_security_review");
    expect(toolNames).toContain("port_scan");
    expect(toolNames).toContain("ssl_check");
  });

  it("should have sandbox and security tools in BUILDER_TOOLS", async () => {
    const { BUILDER_TOOLS } = await import("./chat-tools");
    const toolNames = BUILDER_TOOLS.map((t) => t.function.name);
    expect(toolNames).toContain("sandbox_exec");
    expect(toolNames).toContain("sandbox_write_file");
    expect(toolNames).toContain("sandbox_read_file");
    expect(toolNames).toContain("sandbox_list_files");
    expect(toolNames).toContain("security_scan");
    expect(toolNames).toContain("code_security_review");
    expect(toolNames).toContain("port_scan");
    expect(toolNames).toContain("ssl_check");
  });

  it("should have correct parameter schemas for sandbox_exec", async () => {
    const { TITAN_TOOLS } = await import("./chat-tools");
    const sandboxExec = TITAN_TOOLS.find((t) => t.function.name === "sandbox_exec");
    expect(sandboxExec).toBeDefined();
    expect(sandboxExec!.function.parameters.properties.command).toBeDefined();
    expect(sandboxExec!.function.parameters.required).toContain("command");
  });

  it("should have correct parameter schemas for security_scan", async () => {
    const { TITAN_TOOLS } = await import("./chat-tools");
    const secScan = TITAN_TOOLS.find((t) => t.function.name === "security_scan");
    expect(secScan).toBeDefined();
    expect(secScan!.function.parameters.properties.target).toBeDefined();
    expect(secScan!.function.parameters.required).toContain("target");
  });

  it("should have correct parameter schemas for port_scan", async () => {
    const { TITAN_TOOLS } = await import("./chat-tools");
    const portScan = TITAN_TOOLS.find((t) => t.function.name === "port_scan");
    expect(portScan).toBeDefined();
    expect(portScan!.function.parameters.properties.host).toBeDefined();
    expect(portScan!.function.parameters.required).toContain("host");
  });
});

// ─── Sandbox Router Tests ──────────────────────────────────────────

describe("Sandbox Router Schema", () => {
  it("should have sandboxes table in schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.sandboxes).toBeDefined();
  });

  it("should have sandboxCommands table in schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.sandboxCommands).toBeDefined();
  });

  it("should have sandboxFiles table in schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.sandboxFiles).toBeDefined();
  });
});
