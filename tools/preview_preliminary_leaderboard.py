"""Export a public-safe leaderboard and serve it locally without production writes."""
import argparse
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path
import sys
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "evaluation_tools"))
from archive_pool_worker import Backend, private_read, private_write, runtime_settings

TASKS = ("click_bell", "drawer_open_place", "mixer_operating", "table_rearrangement", "water_pouring",
         "handle_basket", "items_handover", "item_assembly", "manipulate_pipette", "sample_loading")
METRICS = ("weighted_score", "success_rate", "average_steps", "action_efficiency", "inference_ms",
           "inference_per_episode_ms", "inference_efficiency")
ANONYMOUS_EVALUATION = "eval_7c44b331c23d47"


def public_snapshot(board):
    tables = board.get("tables", [])
    if [table.get("id") for table in tables] != ["overall", *TASKS]:
        raise ValueError("Incomplete private leaderboard response")
    eligible = {row["evaluation_id"] for row in tables[0]["rows"]
                if row.get("review_status") == "reviewed" and row.get("completed_tasks") == 10
                and isinstance(row.get("weighted_all"), (int, float)) and math.isfinite(row["weighted_all"])}
    output = []
    for table in tables:
        rows, seen = [], set()
        for source in table["rows"]:
            identity = source["evaluation_id"]
            if identity not in eligible:
                continue
            if identity in seen or source.get("review_status") != "reviewed":
                raise ValueError("Inconsistent reviewed result identity")
            seen.add(identity)
            row = {key: source.get(key) for key in METRICS}
            if not all(type(value) in (int, float) and math.isfinite(value) for value in row.values()):
                raise ValueError("Reviewed leaderboard contains missing metrics")
            anonymous = identity == ANONYMOUS_EVALUATION
            row.update(rank=len(rows) + 1,
                       model_name="AnonymousVLA" if anonymous else str(source["model_name"]),
                       team_name="AnonymousVLA" if anonymous else str(source["team_name"]))
            if table["id"] == "overall":
                if row["weighted_score"] != source["weighted_all"]:
                    raise ValueError("Overall weighted score differs from private leaderboard")
                row["weighted_all"] = source["weighted_all"]
            rows.append(row)
        if seen != eligible:
            raise ValueError("A reviewed team's task results are incomplete")
        output.append({"id": table["id"], "rows": rows})
    return {"schema": 1, "stage": "preliminary_simulation", "review_status": "reviewed",
            "captured_at": datetime.now(timezone.utc).isoformat(), "team_count": len(eligible),
            "task_count": 10, "episodes_per_task": 100, "tables": output}


def handler(root, snapshot):
    class PreviewHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def send_json(self, value, content_type="application/json; charset=utf-8"):
            data = value.encode() if isinstance(value, str) else json.dumps(value).encode()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/static/config.js":
                self.send_json('window.ROBO_SYN_CONFIG = {API_BASE_URL:"", CONTACT_EMAIL:"robosynchallenge@gmail.com",'
                               'PRELIMINARY_LEADERBOARD_URL:"/__preview__/preliminary-leaderboard.json",'
                               'PRELIMINARY_PREVIEW:true};', "application/javascript; charset=utf-8")
                return
            if path == "/__preview__/preliminary-leaderboard.json":
                self.send_json(private_read(snapshot))
                return
            if path == "/":
                self.path = "/index.html"
            target = Path(self.translate_path(self.path)).resolve()
            try:
                relative = target.relative_to(root)
            except ValueError:
                self.send_error(404)
                return
            allowed = relative == Path("index.html") or relative.parts and relative.parts[0] in ("static", "material")
            if not allowed and path != "/" or any(part.startswith(".") for part in relative.parts) or relative == Path("static/reviewer-preview.json"):
                self.send_error(404)
                return
            if target.is_dir():
                self.send_error(404)
                return
            super().do_GET()

        def do_POST(self):
            self.send_error(405, "Local preview is read-only")

        def do_HEAD(self):
            self.send_error(405, "Use GET for local preview")

    return PreviewHandler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--settings", type=Path)
    parser.add_argument("--port", type=int, default=8042)
    parser.add_argument("--export-only", action="store_true")
    args = parser.parse_args()
    if args.settings:
        board = Backend(runtime_settings(args.settings)).call("reviewer_private_leaderboard")
        snapshot = public_snapshot(board)
        private_write(args.snapshot, snapshot)
        print(json.dumps({"exported_teams": snapshot["team_count"], "tables": len(snapshot["tables"])}), flush=True)
    if args.export_only:
        return
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler(root, args.snapshot))
    print(f"Local preliminary leaderboard: http://127.0.0.1:{args.port}/index.html#/leaderboard", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
