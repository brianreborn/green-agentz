#!/usr/bin/env node
/**
 * adb-peer - part of the LAUNCH HARNESS, not the green-roomz baseline.
 *
 * adb is used as both authenticator and authorizer:
 *   - authentication: the Android device must be adb-attached and in the
 *     `device` state (its adb RSA key was accepted).
 *   - authorization: we read the device's interface addresses over adb and this
 *     host's own interfaces, and trust only the device IP on a subnet the two
 *     hosts actually share.
 *
 * Usage:
 *   node deploy/adb-peer.mjs [--serial <s>] [--json]   # print the peer IP(s)
 *   node deploy/adb-peer.mjs --describe                 # full diagnostic
 *
 * Then hand the IP to the gateway:
 *   node bin/green-roomz.mjs serve --host <this-host-lan-ip> --allow-peer $(node deploy/adb-peer.mjs)
 */
import { execFile } from 'node:child_process';
import os from 'node:os';

const ADB = () => process.env.GREEN_ROOMZ_ADB || 'adb';
const RUN_TIMEOUT_MS = 4000;

function run(bin, args, timeout = RUN_TIMEOUT_MS) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout ?? '')));
  });
}

// --- IPv4 math ------------------------------------------------------------

export function ipToLong(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const o of p) {
    const v = Number(o);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n * 256) + v;
  }
  return n >>> 0;
}

export function maskToBits(netmask) {
  const long = ipToLong(netmask);
  if (long == null) return null;
  let bits = 0;
  let seenZero = false;
  for (let i = 31; i >= 0; i -= 1) {
    if (long & (1 << i)) { if (seenZero) return null; bits += 1; } else { seenZero = true; }
  }
  return bits;
}

export function sameSubnet(ipA, ipB, bits) {
  const a = ipToLong(ipA);
  const b = ipToLong(ipB);
  if (a == null || b == null || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

/** This host's non-internal IPv4 interfaces as [{ address, bits }]. */
export function localSubnets(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const addrs of Object.values(interfaces ?? {})) {
    for (const a of addrs ?? []) {
      if (a.internal) continue;
      if ((a.family !== 'IPv4' && a.family !== 4)) continue;
      const bits = typeof a.cidr === 'string' ? Number(a.cidr.split('/')[1]) : maskToBits(a.netmask);
      if (Number.isInteger(bits)) out.push({ address: a.address, bits });
    }
  }
  return out;
}

// --- adb ------------------------------------------------------------------

/** `adb devices -l` -> [{ serial, model, state }]. state is 'device' when authenticated. */
export async function listAdbDevices({ adbPath = ADB() } = {}) {
  const out = await run(adbPath, ['devices', '-l']);
  const devices = [];
  for (const line of out.split(/\r?\n/).slice(1)) {
    const m = /^(\S+)\s+(device|unauthorized|offline|no permissions)\b(.*)$/.exec(line.trim());
    if (!m) continue;
    devices.push({ serial: m[1], state: m[2], model: /\bmodel:(\S+)/.exec(m[3] ?? '')?.[1] ?? null });
  }
  return devices;
}

/** Parse `ip -o -4 addr show` into [{ iface, ip, bits }]. */
export function parseIpAddr(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\d+:\s+(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)\/(\d+)/.exec(line.trim());
    if (m && m[2] !== '127.0.0.1') rows.push({ iface: m[1], ip: m[2], bits: Number(m[3]) });
  }
  return rows;
}

export async function adbDeviceAddrs(serial, { adbPath = ADB() } = {}) {
  return parseIpAddr(await run(adbPath, ['-s', serial, 'shell', 'ip', '-o', '-4', 'addr', 'show']));
}

/**
 * adb is BOTH the authenticator and the authorizer:
 *  - authentication: the device must be adb-attached and in the `device` state
 *    (the adb RSA key was accepted). `unauthorized` / `offline` are rejected.
 *  - authorization: we read the device's interface addresses over adb and this
 *    host's own interfaces, and trust only the device IP that sits on a subnet
 *    the two hosts actually share. No shared subnet => no peer (fail-closed).
 *
 * `serial` pins to one device (recommended). Returns [] when adb is missing,
 * nothing is attached/authenticated, or no shared subnet is found.
 */
export async function resolveAdbPeerIps({ adbPath = ADB(), serial = null, interfaces } = {}) {
  const local = localSubnets(interfaces);
  if (!local.length) return [];
  let devices = (await listAdbDevices({ adbPath })).filter((d) => d.state === 'device');
  if (serial) devices = devices.filter((d) => d.serial === serial);
  const ips = new Set();
  for (const d of devices) {
    for (const addr of await adbDeviceAddrs(d.serial, { adbPath })) {
      if (local.some((l) => sameSubnet(l.address, addr.ip, Math.min(l.bits, addr.bits)))) {
        ips.add(addr.ip);
      }
    }
  }
  return [...ips];
}

/** Diagnostics for `doctor` / logs: what adb sees and why a peer was/wasn't chosen. */
export async function describeAdbPeers({ adbPath = ADB(), serial = null, interfaces } = {}) {
  const local = localSubnets(interfaces);
  const devices = await listAdbDevices({ adbPath });
  const detail = [];
  for (const d of devices) {
    if (serial && d.serial !== serial) continue;
    const addrs = d.state === 'device' ? await adbDeviceAddrs(d.serial, { adbPath }) : [];
    detail.push({
      serial: d.serial,
      model: d.model,
      state: d.state,
      addrs,
      shared: addrs.filter((a) => local.some((l) => sameSubnet(l.address, a.ip, Math.min(l.bits, a.bits)))).map((a) => a.ip),
    });
  }
  return { localSubnets: local, devices: detail };
}

// --- CLI --------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('adb-peer.mjs')) {
  const argv = process.argv.slice(2);
  const serial = argv.includes('--serial') ? argv[argv.indexOf('--serial') + 1] : null;
  if (argv.includes('--describe')) {
    console.log(JSON.stringify(await describeAdbPeers({ serial }), null, 2));
    process.exit(0);
  }
  const ips = await resolveAdbPeerIps({ serial });
  if (argv.includes('--json')) console.log(JSON.stringify(ips));
  else console.log(ips.join('\n'));
  process.exit(ips.length ? 0 : 1);
}
