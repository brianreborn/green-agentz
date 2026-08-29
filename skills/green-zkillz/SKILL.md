---
name: green-zkillz
description: Run the green-zkillz adaptive skill pipeline. Triggers include green-zkillz, green-agency pipeline, run green-probe through green-deploy.
metadata:
  type: workflow
  version: "1.2"
  package: green-zkillz
---

# green-zkillz

Order: `green-probe` → `green-bootstrap` → `green-ingest` → `green-format` → `green-deploy`.

Identity and URLs: `HOST-BINDINGS.md`. Empty site fields mean ask.
Follow `../green-agency/SKILL.md` for contracts and GDICT. `green-agency` is a legacy trigger and a scripts folder.
