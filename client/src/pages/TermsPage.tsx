import { ArrowLeft } from "lucide-react";
import { TitanLogo } from "@/components/TitanLogo";
import { Link } from "wouter";

export default function TermsPage() {
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
          <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight">Terms & Conditions</h1>
          <p className="mt-4 text-white/40">Last updated: February 15, 2026</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8">
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">1. Acceptance of Terms</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              By downloading, installing, accessing, or using Archibald Titan ("the Software," "the Platform," or "the Service"), you ("the User") agree to be bound by these Terms and Conditions ("Terms") in their entirety. If you do not agree to all of these Terms, you must immediately cease all use of the Software and delete all copies from your devices. Your continued use of the Software constitutes irrevocable acceptance of these Terms, including all disclaimers, limitations of liability, and indemnification obligations contained herein.
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              These Terms constitute a legally binding agreement between you and Archibald Titan ("we," "us," "our," or "the Company"). We reserve the right to modify these Terms at any time without prior notice. It is your sole responsibility to review these Terms periodically. Continued use of the Software after any modifications constitutes acceptance of the revised Terms.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">2. Description of Service</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              Archibald Titan is a comprehensive software platform that provides, among other capabilities: credential management and retrieval tools, an AI-powered assistant ("Titan Assistant"), cloud-based code execution sandboxes, website analysis and replication tools, cybersecurity research and development tools (including but not limited to vulnerability scanning, credential leak detection, penetration testing utilities, and offensive security research capabilities), automated browser interaction, and developer APIs. The Software operates as both a locally-installed application and a cloud-hosted service.
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              The Software is provided as a professional tool for authorized use only. It automates complex workflows that the User could otherwise perform manually. The Software does not guarantee successful completion of any task, as third-party websites, services, and systems may change their interfaces, security measures, or terms of service at any time without notice.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">3. User Responsibilities and Obligations</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              The User acknowledges and agrees that:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>They will only use the Software to access accounts, systems, and credentials that they own or have explicit, documented authorization to access, test, or audit.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>They are solely responsible for ensuring that their use of the Software complies with all applicable local, state, national, and international laws, regulations, and the terms of service of any third-party providers or target systems.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>They will not use the Software for any unauthorized, illegal, or malicious purpose, including but not limited to unauthorized access to computer systems, identity theft, fraud, or any activity that violates the Computer Fraud and Abuse Act (CFAA) or equivalent legislation in their jurisdiction.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>They assume full responsibility for the security of their local machine, cloud resources, and any credentials, code, or data stored in or generated by the Software.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>They understand that the use of residential proxies, CAPTCHA-solving services, browser automation, code execution sandboxes, AI-generated code, security research tools, or website replication features may violate the terms of service of certain third-party providers or the laws of certain jurisdictions, and they accept all risk and liability associated with such use.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>They are solely responsible for obtaining all necessary authorizations, permissions, and legal clearances before using any security testing, vulnerability research, penetration testing, or offensive security features of the Software against any system, network, or application.</span>
              </li>
            </ul>
          </section>

          {/* Section 4 — NEW: Security Research & Offensive Tools */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">4. Security Research, Offensive Tools, and Cybersecurity Features</h2>
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 mb-4">
              <p className="text-sm text-red-300/90 leading-relaxed font-medium">
                THE PLATFORM PROVIDES ADVANCED CYBERSECURITY RESEARCH AND DEVELOPMENT TOOLS, INCLUDING BUT NOT LIMITED TO: VULNERABILITY SCANNERS, CREDENTIAL LEAK DETECTORS, PENETRATION TESTING UTILITIES, EXPLOIT DEVELOPMENT FRAMEWORKS, CODE EXECUTION SANDBOXES, AND AI-ASSISTED SECURITY RESEARCH CAPABILITIES. THESE TOOLS ARE PROVIDED EXCLUSIVELY FOR AUTHORIZED, LAWFUL, AND PROFESSIONAL USE. THE COMPANY BEARS ABSOLUTELY NO RESPONSIBILITY FOR ANY MISUSE, UNAUTHORIZED USE, OR ILLEGAL APPLICATION OF THESE TOOLS.
              </p>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              The User expressly acknowledges and agrees that:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>All cybersecurity tools, including but not limited to vulnerability scanners, exploit research tools, zero-click exploit analysis, command-and-control (C2) framework builders, payload generators, network reconnaissance tools, and any other offensive or defensive security capabilities, are provided solely for authorized security research, penetration testing with written consent, bug bounty programs, academic research, and lawful professional use.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The User is solely and exclusively responsible for ensuring they have proper written authorization before using any security tool against any system, network, application, or service. The Company does not verify, validate, or confirm the User's authorization to test any target.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The Company shall not be held liable for any damage, loss, legal action, criminal prosecution, civil suit, regulatory penalty, or any other consequence arising from the User's use or misuse of any security research tool, exploit code, vulnerability information, or offensive capability provided by or generated through the Platform.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The provision of security research tools does not constitute encouragement, endorsement, or authorization to engage in any unauthorized access, hacking, data theft, service disruption, or any other unlawful activity. The tools exist as professional instruments analogous to locksmith tools, forensic equipment, or laboratory chemicals — their lawful or unlawful application is entirely the User's responsibility.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any exploit code, proof-of-concept (PoC) code, vulnerability analysis, attack methodology, or security research output generated by the Platform's AI assistant or sandbox environment is provided for educational and authorized professional purposes only. The User assumes complete liability for how they use, distribute, or deploy such output.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The Company makes no representation that any security tool, exploit, or technique provided through the Platform is legal to use in the User's jurisdiction. Laws regarding computer security research, penetration testing, vulnerability disclosure, and reverse engineering vary significantly by jurisdiction. It is the User's sole responsibility to understand and comply with all applicable laws.</span>
              </li>
            </ul>
          </section>

          {/* Section 5 — NEW: AI-Generated Content */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">5. AI-Generated Content, Code, and Outputs</h2>
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 mb-4">
              <p className="text-sm text-amber-300/90 leading-relaxed font-medium">
                THE PLATFORM UTILIZES ARTIFICIAL INTELLIGENCE TO GENERATE CODE, SECURITY ANALYSES, BUILD PLANS, EXPLOIT RESEARCH, AND OTHER CONTENT. ALL AI-GENERATED OUTPUT IS PROVIDED "AS IS" WITHOUT ANY WARRANTY OF ACCURACY, COMPLETENESS, SAFETY, LEGALITY, OR FITNESS FOR ANY PURPOSE. THE COMPANY ASSUMES ZERO LIABILITY FOR ANY CONSEQUENCES ARISING FROM THE USE OF AI-GENERATED CONTENT.
              </p>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              The User acknowledges and agrees that:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>All code, scripts, configurations, exploit code, security analyses, build plans, architectural recommendations, and any other output generated by the Titan Assistant or any AI component of the Platform may contain errors, vulnerabilities, inaccuracies, or unintended behaviors. The User is solely responsible for reviewing, testing, and validating all AI-generated output before use.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>AI-generated code executed in the Platform's sandbox environment runs at the User's sole risk. The Company is not responsible for any damage, data loss, security breach, or unintended consequence resulting from the execution of AI-generated code.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The AI assistant may generate content related to security vulnerabilities, exploit techniques, attack methodologies, or other sensitive topics in response to User requests. The User is solely responsible for the lawful and ethical use of such content. The Company does not endorse, encourage, or authorize any illegal use of AI-generated security content.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>AI-generated content may inadvertently infringe upon third-party intellectual property rights, patents, copyrights, or trade secrets. The User assumes all liability for intellectual property claims arising from their use of AI-generated content.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The Company does not guarantee the security, reliability, or correctness of any AI-generated application, website, API, or system. Deploying AI-generated code to production environments is done entirely at the User's own risk.</span>
              </li>
            </ul>
          </section>

          {/* Section 6 — NEW: Sandbox and Code Execution */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">6. Sandbox Environment and Code Execution</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              The Platform provides cloud-based sandbox environments for code execution, application building, security testing, and development purposes. The User acknowledges and agrees that:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>All code executed within sandbox environments runs at the User's sole risk and responsibility. The Company provides the execution environment but assumes no liability for the code executed within it or its consequences.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The User shall not use sandbox environments to launch attacks against unauthorized targets, host malicious services, distribute malware, conduct denial-of-service attacks, or engage in any other unlawful activity. Violation of this provision may result in immediate termination of access without notice or refund.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The Company is not responsible for any data stored in, transmitted from, or processed within sandbox environments. Sandbox environments may be terminated, reset, or wiped at any time without notice.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any applications, websites, or services built within sandbox environments and subsequently deployed or published are the sole responsibility of the User. The Company assumes no liability for the operation, security, legality, or consequences of deployed applications.</span>
              </li>
            </ul>
          </section>

          {/* Section 7 — NEW: Website Replication */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">7. Website Replication and Cloning Features</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              The Platform includes features that analyze and replicate the functionality, design patterns, and architecture of third-party websites. The User acknowledges and agrees that:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Website replication features are provided for legitimate purposes only, including but not limited to: learning, prototyping, competitive analysis, authorized redesign projects, and building original products inspired by existing designs. The User is solely responsible for ensuring their use does not infringe upon any third party's intellectual property rights, trademarks, copyrights, trade dress, or other legal protections.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The Company does not verify whether the User has authorization to replicate, clone, or analyze any target website. The User assumes all legal risk and liability for their use of website replication features.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The Company shall not be held liable for any intellectual property infringement claims, trademark disputes, copyright violations, trade dress claims, or any other legal action arising from the User's use of website replication features.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Replicated websites may incorporate third-party assets, designs, or code patterns. The User is solely responsible for replacing, licensing, or obtaining permission for any third-party elements before deploying or distributing replicated websites.</span>
              </li>
            </ul>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">8. Complete Disclaimer of Warranties</h2>
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 mb-4">
              <p className="text-sm text-amber-300/90 leading-relaxed font-medium">
                THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT ANY WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, WE SPECIFICALLY DISCLAIM ALL IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
              </p>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              Without limiting the foregoing, we make no warranty or representation that:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The Software will meet your requirements or expectations.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The Software will be uninterrupted, timely, secure, or error-free.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The results obtained from the use of the Software, including AI-generated content, security analyses, or replicated websites, will be accurate, reliable, complete, or legally compliant.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any code generated, executed, or deployed through the Software will be free of bugs, vulnerabilities, or security flaws.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The encryption mechanisms, sandbox isolation, or any other security feature will prevent all unauthorized access under all circumstances.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Security research tools, exploit code, or vulnerability analyses provided through the Platform are accurate, complete, or safe to use.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any errors in the Software will be corrected, or that the Software is free of viruses, malware, or other harmful components.</span>
              </li>
            </ul>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">9. Absolute Limitation of Liability</h2>
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 mb-4">
              <p className="text-sm text-red-300/90 leading-relaxed font-medium">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ARCHIBALD TITAN, ITS CREATORS, DEVELOPERS, CONTRIBUTORS, AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, LICENSORS, OR SERVICE PROVIDERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, CREDENTIALS, API KEYS, OR OTHER INTANGIBLE LOSSES, REGARDLESS OF WHETHER SUCH DAMAGES WERE FORESEEABLE AND WHETHER OR NOT WE WERE ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              This limitation of liability applies to, without limitation:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any loss, theft, exposure, or unauthorized use of credentials, API keys, passwords, or other sensitive information retrieved, stored, or managed by the Software.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any account suspension, termination, or restriction imposed by third-party providers as a result of automated access or any other activity performed by the Software.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any financial loss, including but not limited to unauthorized charges, fraudulent transactions, or billing disputes arising from the use or misuse of retrieved credentials.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any damage to computer systems, networks, data, or files resulting from the use of security research tools, exploit code, AI-generated code, or sandbox environments.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any legal action, criminal prosecution, regulatory penalty, claim, or proceeding brought against you by any third party, government agency, or law enforcement entity as a result of your use of the Software, its security tools, AI capabilities, or any output generated by the Platform.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any intellectual property infringement, trademark violation, copyright claim, or trade dress dispute arising from the use of website replication, AI-generated content, or any other feature of the Platform.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any damage caused by exploits, vulnerabilities, attack tools, or security research output generated by or through the Platform, whether used by the User or by any third party who obtained such output from the User.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any failure of the encryption, security mechanisms, kill switch, sandbox isolation, or any other protective feature of the Software.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any loss or damage arising from the deployment of applications, websites, or services built using the Platform's tools, whether in development, staging, or production environments.</span>
              </li>
            </ul>
            <p className="text-sm text-white/60 leading-relaxed mt-4">
              IN NO EVENT SHALL OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THE USE OF THE SOFTWARE EXCEED THE LESSER OF: (A) THE AMOUNT YOU PAID FOR THE SOFTWARE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100.00). THIS LIMITATION APPLIES REGARDLESS OF THE LEGAL THEORY UPON WHICH THE CLAIM IS BASED, WHETHER IN CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, OR OTHERWISE.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">10. Comprehensive Indemnification</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              You agree to indemnify, defend, and hold harmless Archibald Titan, its creators, developers, contributors, affiliates, officers, directors, employees, agents, licensors, and service providers from and against any and all claims, demands, actions, suits, proceedings, losses, damages, liabilities, costs, and expenses (including reasonable attorneys' fees and court costs) arising out of or in connection with:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Your use or misuse of the Software, including all security research tools, AI capabilities, sandbox environments, and website replication features.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Your violation of these Terms.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Your violation of any applicable law, regulation, or the terms of service of any third-party provider or target system.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Your violation of any rights of any third party, including intellectual property rights, privacy rights, contractual rights, or property rights.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any claim that your use of the Software, its security tools, AI-generated content, or any output from the Platform caused damage to a third party, their systems, their data, or their business.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any unauthorized access to accounts, systems, or networks facilitated through the Software or its tools.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any distribution, publication, or sharing of exploit code, vulnerability information, attack tools, or security research output generated by or through the Platform.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Any criminal investigation, prosecution, or regulatory action resulting from your use of the Platform's capabilities.</span>
              </li>
            </ul>
            <p className="text-sm text-white/60 leading-relaxed mt-3">
              This indemnification obligation shall survive the termination of these Terms and your cessation of use of the Software indefinitely.
            </p>
          </section>

          {/* Section 11 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">11. Assumption of Risk</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              You expressly acknowledge and agree that your use of the Software is at your sole and exclusive risk. You understand and accept that:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Automated interaction with third-party websites carries inherent risks, including but not limited to account suspension, IP blocking, legal action by providers, and data loss.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>The use of browser automation, stealth techniques, residential proxies, and CAPTCHA-solving services may violate the terms of service of certain providers and may have legal implications in certain jurisdictions.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Security research tools, exploit development capabilities, and offensive security features carry significant legal and ethical risks. Unauthorized use of these tools against systems you do not own or have explicit written permission to test may constitute a criminal offense in many jurisdictions.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>AI-generated code and security analyses may be incorrect, incomplete, or dangerous. Running AI-generated code without thorough review may result in data loss, security breaches, system damage, or legal liability.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Website replication may result in products that infringe upon third-party intellectual property. The User assumes all risk of intellectual property claims.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>No encryption system is infallible. While the Software uses AES-256-GCM encryption, no security measure can guarantee absolute protection against all threats.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Third-party providers may change their websites, APIs, security measures, or terms of service at any time, which may render the Software partially or wholly non-functional.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>You assume all risk associated with the storage of sensitive credentials on your local machine, including risks from malware, unauthorized physical access, or hardware failure.</span>
              </li>
            </ul>
          </section>

          {/* Section 12 — NEW: Prohibited Uses and Misuse */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">12. Prohibited Uses and Misuse Disclaimer</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              The following uses of the Software are strictly prohibited. The Company disclaims all liability for any consequences arising from prohibited use:
            </p>
            <ul className="text-sm text-white/60 leading-relaxed space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Using security tools against systems, networks, or applications without explicit written authorization from the system owner.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Deploying exploit code, attack tools, or offensive capabilities for malicious purposes, including but not limited to unauthorized data exfiltration, ransomware deployment, service disruption, or espionage.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Using website replication features to create fraudulent, phishing, or deceptive websites designed to impersonate legitimate businesses or services.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Using the Platform to facilitate identity theft, financial fraud, or any form of criminal activity.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Distributing or selling exploit code, vulnerability information, or attack tools generated through the Platform to parties who intend to use them for unauthorized or illegal purposes.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1 shrink-0">•</span>
                <span>Using sandbox environments to host malicious services, botnets, command-and-control infrastructure targeting unauthorized systems, or any other infrastructure used for illegal purposes.</span>
              </li>
            </ul>
            <p className="text-sm text-white/60 leading-relaxed mt-3">
              The Company provides tools; the User provides intent. The Company is not responsible for determining, monitoring, or enforcing the legality of the User's intent or actions. The User bears sole and complete responsibility for ensuring all use is lawful and authorized.
            </p>
          </section>

          {/* Section 13 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">13. Third-Party Services and Providers</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              The Software interacts with third-party services and websites over which we have no control. We are not responsible for the availability, accuracy, content, policies, or practices of any third-party service. Your interactions with third-party services through the Software are governed solely by the terms and policies of those third parties.
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              We do not endorse, warrant, or assume responsibility for any third-party service, product, or content. Any reliance you place on third-party services accessed through the Software is strictly at your own risk. We shall not be liable for any damage or loss caused by or in connection with the use of or reliance on any third-party service.
            </p>
          </section>

          {/* Section 14 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">14. Intellectual Property</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              The Software, including all code, documentation, design, logos, trademarks, and other intellectual property, is owned by Archibald Titan and is protected by applicable intellectual property laws. You are granted a limited, non-exclusive, non-transferable, revocable license to use the Software for personal or internal business purposes only. You may not copy, modify, distribute, sell, lease, sublicense, reverse engineer, decompile, or disassemble the Software or any part thereof without prior written consent.
            </p>
          </section>

          {/* Section 15 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">15. Subscription, Payments, and Refunds</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              Certain features of the Platform require a paid subscription. Subscription fees are non-refundable except where required by applicable law. The Company reserves the right to change subscription pricing at any time. Continued use after a price change constitutes acceptance of the new pricing.
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              Termination of your account for violation of these Terms will result in immediate loss of access to all paid features without refund. The Company is under no obligation to provide refunds for any reason, including but not limited to dissatisfaction with the Software, inability to use specific features, or changes to the Software's capabilities.
            </p>
          </section>

          {/* Section 16 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">16. Termination</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              We reserve the right to terminate or suspend your access to the Software at any time, for any reason, without prior notice or liability. Upon termination, all licenses granted to you under these Terms shall immediately cease. Sections 4 through 12, 17, 18, and 19 shall survive any termination of these Terms.
            </p>
          </section>

          {/* Section 17 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">17. Governing Law and Dispute Resolution</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions. Any dispute arising out of or relating to these Terms or the Software shall be resolved exclusively through binding arbitration administered by the American Arbitration Association (AAA) in accordance with its Commercial Arbitration Rules.
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              YOU AGREE TO WAIVE YOUR RIGHT TO A JURY TRIAL AND YOUR RIGHT TO PARTICIPATE IN A CLASS ACTION LAWSUIT OR CLASS-WIDE ARBITRATION. All claims must be brought in the parties' individual capacity and not as a plaintiff or class member in any purported class or representative proceeding.
            </p>
          </section>

          {/* Section 18 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">18. Force Majeure</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              We shall not be liable for any failure or delay in performing our obligations under these Terms where such failure or delay results from any cause beyond our reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, riots, embargoes, acts of civil or military authorities, fire, floods, accidents, pandemic, strikes, or shortages of transportation, facilities, fuel, energy, labor, or materials.
            </p>
          </section>

          {/* Section 19 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">19. Severability and Entire Agreement</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, such provision shall be modified to the minimum extent necessary to make it valid and enforceable, or if modification is not possible, shall be severed from these Terms. The remaining provisions shall continue in full force and effect.
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              These Terms, together with our Privacy Policy, constitute the entire agreement between you and Archibald Titan regarding the Software and supersede all prior or contemporaneous agreements, representations, warranties, and understandings, whether written or oral.
            </p>
          </section>

          {/* Section 20 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">20. No Waiver</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Our failure to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision. Any waiver of any provision of these Terms will be effective only if in writing and signed by us.
            </p>
          </section>

          {/* Section 21 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-white/10">21. Contact Information</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              For questions about these Terms, please contact us through the dashboard or at the contact information provided on our website. We will make reasonable efforts to respond to inquiries in a timely manner, but we are under no obligation to do so.
            </p>
          </section>

          {/* Acknowledgment */}
          <section className="mt-12 p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white mb-3">Acknowledgment</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              BY DOWNLOADING, INSTALLING, OR USING ARCHIBALD TITAN, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS AND CONDITIONS IN THEIR ENTIRETY. YOU SPECIFICALLY ACKNOWLEDGE SECTIONS 4 THROUGH 12, WHICH ADDRESS SECURITY RESEARCH TOOLS, AI-GENERATED CONTENT, SANDBOX CODE EXECUTION, WEBSITE REPLICATION, AND PROHIBITED USES. YOU UNDERSTAND THAT THE COMPANY ASSUMES ZERO LIABILITY FOR ANY MISUSE OF THE PLATFORM'S CAPABILITIES AND THAT YOU BEAR SOLE AND COMPLETE RESPONSIBILITY FOR ALL CONSEQUENCES ARISING FROM YOUR USE OF THE SOFTWARE.
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
            <Link href="/terms" className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors">Terms & Conditions</Link>
            <Link href="/privacy" className="text-xs text-white/20 hover:text-white/40 transition-colors">Privacy Policy</Link>
            <Link href="/" className="text-xs text-white/20 hover:text-white/40 transition-colors">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
