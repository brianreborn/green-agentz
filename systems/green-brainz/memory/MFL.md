# Memory Feedback Loop (implementation)

Module: `memory-feedback-loop.mjs`. Dreamcatcher remains the COW store.

| Name | Meaning |
|---|---|
| nap | Working set full or first stutter. Do not drop admitted items (fugue prevention). Host may `tryPromote()` on `epigenetic-optimization`. |
| fridge | Partition (ordinary recall hides; scoped lookup may still see). |
| freezer | Containment (no recall until `thaw`). |
| seizure | Hard pause after fridge→freezer or a repeated cycle. Goals tagged `goal` stay integrated. |

Stutter protocol id: `fr-fr-freezer`. Identical action hashes climb nap → fridge → freezer → seizure. ABAB cycles jump to freezer.

Attention cannot thaw containment. Wraparound writes a **new** derived key and keeps the parent in disintegration.
