# RoboSynChallenge Website

This branch contains the full Flask implementation of the RoboSynChallenge website.

It is the operational source branch for:

- public competition pages
- participant login with email and token
- model registry
- evaluation submission forms
- admin scheduling and publishing
- SQLite-backed persistence

## Stack

- `Flask`
- `SQLite`
- plain `CSS` and `JavaScript`
- optional local video uploads
- optional external video URLs

## Local run

From this repository root:

```bash
./bootstrap.sh
source .venv/bin/activate
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```
