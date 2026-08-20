#!/usr/bin/env python3
"""Local dashboard for the running Claude Code workflow (the agent team).

Shows every pipeline stage as an EXPANDABLE dropdown (click to see full detail:
stories, design, files changed, per-screen parity, etc.) plus a live log tail.
Refreshes content in place (open dropdowns + scroll are preserved). Stdlib only,
read-only. Run:

    ./.venv/bin/python tools/wf_dashboard.py      # open http://localhost:8770
"""
import glob
import html
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("WF_DASH_PORT", "8770"))
WF_BASE = os.path.expanduser(
    "~/.claude/projects/-Users-yoginparmar-Desktop-OtherStuff/"
    "bf96f5c6-b2d7-4884-96ed-101cbab7d5cd/subagents/workflows"
)

DOT = {"done": "🟢", "running": "🟡", "queued": "⚪"}
LOG_ICON = {"text": "💬", "tool": "🔧", "result": "↩"}
BUCKET_LABEL = {
    "plan": ("Plan", "Product Manager"),
    "design": ("Design", "Tech Lead"),
    "build": ("Build", "Engineer"),
    "parity": ("Verify / Parity", "QA (Playwright)"),
    "review": ("Review", "Tech Lead"),
    "signoff": ("Sign-off", "Product Manager"),
    "?": ("Step", ""),
}


def categorize(r):
    if not isinstance(r, dict):
        return "?"
    if "stories" in r:
        return "plan"
    if any(k in r for k in ("api_client", "react_structure", "dev_proxy", "parity_preservation")):
        return "design"
    if "approach" in r or "fixture_strategy" in r:
        return "plan"  # remediation plan
    if any(k in r for k in ("screen_results", "functional_results", "parity_results")):
        return "parity"
    if "next_scope" in r:
        return "signoff"
    if "decision" in r:
        return "review"
    return "build"


def newest_run():
    runs = sorted(glob.glob(os.path.join(WF_BASE, "wf_*")), key=os.path.getmtime)
    return runs[-1] if runs else None


def read_state(run_dir):
    """One row per journal call, in order — done (bucket-labeled, with raw result) or running."""
    jp = os.path.join(run_dir, "journal.jsonl")
    calls, order = {}, []
    if os.path.exists(jp):
        for line in open(jp):
            try:
                d = json.loads(line)
            except Exception:
                continue
            k = d.get("key")
            if k not in calls:
                calls[k] = {"started": False, "result": None}
                order.append(k)
            if d.get("type") == "started":
                calls[k]["started"] = True
            elif d.get("type") == "result":
                calls[k]["result"] = d.get("result")

    stages = []  # {label, role, status, detail, result}
    for k in order:
        c = calls[k]
        if c["result"] is not None:
            b = categorize(c["result"])
            label, role = BUCKET_LABEL.get(b, BUCKET_LABEL["?"])
            stages.append({"label": label, "role": role, "status": "done",
                           "detail": short_detail(c["result"]), "result": c["result"]})
        elif c["started"]:
            stages.append({"label": "In progress", "role": "…", "status": "running",
                           "detail": "working…", "result": None})

    agents = []
    for f in sorted(glob.glob(os.path.join(run_dir, "agent-*.jsonl")),
                    key=os.path.getmtime, reverse=True):
        agents.append((os.path.basename(f)[6:22], os.path.getmtime(f), os.path.getsize(f)))
    return stages, agents


def short_detail(r):
    if not isinstance(r, dict):
        return ""
    b = categorize(r)
    if b == "plan" and "stories" in r:
        return f"{len(r['stories'])} stories"
    if b == "plan":
        return (r.get("approach", "") or f"{len(r.get('tasks', []))} tasks")[:70]
    if b == "design":
        return ", ".join(r.get("screens", [])[:5]) or (r.get("api_client", "")[:60])
    if b == "parity":
        pr = r.get("parity_results") or r.get("screen_results") or []
        fr = r.get("functional_results") or []
        okp = sum(1 for s in pr if s.get("parity") == "PASS")
        okf = sum(1 for s in fr if s.get("result") == "PASS")
        bits = [f"overall={r.get('overall')}"]
        if fr:
            bits.append(f"func {okf}/{len(fr)}")
        if pr:
            bits.append(f"parity {okp}/{len(pr)}")
        return " · ".join(bits)
    if b == "signoff":
        return str(r.get("decision", ""))[:70]
    if b == "review":
        return str(r.get("decision", ""))[:70]
    return (r.get("summary", "") or "")[:70]


def _ul(items):
    return "<ul>" + "".join(f"<li>{html.escape(str(x))[:240]}</li>" for x in items) + "</ul>"


def format_detail(r):
    """Full expandable content for a completed stage."""
    if not isinstance(r, dict):
        return "<p class=muted>no detail</p>"
    b = categorize(r)
    if b == "plan" and "stories" in r:
        return "<ol>" + "".join(
            f"<li><b>{html.escape(s.get('id',''))}</b> — {html.escape((s.get('title') or '')[:140])}"
            + (("<div class=ac>" + "".join(f"• {html.escape(a[:160])}<br>" for a in s.get('acceptance_criteria', [])[:4]) + "</div>") if s.get('acceptance_criteria') else "")
            + "</li>" for s in r["stories"]) + "</ol>"
    if b == "plan":
        out = f"<p>{html.escape((r.get('approach') or '')[:400])}</p>"
        if r.get("fixture_strategy"):
            out += f"<p><b>Fixtures:</b> {html.escape(r['fixture_strategy'][:300])}</p>"
        if r.get("tasks"):
            out += "<p><b>Tasks:</b></p>" + _ul(r["tasks"])
        return out
    if b == "design":
        out = ""
        for key, lbl in (("api_client", "API client"), ("auth_flow", "Auth"),
                         ("dev_proxy", "Dev proxy"), ("react_structure", "Structure"),
                         ("css_strategy", "CSS"), ("parity_preservation", "Parity"),
                         ("parity_approach", "Parity")):
            if r.get(key):
                out += f"<p><b>{lbl}:</b> {html.escape(str(r[key])[:300])}</p>"
        if r.get("screens"):
            out += f"<p><b>Screens:</b> {html.escape(', '.join(r['screens']))}</p>"
        if r.get("endpoints"):
            out += "<p><b>Endpoints:</b></p>" + _ul(r["endpoints"])
        for key in ("backend_tasks", "tasks"):
            if r.get(key):
                out += f"<p><b>{key}:</b></p>" + _ul(r[key])
        return out or "<p class=muted>(design)</p>"
    if b == "parity":
        out = f"<p><b>Overall: {html.escape(str(r.get('overall','?')))}</b></p>"
        fr = r.get("functional_results")
        if fr:
            out += "<p><b>Functional:</b></p><ul>" + "".join(
                f"<li>{html.escape(f.get('area',''))} — <b>{html.escape(f.get('result',''))}</b>"
                + (f" <span class=muted>{html.escape((f.get('evidence') or '')[:120])}</span>" if f.get('evidence') else "")
                + "</li>" for f in fr) + "</ul>"
        pr = r.get("parity_results") or r.get("screen_results")
        if pr:
            out += "<p><b>Per screen:</b> " + " ".join(
                f"<span class='chip {'ok' if s.get('parity')=='PASS' else 'bad'}'>{html.escape(s.get('screen',''))} {'✓' if s.get('parity')=='PASS' else '✗'}</span>"
                for s in pr) + "</p>"
        if r.get("remaining_issues"):
            out += "<p><b>Notes / issues:</b></p>" + _ul(r["remaining_issues"])
        return out
    if b == "build":
        out = f"<p>{html.escape((r.get('summary') or '')[:500])}</p>"
        fc = r.get("files_changed") or []
        if fc:
            out += f"<p><b>{len(fc)} files changed:</b></p>" + _ul(fc)
        if r.get("commands_run"):
            out += "<p><b>Commands:</b></p>" + _ul(r["commands_run"])
        if "compiles" in r:
            out += f"<p><b>Compiles:</b> {r.get('compiles')}</p>"
        if r.get("flags"):
            out += "<p><b>Flags:</b></p>" + _ul(r["flags"])
        return out
    if b == "review":
        out = f"<p><b>{html.escape(str(r.get('decision','')))}</b></p>"
        if r.get("feedback"):
            out += _ul(r["feedback"])
        return out
    if b == "signoff":
        out = f"<p><b>{html.escape(str(r.get('decision',''))[:400])}</b></p>"
        if r.get("summary"):
            out += f"<p>{html.escape(r['summary'][:600])}</p>"
        if r.get("next_scope"):
            out += f"<p><b>Next scope:</b> {html.escape(r['next_scope'][:400])}</p>"
        return out
    return "<p class=muted>(step)</p>"


def parse_agent_log(path, n=18):
    try:
        lines = open(path, errors="replace").read().splitlines()
    except Exception:
        return []
    events = []
    for line in lines[-140:]:
        try:
            rec = json.loads(line)
        except Exception:
            continue
        msg = rec.get("message") or {}
        content = msg.get("content")
        ts = (rec.get("timestamp") or "")[11:19]
        items = content if isinstance(content, list) else (
            [{"type": "text", "text": content}] if isinstance(content, str) else [])
        for it in items:
            if not isinstance(it, dict):
                continue
            it_t = it.get("type")
            if it_t == "text" and it.get("text", "").strip():
                events.append((ts, "text", it["text"].strip().replace("\n", " ")[:220]))
            elif it_t == "tool_use":
                inp = it.get("input", {})
                arg = ""
                if isinstance(inp, dict):
                    arg = (inp.get("command") or inp.get("file_path") or inp.get("description")
                           or inp.get("path") or inp.get("pattern") or "")
                    if isinstance(arg, str):
                        arg = arg.replace("\n", " ")[:150]
                events.append((ts, "tool", f"{it.get('name','tool')}: {arg}"))
            elif it_t == "tool_result":
                c = it.get("content")
                if isinstance(c, list):
                    c = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
                c = (str(c) or "").replace("\n", " ").strip()[:180]
                if c:
                    events.append((ts, "result", c))
    return events[-n:]


def render():
    run = newest_run()
    if not run:
        return "<p>No workflow runs found yet.</p>"
    stages, agents = read_state(run)
    done = sum(1 for s in stages if s["status"] == "done")
    running = [s for s in stages if s["status"] == "running"]
    status = "RUNNING" if running else ("COMPLETE" if done else "STARTING")
    now = time.strftime("%H:%M:%S")

    cards = ""
    for i, s in enumerate(stages):
        st = s["status"]
        body = format_detail(s["result"]) if s["result"] is not None else \
            "<p class=muted>In progress — see the Live log panel below for what it's doing right now.</p>"
        cards += (
            f"<details class='stage {st}' data-key='k{i}'>"
            f"<summary>{DOT[st]} <b>{html.escape(s['label'])}</b>"
            f"<span class=role>{html.escape(s['role'])}</span>"
            f"<span class='tag {st}'>{st.upper()}</span>"
            f"<span class=sd>{html.escape(s['detail'])}</span></summary>"
            f"<div class=body>{body}</div></details>")

    run_label = html.escape(os.path.basename(run))
    now_txt = "several agents" if len(running) > 1 else ("1 agent" if running else "—")
    done_txt = f"{done} step(s)"
    pct = 100 if status == "COMPLETE" else (85 if done else 12)

    arows = ""
    for aid, mt, sz in agents[:8]:
        ago = int(time.time() - mt)
        live = "live" if ago < 30 else ""
        arows += (f"<tr><td><code>{aid}</code></td>"
                  f"<td class='{live}'>{ago}s ago</td><td>{sz // 1024} KB</td></tr>")

    log_files = sorted(glob.glob(os.path.join(run, "agent-*.jsonl")),
                       key=os.path.getmtime, reverse=True)
    active_id, log_rows = "", ""
    if log_files:
        active_id = os.path.basename(log_files[0])[6:22]
        for ts, kind, txt in parse_agent_log(log_files[0]):
            log_rows += (f"<tr><td class=ts>{ts}</td><td>{LOG_ICON.get(kind, '·')}</td>"
                         f"<td class='log {kind}'>{html.escape(txt)}</td></tr>")

    return f"""
    <p class=meta>Run <code>{run_label}</code> ·
       <span class="badge {status.lower()}">{status}</span> ·
       {done_txt} done · {len(running)} running · refreshed {now}</p>
    <div class=bar><div class=fill style="width:{pct}%"></div></div>
    <div class=cards>
      <div class=card><div class=k>▶ Running now</div><div class=v>{now_txt}</div></div>
      <div class=card><div class=k>✓ Steps done</div><div class=v>{done}</div></div>
    </div>
    <h2>Pipeline <span class=hint2>(click a row to expand)</span></h2>
    <div class=pipeline>{cards or '<p class=muted>waiting…</p>'}</div>
    <h2>📜 Live log — agent <code>{active_id}</code> (most active)</h2>
    <table class=logtbl>{log_rows or '<tr><td>no log yet…</td></tr>'}</table>
    <p class=hint>🟢 done · 🟡 running · ⚪ queued · 💬 message · 🔧 tool · ↩ result.
       Content refreshes every 3s in place — expanded rows stay open.</p>
    """


PAGE = """<!doctype html><html><head><meta charset=utf-8>
<title>Team Sprint Dashboard</title>
<style>
 body{{font-family:"DM Sans",system-ui,sans-serif;background:radial-gradient(120% 80% at 10% 0%,#fff9f4,#faf6f1 45%,#e8ddd4);color:#3e2723;margin:0;padding:32px;}}
 h1{{margin:0 0 4px;font-size:24px}} h2{{margin:26px 0 8px;font-size:15px;color:#5d4037}}
 .hint2{{font-weight:400;color:#8d6e63;font-size:12px}}
 .meta{{color:#8d6e63;font-size:13px}}
 .badge{{padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700}}
 .badge.running{{background:rgba(255,183,77,.35)}} .badge.complete{{background:rgba(129,199,132,.45)}}
 .badge.starting{{background:rgba(62,39,35,.1)}}
 .cards{{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}}
 .card{{background:rgba(255,255,255,.72);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.35);
   border-radius:18px;padding:14px 18px;box-shadow:0 8px 32px rgba(62,39,35,.12);min-width:200px}}
 .card .k{{font-size:12px;color:#8d6e63;text-transform:uppercase;letter-spacing:.04em}}
 .card .v{{font-size:16px;font-weight:600;margin-top:4px}}
 .pipeline{{width:min(880px,100%)}}
 details.stage{{background:rgba(255,255,255,.72);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.35);
   border-radius:14px;box-shadow:0 4px 18px rgba(62,39,35,.08);margin-bottom:8px;overflow:hidden}}
 details.stage.running{{background:rgba(255,183,77,.16)}}
 summary{{cursor:pointer;list-style:none;padding:12px 16px;display:flex;align-items:center;gap:10px;font-size:14px}}
 summary::-webkit-details-marker{{display:none}}
 summary b{{min-width:130px}} .role{{font-size:12px;color:#8d6e63;min-width:120px}}
 .tag{{padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700}}
 .tag.done{{background:rgba(129,199,132,.45)}} .tag.running{{background:rgba(255,183,77,.45)}}
 .tag.queued{{background:rgba(62,39,35,.1);color:#8d6e63}}
 .sd{{color:#5d4037;font-size:13px;flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
 .body{{padding:2px 18px 16px;font-size:13px;border-top:1px solid rgba(62,39,35,.08);color:#4e342e}}
 .body ul,.body ol{{margin:6px 0;padding-left:20px}} .body li{{margin:3px 0}}
 .body p{{margin:8px 0}} .ac{{color:#8d6e63;font-size:12px;margin:2px 0 6px 4px}}
 .chip{{display:inline-block;padding:1px 8px;margin:2px;border-radius:999px;font-size:12px}}
 .chip.ok{{background:rgba(129,199,132,.4)}} .chip.bad{{background:rgba(198,40,40,.3)}}
 .muted{{color:#8d6e63}}
 code{{background:rgba(62,39,35,.08);padding:1px 6px;border-radius:6px;font-size:12px}}
 .bar{{width:min(880px,100%);height:10px;background:rgba(62,39,35,.1);border-radius:999px;overflow:hidden;margin:10px 0}}
 .fill{{height:100%;background:#2e7d32;transition:width .4s}}
 table.logtbl{{border-collapse:collapse;background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.35);
   border-radius:14px;overflow:hidden;width:min(880px,100%)}}
 .logtbl td{{font-size:12.5px;padding:6px 12px;border-bottom:1px solid rgba(62,39,35,.06);vertical-align:top}}
 .ts{{color:#8d6e63;font-variant-numeric:tabular-nums;white-space:nowrap}}
 .log{{font-family:ui-monospace,Menlo,monospace}} .log.tool{{color:#1565c0}} .log.result{{color:#8d6e63}} .log.text{{color:#3e2723;font-family:inherit}}
 .live{{color:#2e7d32;font-weight:700}}
 .hint{{color:#8d6e63;font-size:12px;margin-top:18px}}
</style></head><body>
<h1>🐾 Pet Physio Vet — Team Sprint</h1>
<div id=content>{body}</div>
<script>
(function(){{
  var K='wf-open-stages';
  function loadState(){{ try{{return JSON.parse(localStorage.getItem(K)||'{{}}')}}catch(e){{return {{}}}} }}
  function applyOpen(){{
    var st=loadState();
    document.querySelectorAll('details.stage').forEach(function(d){{
      var k=d.getAttribute('data-key'); if(st[k]) d.open=true;
      d.addEventListener('toggle', function(){{
        var s=loadState(); s[k]=d.open; localStorage.setItem(K, JSON.stringify(s));
      }});
    }});
  }}
  async function tick(){{
    try{{
      var r=await fetch(location.href,{{cache:'no-store'}});
      var t=await r.text();
      var doc=new DOMParser().parseFromString(t,'text/html');
      var c=doc.querySelector('#content');
      if(c){{ document.querySelector('#content').innerHTML=c.innerHTML; applyOpen(); }}
    }}catch(e){{}}
  }}
  applyOpen();
  setInterval(tick, 3000);
}})();
</script>
</body></html>"""


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            body = render()
        except Exception as e:
            body = f"<pre>dashboard error: {html.escape(str(e))}</pre>"
        out = PAGE.format(body=body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"Dashboard: http://localhost:{PORT}  (Ctrl-C to stop)")
    HTTPServer(("127.0.0.1", PORT), H).serve_forever()
