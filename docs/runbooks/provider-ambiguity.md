# Provider ambiguity and outage

Trigger: timeout after submission, provider unavailable or unknown execution state.

1. Open the circuit after the configured failure threshold and stop new unsafe submissions.
2. Query by immutable Vendor dispatch/external reference.
3. If execution exists, attach it to the current dispatch; never create a second execution.
4. If absence is authoritative, retry with the original idempotency key after recovery.
5. Preserve in-flight delivery, tracking and support operations during new-work freeze.

Success: one active execution per dispatch and no duplicate funding or provider task.
