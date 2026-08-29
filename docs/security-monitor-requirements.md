# security-monitor requirements (API pointer)

The Common API in `src/monitor/` implements the SHALLs of the locked
security-monitor contract (discussion 2026-08-28 PT):

- mailbox envelope fields `seq`, `kind`, `source`, `ticket`, `ts`, `payload`, `target`
- 64-bit `{hi, lo}` ids; 32-bit ring index; wrap is not identity
- call table + `assertCaller` (lockdown/reboot/secure_reboot: respond after vote only)
- state graph + reject envelope (idempotent, not voted)
- identity snapshot without passwords/tokens/cookies/keys
- upcall `{kind: upcall, ticket, payload: {agent, op}}` against a frozen op allowlist

Canonical module: `src/monitor/api.mjs`.

Normative text lives in the research copy
`/workspace/cuda-research/security-monitor-requirements.md` (not vendored here).

Complex modules (Fortuna, 3-way vote, CUDA kernels, actual reboot) are out of
this sprint. `vote()` and `secureReboot()` throw `complex-last`.
