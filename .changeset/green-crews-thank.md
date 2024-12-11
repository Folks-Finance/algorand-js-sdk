---
"@folks-finance/algorand-sdk": patch
---

Fixed unstake transaction bug by initializing arrays with BigInt(0)s to prevent undefined elements during iteration.
