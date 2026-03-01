import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { X, Sparkles, ChevronDown, Volume2, VolumeX } from "lucide-react";
import { useArchibald } from "@/contexts/ArchibaldContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { TitanLogo } from "@/components/TitanLogo";
import {
  playAppearSound,
  playDisappearSound,
  playClickSound,
  playRoamSound,
  playDragStartSound,
  playDragEndSound,
  playBubbleSound,
  playMinimizeSound,
  playRestoreSound,
  isWizardSoundsMuted,
  setWizardSoundsMuted,
} from "@/lib/wizard-sounds";

// Archibald's contextual tips based on the current page
const PAGE_TIPS: Record<string, string[]> = {
  "/": [
    "Welcome to Archibald Titan! I'm Archibald, your guide. Let me show you around!",
    "Titan is the world's most advanced local AI agent. Download it free and take control of your digital life!",
    "Tip: Scroll down to see all the incredible features Titan offers — from credential management to AI-powered automation.",
    "Ready to get started? Click 'Download Free' or sign in to access your dashboard!",
  ],
  "/dashboard": [
    "Welcome back! I'm Archibald, your guide. Ask me anything!",
    "Tip: You can talk to Titan AI right here in the chat. Try asking about your credentials!",
    "Did you know? Titan can auto-fetch credentials from 50+ providers. Try 'New Fetch'!",
    "Pro tip: Set up Auto-Sync to keep your credentials fresh automatically.",
  ],
  "/fetcher/new": [
    "Starting a new fetch? I can help! Just pick a provider and enter your credentials.",
    "Tip: Use Smart Fetch AI for intelligent credential extraction.",
    "Remember: Your credentials are encrypted end-to-end. Even I can't see them!",
  ],
  "/fetcher/jobs": [
    "Here's where all your fetch jobs live. Click any job to see its details.",
    "Tip: Failed jobs? Check Provider Health to see if the service is down.",
    "You can re-run any failed job by clicking the retry button.",
  ],
  "/fetcher/credentials": [
    "Your credential vault — all your secrets, safely stored.",
    "Tip: Use the search bar to quickly find any credential.",
    "Pro tip: Set up expiry alerts so you never get caught off guard!",
  ],
  "/fetcher/settings": [
    "Customize Titan to work exactly how you want.",
    "Tip: Enable dark mode for late-night credential management sessions!",
  ],
  "/fetcher/killswitch": [
    "The Kill Switch — for when things go sideways. Use with caution!",
    "This will immediately halt all automated processes. Only use in emergencies.",
  ],
  "/grants": [
    "Looking for funding? I'll help you find the perfect grants for your business!",
    "Tip: Use filters to narrow down grants by industry, amount, and deadline.",
    "Pro tip: Save grants you're interested in and I'll remind you before deadlines!",
  ],
  "/sandbox": [
    "Welcome to the Sandbox! Test and experiment safely here.",
    "Anything you do in the sandbox won't affect your production data.",
  ],
  "/affiliate": [
    "Your affiliate empire starts here! Track all your partner programs.",
    "Tip: Check which programs are approved and start embedding your links!",
  ],
  "/seo": [
    "SEO Command Center — let's get your site ranking!",
    "Tip: Focus on long-tail keywords for faster ranking results.",
  ],
  "/marketing": [
    "Marketing Engine — automate your outreach and grow your audience!",
    "Tip: Consistent content creation is the key to organic growth.",
  ],
  "/pricing": [
    "Choosing a plan? The Pro plan gives you unlimited fetches and priority support!",
    "Not sure which plan? Start with Free and upgrade anytime.",
  ],
  "/marketplace": [
    "Welcome to the Tech Bazaar! Browse battle-tested components here.",
    "Tip: Check the seller ratings before purchasing any component.",
    "Pro tip: Use the search to find exactly what you need for your project!",
  ],
};

// Archibald's idle messages
const IDLE_MESSAGES = [
  "Need help? Click me!",
  "I sense you might need assistance...",
  "Having a great day?",
  "Click me for a tip!",
  "I'm here if you need me!",
  "Anything I can help with?",
  "Let's make things happen!",
];

// Archibald's greeting messages
const GREETINGS = [
  "Greetings, fellow traveller!",
  "Ah, you've returned!",
  "Welcome to the realm of Titan!",
  "At your service, master!",
  "The stars align for great things today!",
];

// Roaming positions — TOP of page only, avoids sidebar and buttons (used on Titan/dashboard pages)
const ROAM_POSITIONS: Array<{ top?: number; right?: number; bottom?: number; left?: number }> = [
  { top: 12, right: 16 },
  { top: 12, right: 80 },
  { top: 60, right: 16 },
  { top: 60, right: 80 },
];

// Fixed position for marketplace — bottom-left corner, out of the way of all buttons/tabs
const MARKETPLACE_FIXED_POS = { bottom: 24, left: 16 };

type WizardState = "idle" | "talking" | "waving" | "celebrating" | "sleeping" | "walking";

// Visibility states for animated transitions
type VisibilityState = "entering" | "visible" | "exiting" | "hidden";

export default function ArchibaldWizard() {
  const { isEnabled } = useArchibald();
  const { user, loading: authLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [isMinimized, setIsMinimized] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [wizardState, setWizardState] = useState<WizardState>("idle");
  const [tipIndex, setTipIndex] = useState(0);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    return sessionStorage.getItem("archibald-dismissed") === "true";
  });

  // Sound mute state
  const [soundsMuted, setSoundsMuted] = useState(() => isWizardSoundsMuted());

  // Animation visibility state
  const [visibility, setVisibility] = useState<VisibilityState>(
    isEnabled && !isDismissed ? "entering" : "hidden"
  );
  const prevEnabled = useRef(isEnabled);
  const prevDismissed = useRef(isDismissed);
  const prevMinimized = useRef(isMinimized);

  // Roaming position state
  const [posIndex, setPosIndex] = useState(0);
  const [currentPos, setCurrentPos] = useState<{ top?: number; right?: number; bottom?: number; left?: number }>(ROAM_POSITIONS[0]);
  const [isFlipped, setIsFlipped] = useState(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const wizardRef = useRef<HTMLDivElement>(null);
  const dragStartTime = useRef(0);

  // Determine if we're on the marketplace page
  const isOnMarketplace = location.startsWith("/marketplace");

  // Determine if we're on the Titan chat / dashboard page (where roaming is allowed)
  const isOnTitanPage = location.startsWith("/dashboard") || location === "/";

  // Handle toggle on/off with animation + sound
  useEffect(() => {
    if (prevEnabled.current !== isEnabled) {
      prevEnabled.current = isEnabled;
      if (isEnabled) {
        // Turning ON: enter with animation + sound
        playAppearSound();
        setVisibility("entering");
        requestAnimationFrame(() => {
          setTimeout(() => setVisibility("visible"), 20);
        });
      } else {
        // Turning OFF: exit with animation + sound
        playDisappearSound();
        setVisibility("exiting");
        setTimeout(() => setVisibility("hidden"), 500);
      }
    }
  }, [isEnabled]);

  // Handle dismiss with animation + sound
  useEffect(() => {
    if (prevDismissed.current !== isDismissed) {
      prevDismissed.current = isDismissed;
      if (isDismissed) {
        playDisappearSound();
        setVisibility("exiting");
        setTimeout(() => setVisibility("hidden"), 500);
      } else {
        playAppearSound();
        setVisibility("entering");
        requestAnimationFrame(() => {
          setTimeout(() => setVisibility("visible"), 20);
        });
      }
    }
  }, [isDismissed]);

  // Handle minimize with animation + sound
  useEffect(() => {
    if (prevMinimized.current !== isMinimized) {
      prevMinimized.current = isMinimized;
      if (isMinimized) {
        playMinimizeSound();
        setVisibility("exiting");
        setTimeout(() => setVisibility("hidden"), 400);
      } else {
        playRestoreSound();
        setVisibility("entering");
        requestAnimationFrame(() => {
          setTimeout(() => setVisibility("visible"), 20);
        });
      }
    }
  }, [isMinimized]);

  // Initial entrance animation
  useEffect(() => {
    if (isEnabled && !isDismissed && !isMinimized && visibility === "entering") {
      const timer = setTimeout(() => setVisibility("visible"), 100);
      return () => clearTimeout(timer);
    }
  }, []);

  // Find tips for current page
  const currentPageTips = useMemo(() => {
    const exactMatch = PAGE_TIPS[location];
    if (exactMatch) return exactMatch;
    const prefix = Object.keys(PAGE_TIPS).find(
      (key) => key !== "/" && location.startsWith(key)
    );
    return prefix ? PAGE_TIPS[prefix] : null;
  }, [location]);

  // Show greeting on first load with sound
  useEffect(() => {
    if (!hasGreeted && !isDismissed && isEnabled) {
      const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
      setCurrentMessage(greeting);
      setShowBubble(true);
      setWizardState("waving");
      setHasGreeted(true);
      playAppearSound();

      const timer = setTimeout(() => {
        setShowBubble(false);
        setWizardState("idle");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [hasGreeted, isDismissed, isEnabled]);

  // Show page-specific tip when navigating
  useEffect(() => {
    if (!hasGreeted || isDismissed || isMinimized || !isEnabled) return;

    const timer = setTimeout(() => {
      if (currentPageTips && currentPageTips.length > 0) {
        const tip = currentPageTips[0];
        setCurrentMessage(tip);
        setShowBubble(true);
        playBubbleSound();
        setWizardState("talking");
        setTipIndex(1);

        const hideTimer = setTimeout(() => {
          setShowBubble(false);
          setWizardState("idle");
        }, 6000);
        return () => clearTimeout(hideTimer);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [location, hasGreeted, isDismissed, isMinimized, isEnabled]);

  // Roaming: move to a new position every 12-20 seconds — ONLY on Titan/dashboard pages
  useEffect(() => {
    // Don't roam if dismissed, minimized, dragging, has drag position, disabled, or NOT on a roaming page
    if (isDismissed || isMinimized || isDragging || dragPos || !isEnabled) return;

    // Only roam on Titan chat / dashboard pages — stay fixed everywhere else
    if (!isOnTitanPage) return;

    const roam = () => {
      const nextIndex = (posIndex + 1 + Math.floor(Math.random() * (ROAM_POSITIONS.length - 1))) % ROAM_POSITIONS.length;
      const nextPos = ROAM_POSITIONS[nextIndex];
      const prevPos = currentPos;

      // Determine flip direction based on horizontal movement
      const prevX = prevPos.right !== undefined ? window.innerWidth - prevPos.right : (prevPos.left || 0);
      const nextX = nextPos.right !== undefined ? window.innerWidth - nextPos.right : (nextPos.left || 0);
      setIsFlipped(nextX < prevX);

      playRoamSound();
      setWizardState("walking");
      setPosIndex(nextIndex);
      setCurrentPos(nextPos);

      // Return to idle after the transition
      setTimeout(() => {
        setWizardState((prev) => (prev === "walking" ? "idle" : prev));
      }, 1200);
    };

    const interval = setInterval(roam, 12000 + Math.random() * 8000);
    return () => clearInterval(interval);
  }, [isDismissed, isMinimized, isDragging, dragPos, posIndex, currentPos, isEnabled, isOnTitanPage]);

  // Reset drag position when page changes so wizard doesn't get stuck
  // Also reset roaming position to first position when switching pages
  useEffect(() => {
    setDragPos(null);
    // When entering marketplace, snap to fixed position
    if (isOnMarketplace) {
      setCurrentPos(MARKETPLACE_FIXED_POS as any);
    } else {
      setCurrentPos(ROAM_POSITIONS[0]);
      setPosIndex(0);
    }
  }, [location]);

  // Drag handlers with sound — only allow dragging on Titan page
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isMinimized) return;
    // Disable dragging on marketplace — wizard stays put
    if (isOnMarketplace) return;
    const el = wizardRef.current;
    if (!el) return;

    dragStartTime.current = Date.now();
    const rect = el.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsDragging(true);
    playDragStartSound();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [isMinimized, isOnMarketplace]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    setDragPos({ x, y });
  }, [isDragging, dragOffset]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // If it was a short tap (< 200ms), treat as click
    if (Date.now() - dragStartTime.current < 200) {
      setDragPos(null); // Reset drag so it can roam again
      handleWizardClick();
    } else {
      playDragEndSound();
    }
  }, [isDragging]);

  // Click wizard → toggle between marketplace and Titan chat
  const handleWizardClick = useCallback(() => {
    if (isMinimized) {
      setIsMinimized(false);
      return;
    }

    playClickSound();
    setCurrentMessage(isOnMarketplace ? "Back to the Titan we go!" : "Follow me to the marketplace!");
    setShowBubble(true);
    playBubbleSound();
    setWizardState("celebrating");

    setTimeout(() => {
      setShowBubble(false);
      setWizardState("idle");
      setLocation(isOnMarketplace ? "/dashboard" : "/marketplace");
    }, 1500);
  }, [isMinimized, isOnMarketplace, setLocation]);

  const handleDismiss = useCallback(() => {
    setShowBubble(false);
    // Animation + sound handled by isDismissed effect
    setIsDismissed(true);
    sessionStorage.setItem("archibald-dismissed", "true");
  }, []);

  const handleMinimize = useCallback(() => {
    setShowBubble(false);
    // Animation + sound handled by isMinimized effect
    setIsMinimized(true);
  }, []);

  // Toggle sound mute
  const toggleSounds = useCallback(() => {
    const newMuted = !soundsMuted;
    setSoundsMuted(newMuted);
    setWizardSoundsMuted(newMuted);
  }, [soundsMuted]);

  // Compute position style
  const positionStyle = useMemo(() => {
    if (dragPos) {
      return {
        position: "fixed" as const,
        left: dragPos.x,
        top: dragPos.y,
        transition: isDragging ? "none" : "left 0.3s ease, top 0.3s ease",
      };
    }

    // On marketplace: fixed bottom-left position, no roaming
    if (isOnMarketplace) {
      return {
        position: "fixed" as const,
        bottom: MARKETPLACE_FIXED_POS.bottom,
        left: MARKETPLACE_FIXED_POS.left,
        transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      };
    }

    // Use roaming position (Titan page and others)
    const style: Record<string, any> = {
      position: "fixed" as const,
      transition: "all 1s cubic-bezier(0.4, 0, 0.2, 1)",
    };
    if (currentPos.bottom !== undefined) style.bottom = currentPos.bottom;
    if (currentPos.top !== undefined) style.top = currentPos.top;
    if (currentPos.right !== undefined) style.right = currentPos.right;
    if (currentPos.left !== undefined) style.left = currentPos.left;
    return style;
  }, [dragPos, isDragging, currentPos, isOnMarketplace]);

  // Entrance/exit animation styles
  const animationStyle = useMemo(() => {
    switch (visibility) {
      case "entering":
        return {
          opacity: 0,
          transform: "scale(0.3) rotate(-15deg)",
          transition: "opacity 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        };
      case "visible":
        return {
          opacity: 1,
          transform: "scale(1) rotate(0deg)",
          transition: "opacity 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        };
      case "exiting":
        return {
          opacity: 0,
          transform: "scale(0.3) rotate(15deg)",
          transition: "opacity 0.4s ease-in, transform 0.4s ease-in",
          pointerEvents: "none" as const,
        };
      case "hidden":
        return { display: "none" as const };
    }
  }, [visibility]);

  // Only show wizard after successful login — never on landing/public pages
  if (authLoading || !user) return null;

  // If globally disabled and fully hidden, render nothing
  if (!isEnabled && visibility === "hidden") return null;

  // Dismissed state — show the "bring back" sparkle button with animation
  if (isDismissed && visibility === "hidden") {
    return (
      <button
        onClick={() => {
          setIsDismissed(false);
          sessionStorage.removeItem("archibald-dismissed");
          setWizardState("waving");
          setCurrentMessage("I'm back! Miss me?");
          setShowBubble(true);
          playAppearSound();
          setTimeout(() => {
            setShowBubble(false);
            setWizardState("idle");
          }, 4000);
        }}
        className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full bg-indigo-600/80 hover:bg-indigo-500 flex items-center justify-center shadow-lg transition-all hover:scale-110"
        title="Bring back Archibald"
        style={{ animation: "archibald-sparkle-btn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" }}
      >
        <Sparkles className="w-5 h-5 text-white" />
      </button>
    );
  }

  // Minimized state — show small avatar with animation
  if (isMinimized && visibility === "hidden") {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed top-4 right-4 z-50 group"
        title="Archibald is here!"
        style={{ animation: "archibald-minimize-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" }}
      >
        <div className="relative">
          <div
            className="w-14 h-14 transition-transform group-hover:scale-110"
            style={{
              animation: "archibald-bob 3s ease-in-out infinite",
              filter: "drop-shadow(0 4px 8px rgba(79, 70, 229, 0.3))",
            }}
          >
            <TitanLogo size="md" />
          </div>
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-400 rounded-full animate-pulse" />
        </div>
      </button>
    );
  }

  // Choose idle animation based on page — gentle bob on marketplace, full bob on titan
  const idleAnimation = isOnMarketplace
    ? "archibald-gentle-bob 4s ease-in-out infinite"
    : "archibald-bob 3s ease-in-out infinite";

  return (
    <>
      <div
        ref={wizardRef}
        className="z-50 flex flex-col items-end gap-2"
        style={{
          ...positionStyle,
          ...animationStyle,
          cursor: isOnMarketplace ? "pointer" : (isDragging ? "grabbing" : "grab"),
          userSelect: "none",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={isOnMarketplace ? handleWizardClick : undefined}
      >
        {/* Speech bubble */}
        {showBubble && (
          <div
            className="max-w-[280px] bg-slate-900/95 backdrop-blur-sm border border-indigo-500/30 rounded-2xl rounded-br-sm p-3.5 shadow-xl pointer-events-auto"
            style={{
              animation: "archibald-bubble-in 0.3s ease-out",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-slate-100 leading-relaxed">
              {currentMessage}
            </p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
              <span className="text-[10px] text-indigo-400 font-medium tracking-wide uppercase">
                Archibald
              </span>
              <div className="flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleWizardClick();
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  {isOnMarketplace ? "🤖 Titan Chat" : "🛒 Marketplace"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Wizard character */}
        <div className="relative group">
          {/* Controls */}
          <div
            className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={toggleSounds}
              className="w-5 h-5 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center hover:bg-slate-700 transition-colors cursor-pointer"
              title={soundsMuted ? "Unmute sounds" : "Mute sounds"}
            >
              {soundsMuted ? (
                <VolumeX className="w-3 h-3 text-slate-400" />
              ) : (
                <Volume2 className="w-3 h-3 text-cyan-400" />
              )}
            </button>
            <button
              onClick={handleMinimize}
              className="w-5 h-5 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center hover:bg-slate-700 transition-colors cursor-pointer"
              title="Minimize"
            >
              <ChevronDown className="w-3 h-3 text-slate-300" />
            </button>
            <button
              onClick={handleDismiss}
              className="w-5 h-5 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center hover:bg-red-900/80 transition-colors cursor-pointer"
              title="Dismiss Archibald"
            >
                  <span className="sr-only">Close</span>
                  <X className="w-3 h-3 text-slate-300" />
            </button>
          </div>

          {/* Glow effect */}
          <div
            className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl transition-all"
            style={{
              animation:
                wizardState === "talking"
                  ? "archibald-glow 1.5s ease-in-out infinite"
                  : wizardState === "waving"
                    ? "archibald-glow 1s ease-in-out infinite"
                    : "none",
            }}
          />

          {/* Archibald image */}
          <div className="relative">
            <div
              className="w-20 h-20 drop-shadow-lg"
              draggable={false}
              style={{
                animation:
                  wizardState === "idle"
                    ? idleAnimation
                    : wizardState === "waving"
                      ? "archibald-wave 0.5s ease-in-out 3"
                      : wizardState === "talking"
                        ? "archibald-talk 0.3s ease-in-out infinite"
                        : wizardState === "celebrating"
                          ? "archibald-celebrate 0.4s ease-in-out 3"
                          : wizardState === "walking"
                            ? "archibald-walk 0.6s ease-in-out infinite"
                            : idleAnimation,
                filter: "drop-shadow(0 4px 12px rgba(79, 70, 229, 0.4))",
                transform: isFlipped ? "scaleX(-1)" : "scaleX(1)",
              }}
            >
              <TitanLogo size="lg" />
            </div>

            {/* Walking trail particles — only on Titan page where roaming happens */}
            {wizardState === "walking" && isOnTitanPage && (
              <>
                <div
                  className="absolute bottom-0 left-1/2 w-1.5 h-1.5 bg-indigo-400/60 rounded-full"
                  style={{ animation: "archibald-trail 0.8s ease-out forwards" }}
                />
                <div
                  className="absolute bottom-1 left-1/3 w-1 h-1 bg-purple-400/40 rounded-full"
                  style={{ animation: "archibald-trail 0.8s ease-out 0.2s forwards" }}
                />
              </>
            )}

            {/* Sparkle particles */}
            {(wizardState === "waving" || wizardState === "celebrating") && (
              <>
                <div
                  className="absolute top-0 left-2 w-2 h-2 bg-cyan-400 rounded-full"
                  style={{ animation: "archibald-sparkle 0.8s ease-out forwards" }}
                />
                <div
                  className="absolute top-2 right-0 w-1.5 h-1.5 bg-yellow-400 rounded-full"
                  style={{ animation: "archibald-sparkle 0.8s ease-out 0.2s forwards" }}
                />
                <div
                  className="absolute bottom-4 left-0 w-1 h-1 bg-purple-400 rounded-full"
                  style={{ animation: "archibald-sparkle 0.8s ease-out 0.4s forwards" }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes archibald-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes archibald-gentle-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes archibald-wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-8deg); }
          75% { transform: rotate(8deg); }
        }
        @keyframes archibald-talk {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-2px) scale(1.02); }
        }
        @keyframes archibald-celebrate {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-10px) rotate(-5deg); }
          75% { transform: translateY(-10px) rotate(5deg); }
        }
        @keyframes archibald-walk {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-4px) rotate(-3deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-4px) rotate(3deg); }
        }
        @keyframes archibald-sparkle {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(-10px, -20px) scale(0); }
        }
        @keyframes archibald-trail {
          0% { opacity: 0.6; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(0, 8px) scale(0.3); }
        }
        @keyframes archibald-glow {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
        @keyframes archibald-bubble-in {
          0% { opacity: 0; transform: translateY(10px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes archibald-sparkle-btn {
          0% { opacity: 0; transform: scale(0) rotate(-180deg); }
          60% { opacity: 1; transform: scale(1.2) rotate(10deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes archibald-minimize-in {
          0% { opacity: 0; transform: scale(0.3) translateY(20px); }
          60% { opacity: 1; transform: scale(1.1) translateY(-3px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}
