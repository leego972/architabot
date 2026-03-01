# Module Pricing Analysis — Buy vs Build

## Credit Costs Per Action
- chat_message: 1 credit
- builder_action: 3 credits (per tool call)
- github_action: 5 credits

## Typical Build-From-Scratch Costs (via Titan Chat)

### Simple Module (e.g., Password Strength Analyzer)
- ~5 chat messages to describe requirements: 5 credits
- ~8 builder tool calls (create files, write code, test): 24 credits
- ~3 follow-up messages for refinements: 3 credits
- ~5 more tool calls for fixes: 15 credits
- Total: ~47 credits
- **With iteration/debugging (realistic): ~80-120 credits**

### Medium Module (e.g., HTTP Header Auditor, SSL Analyzer)
- ~8 chat messages: 8 credits
- ~15 builder tool calls: 45 credits
- ~5 follow-up messages: 5 credits
- ~10 more tool calls: 30 credits
- Total: ~88 credits
- **With iteration/debugging (realistic): ~150-250 credits**

### Complex Module (e.g., API Security Suite, SIEM Pipeline)
- ~15 chat messages: 15 credits
- ~30 builder tool calls: 90 credits
- ~10 follow-up messages: 10 credits
- ~20 more tool calls: 60 credits
- Total: ~175 credits
- **With iteration/debugging (realistic): ~300-500 credits**

### Enterprise Module (e.g., Pentest Framework, Compliance Suite)
- ~25 chat messages: 25 credits
- ~50 builder tool calls: 150 credits
- ~15 follow-up messages: 15 credits
- ~30 more tool calls: 90 credits
- Total: ~280 credits
- **With iteration/debugging (realistic): ~500-1000 credits**

### Hacker Attack+Defense Module (e.g., SQLi Arsenal, AV Evasion)
- These are COMPLEX because they need both attack AND defense code
- ~20 chat messages: 20 credits
- ~40 builder tool calls: 120 credits
- ~12 follow-up messages: 12 credits
- ~25 more tool calls: 75 credits
- Total: ~227 credits
- **With iteration/debugging (realistic): ~400-700 credits**

## Pricing Strategy
Module price should be ~40-60% of the build-from-scratch cost.
This makes buying the obvious choice while still being profitable.

### Recommended Price Tiers:
- Simple modules: 50-80 credits (build cost ~100)
- Medium modules: 100-150 credits (build cost ~200)
- Complex modules: 200-350 credits (build cost ~400)
- Enterprise modules: 400-600 credits (build cost ~800)
- Hacker dual-purpose: 250-450 credits (build cost ~500)
