# Duplicate or conflicting event

Trigger: event-ID payload-hash conflict, callback lag or dead-letter growth.

1. Preserve the inbox row and signatures; never delete or rewrite it.
2. Verify platform, environment, signing key ID, timestamp and payload hash.
3. Treat an identical duplicate as processed; quarantine conflicting reuse.
4. Inquire with the source system before replay. Replay delivery evidence, not the financial event.
5. Escalate conflicting signed payloads to Security and the source owner.

Success: every event is processed once or remains in a visible exception with an owner.
