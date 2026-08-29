# Fleet targets (workers)

Job unless noted: **0.5B Q4**, short completion, thinking off.
`tok/W = tok/s / W_load`. `J/tok = W_load / tok/s`.
`meas` = timed here. `est` = estimate. Panel watts = display on.

**Policy:** own-device exploit OK. Worker **alongside** system software.
Operator names the box; this file holds SoCs / reset notes.

**UART:** USB-UART + cisco/ethernet console on hand.

Charts list **every considered device**. Rejects = one line only, no bar.

**Reset column:** can we recover from a backup / stock ROM after a bad flash?

Bar scale: tok/s 1#≈1; tok/W 1#≈0.25; J/tok 1#≈1 J. Width 40.

---

## Intake SOP (parallel)

1. FCC ID → internals / OpDesc silk  
2. OpenWrt ToH / WikiDevi / TechInfoDepot  
3. `"model" UART|OpenWrt|root|sdb|firmware`  
4. Cousin SKUs  
5. **Reset:** stock image URL / dual-boot / USB recovery / factory partition  

---

## tok/s

```
pixel8      20–40 est   ########################################
shalom      15–30 est   ##############################..........
note9        8–15 est   ###############.........................
godslove     4–8  est   ########................................
qodesh       3.0  meas  ###.....................................   2026-08-29 8-tok; was 2.5
QD65NF      ~2–6 est   ######..................................   55QD65NF Fire TV MT9602
SAX2V1R      —          ........................................
TU7000       —          ........................................
E472VLE      —          ........................................
EN2251       —          ........................................
K243Y        —          ........................................
IMW1202      —          ........................................
CKS5TW       —          ........................................   ATH-CKS5TW TWS
J3B          —          ........................................   V3J-J3B BT headset
```

## tok/W

```
pixel8      5–8         ################################
note9       1.5–3       ############............................
shalom      1.2–2.2     #########...............................
godslove    0.10–0.20   #.......................................
qodesh      0.05–0.06   ........................................   ~55–65 W load assumed
QD65NF      0.02–0.05   ........................................
SAX2V1R / TU7000 / E472VLE / EN2251 / K243Y / IMW1202 / CKS5TW / J3B  0 until shell
```

## J/tok

```
pixel8      0.15–0.3    #.......................................
note9       0.3–0.7     #.......................................
shalom      0.5–0.8     #.......................................
godslove    5–12        ############............................
qodesh      18–22 meas  ######################..................   scaled from 3.0 tok/s
QD65NF      25–80 est   ########################################
SAX2V1R / TU7000 / E472VLE / EN2251 / K243Y / IMW1202 / CKS5TW / J3B  n/a
```

Rejected for not apparently very feasible: *(none yet)*

---

## Table (all considered) + reset

| id | hardware | OS | tok/s | reset / backup ROM | programmable |
|---|---|---|---|---|---|
| **qodesh** | Athlon II X2; 8600 GT; 16 GB | Win11 | **3.0 meas** (was 2.5) | N/A (PC; git + GGUF on disk) | live GRZ |
| **shalom** | 7520U + RDNA2 | Win | 15–40 VK | N/A (PC; git) | live GRZ |
| **godslove** | i7-620M; Ironlake/NVS; 8 GB | PQFreeBSD 15 | 4–8 | FreeBSD install media / ZFS bootenv if set | CPU then GL |
| **pixel8** | Tensor G3; EdgeTPU | Android+KernelSU | 20–40 | **Yes** — factory images / Android Flash Tool / fastboot | Termux/sidecar |
| **note9** | Exynos9810 or SDM845 | Android | 8–15 | **Yes** — Odin/Heimdall stock + combo firmware widely mirrored | Termux+GLES |
| **QD65NF** | **55QD65NF** Costco Fire TV QLED; **MT9602** 4×A53 @ 1.5 GHz + Mali-G52 | **Fire TV** | ~2–6 | **Partial** — Fire TV USB recovery / Amazon factory reset; Hisense USB update packages exist by SKU; not as clean as Pixel fastboot. Confirm exact recovery menu on unit. | **ADB easy; full root not.** Sideload/dev options = Fire TV normal. No public one-click Magisk for this Fire OEM SKU. Cousin: Hisense **Google/VIDAA** U8N MT9618 has XDA Magisk (UART+fastboot unlock) — different OS/SoC. Fire sticks/Cubes have exploits; **OEM Fire panels generally do not.** |
| **SAX2V1R** | Sercomm IP6442B; FCC P27IP6442B; WiFi 6E. Cousin SAX1V1K=IPQ8072A+2GB+OpenWrt | Spectrum Linux | — | **Partial** — dual U-Boot slots on Askey cousins; dump eMMC before flash; stock Spectrum image hard to re-fetch (ISP). Dump first. | UART |
| **TU7000** | Crystal 4K; Tizen 5.5 | Tizen | — | **Yes** — Samsung USB firmware / SmartThings / factory reset; Tizen recovery documented | SDB |
| **E472VLE** | VIA 2012 | Yahoo widgets | — | **Weak** — USB `MERGE.bin`-style updates for some Vizio; 2012 VIA images scarce. Dump NAND/SPI before write. | UART |
| **EN2251** | Puma 7 ≈ dual Atom 2–2.5 GHz + DOCSIS ARM | Spectrum | — | **Weak** — ISP config push; full stock ROM not user-hosted. Dump eMMC. | UART |
| **K243Y** | Acer FHD scaler MCU | OSD | — | Factory scaler dump only | UART silk |
| **IMW1202** | HydraJolt 2.0 BT speaker; BT audio MCU | RTOS | — | Vendor OTA / SPI dump | CE practice |
| **CKS5TW** | **ATH-CKS5TW** TWS; FCC **JFZCKS5TWR/L**; BT 5.0 aptX/AAC; Qualcomm audio path (aptX/cVc) | proprietary | — | Charging-case DFU / vendor app; dump each bud + case | CE practice pair |
| **J3B** | FCC **V3J-J3B** (Aliph Jawbone BT VoIP dongle family) **or** label **V3J-J3B** — confirm silk. Closest public: Jawbone BT dongle (2011) CSR-class. If generic J3 headset (2BD43-J3): cheap TWS, JieLi/JL or similar | proprietary | — | Case DFU / chip-off | CE practice pair |

---

## Secondary controllers (powerful misses)

| host | secondary | worker? |
|---|---|---|
| **EN2251** | Puma **dual Atom @ 2–2.5 GHz** | **Yes if shelled** |
| **SAX/IPQ807x** | **2× NSS** packet cores | Offload Wi-Fi → A53 free for 0.5B |
| **pixel8** | EdgeTPU | TFLite sidecar |
| **pixel8** | Titan M2 / modem | No GGUF |
| **shalom** | RDNA2 | Primary 4B/7B |
| **qodesh** | 8600 GT shaders | Ancient |
| **QD65NF** | Mali-G52 + T-Con | GLES maybe |
| Storage | SSD R5/R8; **DVD/BD** drive MCU (MediaTek/ESS/Realtek — well-hacked firmware scene) | Stream/ripping DSP; not GGUF. DVD = practice + maybe stream decode assist |
| **CKS5TW / J3B / IMW1202** | BT audio SoC | CE exploit practice only |

**DVD/BD drives:** firmware (MTK/Realtek/ESS) is a known hacker target (region-free, RPC). Treat like SSD secondary: programmable MCU, **not** a tok/s worker. Add physical drive model when you name one.

---

## Qodesh test status (this session)

| gate | status |
|---|---|
| Unit tests (routing/gateway/nexus/proxy/logical) | **pass** (focused) |
| Full suite | last local-ci snapshot: suite ran (fuzz **9/9** present in `local-ci-last.txt`); loop process **dead** after start line only |
| Serve live | **8187 health ok**; `llama-server` PID 1252 + `node … serve` PID 10372; **gateway :3000 down** |
| Direct 8187 8-tok | **3.0 tok/s meas** (2026-08-29; `predicted_per_second` 3.04; 8 completion tok; cold prompt ~62 s) |
| `/code` via gateway | **not re-verified** — gateway not listening |
| Local CI loop | **started** then died — only `local-ci start pid=7768`; no PASS/FAIL ticks; restart needed |
| Visible console | `serve-window.cmd` + `%~dp0` |
| Uncommitted | gateway cold-skip, GGML_VULKAN=0 on CPU, slash/prettify, fuzz, fleet doc, local-ci, serve-window |

---

## Next

1. Bring gateway :3000 up; re-run `/code` and 8-line `/route`  
2. Restart `scripts/local-ci.ps1` so ticks append every 5 min  
3. pixel8 / **55QD65NF** ADB  
4. SAX2V1R UART dump before any flash  
5. CE practice: CKS5TW + J3B + IMW1202  

New device → row + all three charts + **reset** note. Update charts on every new `meas`.
