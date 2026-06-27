#!/usr/bin/env python3
"""Rail 3 — TS-log GPS accuracy harness (W232).

Parse a Transistorsoft on-device diagnostic log (pulled via the in-app "Send
diagnostic log" button -> logger.emailLog) and report GPS performance. Optionally
align the fixes against a synchronous RWGPS GPX to estimate real positional error.

This is the privacy-preserving spatial-accuracy harness: Vechelon never persists
coordinates server-side, but the TS engine's *on-device* verbose log records each
fix with lat/lng + a per-fix accuracy estimate (hAcc). A tester emails that log
after a ride; we analyse it here. One-off PoC measurement, not a data pipeline.

Usage:
    python3 rail3_ts_log_accuracy.py <ts_log.txt>
    python3 rail3_ts_log_accuracy.py <ts_log.txt> --gpx ride.gpx --tz-offset -4

Notes / caveats:
  - hAcc is the device's SELF-REPORTED accuracy, not measured error. Real error
    needs the --gpx diff.
  - RWGPS is itself a phone track (agreement, not survey-grade truth).
  - TS log timestamps are "MM-DD HH:MM:SS.mmm" (no year, device-local). For GPX
    alignment we borrow the year from the GPX and shift TS local->UTC via
    --tz-offset (hours). Confirm the offset matches the ride's timezone.
  - The fix-line regex is validated against the documented TS sample line; if a
    real emailLog log differs, adjust FIX_RE (it's the single parse point).
"""
import argparse
import math
import re
import statistics
import sys
from datetime import datetime, timedelta, timezone
import xml.etree.ElementTree as ET

# TS fix line, e.g.:
#   09-19 11:12:21.314 ╟─ 📍  Location[fused 45.519239,-73.617058 hAcc=15]...
# Provider word (fused/gps/network) is optional; we capture lat,lng,hAcc.
FIX_RE = re.compile(
    r"Location\[(?:[a-zA-Z]+\s+)?(-?\d+\.\d+),(-?\d+\.\d+)\s+hAcc=([\d.]+)"
)
# Leading log timestamp "MM-DD HH:MM:SS.mmm" (best-effort; may be absent on a line).
TS_RE = re.compile(r"(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d+)")


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def parse_ts_log(path, year, tz_offset_hours):
    """Yield dicts {dt(UTC or None), lat, lng, hacc} from a TS log."""
    fixes = []
    tz = timezone(timedelta(hours=tz_offset_hours))
    with open(path, "r", errors="replace") as f:
        for line in f:
            m = FIX_RE.search(line)
            if not m:
                continue
            lat, lng, hacc = float(m.group(1)), float(m.group(2)), float(m.group(3))
            dt = None
            tm = TS_RE.search(line)
            if tm and year:
                mo, da, hh, mm, ss = (int(x) for x in tm.groups()[:5])
                micro = int((tm.group(6) + "000000")[:6])
                try:
                    local = datetime(year, mo, da, hh, mm, ss, micro, tzinfo=tz)
                    dt = local.astimezone(timezone.utc)
                except ValueError:
                    dt = None
            fixes.append({"dt": dt, "lat": lat, "lng": lng, "hacc": hacc})
    return fixes


def parse_gpx(path):
    """Return sorted [(dt_utc, lat, lon)] from a GPX trk."""
    pts = []
    tree = ET.parse(path)
    # GPX is namespaced; match trkpt by local-name to stay namespace-agnostic.
    for el in tree.iter():
        if el.tag.split("}")[-1] != "trkpt":
            continue
        lat = float(el.attrib["lat"])
        lon = float(el.attrib["lon"])
        dt = None
        for child in el:
            if child.tag.split("}")[-1] == "time" and child.text:
                t = child.text.strip().replace("Z", "+00:00")
                try:
                    dt = datetime.fromisoformat(t).astimezone(timezone.utc)
                except ValueError:
                    dt = None
        if dt:
            pts.append((dt, lat, lon))
    pts.sort(key=lambda p: p[0])
    return pts


def dist_stats(label, values, unit):
    if not values:
        print(f"  {label}: (none)")
        return
    vals = sorted(values)
    def pct(p):
        return vals[min(len(vals) - 1, int(p / 100 * len(vals)))]
    print(
        f"  {label}: n={len(vals)}  min={vals[0]:.1f}  median={statistics.median(vals):.1f}"
        f"  p90={pct(90):.1f}  max={vals[-1]:.1f} {unit}"
    )


def nearest_gpx(dt, gpx):
    """Nearest GPX point (by time) to dt; returns (point, abs_seconds)."""
    best, best_ds = None, None
    for p in gpx:
        ds = abs((p[0] - dt).total_seconds())
        if best_ds is None or ds < best_ds:
            best, best_ds = p, ds
    return best, best_ds


def main():
    ap = argparse.ArgumentParser(description="Rail 3 TS-log GPS accuracy harness")
    ap.add_argument("ts_log", help="Transistorsoft diagnostic log (text)")
    ap.add_argument("--gpx", help="Synchronous RWGPS GPX for ground-truth comparison")
    ap.add_argument("--year", type=int, help="Year for TS timestamps (default: from GPX, else none)")
    ap.add_argument("--tz-offset", type=float, default=0.0,
                    help="TS device-local UTC offset in hours (e.g. -4 for EDT). Default 0.")
    ap.add_argument("--match-window", type=float, default=10.0,
                    help="Max seconds between a TS fix and a GPX point to count as a match.")
    args = ap.parse_args()

    gpx = parse_gpx(args.gpx) if args.gpx else None
    year = args.year or (gpx[0][0].year if gpx else None)
    if args.gpx and not year:
        print("WARN: GPX had no timestamps; cannot align by time.", file=sys.stderr)

    fixes = parse_ts_log(args.ts_log, year, args.tz_offset)
    print(f"TS log: {args.ts_log}")
    if not fixes:
        print("  No fix lines parsed. Expected lines like:")
        print("    Location[fused 45.519239,-73.617058 hAcc=15]")
        print("  If the real log differs, adjust FIX_RE in this script.")
        return
    print(f"  parsed {len(fixes)} fixes")
    dated = [f for f in fixes if f["dt"]]
    if dated:
        span = (dated[-1]["dt"] - dated[0]["dt"]).total_seconds()
        print(f"  time span: {span/60:.1f} min  ({dated[0]['dt']} -> {dated[-1]['dt']} UTC)")
    print("Device self-reported accuracy (hAcc):")
    dist_stats("hAcc", [f["hacc"] for f in fixes], "m")

    if not gpx:
        print("\n(no --gpx: skipping ground-truth positional error)")
        return
    print(f"\nGPX: {args.gpx}  ({len(gpx)} trackpoints)")
    if not dated:
        print("  TS fixes have no usable timestamps (need --year + correct --tz-offset).")
        return
    errors, matched, unmatched = [], 0, 0
    for f in dated:
        p, ds = nearest_gpx(f["dt"], gpx)
        if p and ds is not None and ds <= args.match_window:
            errors.append(haversine_m(f["lat"], f["lng"], p[1], p[2]))
            matched += 1
        else:
            unmatched += 1
    print(f"  matched {matched}/{len(dated)} fixes within {args.match_window:.0f}s"
          f" ({unmatched} unmatched — check --tz-offset/--year if high)")
    print("Positional error vs RWGPS ground truth:")
    dist_stats("error", errors, "m")


if __name__ == "__main__":
    main()
