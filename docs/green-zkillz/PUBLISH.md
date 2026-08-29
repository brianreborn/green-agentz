# Publish with GitHub CLI

```bash
gh auth login
git clone https://github.com/brianreborn/green-agentz.git
cd green-agentz
chmod +x scripts/green-zkillz/gh-release-alpha.sh
./scripts/green-zkillz/gh-release-alpha.sh
# or: ./scripts/green-zkillz/gh-release-alpha.sh green-zkillz-v0.1.1-alpha
```

No-script form:

```bash
gh release create green-zkillz-v0.1.0-alpha --title "green-zkillz 0.1.0-alpha" --notes-file docs/green-zkillz/ALPHA.md --prerelease --generate-notes
```

## Actions (no laptop gh)

Repo → Actions → **green-zkillz-alpha-release** → Run workflow → tag `green-zkillz-v0.1.0-alpha`.

Or: `git tag green-zkillz-v0.1.0-alpha && git push origin green-zkillz-v0.1.0-alpha`

Then open the repo page → **Releases** on the right. ZIP is under Assets.
