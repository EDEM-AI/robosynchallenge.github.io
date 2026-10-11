# Evaluation System Status (2026-10-11)

## Integration

The evaluator frontend is part of this website repository: eval_backend/, static/js/reviewer-page.js, static/js/reviewer-onedrive.js and static/css/reviewer.css. It uses the same static assets/configuration and the existing Apps Script/Google Sheet backend. No production application server is introduced. The public submission form and FAQ are published separately; evaluator UI remains on a non-Pages work branch and local preview until approved.

Local walkthrough: http://127.0.0.1:8032/eval_backend/?review_preview=1. The first synthetic request permits skipping inputs and does not mutate Sheet rows, send mail or publish branches. Real local UI: omit review_preview=1. Token files stay outside Git in evaluation_system/.runtime/.

## Verified

- The original Apps Script deployment is version 43, reviewer API v6, with independent code-preparation records; live health and authenticated submission-link audit passed. The existing ACT source SHA256 was accepted by the immutable scoring configuration endpoint.
- HF official endpoint verifies the individual RoboSynChallenge account; auth ignores HF_ENDPOINT mirror overrides. Credentials are mode 0600.
- GitHub robosynchallenge account is authorized for participant repositories. Private composition publishes under ZhaoRunyi/RoboSynChallenge_eval; main remains the frozen official commit.
- Private repo main was independently checked against official SHA 8818c82df5fa2522809b8105e7018950dcc9a9a8. Guiliang and lichengkun789-ship-it still have pending invitations; they must accept their own invitations.
- Owner OneDrive authorization works through the existing Apps Script backend. The real 100 MiB probe matched SHA256, about 1.70 MiB/s upload and 10.27 MiB/s download; 100 GiB total, about 99.78 GiB remaining. Evaluators do not repeat Microsoft consent.
- The pure-code preparation service polls every 120 seconds. Code composition no longer waits for historical ten-task checkpoint mapping. It reads the submitted GitHub repository and preserves its complete policy/ tree on the private official base. ReviewCodePreparations records immutable validation branches separately from formal evaluation code. No task maps are guessed.
- Live audit found 220 submissions, 29 submitting emails and 28 latest eligible ranked requests. It repaired two missing evaluation associations from complete existing submissions, preserving IDs and sending no mail. There are now 223 evaluations; three orphan evaluations remain reported, not guessed or deleted. The watcher repeats this integrity audit hourly and saves a private report.
- Backend and browser tests cover identity isolation, five-stage gates, result checks, email idempotency, one correction within the first notice's 24h window, AoE deadline and per-current-token exceptions.

## Outputs and Scoring

Each official task collector run generates a JSON manifest and ZIP for 100 episodes. Actual commands are recorded automatically. The default uploads directly to owner OneDrive, reads the ZIP back for SHA256 verification and registers its manifest in the Sheet. On failure local outputs remain; retry upload only. Evaluator uploads use terminal commands, not webpage ZIP/JSON forms. A task has one latest archive and accepted evidence is locked.

Backend metrics are computed from episodes, not participant self-reported summaries. Success, action steps, inference per call and 75/20/5 score are automatic; overall means require all ten tasks. The existing published RTX 5090 ACT benchmark is 0.011607777797617019 seconds/call with a 50-step horizon. T is ceiling(episode action_steps/50) times that cost. Its source commit and JSON SHA256 are frozen. Historical website ACT episode estimates and DP per-call values must not be treated as interchangeable units. A new timing reference must not replace the frozen reference mid-competition.

The review UI now explicitly displays mean total inference per episode. RPC mean remains recorded separately; RPC count includes cached-action requests and is not a GPU forward-pass count. Participant model configuration remains their responsibility; evaluators choose the correct task configuration and record the actual command. No automatic compatibility changes are made to old ACT/SmolVLA adapters.

Uploads now persist their Microsoft session URL outside the evictable cache and query the acknowledged resume offset. Repeating the same command recovers an interrupted upload, a lost final PUT response, or a completed/verified ZIP whose JSON registration failed. Identical registration is idempotent, including accepted evidence; altered accepted evidence stays locked. The CLI `--restart` explicitly cancels unfinished sessions before restarting the same ZIP. No credential is forwarded in ZIP chunks.

After all evidence is accepted, the authenticated participant's own submission detail shows task metrics, actual commands and archive SHA256. This does not automatically publish a leaderboard or make private OneDrive archives public. Archive sharing/publication and final GPU/container trials remain organizer acceptance work.

Ordinary requests close after October 11 23:59 AoE, at 2026-10-12 12:00 UTC / Beijing October 12 20:00. The backend enforces it even if an old browser or direct HTTP call bypasses the UI. Admins can grant/revoke a reasoned expiry for an existing current participant token; regenerating the token invalidates the exception. This is distinct from a request's single 24h correction window.

Preparation before that cutoff creates validation branches only. After cutoff the watcher selects the latest reachable pre-cutoff Git/HF revisions and produces formal submissions branches; SHAs, timestamps and cutoff are stored in ReviewVersionChecks. No eligible revision blocks the first stage. Its email requests a reply with an argument, without a correction-form shortcut. The assigned reviewer explicitly records approval and a reason; that queues an auditable exception branch automatically. Git dates alone do not prove pre-cutoff server upload. Early validation failures receive one automatic final attempt after cutoff; final failures wait for reviewer action. An admin may reassign before local code handoff with an audit reason; local handoff locks reassignment. Partial task acceptance no longer prohibits the single timely participant correction, but final completed evaluation does.

Submission retries now use a durable SubmissionReceipts row and a script lock, with stable submission/evaluation IDs. The public form reuses its retry key after timeouts. Interrupted writes are completed rather than duplicated. Confirmed insufficient mail quota leaves notification pending for the existing three-hour trigger; accepted submission is still returned as successful. Uncertain mid-send failures are marked needs_review and not blindly resent. Team identity is not changed by any of these paths.

## Independent Code Preparation

Code-only validation branches use validation/{evaluation_id}-{participant_sha12}-{official_sha12}, with correction/exception suffixes when applicable. They contain no checkpoint receipt or upload capability and cannot unlock formal evaluation or retrieve the organizer HF credential. The first review stage shows the real code result even while checkpoint mapping is incomplete. A correction or approved version exception invalidates the old displayed code record. Retries reuse an existing matching branch and never force-push it.

To refresh the local-only walkthrough with live preparation status:

```bash
node tools/sync-review-preview.js /home/edemlab/challenge_ws/evaluation_system/.runtime/prepare-settings.json /home/edemlab/challenge_ws/evaluation_system/.runtime/reviewer-demo-token.txt
```

This is a read-only queue sync. It neither sends participant mail nor changes reviewer checklists. Local walkthrough edits remain simulated; use the local URL without review_preview=1 for authenticated backend operations.

## Remaining Acceptance

1. Assigned reviewers verify each legacy ten-task checkpoint mapping. Two current repositories return 404 and one request lists ten repositories rather than a single complete policy/ repository; organizers must obtain readable, conforming inputs.
2. The separate rendering agent installs genuine built-in reference samples and approved SSIM/PSNR thresholds, then runs a real GPU/container task through all 100 episodes and cloud registration. Offline/browser tests are not GPU evidence.
3. Check artifact storage sizing with a real task. 100 GiB is not a guarantee for every team: reserving 80 GiB for 28 x 10 x 100 episodes permits only about 2.93 MiB per episode including video/state/action. Do not delete or degrade evidence without an explicit retention decision.
4. Confirm invite acceptance by evaluator GitHub collaborators, dependency image preparation and checkpoint download credentials. Owner tokens never enter the participant container or prepared branch. Public/gated/organization-readable HF models work with the verified download account; individual private repositories may require a separate repo-scoped read token via a private organizer channel, not submission notes.

Mail uses Apps Script email recipient quotas, not Google Drive storage allowance. Rendering/storage checks and form submissions do not send mail; clicking Send issue email consumes recipient quota. No participant email is sent by the deployment/acceptance tests.
