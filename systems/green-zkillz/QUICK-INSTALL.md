# Quick install — green-zkillz

```bash
git clone https://github.com/brianreborn/green-agency.git
cd green-agency
export GREEN_WORKSPACE="$PWD"
export GDICT_STATIC="$PWD/skills/green-agency/assets"
chmod +x skills/*/scripts/*.sh skills/green-agency/scripts/*.py
```

Copy into the host skill dir (`~/.grok/skills/` on Grok):

`skills/green-zkillz` plus `green-probe` `green-bootstrap` `green-ingest` `green-format` `green-deploy` `green-agency` (legacy).

Needs: bash, python3. No pip.

```bash
export GREEN_WORKSPACE=/tmp/green-smoke
mkdir -p "$GREEN_WORKSPACE"
skills/green-probe/scripts/probe.sh
skills/green-agency/scripts/gdict-lru.sh usage compress
```

Do not commit `.runtime/`.
Full notes: skills/green-agency/references/INSTALL.md
