# green-zkillz 0.1.0-alpha

Public alpha for the **Green-Zkillz** capability layer in Green-Agentz. The
GitHub repository has not been created or migrated yet.

This tree already contains the pipeline skills, GDICT, usage ledger, and host-bindings. Not a 1.0.

## Get it (no file paste)

```bash
git clone https://github.com/brianreborn/green-agentz.git
cd green-agentz
cp -R skills/green-* "$HOME/.grok/skills/"   # or your host skill dir
```

Or: GitHub → Code → Download ZIP.

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
