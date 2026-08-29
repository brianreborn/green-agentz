# Fleet targets (workers)

Job unless noted: **0.5B Q4**, short completion, thinking off.
`tok/W = tok/s / W_load`. `J/tok = W_load / tok/s`.
`meas` = timed here. `est` = estimate from known class. `hyp` = silicon guess, **no shell yet**.
Panel watts = display on (TVs/monitors dominate J/tok).

**Chart rule:** if we know enough SoC/RAM to guess 0.5B Q4 → put a **`hyp`** (or `est`) bar.
**`0` / blank only** when we **cannot really guess** (no usable CPU story, or MCU with no GGUF path).
Not “0 until shell” for every unshelled box — shell upgrades `hyp`→`meas`.

**Policy:** own-device exploit OK. Worker **alongside** system software.
Operator names the box; this file holds SoCs / reset notes.

**UART:** USB-UART + cisco/ethernet console on hand.

Charts list **every considered device**. Rejects = one line only (MCU-class stay at 0).

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
EN2251       4–10 hyp   ##########..............................   Puma7 dual Atom @2–2.5G if shelled
godslove     4–8  est   ########................................
qodesh       3.0  meas  ###.....................................   2026-08-29 8-tok; was 2.5
SAX2V1R      2–6  hyp   ######..................................   if IPQ-class A53s free; NSS≠GGUF
QD65NF       2–6  est   ######..................................   55QD65NF Fire TV MT9602
TU7000       1–4  hyp   ####....................................   Crystal UHD ARM, Tizen rooted
E472VLE      0.2–1 hyp  #.......................................   2012 VIA; marginal for 0.5B
K243Y        0    hyp   ........................................   scaler MCU — no GGUF
IMW1202      0    hyp   ........................................   BT audio MCU
CKS5TW       0    hyp   ........................................   TWS / aptX path MCU
J3B          0    hyp   ........................................   BT headset/dongle MCU
```

## tok/W

```
pixel8      5–8         ################################
note9       1.5–3       ############............................
shalom      1.2–2.2     #########...............................
EN2251      0.4–1.0 hyp ####....................................   ~8–12 W Atom-side guess
SAX2V1R     0.2–0.6 hyp ##......................................   ~8–15 W AP load
godslove    0.10–0.20   #.......................................
qodesh      0.05–0.06   ........................................   ~55–65 W load assumed
TU7000      0.01–0.04   ........................................   panel ~80–120 W on
QD65NF      0.02–0.05   ........................................   panel on
E472VLE     0.01–0.05   ........................................   old panel+SoC
K243Y / IMW1202 / CKS5TW / J3B   0  (cannot run 0.5B)
```

## J/tok

```
pixel8      0.15–0.3    #.......................................
note9       0.3–0.7     #.......................................
shalom      0.5–0.8     #.......................................
EN2251      1–3   hyp   ###.....................................
SAX2V1R     2–6   hyp   ######..................................
godslove    5–12        ############............................
qodesh      18–22 meas  ######################..................
TU7000      25–100 hyp  ########################################   panel dominates
QD65NF      25–80 est   ########################################
E472VLE     40–200 hyp  ########################################
K243Y / IMW1202 / CKS5TW / J3B   n/a (tok/s=0)
```

**hyp basis (bottom rows):** EN2251 ≈ dual Atom class vs godslove/qodesh; SAX2 ≈ 2–4×A53 AP if main CPU freed (cousin SAX1 IPQ8072A is stronger — SAX2 Sercomm may be weaker, hence wide band); TU7000/QD65NF ≈ TV ARM + panel watts; E472 ≈ decade-old smart SoC; MCU rows = **0** on purpose (no userspace GGUF).

Rejected for not apparently very feasible as **workers**: K243Y, IMW1202, CKS5TW, J3B (still charted at 0; keep as CE practice).

---

## Table (all considered) + reset

| id | hardware | OS | tok/s | reset / backup ROM | programmable |
|---|---|---|---|---|---|
| **qodesh** | Athlon II X2; 8600 GT; 16 GB | Win11 | **3.0 meas** (was 2.5) | N/A (PC; git + GGUF on disk) | live GRZ |
| **shalom** | 7520U + RDNA2 | Win | 15–40 VK | N/A (PC; git) | live GRZ |
| **godslove** | i7-620M; Ironlake/NVS; 8 GB | PQFreeBSD 15 | 4–8 | FreeBSD install media / ZFS bootenv if set | CPU then GL |
| **pixel8** | Tensor G3; EdgeTPU | Android+KernelSU | 20–40 | **Yes** — factory images / Android Flash Tool / fastboot | Termux/sidecar |
| **note9** | Exynos9810 or SDM845 | Android | 8–15 | **Yes** — Odin/Heimdall stock + combo firmware widely mirrored | Termux+GLES |
| **QD65NF** | **55QD65NF** Costco Fire TV QLED; **MT9602** 4×A53 @ 1.5 GHz + Mali-G52 | **Fire TV** | **2–6 est** | **Partial** — Fire TV USB recovery / Amazon factory reset; Hisense USB update packages exist by SKU; not as clean as Pixel fastboot. Confirm exact recovery menu on unit. | **ADB easy; full root not.** Sideload/dev options = Fire TV normal. No public one-click Magisk for this Fire OEM SKU. Cousin: Hisense **Google/VIDAA** U8N MT9618 has XDA Magisk (UART+fastboot unlock) — different OS/SoC. Fire sticks/Cubes have exploits; **OEM Fire panels generally do not.** |
| **SAX2V1R** | Sercomm IP6442B; FCC P27IP6442B; WiFi 6E. Cousin SAX1V1K=IPQ8072A+2GB+OpenWrt | Spectrum Linux | **2–6 hyp** | **Partial** — dual U-Boot slots on Askey cousins; dump eMMC before flash; stock Spectrum image hard to re-fetch (ISP). Dump first. | UART |
| **TU7000** | Crystal 4K; Tizen 5.5 | Tizen | **1–4 hyp** | **Yes** — Samsung USB firmware / SmartThings / factory reset; Tizen recovery documented | SDB |
| **E472VLE** | VIA 2012 | Yahoo widgets | **0.2–1 hyp** | **Weak** — USB `MERGE.bin`-style updates for some Vizio; 2012 VIA images scarce. Dump NAND/SPI before write. | UART |
| **EN2251** | Puma 7 ≈ dual Atom 2–2.5 GHz + DOCSIS ARM | Spectrum | **4–10 hyp** | **Weak** — ISP config push; full stock ROM not user-hosted. Dump eMMC. | UART |
| **K243Y** | Acer FHD scaler MCU | OSD | **0 hyp** | Factory scaler dump only | UART silk |
| **IMW1202** | HydraJolt 2.0 BT speaker; BT audio MCU | RTOS | **0 hyp** | Vendor OTA / SPI dump | CE practice |
| **CKS5TW** | **ATH-CKS5TW** TWS; FCC **JFZCKS5TWR/L**; BT 5.0 aptX/AAC; Qualcomm audio path (aptX/cVc) | proprietary | **0 hyp** | Charging-case DFU / vendor app; dump each bud + case | CE practice pair |
| **J3B** | FCC **V3J-J3B** (Aliph Jawbone BT VoIP dongle family) **or** label **V3J-J3B** — confirm silk. Closest public: Jawbone BT dongle (2011) CSR-class. If generic J3 headset (2BD43-J3): cheap TWS, JieLi/JL or similar | proprietary | **0 hyp** | Case DFU / chip-off | CE practice pair |

---

## Public root / unlock landscape (cursory, 2026-08-29)

| id / cousin | public status | venue / notes |
|---|---|---|
| **SAX1V1K** (cousin of SAX2) | **Yes — OpenWrt official** | UART; stock root login = serial# CAPS; MeisterLone / Lanchon U-Boot scripts; ToH IPQ8072A. **Not DEF CON** — OpenWrt forum + git. |
| **SAX2V1R** (this unit, Sercomm IP6442B) | **Partial cousin work** | OpenWrt SAX1 thread: SAX1V1R has UART, eMMC CLK glitch → U-Boot, fallback single-user; **no** published OpenWrt image for SAX2. Different SoC than V1K. |
| **EN2251** (Puma 7 Atom) | **Family rooted, not this SKU** | **DEF CON 25 CableTap** (Bastille): RDK / Puma Atom+ARM root chains (Arris/Cisco/Technicolor/Motorola). **DEF CON 30 IoT Village** Rapid7: Arris SB6190 eMMC → SSH root. Hitron CGNM-2250 (Puma 6 cousin): button → `nonpcpu` serial/telnet root. EN2251-specific writeup: **not found**. |
| **TU7000** (Tizen 5.5) | **Yes (dev mode)** | Bishop Fox SDB package-name injection → OS cmds; **demoed on UN43TU700D** (same TU7000 line). Newer public Samsung roots (QN90B/F Magisk-class / Mali) are different gens. SamyGO history. |
| **55QD65NF** Fire MT9602 | **ADB only for this SKU** | No public Magisk/unlock for Fire OEM QD6. Cousins: Hisense **U8N MT9618** Google TV XDA Magisk (UART+fastboot); old Exploitee.rs Hisense Android eMMC; VIDAA MT9602 service UART in Hisense manuals — not Fire. Fire **Stick/Cube** (not panel) heavily rooted on XDA. |
| **E472VLE** (2012 VIA Yahoo) | **Era rooted; SKU sparse** | Old Vizio/MTK UART service-jack + cmd inject (XDA); later SmartCast = Exploitee.rs / L9 RCE (newer). Google TV Co-Star / Hisense Pulse: early ADB-root (DEF CON-adjacent Google TV talks). Exact E472VLE: **no** modern guide. |
| **K243Y** scaler | **No** | Monitor OSD MCU — not a public root scene. |
| **IMW1202 / CKS5TW / J3B** | **No named roots** | Generic BT audio MCU / Qualcomm aptX / Jawbone-CSR class practice only. No DEF CON SKU writeups found. |
| **pixel8 / note9** | **Yes** | Mainstream (KernelSU / Magisk). |

**DEF CON takeaway:** cable/Puma path is the conference-hardened one (CableTap, IoT Village). Spectrum Wi-Fi = OpenWrt community. Tizen TU7000 = published SDB break. Fire OEM panel ≠ Fire Stick scene.

---

## Theorized best entry (public interfaces first)

Own gear only. Theory, not a recipe — no payloads. Prefer interfaces a normal owner already has: LAN, Wi‑Fi, BT, USB, vendor app, ADB/SDB, IR. UART/eMMC is fallback after public path fails or for dump-before-flash.

| id | best public surface | probable play | then |
|---|---|---|---|
| **SAX2V1R** | LAN web / Spectrum app / Wi‑Fi management SSID; WPS if on | Fingerprint Sercomm CGI / warehouse-style hidden pages (SAX1 cousins had hard-coded warehouse creds). Abuse ISP app pairing or local API. If stock already drops a root UART login after boot (cousin did), public path may be **none** — skip to UART. Soft: DHCP/hostname tricks rarely help on locked Spectrum builds. | Confirm SoC via FCC OpDesc; UART; if login shell exists → dump → OpenWrt port. Else eMMC CLK glitch → U-Boot (cousin SAX1V1R). |
| **EN2251** | `192.168.100.1` modem UI; LAN; maybe Wi‑Fi if gateway SKU; SNMP/DOCSIS CM | Classic Puma/RDK: scrape UI for tech pages, password-of-the-day / hard-coded SSH (`arris`-class cousins), enable telnet/SSH from “support” CGI. CableTap-class: once on LAN as admin, hunt sysevent/DBus/UPnP for root cmd. Prefer **Atom (APP CPU)** — that’s the worker. | If UI locked by Spectrum: front-button / factory boot tricks (Hitron Puma cousin `nonpcpu`); then UART or eMMC reflash like DC30 Arris lab. Dump before write. |
| **TU7000** | Samsung **developer mode** + **SDB** from a PC on LAN; SmartThings / DIY apps | Enable dev mode on TV (Apps → Settings → Developer → host IP). From that host: SDB install with malicious package **name** (Bishop Fox injection) → OS command as sdk → escalate per public writeups. Avoid random web RCE; SDB is the documented public interface. | Optional: older SamyGO USB/service if firmware old enough; else stay on volatile root / sideload. |
| **QD65NF** | Fire TV **ADB** (dev options), sideload APKs, USB | Already the public door. For worker: Termux/userland llama first — no root required for weak 0.5B. For root: hunt FireOS build vs Stick/Cube temp-root (likely **won’t** match OEM panel). Next public: malicious/debuggable system app abuse, Amazon package update sideload, or local privilege bugs — low odds vs Stick scene. | Only then UART / eMMC (Hisense MT9602 service notes are mostly VIDAA, not Fire). |
| **E472VLE** | Ethernet/Wi‑Fi if present; Yahoo widget “apps”; USB; IR service codes | 2012 stack: scan LAN for open HTTP/debug; widget/URL handlers often ran shell-adjacent. USB firmware / `MERGE.bin`-style update with unsigned or weakly signed image (era was soft). Hidden-network / service-menu command inject on later Vizios is a **cousin** pattern — try service remote codes first. | UART on mainboard if network dead; assume scarce stock ROM → dump SPI/NAND first. |
| **K243Y** | **HDMI DDC/CI**; OSD buttons; any USB-C/service USB; factory IR if supported | Scalers sometimes expose DDC/CI vendor commands or I²C tunnels for firmware update. Public “interface” = PC with DDC tool / Monitor Asset Manager–class utilities, or vendor .bin over USB if Acer ships one. Exploit = malformed update or DDC write to flash if no sig check. | Silk UART next to scaler; bus pirate dump. Worker value near zero — practice only. |
| **IMW1202** | Classic **Bluetooth** (A2DP/AVRCP/GATT); charge micro‑USB | Pair as speaker; enumerate GATT/RFCOMM. Look for vendor OTA characteristic or serial-over-BT used by “Altec” app. Unsigned OTA or path traversal in update = usual CE win. USB mass-storage / CDC if the charge port enumerates anything beyond charge. | SPI flash clip if BT OTA signed. Practice, not tok/s. |
| **CKS5TW** | BT LE + classic; **charging case** USB; phone companion app | Case is often the DFU master: plug case USB → look for DFU/HID/Audio class. App OTA to case then buds. Qualcomm audio path → QACT/DFU-style interfaces on cousins. Best public bet: **case USB DFU** or app-captured OTA blob replay with patched image. | Dump buds + case separately; don’t brick both. |
| **J3B** | BT and/or USB if it’s the Jawbone **dongle** form | If USB dongle: enumerate as sound card/HID — CSR/BlueCore cousins historically had DFU over USB. If headset: same as CKS5TW (case DFU + BT OTA). Confirm silk before assuming Jawbone vs generic JieLi TWS (JieLi has public flash tools). | Chip-off last. |

**Skip (already accessible):** qodesh, shalom, godslove, pixel8, note9.

**Order to try (public-first):** TU7000 SDB → QD65NF ADB userland → EN2251 `192.168.100.1` → SAX2 LAN/app fingerprint → E472 service/USB era tricks → BT CE toys (IMW/CKS/J3B) → K243Y DDC.

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
| Serve live | resident **8187** + gateway **:8080** (often `degraded`) |
| Direct 8187 8-tok | **3.0 tok/s meas** (2026-08-29) |
| `/code` via gateway | still needs live re-verify |
| Local CI loop | **`scripts/local-ci-window.cmd`** detached, every 5 min → `data/local-ci.log` |
| Visible console | `serve-window.cmd` / `local-ci-window.cmd` |
| Git | local commits; develop further on **shalom** (faster) |

---

## Next

1. Keep local-ci window alive on qodesh; read `data/local-ci.log`  
2. Continue agent work on **shalom**  
3. pixel8 / **55QD65NF** ADB  
4. SAX2V1R UART / CLK-glitch; dump before flash  
5. TU7000 SDB if developer mode OK  

New device → row + all three charts + **reset** note. Update charts on every new `meas`.
