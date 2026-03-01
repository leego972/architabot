import { useState } from "react";
import { ArrowLeft, Mail, MessageSquare, CreditCard, HelpCircle, RefreshCw, User, Send, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { TitanLogo } from "@/components/TitanLogo";

const CATEGORIES = [
  { value: "billing" as const, label: "Billing & Payments", icon: CreditCard, desc: "Invoices, charges, payment methods, subscription issues" },
  { value: "account" as const, label: "Account Issues", icon: User, desc: "Login problems, account access, profile changes" },
  { value: "technical" as const, label: "Technical Support", icon: HelpCircle, desc: "Bugs, errors, feature requests, integration help" },
  { value: "general" as const, label: "General Inquiry", icon: MessageSquare, desc: "Questions, feedback, partnerships, other" },
];

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<"billing" | "technical" | "account" | "general">("billing");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = trpc.contact.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !subject.trim() || message.trim().length < 10) return;
    submitMutation.mutate({ name, email, category, subject, message });
  };

  return (
    <div className="min-h-screen bg-[#060611] text-white">
      {/* Navigation */}
      <nav aria-label="Navigation" className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#060611]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <TitanLogo size="sm" />
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
      <div className="pt-28 pb-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <span className="text-sm font-semibold text-blue-400 tracking-widest uppercase">Support</span>
          <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight">Contact & Billing</h1>
          <p className="mt-4 text-white/40 max-w-xl mx-auto">
            Have a billing question or experiencing technical issues? We're here to help. Fill out the form below and we'll get back to you within 24 hours.
          </p>
        </div>

        {submitted ? (
          /* ── Success State ─────────────────────────────────────────── */
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <CheckCircle className="h-10 w-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Message Sent!</h2>
            <p className="text-white/50 mb-8">
              Thank you for reaching out. We've received your inquiry and will respond to <span className="text-white/70 font-medium">{email}</span> within 24 hours.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button
                onClick={() => {
                  setSubmitted(false);
                  setName("");
                  setEmail("");
                  setSubject("");
                  setMessage("");
                  setCategory("billing");
                }}
                variant="outline"
                className="border-white/10 text-white/70 hover:text-white hover:bg-white/5"
              >
                Send Another
              </Button>
              <Link href="/">
                <Button className="bg-blue-600 hover:bg-blue-500 text-white border-0">
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* ── Form ──────────────────────────────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Category Selection */}
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Select Category</h3>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                    category === cat.value
                      ? "border-blue-500/40 bg-blue-500/10"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <cat.icon className={`h-5 w-5 mt-0.5 shrink-0 ${
                      category === cat.value ? "text-blue-400" : "text-white/40"
                    }`} />
                    <div>
                      <div className={`text-sm font-semibold ${
                        category === cat.value ? "text-white" : "text-white/70"
                      }`}>
                        {cat.label}
                      </div>
                      <div className="text-xs text-white/30 mt-0.5">{cat.desc}</div>
                    </div>
                  </div>
                </button>
              ))}

              {/* Quick info */}
              <div className="mt-6 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-semibold text-white/70">Response Time</span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  We typically respond within 24 hours for billing inquiries and 48 hours for technical support. Urgent billing issues (unauthorized charges, etc.) are prioritized.
                </p>
              </div>
            </div>

            {/* Right: Form Fields */}
            <div className="lg:col-span-2">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      required
                      className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john@example.com"
                      required
                      className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                    />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={
                      category === "billing" ? "e.g., Question about my latest invoice" :
                        category === "account" ? "e.g., Unable to access my account" :
                      category === "technical" ? "e.g., Error when running GoDaddy automation" :
                      "e.g., General question about Archibald Titan"
                    }
                    required
                    className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                  />
                </div>

                {/* Category badge */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/30">Category:</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400">
                    {CATEGORIES.find(c => c.value === category)?.label}
                  </span>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Please describe your issue in detail. Include any relevant order numbers, dates, or error messages..."
                    required
                    rows={7}
                    className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors resize-none"
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-white/20">Minimum 10 characters</span>
                    <span className={`text-xs ${message.length >= 10 ? "text-emerald-400/50" : "text-white/20"}`}>
                      {message.length}/5000
                    </span>
                  </div>
                </div>

                {/* Billing-specific notice */}
                {category === "billing" && (
                  <div className="p-4 rounded-xl border border-amber-500/15 bg-amber-500/5">
                    <p className="text-xs text-amber-300/70 leading-relaxed">
                      <strong className="text-amber-300/90">For billing inquiries:</strong> Please include your account email, transaction date, and any relevant order or invoice numbers.
                    </p>
                  </div>
                )}

                {/* Error */}
                {submitMutation.error && (
                  <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
                    <p className="text-sm text-red-300/80">
                      {submitMutation.error.message || "Something went wrong. Please try again."}
                    </p>
                  </div>
                )}

                {/* Submit */}
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-white/20 max-w-xs">
                    By submitting, you agree to our{" "}
                    <Link href="/terms" className="text-blue-400/50 hover:text-blue-400/70 underline">Terms</Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="text-blue-400/50 hover:text-blue-400/70 underline">Privacy Policy</Link>.
                  </p>
                  <Button
                    type="submit"
                    disabled={submitMutation.isPending || !name.trim() || !email.trim() || !subject.trim() || message.trim().length < 10}
                    className="bg-blue-600 hover:bg-blue-500 text-white border-0 h-11 px-6 gap-2"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send Message
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/20">
            &copy; {new Date().getFullYear()} Archibald Titan. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="text-xs text-white/20 hover:text-white/40 transition-colors">Terms & Conditions</Link>
            <Link href="/privacy" className="text-xs text-white/20 hover:text-white/40 transition-colors">Privacy Policy</Link>
            <Link href="/contact" className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors">Contact</Link>
            <Link href="/" className="text-xs text-white/20 hover:text-white/40 transition-colors">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
