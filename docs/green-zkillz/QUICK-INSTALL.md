# Quick install — green-zkillz

```bash
git clone https://github.com/brianreborn/green-agentz.git
cd green-agentz
export GREEN_WORKSPACE="$PWD"
export GDICT_STATIC="$PWD/skills/green-zkillz/assets"
chmod +x skills/*/scripts/*.sh skills/green-zkillz/scripts/*.py
```

Point the host at this clone (no copy into green-roomz or `~/.grok/skills`):

```bash
./scripts/green-zkillz/install-skills.sh
# Windows: pwsh .\scripts\green-zkillz\install-skills.ps1
```

Skills live at `skills/green-{zkillz,probe,bootstrap,ingest,format,deploy}`.
Brainz (all of it) lives at `systems/green-brainz`. Set `GREEN_BRAINZ_ROOT`
to that path if Roomz should import it.

Needs: bash, python3, Node 22+ for Brainz tests. No pip.

```bash
export GREEN_WORKSPACE=/tmp/green-smoke
mkdir -p "$GREEN_WORKSPACE"
skills/green-probe/scripts/probe.sh
skills/green-zkillz/scripts/gdict-lru.sh usage compress
```

Do not commit `.runtime/`.
Full notes: skills/green-zkillz/references/INSTALL.md
