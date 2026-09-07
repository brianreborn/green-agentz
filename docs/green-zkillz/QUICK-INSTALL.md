# Quick install — green-zkillz

```bash
git clone https://github.com/brianreborn/green-agentz.git
cd green-agentz
export GREEN_WORKSPACE="$PWD"
export GDICT_STATIC="$PWD/skills/green-zkillz/assets"
python scripts/green-zkillz/install-skills.py
```

Needs: Python 3.10+, bash or Git for Windows (skill scripts), Node 22+ for Brainz tests. No pip.

Smoke:

```bash
export GREEN_WORKSPACE=/tmp/green-smoke
mkdir -p "$GREEN_WORKSPACE"
skills/green-probe/scripts/probe.sh
skills/green-zkillz/scripts/gdict-lru.sh usage compress
```

Do not commit `.runtime/`. Details: [skills/green-zkillz/references/INSTALL.md](../../skills/green-zkillz/references/INSTALL.md).
