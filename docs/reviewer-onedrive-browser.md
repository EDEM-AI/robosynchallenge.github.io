# Central OneDrive Evidence Upload

Reviewer pages remain part of the existing static website. Apps Script + the existing workbook are the application backend; there is no additional web server.

The archive owner's authorization is already saved privately and installed into the existing Apps Script properties. The verified rclone authorization path does not require a new Entra application or ITSO intervention. The owner authorizes once; evaluators do not repeat Microsoft login. Do not copy the owner's OAuth files or tokens into a branch, submission, participant runtime or browser asset.

ArchiveUpload.gs creates a pre-authenticated Microsoft upload session after validating the assigned request, task, frozen seeds, stage gates and acceptance lock. ZIP bytes flow directly from the terminal to Microsoft in sequential 320-KiB-aligned chunks. A complete remote SHA256 readback precedes final JSON registration. Google stores only ledger rows and small manifests, not ZIPs. The reviewer page has no ZIP or JSON file picker.

The browser uses its existing reviewer login; no MSAL or per-reviewer Microsoft login is needed. Private prepared branches contain an evaluation-upload.json capability, issued by the organizer preparer, hashed in ReviewUploadAccess, scoped to one eligible evaluation and expiring after 60 days. It cannot be used for email, user edits, task assignment or acceptance. With the organizer's explicit authorization, it can also obtain the shared RoboSynChallenge HF read token after matching the current prepared commit. The HF token is stored in Script Properties and used in downloader memory only; it is not a Git file, webpage field or participant-container credential. Keep the whole clone and capability outside the participant runtime. Authorized evaluators can obtain that account-level token and must be trusted with its existing read scope.

## Terminal Workflow

1. Clone the prepared evaluation-specific private branch from the page.
2. Run `python tools/download_checkpoints.py --output /path/to/checkpoints`. Shared HF authorization is automatic; no personal token is requested.
3. Run `python tools/check_environment.py` and `python tools/check_upload.py`.
4. Use the page's task-specific `tools/run_task_evaluation.py` command. Its default behavior generates JSON + ZIP, uploads the ZIP, verifies SHA256 and registers JSON plus the actual command in the workbook.
5. If upload fails, keep the local evidence and rerun `python tools/upload_evidence.py --manifest /path/to/result.json --archive /path/to/evidence.zip`. It resumes upload or verification/registration without rerunning evaluation. Use `--restart` only to replace an unfinished/corrupt upload session. Refresh the reviewer page after success.

Each evaluation/task has one latest ZIP + JSON. ReviewArchiveUploads prevents concurrent different-content uploads and acceptance during an unfinished upload; checked tasks cannot be overwritten. Download links are temporary verification URLs, not public share links. Persistent SharePoint web URLs retain owner permissions; give reviewers specific read access when they need to inspect archives online.

Real Microsoft authorization and a 100 MiB upload/download probe have passed, including SHA256 readback. The backend also refreshes authorization and reads the intended folder. Total quota is 100 GiB; measure a genuine task archive before assuming this is enough for all teams. The workflow demo does not upload to Microsoft or update production data. A full GPU task's archive registration and permissions for participant-facing publication still require acceptance. See the private docs/ONEDRIVE_UPLOAD_ZH.md for organizer commands, quota testing and permission limitations.
