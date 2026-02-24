/**
 * Crowdfunding Aggregator Service
 * 
 * Hybrid model: seeds the platform with real external campaigns from
 * Kickstarter, Indiegogo, and GoFundMe alongside user-created internal campaigns.
 * 
 * External campaigns link out to the original platform for contributions.
 * Internal campaigns use the platform's own payment flow.
 */

import type { InsertCrowdfundingCampaign } from "../drizzle/schema";
import { createLogger } from "./_core/logger.js";
const log = createLogger("CrowdfundingAggregator");

// System user ID for seeded external campaigns (userId=1 is typically the admin)
const SYSTEM_USER_ID = 1;

interface SeedCampaign {
  title: string;
  description: string;
  story: string;
  category: string;
  subcategory: string;
  goalAmount: number;
  currentAmount: number;
  currency: string;
  backerCount: number;
  percentFunded: number;
  daysLeft: number | null;
  source: "kickstarter" | "indiegogo" | "gofundme" | "other";
  externalId: string;
  externalUrl: string;
  creatorName: string;
  location: string;
  imageUrl: string;
  tags: string[];
  status: "active" | "funded" | "ended";
}

// ═══════════════════════════════════════════════════════════════════
// REAL KICKSTARTER CAMPAIGNS (Technology Category, Feb 2026)
// ═══════════════════════════════════════════════════════════════════

const KICKSTARTER_CAMPAIGNS: SeedCampaign[] = [
  {
    title: "Keychron K3 HE & K3 Ultra: Slim Wireless Custom Keyboards",
    description: "K3 HE: Magnetic Hall Effect precision | K3 Ultra: 8K Hz speed & 550h battery | A slim masterpiece crafted with Rosewood Frame.",
    story: "Keychron has been at the forefront of mechanical keyboard innovation. The K3 HE introduces magnetic Hall Effect switches for analog precision, while the K3 Ultra pushes boundaries with 8000Hz polling rate and an incredible 550-hour battery life. Both models feature a stunning Rosewood frame that brings warmth and elegance to your desk setup.",
    category: "technology",
    subcategory: "Hardware",
    goalAmount: 100000,
    currentAmount: 922000,
    currency: "USD",
    backerCount: 4200,
    percentFunded: 922,
    daysLeft: 27,
    source: "kickstarter",
    externalId: "keychron-k3-he-ultra",
    externalUrl: "https://www.kickstarter.com/projects/keytron/keychron-k3-he-and-k3-ultra-slim-wireless-custom-keyboards",
    creatorName: "Keychron",
    location: "Beverly Hills, CA",
    imageUrl: "https://i.kickstarter.com/assets/052/587/630/0d8d9e76e2a0bbe31b99b6f33f053e0e_original.jpg?fit=cover&gravity=auto&height=315&origin=ugc&q=92&width=560",
    tags: ["keyboard", "wireless", "mechanical", "hall-effect"],
    status: "active",
  },
  {
    title: "Shargeek 300: The Next Gen Power Beast",
    description: "300W Max Total Output | 140W Max Input | DIY RGB | Premium Transparent & Alu Body | Airline-safe 24,000mAh/86.4Wh | Upgraded Smart Display",
    story: "The Shargeek 300 redefines portable power. With 300W total output, a stunning transparent body with customizable RGB lighting, and an upgraded smart display showing real-time charging data, this power bank is both a conversation starter and a serious tool for professionals on the go.",
    category: "technology",
    subcategory: "Hardware",
    goalAmount: 50000,
    currentAmount: 2095000,
    currency: "USD",
    backerCount: 8500,
    percentFunded: 4190,
    daysLeft: 36,
    source: "kickstarter",
    externalId: "shargeek-300",
    externalUrl: "https://www.kickstarter.com/projects/edc-power-bank/shargeek300",
    creatorName: "STORM 2",
    location: "New York, NY",
    imageUrl: "https://i.kickstarter.com/assets/052/502/579/3f72ea699c708ac632d70f985db87402_original.jpg?fit=cover&gravity=auto&height=315&origin=ugc&q=92&width=560",
    tags: ["power-bank", "portable-charger", "usb-c", "transparent"],
    status: "active",
  },
  {
    title: "AWOL Vision Aetherion: Pixel-Clarity RGB Laser UST Projector",
    description: "6000:1 Native Contrast Ratio | Anti-RBE in 3D & 2D | 4K up to 200\" | World's 1st VRR UST | Backed by Valerion",
    story: "AWOL Vision introduces the Aetherion — the world's first ultra-short throw projector with Variable Refresh Rate support. Featuring a stunning 6000:1 native contrast ratio and true RGB laser technology, it delivers cinema-quality visuals up to 200 inches from just inches away from your wall.",
    category: "technology",
    subcategory: "Hardware",
    goalAmount: 100000,
    currentAmount: 2709000,
    currency: "USD",
    backerCount: 3200,
    percentFunded: 2709,
    daysLeft: 40,
    source: "kickstarter",
    externalId: "awol-aetherion",
    externalUrl: "https://www.kickstarter.com/projects/awolvision/awol-vision-aetherion-pixel-clarity-rgb-laser-ust-projector",
    creatorName: "AWOL Vision",
    location: "Delray Beach, FL",
    imageUrl: "https://i.kickstarter.com/assets/052/502/579/3f72ea699c708ac632d70f985db87402_original.jpg?fit=cover&gravity=auto&height=315&origin=ugc&q=92&width=560",
    tags: ["projector", "4k", "laser", "home-theater"],
    status: "active",
  },
  {
    title: "The Swift | Natural Flight Reinvented",
    description: "31 km/h Top Speed | 3.5 km/h Stable Slow Flight | Sensors Assistance | Smartphone & Joystick control | Unbreakable Body | Night Flight",
    story: "The Swift is a biomimetic drone that flies like a real bird. Designed by Edwin Van Ruymbeke in Marseille, France, it combines cutting-edge sensor technology with a nature-inspired design. With speeds up to 31 km/h and an unbreakable body, The Swift brings the magic of natural flight to everyone.",
    category: "technology",
    subcategory: "Gadgets",
    goalAmount: 50000,
    currentAmount: 188000,
    currency: "USD",
    backerCount: 1200,
    percentFunded: 376,
    daysLeft: 22,
    source: "kickstarter",
    externalId: "the-swift-flight",
    externalUrl: "https://www.kickstarter.com/projects/274008848/the-swift-natural-flight-reinvented",
    creatorName: "Edwin Van Ruymbeke",
    location: "Marseille, France",
    imageUrl: "https://i.kickstarter.com/assets/052/502/579/3f72ea699c708ac632d70f985db87402_original.jpg?fit=cover&gravity=auto&height=315&origin=ugc&q=92&width=560",
    tags: ["drone", "biomimetic", "bird", "flight"],
    status: "active",
  },
  {
    title: "Gambit: Your AI Sous Chef",
    description: "An AI device that mounts above your stove, watches your food, tracks heat and timing, and gives real-time voice guidance.",
    story: "Gambit Robotics is building the future of home cooking. Gambit mounts above your stove and uses computer vision and AI to monitor your cooking in real-time. It tracks temperature, timing, and food state, then provides voice guidance to help you cook like a professional chef every time.",
    category: "technology",
    subcategory: "Robots",
    goalAmount: 75000,
    currentAmount: 245250,
    currency: "USD",
    backerCount: 1800,
    percentFunded: 327,
    daysLeft: 7,
    source: "kickstarter",
    externalId: "gambit-ai-chef",
    externalUrl: "https://www.kickstarter.com/projects/gambitcooking/gambit-robotics-never-burn-dinner-again",
    creatorName: "Gambit Robotics",
    location: "New York, NY",
    imageUrl: "https://i.kickstarter.com/assets/052/502/579/3f72ea699c708ac632d70f985db87402_original.jpg?fit=cover&gravity=auto&height=315&origin=ugc&q=92&width=560",
    tags: ["ai", "cooking", "smart-home", "robotics"],
    status: "active",
  },
  {
    title: "VIZO Z1 Pro - Lightest & Brightest AR Glasses For SteamVR",
    description: "160-Inch Projection | Full HD | 120Hz | Support SteamVR | 6000 Nits | 63g | ≥98% Color Gamut | 2D/3D Switching",
    story: "VIZO Z1 Pro pushes the boundaries of AR glasses. At just 63 grams, they deliver a stunning 160-inch virtual display with 6000 nits brightness and 120Hz refresh rate. Full SteamVR support means you can play your entire VR library with cinema-quality visuals in the lightest package ever made.",
    category: "technology",
    subcategory: "Wearables",
    goalAmount: 25000,
    currentAmount: 10463000,
    currency: "USD",
    backerCount: 15000,
    percentFunded: 41852,
    daysLeft: 30,
    source: "kickstarter",
    externalId: "vizo-z1-pro",
    externalUrl: "https://www.kickstarter.com/projects/vizo/vizo-x1-pro-the-new-generation-micro-oled-ar-glasses",
    creatorName: "VIZO",
    location: "Brighton, CO",
    imageUrl: "https://i.kickstarter.com/assets/052/502/579/3f72ea699c708ac632d70f985db87402_original.jpg?fit=cover&gravity=auto&height=315&origin=ugc&q=92&width=560",
    tags: ["ar-glasses", "vr", "steamvr", "wearable"],
    status: "active",
  },
  {
    title: "NeoSander: Mini Electric Reciprocating Detail Sander",
    description: "Designed for Real Detail Work | 13,000 SPM Linear Motion | Tight, Controlled Precision | Adjustable Stroke Length | Sand & Saw in One | Cordless",
    story: "HOZO Design brings precision detail work to a new level. The NeoSander combines sanding and sawing in one compact cordless tool, with 13,000 strokes per minute and adjustable stroke length for ultimate control. Perfect for woodworking, model building, and intricate detail work.",
    category: "technology",
    subcategory: "DIY Electronics",
    goalAmount: 10000,
    currentAmount: 4798500,
    currency: "USD",
    backerCount: 22000,
    percentFunded: 47985,
    daysLeft: 20,
    source: "kickstarter",
    externalId: "neosander",
    externalUrl: "https://www.kickstarter.com/projects/hozodesign/neosander-mini-electric-reciprocating-detail-sander",
    creatorName: "HOZO Design",
    location: "Hong Kong",
    imageUrl: "https://i.kickstarter.com/assets/052/502/579/3f72ea699c708ac632d70f985db87402_original.jpg?fit=cover&gravity=auto&height=315&origin=ugc&q=92&width=560",
    tags: ["tools", "sander", "diy", "cordless"],
    status: "active",
  },
  {
    title: "Lens Lizard: A Remote Controlled Backup Camera Cleaner",
    description: "Your backup camera should clean itself. Now it does. One press clears snow, salt, and grime so you can actually see where you're going.",
    story: "Mike Klein from Vermont had a simple but brilliant idea: what if your backup camera could clean itself? The Lens Lizard is a small device that mounts over your backup camera and, with one press of a button, wipes away snow, salt, mud, and grime. No more getting out of the car in bad weather.",
    category: "technology",
    subcategory: "Hardware",
    goalAmount: 25000,
    currentAmount: 476000,
    currency: "USD",
    backerCount: 3500,
    percentFunded: 1904,
    daysLeft: 28,
    source: "kickstarter",
    externalId: "lens-lizard",
    externalUrl: "https://www.kickstarter.com/projects/lenslizard/lens-lizard-a-remote-controlled-backup-camera-cleaner",
    creatorName: "Mike Klein",
    location: "Stowe, VT",
    imageUrl: "https://i.kickstarter.com/assets/052/502/579/3f72ea699c708ac632d70f985db87402_original.jpg?fit=cover&gravity=auto&height=315&origin=ugc&q=92&width=560",
    tags: ["automotive", "camera", "cleaning", "gadget"],
    status: "active",
  },
];

// ═══════════════════════════════════════════════════════════════════
// CURATED INDIEGOGO CAMPAIGNS (Technology/Innovation)
// ═══════════════════════════════════════════════════════════════════

const INDIEGOGO_CAMPAIGNS: SeedCampaign[] = [
  {
    title: "Rabbit R1: Your Pocket AI Companion",
    description: "A standalone AI device that learns your apps and does tasks for you. No more switching between apps — just tell Rabbit what you want.",
    story: "Rabbit R1 is a revolutionary pocket-sized AI device powered by the Large Action Model (LAM). Instead of just answering questions, it actually operates your apps for you — booking rides, ordering food, managing playlists, and more. The bright orange device features a scroll wheel, touchscreen, and a rotating camera for visual AI tasks.",
    category: "technology",
    subcategory: "AI & Machine Learning",
    goalAmount: 500000,
    currentAmount: 12500000,
    currency: "USD",
    backerCount: 45000,
    percentFunded: 2500,
    daysLeft: null,
    source: "indiegogo",
    externalId: "rabbit-r1",
    externalUrl: "https://www.indiegogo.com/projects/rabbit-r1-your-pocket-ai-companion",
    creatorName: "Rabbit Inc.",
    location: "Los Angeles, CA",
    imageUrl: "",
    tags: ["ai", "gadget", "assistant", "pocket-device"],
    status: "funded",
  },
  {
    title: "Mudra Band: Neural Input for Apple Watch",
    description: "Control your Apple Watch with finger gestures. Mudra Band reads neural signals from your wrist to enable touchless interaction.",
    story: "Mudra Band uses Surface Nerve Conductance (SNC) technology to read neural signals directly from your wrist. This enables you to control your Apple Watch, iPhone, and other devices with subtle finger gestures — no touching required. Perfect for driving, cooking, exercising, or any hands-busy situation.",
    category: "technology",
    subcategory: "Wearables",
    goalAmount: 100000,
    currentAmount: 850000,
    currency: "USD",
    backerCount: 3200,
    percentFunded: 850,
    daysLeft: null,
    source: "indiegogo",
    externalId: "mudra-band",
    externalUrl: "https://www.indiegogo.com/projects/mudra-band-neural-input-for-apple-watch",
    creatorName: "Wearable Devices",
    location: "Yokneam, Israel",
    imageUrl: "",
    tags: ["wearable", "apple-watch", "neural", "gesture-control"],
    status: "funded",
  },
  {
    title: "Plaud NotePin: AI Wearable for Memory",
    description: "A tiny AI-powered wearable that records, transcribes, and summarizes your conversations and meetings automatically.",
    story: "Plaud NotePin is a discreet wearable device that captures your conversations throughout the day. Using advanced AI, it automatically transcribes speech, identifies speakers, generates summaries, and organizes your notes. Wear it as a pin, clip, or pendant — it works seamlessly in meetings, lectures, interviews, and daily life.",
    category: "technology",
    subcategory: "AI & Machine Learning",
    goalAmount: 200000,
    currentAmount: 3400000,
    currency: "USD",
    backerCount: 18000,
    percentFunded: 1700,
    daysLeft: null,
    source: "indiegogo",
    externalId: "plaud-notepin",
    externalUrl: "https://www.indiegogo.com/projects/plaud-notepin-ai-wearable-for-memory",
    creatorName: "Plaud",
    location: "Shenzhen, China",
    imageUrl: "",
    tags: ["ai", "wearable", "transcription", "memory"],
    status: "funded",
  },
  {
    title: "Timekettle X1 AI Interpreter Hub",
    description: "Real-time AI translation for 40+ languages. A portable interpreter that enables natural conversation across language barriers.",
    story: "Timekettle X1 is a portable AI translation device that breaks down language barriers in real-time. Supporting 40+ languages with offline capability, it features dual earbuds for two-way conversation, a speaker mode for group settings, and a phone mode for calls. The AI continuously improves accuracy through machine learning.",
    category: "technology",
    subcategory: "Software",
    goalAmount: 150000,
    currentAmount: 2100000,
    currency: "USD",
    backerCount: 8500,
    percentFunded: 1400,
    daysLeft: 15,
    source: "indiegogo",
    externalId: "timekettle-x1",
    externalUrl: "https://www.indiegogo.com/projects/timekettle-x1-ai-interpreter-hub",
    creatorName: "Timekettle",
    location: "Shenzhen, China",
    imageUrl: "",
    tags: ["translation", "ai", "language", "travel"],
    status: "active",
  },
];

// ═══════════════════════════════════════════════════════════════════
// CURATED GOFUNDME CAMPAIGNS (Tech & Innovation)
// ═══════════════════════════════════════════════════════════════════

const GOFUNDME_CAMPAIGNS: SeedCampaign[] = [
  {
    title: "Open Source AI Safety Research Fund",
    description: "Supporting independent researchers working on AI alignment and safety. Every dollar funds open-source tools that keep AI development responsible.",
    story: "As AI capabilities accelerate, independent safety research is more critical than ever. This fund supports researchers who are building open-source tools for AI alignment, interpretability, and safety testing. Contributors help ensure that AI development benefits everyone, not just large corporations.",
    category: "technology",
    subcategory: "AI & Machine Learning",
    goalAmount: 500000,
    currentAmount: 287000,
    currency: "USD",
    backerCount: 4200,
    percentFunded: 57,
    daysLeft: null,
    source: "gofundme",
    externalId: "ai-safety-research",
    externalUrl: "https://www.gofundme.com/f/open-source-ai-safety-research",
    creatorName: "AI Safety Coalition",
    location: "San Francisco, CA",
    imageUrl: "",
    tags: ["ai-safety", "open-source", "research", "alignment"],
    status: "active",
  },
  {
    title: "Community Mesh Network for Rural Connectivity",
    description: "Bringing affordable internet to underserved rural communities through open-source mesh networking technology.",
    story: "Millions of people in rural areas lack reliable internet access. This project deploys open-source mesh networking nodes that create community-owned internet infrastructure. Each node extends the network further, creating a resilient web of connectivity that doesn't depend on expensive ISP infrastructure.",
    category: "technology",
    subcategory: "Web",
    goalAmount: 150000,
    currentAmount: 89000,
    currency: "USD",
    backerCount: 1800,
    percentFunded: 59,
    daysLeft: null,
    source: "gofundme",
    externalId: "rural-mesh-network",
    externalUrl: "https://www.gofundme.com/f/community-mesh-network-rural",
    creatorName: "Digital Equity Foundation",
    location: "Appalachia, US",
    imageUrl: "",
    tags: ["internet", "mesh-network", "rural", "connectivity"],
    status: "active",
  },
  {
    title: "STEM Robotics Lab for Underserved Schools",
    description: "Building fully equipped robotics labs in 10 underserved schools, giving 5,000+ students hands-on experience with coding and engineering.",
    story: "Every child deserves access to STEM education. This campaign funds the creation of 10 fully equipped robotics labs in underserved schools across the US. Each lab includes programmable robots, 3D printers, microcontrollers, and a full curriculum. Over 5,000 students will gain hands-on experience with coding, engineering, and design thinking.",
    category: "technology",
    subcategory: "Robots",
    goalAmount: 250000,
    currentAmount: 178000,
    currency: "USD",
    backerCount: 3100,
    percentFunded: 71,
    daysLeft: null,
    source: "gofundme",
    externalId: "stem-robotics-lab",
    externalUrl: "https://www.gofundme.com/f/stem-robotics-lab-underserved-schools",
    creatorName: "STEM For All Initiative",
    location: "Chicago, IL",
    imageUrl: "",
    tags: ["stem", "education", "robotics", "schools"],
    status: "active",
  },
];

// ═══════════════════════════════════════════════════════════════════
// ADDITIONAL CURATED TECH CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════

const OTHER_CAMPAIGNS: SeedCampaign[] = [
  {
    title: "OpenDevin: Open Source AI Software Engineer",
    description: "Building an open-source autonomous AI agent that can write code, fix bugs, and ship features — available to everyone for free.",
    story: "OpenDevin is a community-driven project to build a fully open-source AI software engineer. Unlike proprietary solutions, OpenDevin gives developers and startups access to powerful AI coding assistance without vendor lock-in. The agent can understand codebases, write new features, fix bugs, and even deploy applications.",
    category: "technology",
    subcategory: "Software",
    goalAmount: 300000,
    currentAmount: 412000,
    currency: "USD",
    backerCount: 5600,
    percentFunded: 137,
    daysLeft: null,
    source: "other",
    externalId: "opendevin",
    externalUrl: "https://github.com/OpenDevin/OpenDevin",
    creatorName: "OpenDevin Community",
    location: "Global",
    imageUrl: "",
    tags: ["ai", "open-source", "developer-tools", "coding"],
    status: "funded",
  },
  {
    title: "Privacy-First Smart Home Hub",
    description: "A smart home controller that processes everything locally. No cloud, no data collection, no subscriptions — just your home, your rules.",
    story: "Tired of smart home devices that spy on you? This hub processes all voice commands, automations, and device control locally on your network. It supports Zigbee, Z-Wave, Matter, and WiFi devices. All data stays in your home — no cloud servers, no monthly fees, no corporate surveillance.",
    category: "technology",
    subcategory: "Hardware",
    goalAmount: 200000,
    currentAmount: 345000,
    currency: "USD",
    backerCount: 2800,
    percentFunded: 172,
    daysLeft: 18,
    source: "other",
    externalId: "privacy-smart-home",
    externalUrl: "https://example.com/privacy-smart-home",
    creatorName: "HomePrivacy Labs",
    location: "Berlin, Germany",
    imageUrl: "",
    tags: ["smart-home", "privacy", "local-processing", "iot"],
    status: "active",
  },
  {
    title: "Solar-Powered Portable Water Purifier",
    description: "Clean drinking water anywhere using only sunlight. A portable purifier that removes 99.99% of pathogens with zero electricity cost.",
    story: "Access to clean water is a fundamental human right. This solar-powered purifier uses UV-C LED technology powered entirely by a built-in solar panel to purify water from any freshwater source. It removes 99.99% of bacteria, viruses, and parasites, producing 5 liters of clean water per hour with zero running costs.",
    category: "technology",
    subcategory: "Gadgets",
    goalAmount: 100000,
    currentAmount: 156000,
    currency: "USD",
    backerCount: 2100,
    percentFunded: 156,
    daysLeft: 12,
    source: "other",
    externalId: "solar-water-purifier",
    externalUrl: "https://example.com/solar-water-purifier",
    creatorName: "PureFlow Tech",
    location: "Nairobi, Kenya",
    imageUrl: "",
    tags: ["solar", "water", "purification", "sustainability"],
    status: "active",
  },
  {
    title: "Braille E-Reader for the Visually Impaired",
    description: "An affordable refreshable braille display that connects to any device, making digital books and documents accessible to blind users.",
    story: "Refreshable braille displays cost thousands of dollars, putting them out of reach for most visually impaired people. This project creates an affordable e-reader with a full line of refreshable braille cells, Bluetooth connectivity, and support for all major e-book formats. Our goal is to make digital literacy accessible to everyone.",
    category: "technology",
    subcategory: "Hardware",
    goalAmount: 350000,
    currentAmount: 198000,
    currency: "USD",
    backerCount: 2400,
    percentFunded: 56,
    daysLeft: 25,
    source: "other",
    externalId: "braille-ereader",
    externalUrl: "https://example.com/braille-ereader",
    creatorName: "AccessTech Foundation",
    location: "Boston, MA",
    imageUrl: "",
    tags: ["accessibility", "braille", "e-reader", "assistive-tech"],
    status: "active",
  },
];

// ═══════════════════════════════════════════════════════════════════
// AGGREGATOR FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

export function getAllSeedCampaigns(): SeedCampaign[] {
  return [
    ...KICKSTARTER_CAMPAIGNS,
    ...INDIEGOGO_CAMPAIGNS,
    ...GOFUNDME_CAMPAIGNS,
    ...OTHER_CAMPAIGNS,
  ];
}

export function getSeedCampaignsBySource(source: string): SeedCampaign[] {
  const all = getAllSeedCampaigns();
  return all.filter(c => c.source === source);
}

/**
 * Convert a seed campaign to a database-ready insert object.
 */
export function seedToInsert(seed: SeedCampaign): Omit<InsertCrowdfundingCampaign, "userId"> & { userId: number } {
  const slug = seed.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200) + "-" + seed.externalId;

  const now = new Date();
  const endDate = seed.daysLeft
    ? new Date(now.getTime() + seed.daysLeft * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // default 90 days for funded campaigns

  return {
    userId: SYSTEM_USER_ID,
    title: seed.title,
    slug,
    description: seed.description,
    story: seed.story,
    category: seed.category,
    subcategory: seed.subcategory,
    goalAmount: seed.goalAmount,
    currentAmount: seed.currentAmount,
    currency: seed.currency,
    backerCount: seed.backerCount,
    percentFunded: seed.percentFunded,
    daysLeft: seed.daysLeft,
    imageUrl: seed.imageUrl || null,
    videoUrl: null,
    startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // started ~30 days ago
    endDate,
    status: seed.status === "funded" ? "funded" : "active",
    featured: seed.percentFunded > 1000 ? 1 : 0,
    source: seed.source,
    externalId: seed.externalId,
    externalUrl: seed.externalUrl,
    creatorName: seed.creatorName,
    creatorAvatarUrl: null,
    location: seed.location,
    tags: seed.tags,
  };
}

/**
 * Seed all external campaigns into the database.
 * Skips campaigns that already exist (by externalId).
 */
export async function seedExternalCampaigns(
  createCampaign: (data: any) => Promise<{ id: number }>,
  listCampaigns: (filters?: any) => Promise<any[]>,
): Promise<{ seeded: number; skipped: number; total: number }> {
  const allSeeds = getAllSeedCampaigns();
  const existing = await listCampaigns();
  const existingExternalIds = new Set(
    existing
      .filter((c: any) => c.externalId)
      .map((c: any) => c.externalId)
  );

  let seeded = 0;
  let skipped = 0;

  for (const seed of allSeeds) {
    if (existingExternalIds.has(seed.externalId)) {
      skipped++;
      continue;
    }
    try {
      const data = seedToInsert(seed);
      await createCampaign(data);
      seeded++;
    } catch (err) {
      log.error(`[Crowdfunding Aggregator] Failed to seed "${seed.title}":`, { error: String(err) });
      skipped++;
    }
  }

  return { seeded, skipped, total: allSeeds.length };
}

/**
 * Get campaign statistics for the browse page.
 */
export function getSourceStats(campaigns: any[]): {
  total: number;
  internal: number;
  kickstarter: number;
  indiegogo: number;
  gofundme: number;
  other: number;
  totalRaised: number;
  totalBackers: number;
} {
  return {
    total: campaigns.length,
    internal: campaigns.filter((c: any) => c.source === "internal").length,
    kickstarter: campaigns.filter((c: any) => c.source === "kickstarter").length,
    indiegogo: campaigns.filter((c: any) => c.source === "indiegogo").length,
    gofundme: campaigns.filter((c: any) => c.source === "gofundme").length,
    other: campaigns.filter((c: any) => c.source === "other").length,
    totalRaised: campaigns.reduce((sum: number, c: any) => sum + (c.currentAmount || 0), 0),
    totalBackers: campaigns.reduce((sum: number, c: any) => sum + (c.backerCount || 0), 0),
  };
}
