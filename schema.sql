PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    access_token_hash TEXT,
    access_token_hint TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    affiliation TEXT,
    bio TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participant_models (
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

CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model_id INTEGER,
    model_name_snapshot TEXT,
    title TEXT NOT NULL,
    short_description TEXT NOT NULL,
    policy_filename TEXT,
    policy_original_name TEXT,
    endpoint_url TEXT,
    repo_url TEXT,
    technical_notes TEXT,
    data_sources_json TEXT NOT NULL,
    other_data_source_text TEXT,
    input_state_json TEXT NOT NULL,
    input_image_json TEXT NOT NULL,
    input_rotation_format TEXT,
    output_json TEXT NOT NULL,
    output_rotation_format TEXT,
    output_chunk_size INTEGER NOT NULL,
    gripper_threshold REAL NOT NULL,
    execution_chunk_size INTEGER NOT NULL,
    is_ranked INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'submitted',
    schedule_at TEXT,
    admin_schedule_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES participant_models (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER UNIQUE,
    model_name TEXT NOT NULL,
    username_display TEXT NOT NULL,
    affiliation TEXT,
    track TEXT NOT NULL,
    data_regime TEXT NOT NULL,
    source_kind TEXT NOT NULL DEFAULT 'submission',
    success_rate REAL,
    action_steps REAL,
    real_time REAL,
    notes TEXT,
    is_placeholder INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (submission_id) REFERENCES submissions (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER UNIQUE,
    leaderboard_entry_id INTEGER UNIQUE,
    result_title TEXT NOT NULL,
    schedule_at TEXT,
    status TEXT NOT NULL DEFAULT 'submitted',
    success_rate REAL,
    action_steps REAL,
    real_time REAL,
    notes TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (submission_id) REFERENCES submissions (id) ON DELETE CASCADE,
    FOREIGN KEY (leaderboard_entry_id) REFERENCES leaderboard_entries (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evaluation_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evaluation_id INTEGER NOT NULL,
    episode_index INTEGER NOT NULL,
    task_name TEXT NOT NULL,
    notes TEXT,
    video_filename TEXT,
    video_url TEXT,
    duration_seconds REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (evaluation_id) REFERENCES evaluations (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_participant_models_user_id ON participant_models (user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_model_id ON submissions (model_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions (status);
CREATE INDEX IF NOT EXISTS idx_leaderboard_track ON leaderboard_entries (track);
CREATE INDEX IF NOT EXISTS idx_evaluations_submission_id ON evaluations (submission_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_published ON evaluations (published);
CREATE INDEX IF NOT EXISTS idx_evaluation_episodes_evaluation_id ON evaluation_episodes (evaluation_id);
