# Publish with GitHub CLI

```bash
gh auth login
git clone https://github.com/brianreborn/green-agentz.git
cd green-agentz
chmod +x scripts/green-zkillz/gh-release-alpha.sh
./scripts/green-zkillz/gh-release-alpha.sh
# or: ./scripts/green-zkillz/gh-release-alpha.sh green-zkillz-v0.1.1-alpha
```

The script runs `archive.py` and attaches `dist/green-zkillz-<VERSION>.zip`. Do not `gh release create` without that zip.

## Actions (no laptop gh)

Repo → Actions → **green-zkillz-alpha-release** → Run workflow → tag `green-zkillz-v0.1.0-alpha`.

Or: `git tag green-zkillz-v0.1.0-alpha && git push origin green-zkillz-v0.1.0-alpha`

Then open the repo page → **Releases** on the right. ZIP is under Assets.
