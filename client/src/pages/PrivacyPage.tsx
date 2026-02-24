import { ArrowLeft } from "lucide-react";
import { TitanLogo } from "@/components/TitanLogo";
import { Link } from "wouter";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#060611] text-white">
      {/* Navigation */}
      <nav aria-label="Navigation" className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#060611]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <TitanLogo size="sm" />
              </div>
              <span className="text-lg font-bold tracking-tight">Archibald Titan</span>
            </Link>
            <Link href="/" className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="pt-28 pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <span className="text-sm font-semibold text-blue-400 tracking-widest uppercase">Legal</span>
          <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-4 text-white/40">Last updated: February 15, 2026</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8">
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">1. Overview</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              Archibald Titan ("the Software," "the Platform," "we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how the Software handles information when you use our locally-installed application, cloud-hosted services, AI assistant, code execution sandboxes, cybersecurity research tools, and associated web services.
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              The fundamental design principle of Archibald Titan is local-first operation for credential management. However, the Platform also provides cloud-based services including AI-powered assistance, code execution sandboxes, website replication, security scanning, and subscription-based features. This Privacy Policy describes what information may be collected, processed, and stored across all Platform capabilities.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">2. Information We Do Not Collect</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              Archibald Titan is designed with privacy as a core principle. The following information is never collected, transmitted, or stored on our servers:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1 shrink-0">&#10003;</span>
                <span>Your locally-stored API keys, credentials, passwords, or any sensitive authentication data from your encrypted vault.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1 shrink-0">&#10003;</span>
                <span>The master password or encryption keys for your local credential vault.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1 shrink-0">&#10003;</span>
                <span>Your browsing history or the websites the Software accesses on your behalf during local automation.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1 shrink-0">&#10003;</span>
                <span>Screenshots, recordings, or logs of the local automation process.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1 shrink-0">&#10003;</span>
                <span>Your proxy credentials or residential proxy configuration.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1 shrink-0">&#10003;</span>
                <span>Your CAPTCHA-solving service API keys.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1 shrink-0">&#10003;</span>
                <span>TOTP secret keys stored in your vault (these remain encrypted locally).</span>
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">3. Information We May Collect</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              When you use our web dashboard, cloud services, or website, we may collect the following information:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-white/60 border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 pr-4 text-white/80 font-semibold">Data Type</th>
                    <th className="text-left py-3 pr-4 text-white/80 font-semibold">Purpose</th>
                    <th className="text-left py-3 text-white/80 font-semibold">Retention</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Account information (via OAuth)</td>
                    <td className="py-3 pr-4">Dashboard authentication and identity</td>
                    <td className="py-3">Duration of account</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Usage analytics (page views)</td>
                    <td className="py-3 pr-4">Improve the website experience</td>
                    <td className="py-3">90 days</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Download counts</td>
                    <td className="py-3 pr-4">Track software adoption</td>
                    <td className="py-3">Indefinite (aggregated)</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Version check requests</td>
                    <td className="py-3 pr-4">Deliver update notifications</td>
                    <td className="py-3">Not stored</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Subscription and payment metadata</td>
                    <td className="py-3 pr-4">Manage plan access and billing</td>
                    <td className="py-3">Duration of account</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">AI chat conversation history</td>
                    <td className="py-3 pr-4">Provide persistent assistant context</td>
                    <td className="py-3">Duration of account</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Sandbox session metadata</td>
                    <td className="py-3 pr-4">Manage cloud code execution environments</td>
                    <td className="py-3">30 days after session end</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Website replication project metadata</td>
                    <td className="py-3 pr-4">Track replicate project status and configuration</td>
                    <td className="py-3">Duration of account</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Leak scan results (hashed email lookups)</td>
                    <td className="py-3 pr-4">Display breach exposure status</td>
                    <td className="py-3">Duration of account</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Credential health scores (aggregated)</td>
                    <td className="py-3 pr-4">Provide security health dashboard</td>
                    <td className="py-3">Duration of account</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">4. AI Assistant and Content Generation</h2>
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 mb-4">
              <p className="text-sm text-amber-200/80 leading-relaxed font-medium">
                THE TITAN ASSISTANT PROCESSES YOUR CONVERSATIONS THROUGH THIRD-PARTY AI MODELS. WHILE WE DO NOT STORE RAW CONVERSATION DATA ON THIRD-PARTY SERVERS BEYOND WHAT IS NECESSARY FOR PROCESSING, THE AI MODEL PROVIDER MAY PROCESS YOUR INPUT IN ACCORDANCE WITH THEIR OWN PRIVACY POLICIES.
              </p>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              When you interact with the Titan Assistant, the following data processing occurs:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Conversation messages</strong> are sent to AI model providers for processing and response generation. Messages are transmitted over encrypted connections and are not retained by the provider beyond the processing window.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Conversation history</strong> is stored in our database to provide persistent context across sessions. You may delete your conversation history at any time through the dashboard.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">AI-generated code, analyses, and outputs</strong> may be stored as part of your conversation history or sandbox project files. This includes security research outputs, exploit code, vulnerability analyses, and build plans.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Tool execution results</strong> — when the AI assistant executes actions on your behalf (file operations, code execution, web searches), the results are stored as part of the conversation context.</span>
              </li>
            </ul>
            <p className="text-sm text-white/60 leading-relaxed mt-3">
              We do not use your conversations to train AI models. Your conversation data is used solely to provide the assistant service to you.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">5. Sandbox Environment and Code Execution</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              The Platform provides cloud-based sandbox environments for code execution, application building, and security testing. The following data processing applies:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Code and files</strong> uploaded to or created within sandbox environments are stored on our cloud infrastructure for the duration of the sandbox session. Sandbox environments are ephemeral and may be terminated and wiped at any time.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Command execution logs</strong> — commands executed within sandboxes are logged for session continuity. These logs are retained for 30 days after the sandbox session ends.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Network traffic</strong> — sandbox environments have internet access. We do not monitor or log the content of network traffic originating from sandbox environments, though we may log connection metadata (destination IPs, ports) for abuse prevention.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Built applications</strong> — applications built and deployed through sandbox environments may be hosted on our infrastructure. The source code and assets of deployed applications are stored for the duration of the deployment.</span>
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">6. Security Research and Cybersecurity Tools</h2>
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-200/80 leading-relaxed font-medium">
                CYBERSECURITY FEATURES (LEAK SCANNER, CREDENTIAL HEALTH, TOTP VAULT, AND SECURITY RESEARCH TOOLS) PROCESS SENSITIVE SECURITY DATA. THIS SECTION DESCRIBES HOW THAT DATA IS HANDLED.
              </p>
            </div>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Leak Scanner</strong> — when you run a leak scan, your email addresses are hashed (using k-anonymity techniques where supported) before being sent to third-party breach databases (such as Have I Been Pwned). We store the scan results (breach names, dates, and exposure types) in our database. We do not store the plaintext passwords or credential data found in breaches.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Credential Health</strong> — credential health analysis is performed locally or within your authenticated session. Health scores, weakness indicators, and reuse detection results are stored in our database as aggregated metrics. Individual passwords are never transmitted to or stored on our servers.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">TOTP Vault</strong> — TOTP secret keys are encrypted and stored in your local vault. The cloud dashboard may display TOTP codes generated from locally-stored secrets, but the secret keys themselves are never transmitted in plaintext to our servers.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Security research outputs</strong> — vulnerability analyses, exploit code, penetration testing results, and other security research outputs generated through the AI assistant or sandbox are treated as user content and stored as part of your conversation history or sandbox files. We do not independently analyze, review, or monitor the content of security research outputs.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Passive web scans and SSL checks</strong> — when you use security scanning tools, the target URLs and scan results are processed in real-time. Scan results may be stored as part of your conversation history if initiated through the AI assistant.</span>
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">7. Website Replication and Analysis</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              When you use the Website Replicate feature, the following data is processed:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Target URLs</strong> — the URLs you submit for analysis are stored in our database as part of your replicate project record.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Research results</strong> — the AI-generated analysis of target websites (feature lists, technology stacks, design patterns) is stored as part of your project record.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Build plans and generated code</strong> — the build plans and any code generated during the replication process are stored in your sandbox environment and project record.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Custom branding data</strong> — if you provide custom branding (business name, logo URL, color scheme, Stripe keys), this information is stored in your project record. Stripe API keys you provide are stored encrypted and are only used to configure payment processing in your generated application.</span>
              </li>
            </ul>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">8. Local Data Storage</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              All sensitive credential data processed by the locally-installed Software is stored exclusively on your local machine. This includes:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>Encrypted credential vault (AES-256-GCM encryption at rest).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>Provider login credentials you enter for automation.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>TOTP secret keys and vault entries.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>Job history and automation logs.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>Application settings and preferences.</span>
              </li>
            </ul>
            <p className="text-sm text-white/60 leading-relaxed mt-3">
              You are solely responsible for the security of your local machine and the data stored on it. We recommend using full-disk encryption, strong system passwords, and keeping your operating system updated.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">9. Subscription and Payment Data</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              When you subscribe to a paid plan (Pro, Enterprise, or Cyber), the following payment data processing occurs:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Payment processing</strong> is handled entirely by Stripe, Inc. We never receive, process, or store your full credit card number, CVV, or card expiration date. Stripe's privacy policy governs the handling of your payment information.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Stripe identifiers</strong> — we store your Stripe Customer ID, Subscription ID, and Payment Intent IDs in our database to manage your subscription status and billing history.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Subscription status</strong> — your current plan tier, billing period, and subscription status are stored in our database to enforce feature access controls.</span>
              </li>
            </ul>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">10. Third-Party Services</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              The Software may interact with the following categories of third-party services:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Provider websites</strong> (e.g., OpenAI, AWS, GoDaddy) — accessed only when you initiate a credential retrieval job. Your login credentials are sent directly from your machine to the provider; they never pass through our servers.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">AI model providers</strong> — your Titan Assistant conversations are processed through third-party AI models. Conversations are transmitted over encrypted connections. We do not authorize AI providers to use your data for model training.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Breach databases</strong> (e.g., Have I Been Pwned) — the Leak Scanner queries third-party breach databases using hashed or k-anonymity-protected email addresses. These services have their own privacy policies.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Stripe, Inc.</strong> — payment processing for subscriptions. Stripe receives your payment information directly; we only receive transaction confirmations and identifiers.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">CAPTCHA-solving services</strong> (e.g., 2Captcha, Anti-Captcha) — if configured by you. CAPTCHA images are sent to these services for solving.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Residential proxy providers</strong> — if configured by you. Your web traffic is routed through these services.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span><strong className="text-white/80">Cloud storage providers</strong> — files uploaded through the Platform (sandbox files, generated applications, images) may be stored on third-party cloud storage infrastructure (AWS S3 or equivalent).</span>
              </li>
            </ul>
            <p className="text-sm text-white/60 leading-relaxed mt-3">
              We are not responsible for the privacy practices of any third-party services. We encourage you to review the privacy policies of any third-party services you use in conjunction with the Software.
            </p>
          </section>

          {/* Section 11 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">11. Cookies and Tracking</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Our web dashboard uses session cookies solely for authentication purposes. We do not use tracking cookies, advertising cookies, or any form of cross-site tracking. We may use privacy-respecting analytics (without personal data collection) to understand aggregate usage patterns of our website.
            </p>
          </section>

          {/* Section 12 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">12. Data Security</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              We implement industry-standard security measures to protect information processed through our services:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>All data in transit is encrypted using TLS 1.2 or higher.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>Local credential vault uses AES-256-GCM encryption at rest.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>Database access is restricted and authenticated.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>Sandbox environments are isolated from each other and from our production infrastructure.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>Stripe API keys provided for website replication projects are stored encrypted.</span>
              </li>
            </ul>
            <p className="text-sm text-white/60 leading-relaxed mt-3">
              However, no method of electronic transmission or storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee its absolute security. You are responsible for maintaining the security of your account credentials and local environment.
            </p>
          </section>

          {/* Section 13 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">13. Data Retention and Deletion</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              We retain your data according to the following policies:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-white/60 border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 pr-4 text-white/80 font-semibold">Data Category</th>
                    <th className="text-left py-3 pr-4 text-white/80 font-semibold">Retention Period</th>
                    <th className="text-left py-3 text-white/80 font-semibold">Deletion Method</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Account information</td>
                    <td className="py-3 pr-4">Until account deletion</td>
                    <td className="py-3">Request via dashboard or contact</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">AI conversation history</td>
                    <td className="py-3 pr-4">Until account deletion</td>
                    <td className="py-3">Delete via dashboard</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Sandbox sessions and files</td>
                    <td className="py-3 pr-4">30 days after session end</td>
                    <td className="py-3">Automatic</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Replicate project data</td>
                    <td className="py-3 pr-4">Until project deletion</td>
                    <td className="py-3">Delete via dashboard</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Leak scan results</td>
                    <td className="py-3 pr-4">Until account deletion</td>
                    <td className="py-3">Request via dashboard or contact</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Subscription/payment metadata</td>
                    <td className="py-3 pr-4">As required by law (typically 7 years)</td>
                    <td className="py-3">Automatic after legal retention period</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">Local vault data</td>
                    <td className="py-3 pr-4">Until you delete it</td>
                    <td className="py-3">Uninstall Software or delete data directory</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mt-3">
              Upon account deletion, we will remove your personal data from our active systems within 30 days. Some data may persist in encrypted backups for up to 90 days before being permanently purged.
            </p>
          </section>

          {/* Section 14 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">14. Children's Privacy</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              The Software is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with personal information, please contact us so we can take appropriate action.
            </p>
          </section>

          {/* Section 15 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">15. Your Rights</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              Depending on your jurisdiction, you may have certain rights regarding your personal information, including:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>The right to access the personal information we hold about you.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>The right to request correction of inaccurate information.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>The right to request deletion of your account and associated data.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>The right to data portability.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>The right to object to processing of your personal information.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">&bull;</span>
                <span>The right to withdraw consent at any time (where processing is based on consent).</span>
              </li>
            </ul>
            <p className="text-sm text-white/60 leading-relaxed mt-3">
              Since the vast majority of your sensitive data is stored locally on your machine, you have direct control over it at all times. You can delete all local data by uninstalling the Software and removing its data directory. For cloud-stored data, contact us through the dashboard to exercise your rights.
            </p>
          </section>

          {/* Section 16 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">16. International Data Transfers</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Our cloud services and third-party providers may process data in jurisdictions outside your country of residence. By using the Platform's cloud features (AI assistant, sandbox, website replication, security scanning), you consent to the transfer of your data to servers located in other jurisdictions. We ensure that appropriate safeguards are in place for international data transfers in compliance with applicable data protection laws.
            </p>
          </section>

          {/* Section 17 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">17. Changes to This Policy</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              We may update this Privacy Policy from time to time to reflect changes in our services, legal requirements, or business practices. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the "Last updated" date. For significant changes, we may also provide notice through the dashboard or email. You are advised to review this Privacy Policy periodically. Changes are effective when posted on this page.
            </p>
          </section>

          {/* Section 18 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">18. Contact Us</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              If you have any questions about this Privacy Policy, wish to exercise your data rights, or have concerns about how your information is handled, please contact us through the dashboard or at the contact information provided on our website.
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/20">
            &copy; {new Date().getFullYear()} Archibald Titan. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="text-xs text-white/20 hover:text-white/40 transition-colors">Terms & Conditions</Link>
            <Link href="/privacy" className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors">Privacy Policy</Link>
            <Link href="/" className="text-xs text-white/20 hover:text-white/40 transition-colors">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
