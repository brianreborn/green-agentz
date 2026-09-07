# green-zkillz 0.1.0-alpha

Public alpha for the **Green-Zkillz** capability layer in Green-Agentz, plus
the full **Green-Brainz** tree. Canonical repo:
[brianreborn/green-agentz](https://github.com/brianreborn/green-agentz).
Not a 1.0. Do not copy these trees into
[green-roomz](https://github.com/brianreborn/green-roomz).

This tree already contains the pipeline skills, GDICT, usage ledger, host-bindings,
and `systems/green-brainz`. Pack list: [pack/MANIFEST.json](../../pack/MANIFEST.json).

## Get it (no file paste)

```bash
git clone https://github.com/brianreborn/green-agentz.git
cd green-agentz
./scripts/green-zkillz/install-skills.sh
# Windows: pwsh .\scripts\green-zkillz\install-skills.ps1
```

That points Grok at `skills/` in the clone. Do not `cp` into `~/.grok/skills`
or into a green-roomz checkout.

Filtered zip (skills + all of green-brainz, no green-roomz):
`./scripts/green-zkillz/pack.sh` → `dist/green-zkillz-0.1.0-alpha.zip`.

## Cut the GitHub Release from your laptop

Needs [GitHub CLI](https://cli.github.com/) logged in (`gh auth login`).

```bash
cd green-agentz
gh release create green-zkillz-v0.1.0-alpha --title "green-zkillz 0.1.0-alpha" --notes-file docs/green-zkillz/ALPHA.md --prerelease
```

That is the whole publish. No per-file paste.

## Alpha limits

- Host identity must come from env / site.json (ask if empty).
- GDICT is control-plane only.
- `grok-files` provider is optional and off by default.
