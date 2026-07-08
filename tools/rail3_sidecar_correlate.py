#!/usr/bin/env python3
"""Correlate a Garmin/RWGPS ride track (the GROUND TRUTH we don't store ourselves,
because Vechelon never persists coordinates) against the Rail 3 measurement sink.

Answers: do our send-gaps line up with your actual stops? did the un-force's
stop-detection (motion_change / last_position_write) fire when you really stopped?
what's the moving cadence vs the track? — and the sink↔GPS clock skew.

Usage:
    python3 tools/rail3_sidecar_correlate.py <ride.gpx> [--device SM-S911W] \
        [--pause-gap 20] [--stop-speed 0.7]

Auth: reads the Supabase Management API token from ~/.supabase/access-token.
GPX times are UTC; the sink's client_ts is the device clock (≈UTC if NTP-synced) —
the script reports the measured offset so you can trust (or correct) the alignment.
"""
import sys, os, json, argparse, urllib.request
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

REF = "xybgtbybdhxuwqjfcfkc"
SQL_URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"


def sink(query):
    tok = open(os.path.expanduser("~/.supabase/access-token")).read().strip()
    req = urllib.request.Request(
        SQL_URL, data=json.dumps({"query": query}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json",
                 "User-Agent": "rail3-sidecar/1.0"},  # api.supabase.com's edge 403s the default urllib UA
        method="POST")
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read())


def parse_gpx(path):
    """Return sorted list of (epoch_seconds, lat, lon) trackpoints."""
    root = ET.parse(path).getroot()
    ns = {"g": root.tag[root.tag.find("{") + 1: root.tag.find("}")]} if "{" in root.tag else {}
    pts = []
    xpath = ".//g:trkpt" if ns else ".//trkpt"
    for tp in root.findall(xpath, ns):
        t = tp.find("g:time", ns) if ns else tp.find("time")
        if t is None or not t.text:
            continue
        iso = t.text.strip().replace("Z", "+00:00")
        ts = datetime.fromisoformat(iso).astimezone(timezone.utc).timestamp()
        pts.append((ts, float(tp.get("lat")), float(tp.get("lon"))))
    pts.sort()
    return pts


def haversine_m(a, b):
    from math import radians, sin, cos, asin, sqrt
    (la1, lo1), (la2, lo2) = a, b
    dlat, dlon = radians(la2 - la1), radians(lo2 - lo1)
    h = sin(dlat / 2) ** 2 + cos(radians(la1)) * cos(radians(la2)) * sin(dlon / 2) ** 2
    return 2 * 6371000 * asin(sqrt(h))


def detect_stops(pts, pause_gap, stop_speed):
    """Stops = auto-pause gaps between trackpoints, OR runs of near-zero speed."""
    stops = []
    for (t0, la0, lo0), (t1, la1, lo1) in zip(pts, pts[1:]):
        dt = t1 - t0
        if dt <= 0:
            continue
        dist = haversine_m((la0, lo0), (la1, lo1))
        speed = dist / dt
        # Auto-pause: a long gap with little movement is a stop. Continuous-record:
        # a slow segment is a stop. Either way we bracket [t0, t1].
        if (dt >= pause_gap and speed < stop_speed) or speed < stop_speed and dt >= 8:
            stops.append((t0, t1, dt))
    # merge adjacent stop brackets
    merged = []
    for s in stops:
        if merged and s[0] - merged[-1][1] <= 5:
            merged[-1] = (merged[-1][0], s[1], s[1] - merged[-1][0])
        else:
            merged.append(list(s))
    return [(a, b, b - a) for a, b, _ in merged]


def hhmm(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%H:%M:%S")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gpx")
    ap.add_argument("--device", default="SM-S911W")
    ap.add_argument("--pause-gap", type=float, default=20.0, help="s between trackpoints to call a stop")
    ap.add_argument("--stop-speed", type=float, default=0.7, help="m/s below which a segment is stopped")
    a = ap.parse_args()

    pts = parse_gpx(a.gpx)
    if not pts:
        sys.exit("No timestamped trackpoints found in GPX.")
    t_start, t_end = pts[0][0], pts[-1][0]
    print(f"Track: {a.device} | {hhmm(t_start)}–{hhmm(t_end)} UTC | {len(pts)} points | "
          f"{(t_end - t_start)/60:.0f} min")

    # Pull the sink for this device across the track window (+/- 3 min slack).
    lo = datetime.fromtimestamp(t_start - 180, timezone.utc).isoformat()
    hi = datetime.fromtimestamp(t_end + 180, timezone.utc).isoformat()
    rows = sink(
        "SELECT (metadata->>'client_ts')::bigint ts, metadata->>'kind' kind, "
        "metadata->'payload' payload, left(metadata->>'ride_id',8) ride "
        "FROM analytics_events WHERE metadata->>'m'='rail3' "
        f"AND metadata->>'device'='{a.device}' "
        f"AND created_at BETWEEN '{lo}' AND '{hi}' "
        "ORDER BY ts")
    if isinstance(rows, dict) and rows.get("message"):
        sys.exit("Sink query error: " + rows["message"])
    ev = [(r["ts"] / 1000.0, r["kind"], r.get("payload"), r.get("ride")) for r in rows]
    gps = [e[0] for e in ev if e[1] == "gps_ping"]
    if not gps:
        sys.exit("No gps_ping in the sink for this device/window — check --device and that it's on the new bundle.")
    ride = next((e[3] for e in ev), "?")

    # Clock skew: median offset of each sink ping to the nearest GPX point time.
    gpx_ts = [p[0] for p in pts]
    import bisect
    offs = []
    for g in gps:
        i = bisect.bisect_left(gpx_ts, g)
        cand = [gpx_ts[j] for j in (i - 1, i) if 0 <= j < len(gpx_ts)]
        if cand:
            offs.append(g - min(cand, key=lambda x: abs(x - g)))
    offs.sort()
    skew = offs[len(offs) // 2] if offs else 0.0
    print(f"Ride {ride} | sink pings {len(gps)} | sink↔GPS clock skew ≈ {skew:+.1f}s "
          f"(sink client_ts vs GPX UTC)\n")

    stops = detect_stops(pts, a.pause_gap, a.stop_speed)
    print(f"=== {len(stops)} stops detected in the track — did the sink react? ===")
    hdr = f"{'stop (UTC)':>10}  {'dur':>5}  {'sink gap?':>18}  {'motion_change':>14}  {'last_pos_write':>14}"
    print(hdr)
    mc = [(e[0], e[2]) for e in ev if e[1] == "motion_change"]
    lpw = [e[0] for e in ev if e[1] == "last_position_write"]
    for s0, s1, dur in stops:
        # shift the sink window by measured skew to compare like-for-like
        w0, w1 = s0 + skew, s1 + skew
        inside = [g for g in gps if w0 - 5 <= g <= w1 + 5]
        # biggest gap in send that overlaps this stop
        span = [g for g in gps if g <= w1 + 30 and g >= w0 - 30]
        gap = 0.0
        for x, y in zip(span, span[1:]):
            if y - x > gap and not (y < w0 or x > w1):
                gap = y - x
        got_mc = any(w0 - 15 <= m[0] <= w1 + 15 for m in mc)
        got_lpw = any(w0 - 15 <= p <= w1 + 15 for p in lpw)
        print(f"{hhmm(s0):>10}  {dur:4.0f}s  {('gap '+format(gap,'.0f')+'s') if gap>8 else 'no gap':>18}  "
              f"{'✔ fired' if got_mc else '—':>14}  {'✔ ok' if got_lpw else '—':>14}")

    # Moving cadence (sink) vs track
    moving_gaps = [y - x for x, y in zip(gps, gps[1:]) if (y - x) < a.pause_gap]
    moving_gaps.sort()
    if moving_gaps:
        p50 = moving_gaps[len(moving_gaps) // 2]
        p95 = moving_gaps[int(len(moving_gaps) * 0.95)]
        print(f"\nMoving cadence (sink, gaps < {a.pause_gap:.0f}s): p50 {p50:.0f}s  p95 {p95:.0f}s  "
              f"n={len(moving_gaps)}")
    print(f"Interpretation: a stop with 'gap' + no motion_change = a SHORT stop (< stopTimeout) that "
          f"went silent but wasn't marked stopped. 'motion_change ✔' = long enough to register.")


if __name__ == "__main__":
    main()
