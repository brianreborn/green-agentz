# green-zkillz companion pack

Filtered export of the **Green-Zkillz** skills and the full **Green-Brainz** tree from [brianreborn/green-agentz](https://github.com/brianreborn/green-agentz).

[green-roomz](https://github.com/brianreborn/green-roomz) is **not** in this pack. Do not copy pack paths into that repository.

## Try it from a clone (preferred)

```text
git clone https://github.com/brianreborn/green-agentz.git
pwsh ./scripts/green-zkillz/install-skills.ps1
# or: ./scripts/green-zkillz/install-skills.sh
```

That points Grok at `skills/` in the clone. It does not duplicate files into `~/.grok/skills` or into green-roomz.

Brainz stays at `systems/green-brainz`. Set `GREEN_BRAINZ_ROOT` to that directory if Roomz should import it. Tests: `node --test` in `irq/`, `memory/`, and `scheduler/`.

## Zip (distribution only)

Built with `scripts/green-zkillz/pack.ps1` / `pack.sh` via `git archive` of the paths in [MANIFEST.json](MANIFEST.json). Same files as this repo; not a second source tree.

Version: [docs/green-zkillz/VERSION](../docs/green-zkillz/VERSION). Pipeline docs: [docs/green-zkillz](../docs/green-zkillz).
