from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from flask import (
    Flask,
    abort,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = Path(os.getenv("ROBOCHALLENGE_RUNTIME_DIR", str(BASE_DIR))).resolve()
INSTANCE_DIR = RUNTIME_DIR / "instance"
DB_PATH = INSTANCE_DIR / "robosynchallenge.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"
POLICY_UPLOAD_DIR = RUNTIME_DIR / "uploads" / "policies"
RESULT_UPLOAD_DIR = RUNTIME_DIR / "uploads" / "results"

SIMULATION_REPO_URL = "https://github.com/EDEM-AI/RoboSynChallenge"
HUGGING_FACE_URL = os.getenv("ROBOCHALLENGE_DATASET_URL", "").strip()
HUGGING_FACE_LABEL = os.getenv("ROBOCHALLENGE_DATASET_LABEL", "Hugging Face dataset")
DEFAULT_ADMIN_USERNAME = os.getenv("ROBOCHALLENGE_ADMIN_USERNAME", "admin").strip() or "admin"
DEFAULT_ADMIN_EMAIL = os.getenv(
    "ROBOCHALLENGE_ADMIN_EMAIL", "admin@robosynchallenge.local"
).strip()
DEFAULT_ADMIN_PASSWORD = os.getenv("ROBOCHALLENGE_ADMIN_PASSWORD", "ChangeMe2026!").strip()
DEFAULT_ADMIN_TOKEN = os.getenv("ROBOCHALLENGE_ADMIN_TOKEN", DEFAULT_ADMIN_PASSWORD).strip() or DEFAULT_ADMIN_PASSWORD
ALLOWED_MODEL_LINK_HOSTS = {"github.com", "huggingface.co"}

ALLOWED_POLICY_EXTENSIONS = {
    "zip",
    "tar",
    "gz",
    "tgz",
    "pt",
    "pth",
    "ckpt",
    "bin",
    "onnx",
    "safetensors",
    "json",
    "txt",
    "py",
}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "webm", "mov", "m4v"}

STATE_LABELS = {
    "joints": "joints",
    "gripper": "gripper",
    "eef_pose": "eef pose",
}
IMAGE_LABELS = {
    "cam_high": "cam high",
    "cam_left_wrist": "cam left wrist",
    "cam_right_wrist": "cam right wrist",
}
ROTATION_LABELS = {
    "rot6d": "Rot6D",
    "quat": "Quaternion",
    "rpy": "RPY",
}
DATA_SOURCE_LABELS = {
    "official_real": "Official real data",
    "official_simulated": "Official simulated data",
    "other": "Other data sources",
}
TRACK_LABELS = {
    "hybrid": "Sim + Real",
    "real-only": "Real only",
    "sim-only": "Sim only",
    "custom": "Custom",
}

RANKING_LABELS = {
    1: "Ranked",
    0: "Test run",
}

STATUS_LABELS = {
    "submitted": "Submitted",
    "scheduled": "Scheduled",
    "queued": "Queued",
    "evaluating": "Evaluating",
    "completed": "Completed",
    "published": "Published",
}

HOME_STATS = [
    {"value": "10", "label": "official tasks"},
    {"value": "1000", "label": "synthetic trials / task"},
    {"value": "60", "label": "real references / task"},
    {"value": "1000", "label": "action-step cap"},
]

TASK_TIERS = [
    {
        "name": "Entry-level",
        "tone": "mint",
        "summary": "Short-horizon routines with clear affordances and low contact complexity.",
        "tasks": [
            "Table rearrangement",
            "Click-bell",
            "Water pouring",
            "Handle basket",
        ],
        "image": "assets/task-vis-1.png",
    },
    {
        "name": "Mid-level",
        "tone": "powder",
        "summary": "Sequential interactions that require moderate coordination and spatial reasoning.",
        "tasks": [
            "Items hand-over",
            "Drawer open-and-place",
            "Mixer operating",
        ],
        "image": "assets/task-vis-2.png",
    },
    {
        "name": "High-level",
        "tone": "sand",
        "summary": "Fine-grained multi-stage operations requiring precise end-effector control and adaptation.",
        "tasks": [
            "Item assembly",
            "Manipulate pipette",
            "Sample loading",
        ],
        "image": "assets/task-vis-2.png",
    },
]

REAL_COLLECTION_CONDITIONS = [
    {
        "background": "White",
        "lighting": "Fixed lighting",
        "additionals": "None",
        "description": "Standard neutral setup for canonical demonstrations.",
    },
    {
        "background": "White",
        "lighting": "Enhanced lighting",
        "additionals": "None",
        "description": "Higher illumination to stress lighting invariance.",
    },
    {
        "background": "White",
        "lighting": "Fixed lighting",
        "additionals": "2-3 distractors",
        "description": "Extra objects added to test robustness to clutter.",
    },
    {
        "background": "Blue",
        "lighting": "Fixed lighting",
        "additionals": "None",
        "description": "Alternative background color for visual contrast shifts.",
    },
    {
        "background": "Yellow",
        "lighting": "Fixed lighting",
        "additionals": "None",
        "description": "Textured background to probe appearance generalization.",
    },
]

SIM_RANDOMIZATION = [
    {
        "title": "Lighting and scene appearance",
        "items": [
            "Light intensity, position, and color",
            "Background plate color variation",
            "Table color and texture probability",
        ],
    },
    {
        "title": "Object geometry and pose",
        "items": [
            "Initial object position offsets",
            "Initial object rotation range",
            "Object size scaling and surface material colors",
        ],
    },
    {
        "title": "Camera calibration and viewpoint",
        "items": [
            "Camera intrinsics on fx and fy",
            "Camera position XYZ offsets",
            "Camera roll, pitch, and yaw perturbations",
        ],
    },
    {
        "title": "Robot initialization",
        "items": [
            "Joint configuration randomization",
            "End-effector position variation",
            "Diverse feasible starting states for recovery behavior",
        ],
    },
    {
        "title": "Workspace and distractors",
        "items": [
            "Table height variation up to plus or minus 4 cm",
            "Distractor objects such as bowls, cups, and toys",
            "Mixed task-irrelevant items for scene complexity",
        ],
    },
]

EVALUATION_VARIATIONS = [
    "Three table textures: wood, blue fabric, yellow grid",
    "Three light positions with varying illumination colors",
    "Seen and unseen object instances within the same category",
    "Distractor objects at 2, 4, and 8 item difficulty levels",
    "Unseen positions on a predefined 3 x 3 grid",
]

BENCHMARK_SUMMARY = [
    {
        "label": "pi0 (sim)",
        "model_name": "pi0",
        "track": "sim-only",
        "data_regime": "Sim only",
        "success_rate": 22.00,
        "action_steps": 898.12,
        "real_time": 90.56,
    },
    {
        "label": "pi0 (real)",
        "model_name": "pi0",
        "track": "real-only",
        "data_regime": "Real only",
        "success_rate": 22.50,
        "action_steps": 881.15,
        "real_time": 90.20,
    },
    {
        "label": "pi0.5 (sim)",
        "model_name": "pi0.5",
        "track": "sim-only",
        "data_regime": "Sim only",
        "success_rate": 38.50,
        "action_steps": 797.55,
        "real_time": 80.55,
    },
    {
        "label": "pi0.5 (real)",
        "model_name": "pi0.5",
        "track": "real-only",
        "data_regime": "Real only",
        "success_rate": 33.00,
        "action_steps": 821.65,
        "real_time": 82.35,
    },
    {
        "label": "Motus (sim)",
        "model_name": "Motus",
        "track": "sim-only",
        "data_regime": "Sim only",
        "success_rate": 31.50,
        "action_steps": 778.80,
        "real_time": 133.76,
    },
    {
        "label": "Motus (real)",
        "model_name": "Motus",
        "track": "real-only",
        "data_regime": "Real only",
        "success_rate": 27.50,
        "action_steps": 721.35,
        "real_time": 129.43,
    },
]

BENCHMARK_TABLES_RAW = [
    {
        "title": "Click Bell to Table Rearrangement",
        "tasks": [
            "Click Bell",
            "Items Hand-Over and Place",
            "Dual-Arm Water Pouring",
            "Table Rearrangement",
        ],
        "rows": [
            {
                "model": "pi0 (sim)",
                "values": [("8/20", 625.30, 63.78), ("5/20", 834.75, 83.60), ("6/20", 898.60, 89.95), ("7/20", 788.20, 79.07)],
            },
            {
                "model": "pi0 (real)",
                "values": [("5/20", 860.45, 86.05), ("5/20", 844.00, 86.10), ("4/20", 917.70, 92.69), ("8/20", 742.70, 74.27)],
            },
            {
                "model": "pi0.5 (sim)",
                "values": [("10/20", 647.55, 65.53), ("7/20", 791.25, 80.00), ("7/20", 877.45, 87.90), ("12/20", 612.90, 61.31)],
            },
            {
                "model": "pi0.5 (real)",
                "values": [("6/20", 791.20, 80.70), ("5/20", 832.90, 84.12), ("6/20", 872.15, 87.22), ("12/20", 628.80, 63.51)],
            },
            {
                "model": "Motus (sim)",
                "values": [("13/20", 463.30, 79.09), ("10/20", 584.70, 97.52), ("8/20", 667.30, 111.00), ("4/20", 864.25, 143.75)],
            },
            {
                "model": "Motus (real)",
                "values": [("14/20", 420.50, 70.11), ("12/20", 492.30, 83.65), ("6/20", 744.95, 125.97), ("3/20", 900.05, 153.78)],
            },
        ],
    },
    {
        "title": "Basket Pick-and-Place to Item Assembly",
        "tasks": [
            "Basket Pick-and-Place",
            "Drawer Open and Place",
            "Mixer Operating",
            "Item Assembly",
        ],
        "rows": [
            {
                "model": "pi0 (sim)",
                "values": [("5/20", 835.40, 83.56), ("6/20", 821.40, 82.23), ("3/20", 897.05, 90.09), ("0/20", 1000.00, 102.07)],
            },
            {
                "model": "pi0 (real)",
                "values": [("6/20", 796.70, 80.47), ("8/20", 757.70, 77.29), ("1/20", 967.55, 98.69), ("0/20", 1000.00, 99.86)],
            },
            {
                "model": "pi0.5 (sim)",
                "values": [("10/20", 663.25, 66.42), ("11/20", 664.40, 67.08), ("4/20", 864.50, 87.11), ("0/20", 1000.00, 104.29)],
            },
            {
                "model": "pi0.5 (real)",
                "values": [("9/20", 697.90, 71.88), ("12/20", 645.70, 65.22), ("3/20", 901.75, 90.18), ("0/20", 1000.00, 101.02)],
            },
            {
                "model": "Motus (sim)",
                "values": [("10/20", 827.95, 132.29), ("10/20", 593.15, 102.70), ("2/20", 936.25, 154.80), ("0/20", 1000.00, 166.22)],
            },
            {
                "model": "Motus (real)",
                "values": [("9/20", 608.55, 101.27), ("11/20", 546.60, 93.96), ("0/20", 1000.00, 166.41), ("0/20", 1000.00, 167.37)],
            },
        ],
    },
    {
        "title": "Manipulate Pipette, Sample Loading, and Task Average",
        "tasks": [
            "Manipulate Pipette",
            "Sample Loading",
            "Task Average",
        ],
        "rows": [
            {
                "model": "pi0 (sim)",
                "values": [("2/20", 960.65, 96.29), ("2/20", 946.85, 94.73), ("22.00%", 898.12, 90.56)],
            },
            {
                "model": "pi0 (real)",
                "values": [("0/20", 1000.00, 108.46), ("3/20", 920.35, 92.04), ("22.50%", 881.15, 90.20)],
            },
            {
                "model": "pi0.5 (sim)",
                "values": [("2/20", 953.15, 95.82), ("4/20", 900.05, 89.97), ("38.50%", 797.55, 80.55)],
            },
            {
                "model": "pi0.5 (real)",
                "values": [("4/20", 898.75, 91.67), ("3/20", 914.95, 93.32), ("33.00%", 821.65, 82.35)],
            },
            {
                "model": "Motus (sim)",
                "values": [("4/20", 905.35, 149.33), ("2/20", 945.70, 157.82), ("31.50%", 778.80, 133.76)],
            },
            {
                "model": "Motus (real)",
                "values": [("0/20", 1000.00, 164.84), ("0/20", 1000.00, 166.85), ("27.50%", 721.35, 129.43)],
            },
        ],
    },
]


def _sr_value(sr_text: str) -> float:
    if sr_text.endswith("%"):
        return float(sr_text.rstrip("%"))
    if "/" in sr_text:
        return float(sr_text.split("/", 1)[0])
    return float(sr_text)


def prepare_benchmark_tables(raw_tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    prepared: list[dict[str, Any]] = []
    for block in raw_tables:
        task_bests: list[dict[str, float]] = []
        for task_index, _ in enumerate(block["tasks"]):
            sr_values = [_sr_value(row["values"][task_index][0]) for row in block["rows"]]
            step_values = [float(row["values"][task_index][1]) for row in block["rows"]]
            time_values = [float(row["values"][task_index][2]) for row in block["rows"]]
            task_bests.append(
                {
                    "sr": max(sr_values),
                    "steps": min(step_values),
                    "time": min(time_values),
                }
            )

        rows: list[dict[str, Any]] = []
        for row in block["rows"]:
            metrics: list[dict[str, Any]] = []
            for task_index, (sr_text, steps, time_value) in enumerate(row["values"]):
                bests = task_bests[task_index]
                metrics.append(
                    {
                        "sr": sr_text,
                        "steps": float(steps),
                        "time": float(time_value),
                        "best_sr": _sr_value(sr_text) == bests["sr"],
                        "best_steps": float(steps) == bests["steps"],
                        "best_time": float(time_value) == bests["time"],
                    }
                )
            rows.append({"model": row["model"], "metrics": metrics})

        prepared.append(
            {
                "title": block["title"],
                "tasks": list(block["tasks"]),
                "rows": rows,
            }
        )
    return prepared


BENCHMARK_TABLES = prepare_benchmark_tables(BENCHMARK_TABLES_RAW)

BASELINE_SEEDS = [
    {
        "model_name": item["model_name"],
        "username_display": "Official Baseline",
        "affiliation": "RoboSynChallenge",
        "track": item["track"],
        "data_regime": item["data_regime"],
        "success_rate": item["success_rate"],
        "action_steps": item["action_steps"],
        "real_time": item["real_time"],
        "notes": f"{item['label']} from the official 10-task benchmark snapshot.",
    }
    for item in BENCHMARK_SUMMARY
]

BASELINE_EPISODES = [
    ("Episode 01", "Click-bell", "Entry-level closed-loop evaluation"),
    ("Episode 02", "Drawer open-and-place", "Mid-level coordination evaluation"),
    ("Episode 03", "Sample loading", "High-level fine manipulation evaluation"),
]

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "templates"),
    static_folder=str(BASE_DIR / "static"),
    instance_path=str(INSTANCE_DIR),
)
app.config.update(
    SECRET_KEY=os.getenv("FLASK_SECRET_KEY", "robosynchallenge-dev-secret"),
    MAX_CONTENT_LENGTH=128 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_storage() -> None:
    INSTANCE_DIR.mkdir(parents=True, exist_ok=True)
    POLICY_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def token_hint(raw_token: str) -> str:
    return raw_token[-6:] if len(raw_token) >= 6 else raw_token


def generate_access_token() -> str:
    return secrets.token_urlsafe(24)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        connection = sqlite3.connect(DB_PATH)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def fetchone(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    row = get_db().execute(query, params).fetchone()
    return dict(row) if row is not None else None


def fetchall(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in get_db().execute(query, params).fetchall()]


def execute(query: str, params: tuple[Any, ...] = ()) -> sqlite3.Cursor:
    cursor = get_db().execute(query, params)
    get_db().commit()
    return cursor


def table_exists(table_name: str) -> bool:
    row = get_db().execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def column_exists(table_name: str, column_name: str) -> bool:
    columns = get_db().execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(column["name"] == column_name for column in columns)


def migrate_schema() -> None:
    db = get_db()
    if not column_exists("users", "access_token_hash"):
        db.execute("ALTER TABLE users ADD COLUMN access_token_hash TEXT")
    if not column_exists("users", "access_token_hint"):
        db.execute("ALTER TABLE users ADD COLUMN access_token_hint TEXT")
    if not column_exists("users", "is_active"):
        db.execute("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")

    if not table_exists("participant_models"):
        db.executescript(
            """
            CREATE TABLE participant_models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                display_name TEXT NOT NULL,
                checkpoint_link TEXT,
                code_link TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, display_name),
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
            """
        )

    if not column_exists("submissions", "model_id"):
        db.execute("ALTER TABLE submissions ADD COLUMN model_id INTEGER")
    if not column_exists("submissions", "model_name_snapshot"):
        db.execute("ALTER TABLE submissions ADD COLUMN model_name_snapshot TEXT")
    if not column_exists("submissions", "is_ranked"):
        db.execute("ALTER TABLE submissions ADD COLUMN is_ranked INTEGER NOT NULL DEFAULT 1")

    if not column_exists("evaluation_episodes", "video_url"):
        db.execute("ALTER TABLE evaluation_episodes ADD COLUMN video_url TEXT")

    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_participant_models_user_id ON participant_models (user_id)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_submissions_model_id ON submissions (model_id)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_evaluations_published ON evaluations (published)"
    )
    db.execute(
        """
        UPDATE submissions
        SET model_name_snapshot = title
        WHERE model_name_snapshot IS NULL OR TRIM(model_name_snapshot) = ''
        """
    )
    db.commit()


def init_db() -> None:
    ensure_storage()
    db = get_db()
    has_existing_schema = any(
        table_exists(name)
        for name in ("users", "submissions", "leaderboard_entries", "evaluations", "evaluation_episodes")
    )
    if has_existing_schema:
        # Upgrade legacy databases before applying the current schema script, because the
        # script creates indexes on columns that older tables might not have yet.
        migrate_schema()

    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    db.executescript(schema_sql)
    db.commit()
    migrate_schema()
    seed_admin()
    seed_baselines()


def set_user_access_token(user_id: int, raw_token: str | None = None) -> str:
    token = raw_token or generate_access_token()
    execute(
        "UPDATE users SET access_token_hash = ?, access_token_hint = ? WHERE id = ?",
        (hash_token(token), token_hint(token), user_id),
    )
    return token


def seed_admin() -> None:
    existing_admin = fetchone("SELECT id, access_token_hash FROM users WHERE role = 'admin' LIMIT 1")
    if existing_admin:
        if not existing_admin.get("access_token_hash"):
            set_user_access_token(existing_admin["id"], DEFAULT_ADMIN_TOKEN)
        return

    cursor = execute(
        """
        INSERT INTO users (
            username,
            email,
            password_hash,
            access_token_hash,
            access_token_hint,
            role,
            affiliation,
            bio,
            is_active,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, 1, ?)
        """,
        (
            DEFAULT_ADMIN_USERNAME,
            DEFAULT_ADMIN_EMAIL,
            "",
            hash_token(DEFAULT_ADMIN_TOKEN),
            token_hint(DEFAULT_ADMIN_TOKEN),
            "RoboSynChallenge Operations",
            "Bootstrap administrator account. Change the access token before public deployment.",
            now_iso(),
        ),
    )
    if cursor.lastrowid:
        set_user_access_token(cursor.lastrowid, DEFAULT_ADMIN_TOKEN)


def seed_baselines() -> None:
    placeholder_ids = fetchall(
        "SELECT id FROM leaderboard_entries WHERE source_kind = 'baseline' AND is_placeholder = 1"
    )
    if placeholder_ids:
        for row in placeholder_ids:
            execute(
                "DELETE FROM leaderboard_entries WHERE id = ?",
                (row["id"],),
            )

    demo_video_name = "demo-eval.mp4"
    for seed in BASELINE_SEEDS:
        timestamp = now_iso()
        cursor = execute(
            """
            INSERT INTO leaderboard_entries (
                submission_id,
                model_name,
                username_display,
                affiliation,
                track,
                data_regime,
                source_kind,
                success_rate,
                action_steps,
                real_time,
                notes,
                is_placeholder,
                is_published,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'baseline', ?, ?, ?, ?, 1, 1, ?, ?)
            """,
            (
                None,
                seed["model_name"],
                seed["username_display"],
                seed["affiliation"],
                seed["track"],
                seed["data_regime"],
                seed["success_rate"],
                seed["action_steps"],
                seed["real_time"],
                seed["notes"],
                timestamp,
                timestamp,
            ),
        )
        leaderboard_entry_id = cursor.lastrowid
        eval_cursor = execute(
            """
            INSERT INTO evaluations (
                submission_id,
                leaderboard_entry_id,
                result_title,
                schedule_at,
                status,
                success_rate,
                action_steps,
                real_time,
                notes,
                published,
                published_at,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?, 1, ?, ?, ?)
            """,
            (
                None,
                leaderboard_entry_id,
                f"{seed['model_name']} · {seed['track']}",
                "2026-09-16T09:00",
                seed["success_rate"],
                seed["action_steps"],
                seed["real_time"],
                seed["notes"],
                timestamp,
                timestamp,
                timestamp,
            ),
        )
        evaluation_id = eval_cursor.lastrowid
        for index, (_, task_name, note) in enumerate(BASELINE_EPISODES, start=1):
            execute(
                """
                INSERT INTO evaluation_episodes (
                    evaluation_id,
                    episode_index,
                    task_name,
                    notes,
                    video_filename,
                    duration_seconds,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    evaluation_id,
                    index,
                    task_name,
                    note,
                    demo_video_name,
                    12.0,
                    timestamp,
                ),
            )


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if g.user is None:
            flash("Please sign in to continue.", "warning")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapped_view


def admin_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if g.user is None:
            flash("Administrator access required.", "warning")
            return redirect(url_for("login", next=request.path))
        if g.user["role"] != "admin":
            abort(403)
        return view(*args, **kwargs)

    return wrapped_view


def allowed_file(filename: str, allowed_extensions: set[str]) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_extensions


def save_upload(storage, destination: Path) -> tuple[str | None, str | None]:
    if storage is None or not storage.filename:
        return None, None
    if not allowed_file(storage.filename, ALLOWED_POLICY_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS):
        return None, None
    original_name = storage.filename
    extension = original_name.rsplit(".", 1)[1].lower()
    saved_name = f"{uuid.uuid4().hex}-{secure_filename(Path(original_name).stem)}.{extension}"
    storage.save(destination / saved_name)
    return saved_name, original_name


def parse_json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return value if isinstance(value, list) else []


def parse_json_dict(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def infer_track(data_sources: list[str]) -> tuple[str, str]:
    has_real = "official_real" in data_sources
    has_sim = "official_simulated" in data_sources
    if has_real and has_sim:
        return "hybrid", "Official sim + real"
    if has_real:
        return "real-only", "Official real only"
    if has_sim:
        return "sim-only", "Official sim only"
    return "custom", "Custom data mix"


def parse_int(value: str | None, field_name: str, errors: list[str]) -> int | None:
    try:
        parsed = int(str(value).strip())
        if parsed <= 0:
            raise ValueError
        return parsed
    except (TypeError, ValueError):
        errors.append(f"{field_name} must be a positive integer.")
        return None


def parse_float(value: str | None, field_name: str, errors: list[str]) -> float | None:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        errors.append(f"{field_name} must be a valid number.")
        return None


def validate_external_url(
    value: str | None,
    field_name: str,
    errors: list[str],
    *,
    allowed_hosts: set[str] | None = None,
) -> str | None:
    cleaned = (value or "").strip()
    if not cleaned:
        return None
    parsed = urlparse(cleaned)
    host = parsed.netloc.lower().replace("www.", "")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        errors.append(f"{field_name} must be a valid http or https URL.")
        return None
    if allowed_hosts and host not in allowed_hosts:
        allowed_text = ", ".join(sorted(allowed_hosts))
        errors.append(f"{field_name} must point to one of: {allowed_text}.")
        return None
    return cleaned


def get_user_model(model_id: int, user_id: int) -> dict[str, Any] | None:
    return fetchone(
        """
        SELECT *
        FROM participant_models
        WHERE id = ? AND user_id = ?
        """,
        (model_id, user_id),
    )


def collect_submission_payload() -> tuple[dict[str, Any], list[str]]:
    form = request.form
    errors: list[str] = []

    title = form.get("title", "").strip()
    short_description = form.get("short_description", "").strip()
    technical_notes = form.get("technical_notes", "").strip()
    other_data_source_text = form.get("other_data_source_text", "").strip()
    model_id = parse_int(form.get("model_id"), "Base model", errors)
    is_ranked = bool(form.get("is_ranked"))

    if not title:
        errors.append("Experiment name is required.")
    if not short_description:
        errors.append("Short description is required.")

    data_sources = [
        key
        for key in ("official_real", "official_simulated", "other")
        if form.get(f"data_source_{key}")
    ]
    if not data_sources:
        errors.append("Select at least one data source.")
    if "other" in data_sources and not other_data_source_text:
        errors.append("Describe your additional data sources.")

    input_state = [
        key for key in ("joints", "gripper", "eef_pose") if form.get(f"input_state_{key}")
    ]
    input_images = [
        key
        for key in ("cam_high", "cam_left_wrist", "cam_right_wrist")
        if form.get(f"input_image_{key}")
    ]
    if not input_state and not input_images:
        errors.append("Choose at least one input modality.")
    input_rotation_format = form.get("input_rotation_format", "rot6d")

    output_spec = {
        "joints": {
            "enabled": bool(form.get("output_joints")),
            "delta": bool(form.get("output_joints_delta")),
        },
        "gripper": {
            "enabled": bool(form.get("output_gripper")),
            "delta": bool(form.get("output_gripper_delta")),
        },
        "eef_pose": {
            "enabled": bool(form.get("output_eef_pose")),
            "delta": bool(form.get("output_eef_pose_delta")),
        },
    }
    output_rotation_format = form.get("output_rotation_format", "rot6d")

    valid_bundle = (
        output_spec["joints"]["enabled"] and output_spec["gripper"]["enabled"]
    ) or (output_spec["eef_pose"]["enabled"] and output_spec["gripper"]["enabled"])
    if not valid_bundle:
        errors.append(
            "Output action must include full joints + gripper or full eef pose + gripper."
        )

    output_chunk_size = parse_int(form.get("output_chunk_size"), "Output chunk size", errors)
    execution_chunk_size = parse_int(
        form.get("execution_chunk_size"), "Execution chunk size", errors
    )
    gripper_threshold = parse_float(
        form.get("gripper_threshold"), "Gripper threshold", errors
    )

    if gripper_threshold is not None and not (0.0 <= gripper_threshold <= 0.1):
        errors.append("Gripper threshold must be between 0 and 0.1.")
    if (
        output_chunk_size is not None
        and execution_chunk_size is not None
        and execution_chunk_size >= output_chunk_size
    ):
        errors.append("Execution chunk size must be smaller than output chunk size.")

    linked_model = get_user_model(model_id, g.user["id"]) if model_id is not None and g.user else None
    if model_id is not None and linked_model is None:
        errors.append("Select a valid base model from your model registry.")

    return (
        {
            "model_id": model_id,
            "model_name_snapshot": linked_model["display_name"] if linked_model else None,
            "title": title,
            "short_description": short_description,
            "policy_filename": None,
            "policy_original_name": None,
            "endpoint_url": None,
            "repo_url": linked_model["code_link"] if linked_model else None,
            "technical_notes": technical_notes,
            "data_sources_json": json.dumps(data_sources),
            "other_data_source_text": other_data_source_text,
            "input_state_json": json.dumps(input_state),
            "input_image_json": json.dumps(input_images),
            "input_rotation_format": input_rotation_format if "eef_pose" in input_state else None,
            "output_json": json.dumps(output_spec),
            "output_rotation_format": (
                output_rotation_format if output_spec["eef_pose"]["enabled"] else None
            ),
            "output_chunk_size": output_chunk_size,
            "gripper_threshold": gripper_threshold,
            "execution_chunk_size": execution_chunk_size,
            "is_ranked": int(is_ranked),
        },
        errors,
    )


def collect_model_payload(
    *,
    existing_model: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    display_name = request.form.get("display_name", "").strip()
    checkpoint_link = validate_external_url(
        request.form.get("checkpoint_link"),
        "Checkpoint link",
        errors,
        allowed_hosts=ALLOWED_MODEL_LINK_HOSTS,
    )
    code_link = validate_external_url(
        request.form.get("code_link"),
        "Code link",
        errors,
        allowed_hosts=ALLOWED_MODEL_LINK_HOSTS,
    )

    if not display_name:
        errors.append("Base model name is required.")
    duplicate = fetchone(
        """
        SELECT id
        FROM participant_models
        WHERE user_id = ? AND display_name = ?
        """,
        (g.user["id"], display_name),
    )
    if duplicate and (existing_model is None or duplicate["id"] != existing_model["id"]):
        errors.append("You already have a model with that display name.")
    if not checkpoint_link and not code_link:
        errors.append("Provide at least one Hugging Face or GitHub link.")

    return (
        {
            "display_name": display_name,
            "checkpoint_link": checkpoint_link,
            "code_link": code_link,
        },
        errors,
    )


def hydrate_submission(row: dict[str, Any]) -> dict[str, Any]:
    submission = dict(row)
    data_sources = parse_json_list(submission.get("data_sources_json"))
    input_state = parse_json_list(submission.get("input_state_json"))
    input_images = parse_json_list(submission.get("input_image_json"))
    output_spec = parse_json_dict(submission.get("output_json"))
    submission["data_sources"] = [DATA_SOURCE_LABELS[key] for key in data_sources if key in DATA_SOURCE_LABELS]
    submission["data_sources_raw"] = data_sources
    submission["input_state"] = [STATE_LABELS[key] for key in input_state if key in STATE_LABELS]
    submission["input_images"] = [IMAGE_LABELS[key] for key in input_images if key in IMAGE_LABELS]
    rendered_output: list[str] = []
    for key, label in STATE_LABELS.items():
        spec = output_spec.get(key, {})
        if spec.get("enabled"):
            suffix = " (delta)" if spec.get("delta") else ""
            rendered_output.append(f"{label}{suffix}")
    submission["output_actions"] = rendered_output
    submission["track"], submission["data_regime"] = infer_track(data_sources)
    submission["is_ranked"] = int(submission.get("is_ranked") or 0)
    submission["ranking_label"] = RANKING_LABELS.get(submission["is_ranked"], "Test run")
    submission["display_name"] = (
        submission.get("model_name_snapshot")
        or submission.get("model_display_name")
        or submission.get("title")
    )
    return submission


def human_status(status: str | None) -> str:
    if not status:
        return "Unknown"
    return STATUS_LABELS.get(status, status.replace("-", " ").title())


def leaderboard_rows(limit: int | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT
            le.*,
            ev.id AS evaluation_id,
            ev.status AS evaluation_status,
            ev.published AS evaluation_published
        FROM leaderboard_entries le
        LEFT JOIN evaluations ev ON ev.leaderboard_entry_id = le.id
        WHERE le.is_published = 1
        ORDER BY
            CASE WHEN le.success_rate IS NULL THEN 1 ELSE 0 END,
            le.success_rate DESC,
            CASE WHEN le.action_steps IS NULL THEN 1 ELSE 0 END,
            le.action_steps ASC,
            CASE WHEN le.real_time IS NULL THEN 1 ELSE 0 END,
            le.real_time ASC
    """
    if limit is not None:
        query += f" LIMIT {int(limit)}"
    rows = fetchall(query)
    for row in rows:
        row["track_label"] = TRACK_LABELS.get(row["track"], row["track"])
        row["rank_badge"] = "Placeholder" if row["is_placeholder"] else "Official"
        row["result_url"] = (
            url_for("result_viewer", evaluation_id=row["evaluation_id"])
            if row.get("evaluation_id") and row.get("evaluation_published")
            else None
        )
    return rows


def participant_models_for_user(user_id: int) -> list[dict[str, Any]]:
    return fetchall(
        """
        SELECT *
        FROM participant_models
        WHERE user_id = ?
        ORDER BY updated_at DESC, created_at DESC
        """,
        (user_id,),
    )


def get_submission_with_owner(submission_id: int) -> dict[str, Any] | None:
    row = fetchone(
        """
        SELECT
            s.*,
            u.username,
            u.email,
            u.affiliation AS user_affiliation,
            pm.display_name AS model_display_name,
            pm.checkpoint_link,
            pm.code_link,
            e.id AS evaluation_id,
            e.schedule_at AS evaluation_schedule_at,
            e.status AS evaluation_status,
            e.success_rate,
            e.action_steps,
            e.real_time,
            e.notes AS evaluation_notes,
            e.published AS evaluation_published
        FROM submissions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN participant_models pm ON pm.id = s.model_id
        LEFT JOIN evaluations e ON e.submission_id = s.id
        WHERE s.id = ?
        """,
        (submission_id,),
    )
    return hydrate_submission(row) if row else None


def get_or_create_evaluation_for_submission(submission: dict[str, Any]) -> dict[str, Any]:
    existing = fetchone("SELECT * FROM evaluations WHERE submission_id = ?", (submission["id"],))
    if existing:
        return existing
    timestamp = now_iso()
    cursor = execute(
        """
        INSERT INTO evaluations (
            submission_id,
            leaderboard_entry_id,
            result_title,
            schedule_at,
            status,
            success_rate,
            action_steps,
            real_time,
            notes,
            published,
            published_at,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, 'submitted', NULL, NULL, NULL, NULL, 0, NULL, ?, ?)
        """,
        (submission["id"], None, submission["display_name"], None, timestamp, timestamp),
    )
    return fetchone("SELECT * FROM evaluations WHERE id = ?", (cursor.lastrowid,))


def create_or_update_leaderboard_entry(submission: dict[str, Any], evaluation: dict[str, Any]) -> None:
    track, data_regime = infer_track(submission["data_sources_raw"])
    timestamp = now_iso()
    existing = fetchone(
        "SELECT * FROM leaderboard_entries WHERE submission_id = ?", (submission["id"],)
    )
    if existing:
        execute(
            """
            UPDATE leaderboard_entries
            SET model_name = ?, username_display = ?, affiliation = ?, track = ?, data_regime = ?,
                source_kind = 'submission', success_rate = ?, action_steps = ?, real_time = ?, notes = ?,
                is_placeholder = 0, is_published = ?, updated_at = ?
            WHERE submission_id = ?
            """,
            (
                submission["display_name"],
                submission["username"],
                submission["user_affiliation"],
                track,
                data_regime,
                evaluation["success_rate"],
                evaluation["action_steps"],
                evaluation["real_time"],
                evaluation["notes"],
                int(bool(evaluation["published"])),
                timestamp,
                submission["id"],
            ),
        )
        leaderboard_id = existing["id"]
    else:
        cursor = execute(
            """
            INSERT INTO leaderboard_entries (
                submission_id,
                model_name,
                username_display,
                affiliation,
                track,
                data_regime,
                source_kind,
                success_rate,
                action_steps,
                real_time,
                notes,
                is_placeholder,
                is_published,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'submission', ?, ?, ?, ?, 0, ?, ?, ?)
            """,
            (
                submission["id"],
                submission["display_name"],
                submission["username"],
                submission["user_affiliation"],
                track,
                data_regime,
                evaluation["success_rate"],
                evaluation["action_steps"],
                evaluation["real_time"],
                evaluation["notes"],
                int(bool(evaluation["published"])),
                timestamp,
                timestamp,
            ),
        )
        leaderboard_id = cursor.lastrowid

    execute(
        "UPDATE evaluations SET leaderboard_entry_id = ?, updated_at = ? WHERE id = ?",
        (leaderboard_id, timestamp, evaluation["id"]),
    )


def hide_submission_from_leaderboard(submission_id: int) -> None:
    execute(
        "UPDATE leaderboard_entries SET is_published = 0, updated_at = ? WHERE submission_id = ?",
        (now_iso(), submission_id),
    )


def can_access_submission(submission: dict[str, Any]) -> bool:
    if g.user is None:
        return False
    if g.user["role"] == "admin":
        return True
    return submission["user_id"] == g.user["id"]


def format_datetime(value: str | None) -> str:
    if not value:
        return "TBD"
    try:
        return datetime.fromisoformat(value).strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return value


def episode_payload(episodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for episode in episodes:
        video_url = episode.get("video_url")
        if not video_url and episode.get("video_filename"):
            video_url = url_for("result_video", filename=episode["video_filename"])
        payload.append(
            {
                "episode_index": episode["episode_index"],
                "task_name": episode["task_name"],
                "notes": episode.get("notes") or "",
                "duration_seconds": episode.get("duration_seconds") or 0,
                "video_url": video_url,
            }
        )
    return payload


@app.before_request
def load_logged_in_user() -> None:
    user_id = session.get("user_id")
    g.user = (
        fetchone("SELECT * FROM users WHERE id = ? AND is_active = 1", (user_id,))
        if user_id
        else None
    )


@app.template_filter("human_time")
def human_time_filter(value: float | int | None) -> str:
    if value is None:
        return "TBD"
    return f"{value:.1f}s" if isinstance(value, float) else f"{value}s"


@app.template_filter("human_status")
def human_status_filter(value: str | None) -> str:
    return human_status(value)


@app.template_filter("human_datetime")
def human_datetime_filter(value: str | None) -> str:
    return format_datetime(value)


@app.context_processor
def inject_globals() -> dict[str, Any]:
    return {
        "home_stats": HOME_STATS,
        "task_tiers": TASK_TIERS,
        "rotation_labels": ROTATION_LABELS,
        "track_labels": TRACK_LABELS,
        "ranking_labels": RANKING_LABELS,
        "dataset_url": HUGGING_FACE_URL,
        "dataset_label": HUGGING_FACE_LABEL,
        "simulation_repo_url": SIMULATION_REPO_URL,
        "contact_email": DEFAULT_ADMIN_EMAIL,
        "current_year": datetime.now().year,
    }


@app.route("/")
def home():
    preview = leaderboard_rows(limit=5)
    return render_template(
        "home.html",
        top_entries=preview,
        evaluation_variations=EVALUATION_VARIATIONS,
    )


@app.route("/data")
def data_page():
    return render_template(
        "data.html",
        real_collection_conditions=REAL_COLLECTION_CONDITIONS,
        sim_randomization=SIM_RANDOMIZATION,
    )


@app.route("/benchmark")
def benchmark_page():
    return redirect(url_for("leaderboard_page"))


@app.route("/evaluation", methods=["GET", "POST"])
def evaluation_page():
    available_models = participant_models_for_user(g.user["id"]) if g.user else []
    if request.method == "POST":
        if g.user is None:
            flash("Sign in before submitting an evaluation run.", "warning")
            return redirect(url_for("login", next=url_for("evaluation_page")))
        if not available_models:
            flash("Create at least one base model before submitting for evaluation.", "warning")
            return redirect(url_for("my_models"))

        payload, errors = collect_submission_payload()
        if errors:
            for error in errors:
                flash(error, "error")
        else:
            timestamp = now_iso()
            cursor = execute(
                """
                INSERT INTO submissions (
                    user_id,
                    model_id,
                    model_name_snapshot,
                    title,
                    short_description,
                    policy_filename,
                    policy_original_name,
                    endpoint_url,
                    repo_url,
                    technical_notes,
                    data_sources_json,
                    other_data_source_text,
                    input_state_json,
                    input_image_json,
                    input_rotation_format,
                    output_json,
                    output_rotation_format,
                    output_chunk_size,
                    gripper_threshold,
                    execution_chunk_size,
                    is_ranked,
                    status,
                    schedule_at,
                    admin_schedule_note,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', NULL, NULL, ?, ?)
                """,
                (
                    g.user["id"],
                    payload["model_id"],
                    payload["model_name_snapshot"],
                    payload["title"],
                    payload["short_description"],
                    payload["policy_filename"],
                    payload["policy_original_name"],
                    payload["endpoint_url"],
                    payload["repo_url"],
                    payload["technical_notes"],
                    payload["data_sources_json"],
                    payload["other_data_source_text"],
                    payload["input_state_json"],
                    payload["input_image_json"],
                    payload["input_rotation_format"],
                    payload["output_json"],
                    payload["output_rotation_format"],
                    payload["output_chunk_size"],
                    payload["gripper_threshold"],
                    payload["execution_chunk_size"],
                    payload["is_ranked"],
                    timestamp,
                    timestamp,
                ),
            )
            flash("Evaluation request received. The admin team can now schedule evaluation.", "success")
            return redirect(url_for("submission_detail", submission_id=cursor.lastrowid))

    return render_template(
        "evaluation.html",
        state_labels=STATE_LABELS,
        image_labels=IMAGE_LABELS,
        data_source_labels=DATA_SOURCE_LABELS,
        available_models=available_models,
    )


@app.route("/leaderboard")
def leaderboard_page():
    rows = leaderboard_rows()
    return render_template("leaderboard.html", rows=rows)


@app.route("/models", methods=["GET", "POST"])
@login_required
def my_models():
    if request.method == "POST":
        payload, errors = collect_model_payload()
        if errors:
            for error in errors:
                flash(error, "error")
        else:
            timestamp = now_iso()
            execute(
                """
                INSERT INTO participant_models (
                    user_id,
                    display_name,
                    checkpoint_link,
                    code_link,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    g.user["id"],
                    payload["display_name"],
                    payload["checkpoint_link"],
                    payload["code_link"],
                    timestamp,
                    timestamp,
                ),
            )
            flash("Base model saved to your model registry.", "success")
            return redirect(url_for("my_models"))

    models = participant_models_for_user(g.user["id"])
    return render_template("models.html", models=models)


@app.route("/models/<int:model_id>/edit", methods=["POST"])
@login_required
def edit_model(model_id: int):
    existing_model = get_user_model(model_id, g.user["id"])
    if existing_model is None:
        abort(404)
    payload, errors = collect_model_payload(existing_model=existing_model)
    if errors:
        for error in errors:
            flash(error, "error")
    else:
        execute(
            """
            UPDATE participant_models
            SET display_name = ?, checkpoint_link = ?, code_link = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                payload["display_name"],
                payload["checkpoint_link"],
                payload["code_link"],
                now_iso(),
                model_id,
                g.user["id"],
            ),
        )
        flash("Base model updated.", "success")
    return redirect(url_for("my_models"))


@app.route("/models/<int:model_id>/delete", methods=["POST"])
@login_required
def delete_model(model_id: int):
    existing_model = get_user_model(model_id, g.user["id"])
    if existing_model is None:
        abort(404)
    execute("DELETE FROM participant_models WHERE id = ? AND user_id = ?", (model_id, g.user["id"]))
    flash("Base model removed.", "success")
    return redirect(url_for("my_models"))


@app.route("/dashboard")
@login_required
def dashboard():
    submissions = fetchall(
        """
        SELECT
            s.*,
            pm.display_name AS model_display_name,
            pm.checkpoint_link,
            pm.code_link,
            e.id AS evaluation_id,
            e.status AS evaluation_status,
            e.schedule_at AS evaluation_schedule_at,
            e.published AS evaluation_published
        FROM submissions s
        LEFT JOIN participant_models pm ON pm.id = s.model_id
        LEFT JOIN evaluations e ON e.submission_id = s.id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC
        """,
        (g.user["id"],),
    )
    hydrated = [hydrate_submission(submission) for submission in submissions]
    return render_template("dashboard.html", submissions=hydrated)


@app.route("/submission/<int:submission_id>")
@login_required
def submission_detail(submission_id: int):
    submission = get_submission_with_owner(submission_id)
    if submission is None:
        abort(404)
    if not can_access_submission(submission):
        abort(403)
    episodes = (
        fetchall(
            """
            SELECT * FROM evaluation_episodes
            WHERE evaluation_id = ?
            ORDER BY episode_index ASC
            """,
            (submission["evaluation_id"],),
        )
        if submission.get("evaluation_id")
        else []
    )
    return render_template("submission_detail.html", submission=submission, episodes=episodes)


@app.route("/results/<int:evaluation_id>")
def result_viewer(evaluation_id: int):
    evaluation = fetchone(
        """
        SELECT
            e.*,
            s.id AS submission_id,
            s.user_id,
            s.title AS submission_title,
            s.model_name_snapshot,
            s.short_description,
            s.data_sources_json,
            u.username,
            le.model_name,
            le.username_display,
            le.track,
            le.data_regime,
            le.source_kind,
            le.notes AS leaderboard_notes
        FROM evaluations e
        LEFT JOIN submissions s ON s.id = e.submission_id
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN leaderboard_entries le ON le.id = e.leaderboard_entry_id
        WHERE e.id = ?
        """,
        (evaluation_id,),
    )
    if evaluation is None:
        abort(404)

    is_owner = g.user and evaluation.get("user_id") == g.user["id"]
    is_admin = g.user and g.user["role"] == "admin"
    if not evaluation["published"] and not is_owner and not is_admin:
        abort(403)

    episodes = fetchall(
        """
        SELECT * FROM evaluation_episodes
        WHERE evaluation_id = ?
        ORDER BY episode_index ASC
        """,
        (evaluation_id,),
    )
    if not episodes:
        episodes = [
            {
                "episode_index": 1,
                "task_name": "Awaiting video upload",
                "notes": "The administrator has not uploaded episode footage yet.",
                "video_filename": None,
                "video_url": None,
                "duration_seconds": 0,
            }
        ]

    evaluation["display_name"] = (
        evaluation.get("model_name")
        or evaluation.get("model_name_snapshot")
        or evaluation.get("submission_title")
        or evaluation["result_title"]
    )
    if not evaluation.get("track"):
        track, data_regime = infer_track(parse_json_list(evaluation.get("data_sources_json")))
        evaluation["track"] = track
        evaluation["data_regime"] = data_regime
    evaluation["track_label"] = TRACK_LABELS.get(evaluation.get("track"), evaluation.get("track"))
    return render_template(
        "results.html",
        evaluation=evaluation,
        episodes=episodes,
        episode_data=episode_payload(episodes),
    )


@app.route("/register")
def register():
    if g.user is not None:
        return redirect(url_for("dashboard"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if g.user is not None:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        access_token = request.form.get("token", "").strip()
        user = fetchone("SELECT * FROM users WHERE email = ? AND is_active = 1", (email,))
        token_valid = bool(
            user
            and user.get("access_token_hash")
            and secrets.compare_digest(user["access_token_hash"], hash_token(access_token))
        )
        if user is None or not token_valid:
            flash("Invalid email or access token.", "error")
        else:
            session.clear()
            session["user_id"] = user["id"]
            flash("Signed in successfully with your access token.", "success")
            next_url = request.args.get("next")
            return redirect(next_url or url_for("dashboard"))

    return render_template("login.html")


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    session.clear()
    flash("Signed out.", "success")
    return redirect(url_for("home"))


@app.route("/admin", methods=["GET", "POST"])
@admin_required
def admin_dashboard():
    if request.method == "POST":
        form_name = request.form.get("form_name")
        if form_name == "create-baseline":
            errors: list[str] = []
            model_name = request.form.get("model_name", "").strip()
            username_display = request.form.get("username_display", "").strip() or "Official Baseline"
            affiliation = request.form.get("affiliation", "").strip()
            track = request.form.get("track", "hybrid").strip()
            data_regime = request.form.get("data_regime", "").strip() or TRACK_LABELS.get(track, track)
            notes = request.form.get("notes", "").strip()
            success_rate = parse_float(request.form.get("success_rate"), "Success rate", errors)
            action_steps = parse_float(request.form.get("action_steps"), "Action steps", errors)
            real_time = parse_float(request.form.get("real_time"), "Real time", errors)

            if not model_name:
                errors.append("Baseline model name is required.")
            if track not in TRACK_LABELS:
                errors.append("Select a valid track.")

            if errors:
                for error in errors:
                    flash(error, "error")
            else:
                timestamp = now_iso()
                entry_cursor = execute(
                    """
                    INSERT INTO leaderboard_entries (
                        submission_id,
                        model_name,
                        username_display,
                        affiliation,
                        track,
                        data_regime,
                        source_kind,
                        success_rate,
                        action_steps,
                        real_time,
                        notes,
                        is_placeholder,
                        is_published,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'baseline', ?, ?, ?, ?, 0, 1, ?, ?)
                    """,
                    (
                        None,
                        model_name,
                        username_display,
                        affiliation,
                        track,
                        data_regime,
                        success_rate,
                        action_steps,
                        real_time,
                        notes,
                        timestamp,
                        timestamp,
                    ),
                )
                execute(
                    """
                    INSERT INTO evaluations (
                        submission_id,
                        leaderboard_entry_id,
                        result_title,
                        schedule_at,
                        status,
                        success_rate,
                        action_steps,
                        real_time,
                        notes,
                        published,
                        published_at,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?, 1, ?, ?, ?)
                    """,
                    (
                        None,
                        entry_cursor.lastrowid,
                        model_name,
                        now_iso(),
                        success_rate,
                        action_steps,
                        real_time,
                        notes,
                        timestamp,
                        timestamp,
                        timestamp,
                    ),
                )
                flash("Baseline entry added to the leaderboard.", "success")
                return redirect(url_for("admin_dashboard"))

        if form_name == "create-participant":
            errors: list[str] = []
            username = request.form.get("username", "").strip()
            email = request.form.get("email", "").strip().lower()
            affiliation = request.form.get("affiliation", "").strip()
            bio = request.form.get("bio", "").strip()

            if not username:
                errors.append("Username is required.")
            if not email:
                errors.append("Email is required.")
            if fetchone("SELECT id FROM users WHERE username = ?", (username,)):
                errors.append("That username is already taken.")
            if fetchone("SELECT id FROM users WHERE email = ?", (email,)):
                errors.append("That email is already registered.")

            if errors:
                for error in errors:
                    flash(error, "error")
            else:
                cursor = execute(
                    """
                    INSERT INTO users (
                        username,
                        email,
                        password_hash,
                        access_token_hash,
                        access_token_hint,
                        role,
                        affiliation,
                        bio,
                        is_active,
                        created_at
                    )
                    VALUES (?, ?, '', '', '', 'user', ?, ?, 1, ?)
                    """,
                    (username, email, affiliation, bio, now_iso()),
                )
                raw_token = set_user_access_token(cursor.lastrowid)
                session["latest_user_token"] = {
                    "username": username,
                    "email": email,
                    "token": raw_token,
                    "action": "created",
                }
                flash("Participant account created. Copy the token now.", "success")
                return redirect(url_for("admin_dashboard"))

        if form_name == "regenerate-token":
            errors: list[str] = []
            target_user_id = parse_int(request.form.get("user_id"), "Participant", errors)
            target_user = (
                fetchone("SELECT id, username, email FROM users WHERE id = ?", (target_user_id,))
                if target_user_id is not None
                else None
            )
            if target_user is None:
                errors.append("Select a valid participant.")

            if errors:
                for error in errors:
                    flash(error, "error")
            else:
                raw_token = set_user_access_token(target_user["id"])
                session["latest_user_token"] = {
                    "username": target_user["username"],
                    "email": target_user["email"],
                    "token": raw_token,
                    "action": "regenerated",
                }
                flash("Participant token regenerated. Copy the new token now.", "success")
                return redirect(url_for("admin_dashboard"))

    submissions = fetchall(
        """
        SELECT
            s.id,
            s.title,
            s.model_name_snapshot,
            s.is_ranked,
            s.status,
            s.created_at,
            u.username,
            e.id AS evaluation_id,
            e.status AS evaluation_status,
            e.schedule_at AS evaluation_schedule_at,
            e.published AS evaluation_published
        FROM submissions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN evaluations e ON e.submission_id = s.id
        ORDER BY s.created_at DESC
        """
    )
    metrics = {
        "users": fetchone("SELECT COUNT(*) AS count FROM users")["count"],
        "submissions": fetchone("SELECT COUNT(*) AS count FROM submissions")["count"],
        "published_results": fetchone("SELECT COUNT(*) AS count FROM evaluations WHERE published = 1")[
            "count"
        ],
        "leaderboard_entries": fetchone(
            "SELECT COUNT(*) AS count FROM leaderboard_entries WHERE is_published = 1"
        )["count"],
    }
    participants = fetchall(
        """
        SELECT id, username, email, affiliation, role, access_token_hint, created_at
        FROM users
        WHERE role != 'admin'
        ORDER BY created_at DESC
        """
    )
    latest_token = session.pop("latest_user_token", None)
    return render_template(
        "admin.html",
        submissions=submissions,
        metrics=metrics,
        participants=participants,
        latest_token=latest_token,
    )


@app.route("/admin/submissions/<int:submission_id>", methods=["GET", "POST"])
@admin_required
def admin_submission(submission_id: int):
    submission = get_submission_with_owner(submission_id)
    if submission is None:
        abort(404)

    evaluation = get_or_create_evaluation_for_submission(submission)
    if request.method == "POST":
        form_name = request.form.get("form_name")
        if form_name == "update-evaluation":
            errors: list[str] = []
            status = request.form.get("status", "submitted").strip()
            if status not in STATUS_LABELS:
                errors.append("Select a valid evaluation status.")
            schedule_at = request.form.get("schedule_at", "").strip() or None
            notes = request.form.get("notes", "").strip() or None
            admin_schedule_note = request.form.get("admin_schedule_note", "").strip() or None
            published = bool(request.form.get("published"))

            success_rate = request.form.get("success_rate", "").strip()
            action_steps = request.form.get("action_steps", "").strip()
            real_time = request.form.get("real_time", "").strip()

            success_rate_value = (
                parse_float(success_rate, "Success rate", errors) if success_rate else None
            )
            action_steps_value = (
                parse_float(action_steps, "Action steps", errors) if action_steps else None
            )
            real_time_value = parse_float(real_time, "Real time", errors) if real_time else None

            if published and None in (success_rate_value, action_steps_value, real_time_value):
                errors.append("Published results require success rate, action steps, and real time.")
            if not published and status == "published":
                status = "completed"

            if errors:
                for error in errors:
                    flash(error, "error")
            else:
                timestamp = now_iso()
                execute(
                    """
                    UPDATE evaluations
                    SET schedule_at = ?, status = ?, success_rate = ?, action_steps = ?, real_time = ?,
                        notes = ?, published = ?, published_at = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        schedule_at,
                        status,
                        success_rate_value,
                        action_steps_value,
                        real_time_value,
                        notes,
                        int(published),
                        timestamp if published else None,
                        timestamp,
                        evaluation["id"],
                    ),
                )
                execute(
                    """
                    UPDATE submissions
                    SET status = ?, schedule_at = ?, admin_schedule_note = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        "published" if published else status,
                        schedule_at,
                        admin_schedule_note,
                        timestamp,
                        submission["id"],
                    ),
                )
                refreshed_submission = get_submission_with_owner(submission_id)
                refreshed_evaluation = fetchone(
                    "SELECT * FROM evaluations WHERE id = ?", (evaluation["id"],)
                )
                if published and refreshed_submission["is_ranked"]:
                    create_or_update_leaderboard_entry(refreshed_submission, refreshed_evaluation)
                else:
                    hide_submission_from_leaderboard(submission["id"])
                flash("Evaluation metadata updated.", "success")
                return redirect(url_for("admin_submission", submission_id=submission_id))

        if form_name == "add-episode":
            errors: list[str] = []
            episode_index = parse_int(request.form.get("episode_index"), "Episode index", errors)
            task_name = request.form.get("task_name", "").strip()
            notes = request.form.get("episode_notes", "").strip()
            upload = request.files.get("episode_video")
            external_video_url = validate_external_url(
                request.form.get("video_url"),
                "Video URL",
                errors,
            )

            if not task_name:
                errors.append("Task name is required for each episode.")
            if upload and upload.filename and not allowed_file(upload.filename, ALLOWED_VIDEO_EXTENSIONS):
                errors.append("Result video must be mp4, webm, mov, or m4v.")
            if upload and upload.filename and external_video_url:
                errors.append("Use either an uploaded video or an external video URL, not both.")
            if not external_video_url and (upload is None or not upload.filename):
                errors.append("Provide either an uploaded video or an external video URL.")

            saved_name = None
            if not errors and upload and upload.filename:
                original_name = upload.filename
                extension = original_name.rsplit(".", 1)[1].lower()
                saved_name = (
                    f"{uuid.uuid4().hex}-{secure_filename(Path(original_name).stem)}.{extension}"
                )
                upload.save(RESULT_UPLOAD_DIR / saved_name)

            duration_seconds = request.form.get("duration_seconds", "").strip()
            parsed_duration = (
                parse_float(duration_seconds, "Episode duration", errors) if duration_seconds else None
            )

            if errors:
                for error in errors:
                    flash(error, "error")
            else:
                execute(
                    """
                    INSERT INTO evaluation_episodes (
                        evaluation_id,
                        episode_index,
                        task_name,
                        notes,
                        video_filename,
                        video_url,
                        duration_seconds,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        evaluation["id"],
                        episode_index,
                        task_name,
                        notes or None,
                        saved_name,
                        external_video_url,
                        parsed_duration,
                        now_iso(),
                    ),
                )
                flash("Episode footage added to the result viewer.", "success")
                return redirect(url_for("admin_submission", submission_id=submission_id))

    episodes = fetchall(
        """
        SELECT * FROM evaluation_episodes
        WHERE evaluation_id = ?
        ORDER BY episode_index ASC
        """,
        (evaluation["id"],),
    )
    return render_template(
        "admin_submission.html",
        submission=submission,
        evaluation=evaluation,
        episodes=episodes,
    )


@app.route("/admin/episodes/<int:episode_id>/delete", methods=["POST"])
@admin_required
def admin_delete_episode(episode_id: int):
    episode = fetchone("SELECT * FROM evaluation_episodes WHERE id = ?", (episode_id,))
    if episode is None:
        abort(404)
    if episode.get("video_filename"):
        video_path = RESULT_UPLOAD_DIR / episode["video_filename"]
        if video_path.exists():
            video_path.unlink()
    execute("DELETE FROM evaluation_episodes WHERE id = ?", (episode_id,))
    flash("Episode deleted.", "success")
    return redirect(request.referrer or url_for("admin_dashboard"))


@app.route("/admin/policy/<int:submission_id>/download")
@admin_required
def admin_download_policy(submission_id: int):
    submission = fetchone(
        "SELECT policy_filename, policy_original_name FROM submissions WHERE id = ?",
        (submission_id,),
    )
    if submission is None or not submission["policy_filename"]:
        abort(404)
    return send_from_directory(
        POLICY_UPLOAD_DIR,
        submission["policy_filename"],
        as_attachment=True,
        download_name=submission["policy_original_name"] or submission["policy_filename"],
    )


@app.route("/results/video/<path:filename>")
def result_video(filename: str):
    episode = fetchone(
        """
        SELECT ee.id, ev.published, s.user_id
        FROM evaluation_episodes ee
        JOIN evaluations ev ON ev.id = ee.evaluation_id
        LEFT JOIN submissions s ON s.id = ev.submission_id
        WHERE ee.video_filename = ?
        LIMIT 1
        """,
        (filename,),
    )
    if episode is None:
        abort(404)
    is_owner = g.user and episode.get("user_id") == g.user["id"]
    is_admin = g.user and g.user["role"] == "admin"
    if not episode["published"] and not is_owner and not is_admin:
        abort(403)

    file_path = RESULT_UPLOAD_DIR / filename
    if not file_path.exists():
        abort(404)
    return send_from_directory(RESULT_UPLOAD_DIR, filename, as_attachment=False)


@app.route("/api/leaderboard/leaderboard_all.json")
def leaderboard_json():
    rows = leaderboard_rows()
    payload = [
        {
            "model_name": row["model_name"],
            "username_display": row["username_display"],
            "affiliation": row.get("affiliation"),
            "track": row["track"],
            "track_label": row["track_label"],
            "data_regime": row["data_regime"],
            "success_rate": row.get("success_rate"),
            "action_steps": row.get("action_steps"),
            "real_time": row.get("real_time"),
            "result_url": row.get("result_url"),
            "evaluation_id": row.get("evaluation_id"),
        }
        for row in rows
    ]
    return jsonify(payload)


@app.route("/api/results/published.json")
def published_results_json():
    rows = fetchall(
        """
        SELECT
            e.id,
            e.result_title,
            e.schedule_at,
            e.success_rate,
            e.action_steps,
            e.real_time,
            e.published_at,
            s.data_sources_json,
            le.model_name,
            le.track,
            le.data_regime
        FROM evaluations e
        LEFT JOIN submissions s ON s.id = e.submission_id
        LEFT JOIN leaderboard_entries le ON le.id = e.leaderboard_entry_id
        WHERE e.published = 1
        ORDER BY e.published_at DESC, e.id DESC
        """
    )
    payload = []
    for row in rows:
        track = row.get("track")
        data_regime = row.get("data_regime")
        if not track:
            track, data_regime = infer_track(parse_json_list(row.get("data_sources_json")))
        payload.append(
            {
                "evaluation_id": row["id"],
                "display_name": row.get("model_name") or row["result_title"],
                "track": track,
                "track_label": TRACK_LABELS.get(track, track),
                "data_regime": data_regime,
                "success_rate": row.get("success_rate"),
                "action_steps": row.get("action_steps"),
                "real_time": row.get("real_time"),
                "published_at": row.get("published_at"),
                "result_url": url_for("result_viewer", evaluation_id=row["id"]),
            }
        )
    return jsonify(payload)


@app.route("/api/results/<int:evaluation_id>.json")
def result_detail_json(evaluation_id: int):
    evaluation = fetchone(
        """
        SELECT
            e.*,
            s.user_id,
            s.title AS submission_title,
            s.model_name_snapshot,
            le.model_name,
            le.track,
            le.data_regime
        FROM evaluations e
        LEFT JOIN submissions s ON s.id = e.submission_id
        LEFT JOIN leaderboard_entries le ON le.id = e.leaderboard_entry_id
        WHERE e.id = ?
        """,
        (evaluation_id,),
    )
    if evaluation is None:
        abort(404)

    is_owner = g.user and evaluation.get("user_id") == g.user["id"]
    is_admin = g.user and g.user["role"] == "admin"
    if not evaluation["published"] and not is_owner and not is_admin:
        abort(403)

    episodes = fetchall(
        """
        SELECT *
        FROM evaluation_episodes
        WHERE evaluation_id = ?
        ORDER BY episode_index ASC
        """,
        (evaluation_id,),
    )
    track = evaluation.get("track")
    data_regime = evaluation.get("data_regime")
    if not track and evaluation.get("submission_id"):
        submission_row = fetchone(
            "SELECT data_sources_json FROM submissions WHERE id = ?",
            (evaluation["submission_id"],),
        )
        if submission_row:
            track, data_regime = infer_track(parse_json_list(submission_row.get("data_sources_json")))
    return jsonify(
        {
            "evaluation_id": evaluation["id"],
            "display_name": evaluation.get("model_name")
            or evaluation.get("model_name_snapshot")
            or evaluation.get("submission_title")
            or evaluation["result_title"],
            "track": track,
            "track_label": TRACK_LABELS.get(track, track),
            "data_regime": data_regime,
            "status": evaluation.get("status"),
            "success_rate": evaluation.get("success_rate"),
            "action_steps": evaluation.get("action_steps"),
            "real_time": evaluation.get("real_time"),
            "episodes": episode_payload(episodes),
        }
    )
@app.route("/health")
def health():
    return {"ok": True, "service": "RoboSynChallenge"}


@app.errorhandler(403)
def forbidden(_: Any):
    return render_template("error.html", code=403, message="Access denied."), 403


@app.errorhandler(404)
def not_found(_: Any):
    return render_template("error.html", code=404, message="Page not found."), 404


with app.app_context():
    init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
