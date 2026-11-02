#!/usr/bin/env python3
"""Weekly search + traffic report for thepetphysiovet.com.

Pulls, for the last 7 complete days versus the 7 before:
  * Google Search Console: clicks, impressions, CTR, position; branded vs
    non-branded; local-intent queries; top pages and queries; new queries;
    index coverage of every sitemap URL.
  * Vercel Web Analytics: page views, visitors, top pages, referrers.

Writes Markdown to ~/PetPhysio-reports/YYYY-MM-DD.md and shows a macOS
notification. Run by hand or weekly via launchd (scripts/launchd/).

Credentials are the ones already on this Mac -- nothing is stored here:
  * Search Console: gcloud application-default credentials with the
    webmasters scope, billed to the quota project below.
  * Vercel: the logged-in `vercel` CLI.

Bookings are not included: the production database credential is a Vercel
Secret and cannot be read from this machine (CLAUDE.md rule 1).

Stdlib only. Usage: python3 scripts/seo_weekly_report.py [--days 7] [--no-notify]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

SITE = "https://www.thepetphysiovet.com"
GSC_PROPERTY = "sc-domain:thepetphysiovet.com"
QUOTA_PROJECT = "first-torus-512604-v6"
VERCEL_PROJECT = "petphysio"
VERCEL_TEAM = "team_6vUbuAeWiJGNp37SGCLdS91b"
# GSC data lags ~2-3 days; end the window where it is complete.
GSC_LAG_DAYS = 3
BRAND = re.compile(r"physio\s*vet|pet\s*physio|physiovet|dhanvi", re.I)
LOCAL = re.compile(r"ahmedabad|near me|shilaj|thaltej|bodakdev|science city|sola|gota|gujarat", re.I)
OUT_DIR = pathlib.Path.home() / "PetPhysio-reports"


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout.strip()


# ── Search Console ──────────────────────────────────────────────────────────

class GSC:
    def __init__(self) -> None:
        self.token = run(["gcloud", "auth", "application-default", "print-access-token"])

    def _call(self, url: str, body: dict | None = None) -> dict:
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode() if body is not None else None,
            headers={
                "Authorization": f"Bearer {self.token}",
                "x-goog-user-project": QUOTA_PROJECT,
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Search Console {e.code}: {e.read()[:300]!r}") from None

    def query(self, start: dt.date, end: dt.date, dims: list[str], limit: int = 250) -> list[dict]:
        prop = urllib.parse.quote(GSC_PROPERTY, safe="")
        data = self._call(
            f"https://searchconsole.googleapis.com/webmasters/v3/sites/{prop}/searchAnalytics/query",
            {"startDate": start.isoformat(), "endDate": end.isoformat(), "dimensions": dims, "rowLimit": limit},
        )
        return data.get("rows", [])

    def inspect(self, url: str) -> dict:
        data = self._call(
            "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
            {"inspectionUrl": url, "siteUrl": GSC_PROPERTY},
        )
        return data["inspectionResult"]["indexStatusResult"]


def totals(rows: list[dict]) -> dict:
    clicks = sum(r["clicks"] for r in rows)
    impressions = sum(r["impressions"] for r in rows)
    position = sum(r["position"] * r["impressions"] for r in rows) / impressions if impressions else 0.0
    return {"clicks": clicks, "impressions": impressions,
            "ctr": clicks / impressions * 100 if impressions else 0.0, "position": position}


def delta(now: float, before: float, fmt: str = "{:+.0f}", lower_is_better: bool = False) -> str:
    diff = now - before
    if abs(diff) < 1e-9:
        return "±0"
    arrow = ("▼" if diff > 0 else "▲") if lower_is_better else ("▲" if diff > 0 else "▼")
    return f"{arrow} {fmt.format(diff)}"


# ── Vercel Web Analytics ────────────────────────────────────────────────────

def vercel_aggregate(start: dt.date, end: dt.date, by: str, limit: int = 10) -> list[dict]:
    params = urllib.parse.urlencode({
        "projectId": VERCEL_PROJECT, "teamId": VERCEL_TEAM, "by": by, "limit": limit,
        "since": f"{start.isoformat()}T00:00:00.000Z",
        "until": f"{end.isoformat()}T23:59:59.999Z",
    })
    out = run(["vercel", "api", f"/v1/query/web-analytics/visits/aggregate?{params}", "--method", "GET"])
    return json.loads(out).get("data", [])


def vercel_count(start: dt.date, end: dt.date) -> dict:
    params = urllib.parse.urlencode({
        "projectId": VERCEL_PROJECT, "teamId": VERCEL_TEAM,
        "since": f"{start.isoformat()}T00:00:00.000Z",
        "until": f"{end.isoformat()}T23:59:59.999Z",
    })
    out = run(["vercel", "api", f"/v1/query/web-analytics/visits/count?{params}", "--method", "GET"])
    data = json.loads(out)
    return data.get("data", data)


# ── Report ──────────────────────────────────────────────────────────────────

def path_of(url: str) -> str:
    return url.replace(SITE, "") or "/"


def sitemap_urls() -> list[str]:
    # curl, not urllib: Vercel's firewall stalls Python's HTTP client on the
    # public site (the read just times out), while curl is served normally.
    xml = run(["curl", "-fsS", "--max-time", "30", "--retry", "2", "-A", "Mozilla/5.0 (weekly report)",
               f"{SITE}/sitemap.xml"])
    return re.findall(r"<loc>([^<]+)</loc>", xml)


def build(days: int) -> tuple[str, str]:
    today = dt.date.today()
    end = today - dt.timedelta(days=GSC_LAG_DAYS)
    start = end - dt.timedelta(days=days - 1)
    prev_end = start - dt.timedelta(days=1)
    prev_start = prev_end - dt.timedelta(days=days - 1)
    lines: list[str] = [f"# Search & traffic report: {today.isoformat()}", ""]
    headline = ""

    # Search Console
    try:
        gsc = GSC()
        cur_q, prev_q = gsc.query(start, end, ["query"]), gsc.query(prev_start, prev_end, ["query"])
        cur_t = totals(gsc.query(start, end, ["date"]))
        prev_t = totals(gsc.query(prev_start, prev_end, ["date"]))
        lines += [
            f"## Google Search: {start:%d %b} to {end:%d %b} vs the {days} days before",
            "",
            "| | This period | Previous | Change |",
            "|---|---|---|---|",
            f"| Clicks | {cur_t['clicks']} | {prev_t['clicks']} | {delta(cur_t['clicks'], prev_t['clicks'])} |",
            f"| Impressions | {cur_t['impressions']} | {prev_t['impressions']} | {delta(cur_t['impressions'], prev_t['impressions'])} |",
            f"| CTR | {cur_t['ctr']:.1f}% | {prev_t['ctr']:.1f}% | {delta(cur_t['ctr'], prev_t['ctr'], '{:+.1f} pts')} |",
            f"| Avg position | {cur_t['position']:.1f} | {prev_t['position']:.1f} | {delta(cur_t['position'], prev_t['position'], '{:+.1f}', lower_is_better=True)} |",
            "",
        ]
        headline = f"Search: {cur_t['clicks']} clicks ({delta(cur_t['clicks'], prev_t['clicks'])}), {cur_t['impressions']} impressions"

        def split(rows: list[dict]) -> tuple[dict, dict, dict]:
            return (totals([r for r in rows if BRAND.search(r["keys"][0])]),
                    totals([r for r in rows if not BRAND.search(r["keys"][0])]),
                    totals([r for r in rows if LOCAL.search(r["keys"][0]) and not BRAND.search(r["keys"][0])]))
        cb, cn, cl = split(cur_q)
        pb, pn, pl = split(prev_q)
        lines += [
            "Query-level totals; Google hides rare queries for privacy, so these sum to less than the totals above.",
            "",
            "| Segment | Clicks | Impressions | Change in impressions |",
            "|---|---|---|---|",
            f"| Branded (name searches) | {cb['clicks']} | {cb['impressions']} | {delta(cb['impressions'], pb['impressions'])} |",
            f"| Non-branded | {cn['clicks']} | {cn['impressions']} | {delta(cn['impressions'], pn['impressions'])} |",
            f"| of which local (Ahmedabad / near me / areas) | {cl['clicks']} | {cl['impressions']} | {delta(cl['impressions'], pl['impressions'])} |",
            "",
            "### Top pages",
            "",
            "| Page | Clicks | Impressions | Position |",
            "|---|---|---|---|",
        ]
        for r in gsc.query(start, end, ["page"], 10):
            lines.append(f"| {path_of(r['keys'][0])} | {r['clicks']} | {r['impressions']} | {r['position']:.1f} |")
        lines += ["", "### Top queries", "", "| Query | Clicks | Impressions | Position |", "|---|---|---|---|"]
        for r in sorted(cur_q, key=lambda r: (-r["clicks"], -r["impressions"]))[:12]:
            lines.append(f"| {r['keys'][0]} | {r['clicks']} | {r['impressions']} | {r['position']:.1f} |")
        seen_before = {r["keys"][0] for r in gsc.query(end - dt.timedelta(days=90), start - dt.timedelta(days=1), ["query"], 1000)}
        new = [r for r in cur_q if r["keys"][0] not in seen_before]
        if new:
            lines += ["", f"### New queries this period ({len(new)})", ""]
            lines += [f"- {r['keys'][0]} (pos {r['position']:.0f}, {r['impressions']} impr)"
                      for r in sorted(new, key=lambda r: -r["impressions"])[:12]]

        # Index coverage -- its own try, so a failure here keeps the numbers above.
        try:
            urls = sitemap_urls()
            not_indexed = []
            for u in urls:
                status = gsc.inspect(u)
                if status.get("verdict") != "PASS":
                    not_indexed.append(f"- {path_of(u)}: {status.get('coverageState', 'unknown')}")
            lines += ["", f"### Index coverage: {len(urls) - len(not_indexed)} of {len(urls)} sitemap pages indexed", ""]
            lines += not_indexed or ["All sitemap pages are indexed."]
        except Exception as e:
            lines += ["", "### Index coverage", "", f"Could not check index coverage: {e}"]
        lines.append("")
    except Exception as e:  # report what failed rather than nothing
        lines += ["## Google Search", "", f"Could not read Search Console: {e}",
                  "Fix: `gcloud auth application-default login --scopes="
                  "https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform`", ""]
        headline = "Search Console unavailable"

    # Vercel Web Analytics (page views are near real time; use the last N full days)
    v_end = today - dt.timedelta(days=1)
    v_start = v_end - dt.timedelta(days=days - 1)
    v_prev_end = v_start - dt.timedelta(days=1)
    v_prev_start = v_prev_end - dt.timedelta(days=days - 1)
    try:
        cur, prev = vercel_count(v_start, v_end), vercel_count(v_prev_start, v_prev_end)
        pv, pv_prev = cur.get("pageviews", 0), prev.get("pageviews", 0)
        vis, vis_prev = cur.get("visitors", 0), prev.get("visitors", 0)
        lines += [
            f"## Website visits: {v_start:%d %b} to {v_end:%d %b} (Vercel Web Analytics)",
            "",
            "| | This period | Previous | Change |",
            "|---|---|---|---|",
            f"| Visitors | {vis} | {vis_prev} | {delta(vis, vis_prev)} |",
            f"| Page views | {pv} | {pv_prev} | {delta(pv, pv_prev)} |",
            "",
            "Analytics went live on 2026-11-02, so comparisons before then show zero.",
            "",
            "### Top pages", "", "| Page | Views | Visitors |", "|---|---|---|",
        ]
        for r in vercel_aggregate(v_start, v_end, "requestPath"):
            lines.append(f"| {r.get('requestPath')} | {r.get('pageviews')} | {r.get('visitors')} |")
        lines += ["", "### Where visitors came from", "", "| Referrer | Views |", "|---|---|"]
        for r in vercel_aggregate(v_start, v_end, "referrerHostname"):
            lines.append(f"| {r.get('referrerHostname') or '(direct / none)'} | {r.get('pageviews')} |")
        lines.append("")
        headline += f" · Site: {vis} visitors ({delta(vis, vis_prev)})"
    except Exception as e:
        lines += ["## Website visits", "", f"Could not read Vercel Web Analytics: {e}",
                  "Fix: run `vercel login`, then re-run this script.", ""]

    lines += ["---", "Bookings are not included: the production database is not readable from this Mac.", ""]
    return "\n".join(lines), headline


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--no-notify", action="store_true")
    args = parser.parse_args()

    report, headline = build(args.days)
    OUT_DIR.mkdir(exist_ok=True)
    out = OUT_DIR / f"{dt.date.today().isoformat()}.md"
    out.write_text(report, encoding="utf-8")
    print(report)
    print(f"\nSaved to {out}")
    if not args.no_notify and sys.platform == "darwin":
        msg = headline.replace('"', "'")
        subprocess.run(["osascript", "-e",
                        f'display notification "{msg}" with title "Pet Physio Vet weekly report" '
                        f'subtitle "Saved to ~/PetPhysio-reports"'], check=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
