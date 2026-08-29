# green-zkillz 0.1.0-alpha

Public alpha. Package name **green-zkillz**. GitHub repo still `brianreborn/green-agency` until renamed.

This tree already contains the pipeline skills, GDICT, usage ledger, and host-bindings. Not a 1.0.

## Get it (no file paste)

```bash
git clone https://github.com/brianreborn/green-agency.git
cd green-agency
cp -R skills/green-* "$HOME/.grok/skills/"   # or your host skill dir
```

Or: GitHub → Code → Download ZIP.

## Cut the GitHub Release from your laptop

Needs [GitHub CLI](https://cli.github.com/) logged in (`gh auth login`).

```bash
cd green-agency
gh release create v0.1.0-alpha --title "green-zkillz 0.1.0-alpha" --notes-file ALPHA.md --prerelease
```

That is the whole publish. No per-file paste.

## Alpha limits

- Host identity must come from env / site.json (ask if empty).
- GDICT is control-plane only.
- `grok-files` provider is optional and off by default.
