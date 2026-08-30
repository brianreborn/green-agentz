# Quick install — green-zkillz

```bash
git clone https://github.com/brianreborn/green-agentz.git
cd green-agentz
export GREEN_WORKSPACE="$PWD"
export GDICT_STATIC="$PWD/skills/green-zkillz/assets"
chmod +x skills/*/scripts/*.sh skills/green-zkillz/scripts/*.py
```

Copy into the suitable agent's skill directory:

`skills/green-zkillz` plus `green-probe`, `green-bootstrap`, `green-ingest`,
`green-format`, and `green-deploy`.

Needs: bash, python3. No pip.

```bash
export GREEN_WORKSPACE=/tmp/green-smoke
mkdir -p "$GREEN_WORKSPACE"
skills/green-probe/scripts/probe.sh
skills/green-zkillz/scripts/gdict-lru.sh usage compress
```

Do not commit `.runtime/`.
Full notes: skills/green-zkillz/references/INSTALL.md
