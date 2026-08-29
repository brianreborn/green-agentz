# Publish with GitHub CLI

```bash
gh auth login
git clone https://github.com/brianreborn/green-agency.git   # after rename: .../green-zkillz.git
cd green-agency
chmod +x scripts/gh-release-alpha.sh
./scripts/gh-release-alpha.sh          # tag from VERSION file, default v0.1.0-alpha
# or: ./scripts/gh-release-alpha.sh v0.1.1-alpha
```

No-script form:

```bash
gh release create v0.1.0-alpha --title "green-zkillz 0.1.0-alpha" --notes-file ALPHA.md --prerelease --generate-notes
```

## Actions (no laptop gh)

Repo → Actions → **alpha-release** → Run workflow → tag `v0.1.0-alpha`.

Or: `git tag v0.1.0-alpha && git push origin v0.1.0-alpha`

Then open the repo page → **Releases** on the right. ZIP is under Assets.
