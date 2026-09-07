# green-zkillz companion pack

Filtered export from [brianreborn/green-agentz](https://github.com/brianreborn/green-agentz).
[green-roomz](https://github.com/brianreborn/green-roomz) is not in the archive.

| Tree | Role |
|---|---|
| `skills/green-*` | Operator `/skill` pipeline (zkillz, probe, bootstrap, ingest, format, deploy) |
| `systems/green-brainz` | IRQ, Dreamcatcher memory, cooperative scheduler |

Install and pack from this clone. Do not copy these paths into a green-roomz repository.

```text
python scripts/green-zkillz/install-skills.py
python scripts/green-zkillz/archive.py
```

Version is [docs/green-zkillz/VERSION](../docs/green-zkillz/VERSION). Path list is [MANIFEST.json](MANIFEST.json) `archive`. Pipeline docs: [docs/green-zkillz](../docs/green-zkillz).
