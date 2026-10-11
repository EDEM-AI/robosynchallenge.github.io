# Central OneDrive Evidence Upload

Reviewer pages remain part of the existing static website. Apps Script + the existing workbook are the application backend; there is no additional web server.

The archive owner's authorization is already saved privately and installed into the existing Apps Script properties. The verified rclone authorization path does not require a new Entra application or ITSO intervention. The owner authorizes once; evaluators do not repeat Microsoft login. Do not copy the owner's OAuth files or tokens into a branch, submission, participant runtime or browser asset.

ArchiveUpload.gs creates a pre-authenticated Microsoft upload session after validating the assigned request, task, frozen seeds, stage gates and acceptance lock. ZIP bytes flow directly from browser/CLI to Microsoft in sequential 320-KiB-aligned chunks. A complete remote SHA256 readback precedes final JSON registration. Google stores only ledger rows and small manifests, not ZIPs.

The browser uses its existing reviewer login; no MSAL or per-reviewer Microsoft login is needed. Private prepared branches contain an upload-only evaluation-upload.json capability, issued by the organizer preparer, hashed in ReviewUploadAccess, scoped to one eligible evaluation and expiring after 60 days. It cannot be used for email, user edits, task assignment or acceptance. Keep the whole clone and capability outside the participant runtime.

Each evaluation/task has one latest ZIP + JSON. ReviewArchiveUploads prevents concurrent different-content uploads and acceptance during an unfinished upload; checked tasks cannot be overwritten. Download links are temporary verification URLs, not public share links. Persistent SharePoint web URLs retain owner permissions; give reviewers specific read access when they need to inspect archives online.

Real Microsoft authorization and a 100 MiB upload/download probe have passed, including SHA256 readback. The backend also refreshes authorization and reads the intended folder. Total quota is 100 GiB; measure a genuine task archive before assuming this is enough for all teams. Local preview ZIP checks never upload to Microsoft or update production data. A full GPU task's archive registration and permissions for participant-facing publication still require acceptance. See the private docs/ONEDRIVE_UPLOAD_ZH.md for organizer commands, quota testing and permission limitations.
