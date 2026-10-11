# Evaluation Review Acceptance

## Deployment Status

As of 2026-10-11, reviewer API v5 uses the existing Apps Script Web App. Reviewer 1070055979@qq.com is provisioned with a hash-only server credential. The pure-code preparation service polls every 120 seconds. Assignment works without participant Git credentials; composition waits for verified ten-task mappings and repository/model access. No participant emails are sent by deployment or acceptance tests. The dated system-status document records the final deployment and remaining acceptance work.

The public submission form is approved for release independently: it records all ten task checkpoint URLs, supports a shared checkpoint plus overrides, requires ten-task confirmation, and displays submission failures. The old form remains accepted without claiming verified coverage. Historical records stay unchanged; the assigned reviewer or an admin supplies the mapping in ReviewRuns, with who/when audit.

The evaluator frontend remains LOCAL ONLY and absent from public navigation. Preview:
http://127.0.0.1:8032/eval_backend/?review_preview=1

Use 1070055979@qq.com and the Git-excluded evaluation_system/.runtime/reviewer-demo-token.txt for preview. For local frontend against the real backend, omit ?review_preview=1 and use evaluation_system/.runtime/organizer-reviewer-token.txt. Never publish these credentials or generated preview data.

## Snapshot

The read-only 2026-10-11 audit found 220 submissions, 221 evaluation rows, 218 ranked submissions, and 28 ranked team emails. All 28 latest requests have exact submission/evaluation links. Three evaluation rows lack a submission and two submissions lack an exact evaluation; no business records were repaired. These counts do not prove ten-task coverage. The preview contains the latest 28 requests plus one clearly labeled synthetic walkthrough; the walkthrough cannot write Sheet rows, send mail or create branches.

## Five Stages

1. Preparation receipt: check task mapping and automatic preparation. The assigned reviewer fills missing legacy mappings. Repository or HF failures stop preparation and offer an issue email/retry; successful preparation does not prove the policy runs.
2. Evaluation code: use the eval-ID-specific clone command and pinned branch. The entire participant policy/ is retained; everything outside it comes from the official private base. No reviewer-entered SHA or policy-directory form.
3. Environment check: run python tools/check_environment.py with built-in expert-planner reference scenes. Real SSIM/PSNR calibration assets must exist; no guessed thresholds, machine ID, metric entry or report upload. Same selected GPU/software/config/reference may reuse a passed fingerprint.
4. Evaluation/upload: trusted tools/run_task_evaluation.py collects 100 frozen-seed episodes per task, videos/state/actions/logs and JSON/ZIP. By default it records the actual command, uploads the ZIP, verifies its remote SHA256 and registers the JSON. If upload fails, preserve local outputs and retry tools/upload_evidence.py without rerunning evaluation; ZIP+JSON selection on the page remains a fallback. Neither needs evaluator Microsoft login. Large files go directly to OneDrive, not the website or Sheet.
5. Result review: inspect evidence and SHA256, accept all ten tasks, then complete. Accepted tasks lock; completion does not publish a leaderboard.

The top progress, request list, stage controls and three bottom actions remain stable on desktop. Required fields/checklists have red stars. Stage-specific, generic and blank issue mail templates are editable inline; the participant recipient is server-fixed. Delivery IDs, quota checks and uncertain-send locks prevent blind duplicate retries.

Each new participant issue email opens a response round: confirm the current code or submit an immutable correction with checkpoints for all ten tasks. There is no 24-hour deadline or overall correction limit. Use the latest email's form; an answered link cannot be replayed. Corrections use separate correction1, correction2 and later branches, revoke old upload permissions and supersede previous results without changing team identities or assignments. Code/HF and downstream progress reset; the machine environment test is retained. Evaluators must use the new clone and its frozen checkpoint index.

## Outstanding Acceptance

Owner OneDrive authorization is saved privately and automatically installed into Script Properties. A real 100 MiB upload/download matched SHA256 (1.70 MiB/s up, 10.27 MiB/s down); only the probe directory was deleted. Total quota is 100 GiB, with approximately 99.78 GiB remaining after the probe entered the recycle bin. The live Apps Script organizer-only storage check also refreshed authorization and read the intended folder successfully. GitHub robosynchallenge authorization is verified: 25 of 28 requests have readable repositories, two returned 404, and one submitted ten semicolon-separated repositories rather than one complete code repository. One matching invitation was accepted. All 28 legacy task maps still need evaluator verification. The HF token now verifies as the individual RoboSynChallenge user against the official endpoint; the previous mirror override no longer controls authentication. Real 5090 rendering calibration, a Docker/GPU collector trial, and a formal request's final archive registration remain separate acceptance work.

The existing published RTX 5090 ACT reference is used for 75/20/5 scoring, with its source commit and SHA256 frozen. Overall scores require all ten tasks. Ordinary submissions close at 2026-10-12 12:00 UTC (October 11 23:59 AoE); an admin can grant a reasoned exception bound to an existing participant's current token. See evaluation-system-status-20261011.md for publication and archive-sharing limitations.

See the private repo's AUTOMATIC_PREPARATION_ZH.md, ONEDRIVE_UPLOAD_ZH.md, EVALUATOR_QUICKSTART_ZH.md and RENDER_CALIBRATION_ZH.md. Run tools/check_readiness.py for a non-secret status report. There is no SES/S3 dependency or extra application server.
