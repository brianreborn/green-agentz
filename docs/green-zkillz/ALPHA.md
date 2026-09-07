# green-zkillz 0.1.0-alpha

Public alpha for the **Green-Zkillz** skills plus the full **Green-Brainz** tree
in [brianreborn/green-agentz](https://github.com/brianreborn/green-agentz).
Not a 1.0. Roomz stays in [brianreborn/green-roomz](https://github.com/brianreborn/green-roomz).

Pack list: [pack/MANIFEST.json](../../pack/MANIFEST.json).

## Get it

```bash
git clone https://github.com/brianreborn/green-agentz.git
cd green-agentz
python scripts/green-zkillz/install-skills.py
```

That merges `skills/` into Grok `[skills].paths`. It does not copy files.

Zip: `python scripts/green-zkillz/archive.py` → `dist/green-zkillz-0.1.0-alpha.zip`.

## Publish

Needs [GitHub CLI](https://cli.github.com/) (`gh auth login`).

```bash
./scripts/green-zkillz/gh-release-alpha.sh
```

## Alpha limits

- Host identity must come from env / site.json (ask if empty).
- GDICT is control-plane only.
- `grok-files` provider is optional and off by default.
