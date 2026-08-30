# green-zkillz

Adaptive skill pipeline within Green-Agentz.

**Start here:** [QUICK-INSTALL.md](QUICK-INSTALL.md) · [NAME.md](NAME.md)

Canonical repository: `brianreborn/green-agentz`. Canonical requirements:
[REQUIREMENTS.md](REQUIREMENTS.md).

## Pipeline

| Skill | Role |
|---|---|
| `green-zkillz` | Package orchestrator (preferred name) |
| `green-probe` | Host tier, privileges, identity, short-circuit cache |
| `green-bootstrap` | Makefile / env, CI, compiler proxy |
| `green-ingest` | Tree index or interactive ingest + syntax check |
| `green-format` | STYLE_GUIDE, `MANUSCRIPT.json`, non-destructive make |
| `green-deploy` | X, GitHub, or flat `MANUSCRIPT.md` |

GDICT: control-plane only. See `skills/green-zkillz/`.

## License

BSD 3-Clause. See `LICENSE`.
