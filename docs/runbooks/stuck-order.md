# Stuck order or dispatch

Trigger: non-terminal dispatch older than 24 hours or lifecycle sequence gap.

1. Identify Vendor order, dispatch and provider execution IDs through correlation search.
2. Query provider/Pepsa Order status; never blindly resubmit.
3. Apply only a forward, sequence-valid transition.
4. Preserve customer order during provider failure and allow in-flight completion during suspension.
5. Use explicit cancellation/refund compensation when recovery is impossible.

Success: the execution advances, compensates, or has a visible operator-owned exception.
