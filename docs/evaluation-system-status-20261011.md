# Evaluation System Status (2026-10-11)

## Integration

The evaluator frontend is part of this website repository: eval_backend/, static/js/reviewer-page.js, static/js/reviewer-onedrive.js and static/css/reviewer.css. It uses the same static assets/configuration and the existing Apps Script/Google Sheet backend. No production application server is introduced. The public submission form and FAQ are published separately; evaluator UI remains on a non-Pages work branch and local preview until approved.

Local walkthrough: http://127.0.0.1:8032/eval_backend/?review_preview=1. The first synthetic request permits skipping inputs and does not mutate Sheet rows, send mail or publish branches. Real local UI: omit review_preview=1. Token files stay outside Git in evaluation_system/.runtime/.

## Verified

- The original Apps Script deployment is version 46, reviewer API v6, with independent code-preparation and checkpoint-check records; live health and authenticated submission-link audit passed. The existing ACT source SHA256 was accepted by the immutable scoring configuration endpoint.
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

The private evaluation repository was rechecked through GitHub API: private=true, visibility=private. For real request eval_65821972c17441, the validation branch's policy Git tree hash exactly matches the participant commit; every root entry outside policy/ and the generated bundle manifest matches the official base. It contains neither evaluation-upload.json nor an HF receipt. All 45 offline Python tests, backend/upload tests and the five-stage desktop browser flow passed, including real validation-status display while the checkpoint gate remains blocked and consistent provisional Git/HF receipt cutoffs.

### Independent Checkpoint Access

The first review stage has two substeps: Code preparation / GitHub access, and Hugging Face checkpoint access. Code checks run without a task checkpoint map. Once a reviewer saves all ten task URLs, the persistent preparer checks HF access independently, using the organizer's authorized read account and actual file metadata requests. Code failure does not skip HF checks; HF failure does not suppress a successful code result.

ReviewCheckpointChecks stores pending/checking/passed/failed state and safe failure diagnostics. Receipts are bound to the submission, ten URLs, correction attempt, exception generation and cutoff. Changed inputs hide stale receipts; late results cannot overwrite the newer context. Successful or failed unchanged checks are not repeated every 120 seconds. Explicit reviewer retry or changed URLs requeues failures; the deadline freeze requires a final cutoff check. Formal handoff still requires both successful checks and frozen versions.

Live verification: PeaceVLA has a successful existing HF receipt. DHU RoboLab's ten-task HF check passed automatically at 2026-10-11T08:18:32Z despite its code preparation remaining blocked. The other 26 current requests require reviewer-confirmed task URLs; no mapping or access success was invented. The preview is a read-only snapshot: simulated local form saves do not run production HF checks.

To refresh the local-only walkthrough with live preparation status:

```bash
node tools/sync-review-preview.js /home/edemlab/challenge_ws/evaluation_system/.runtime/prepare-settings.json /home/edemlab/challenge_ws/evaluation_system/.runtime/reviewer-demo-token.txt
```

This is a read-only queue sync. It neither sends participant mail nor changes reviewer checklists. Local walkthrough edits remain simulated; use the local URL without review_preview=1 for authenticated backend operations.

### Live Preparation Audit

On October 11, the first pass processed 28 latest requests: 17 real validation branches were pushed and registered, and 11 were blocked by the following input checks. Formal evaluation branches remain at zero; validation code is not an evaluation pass. A new DHU RoboLab request arrived during the audit, superseded its previous request, and was captured and checked automatically by the restarted service without agent intervention; the same adapter-file issue remains. No participant mail was sent.

| Request | Team | Preparation blocker |
| --- | --- | --- |
| eval_43db939c249046 | 115 | Selected OpenPI upstream commit has no policy/ directory; verified through GitHub tree API. |
| eval_1745e4e6bb874a | Vulcan Dynamics | Selected commit has no policy/ directory; verified through GitHub tree API. |
| eval_1e815230feb54b | Kaelio | Submitted repository cannot be read using the official participant-read account. |
| eval_21a30779b1b445 | Team Turbo | Submitted repository cannot be read using the official participant-read account. |
| eval_6a78fd0ef86b40 | RobotQQ | Documentation symlinks under policy/smolvla/lerobot/src/lerobot/policies, robots and teleoperators are rejected by the safety guard, including policies/act/README.md. |
| eval_770795218d0441 | luminbot | Four HF cache symlinks under policy/policy_v3/services/mono/hf_cache are rejected: config.json, model.safetensors, preprocessor_config.json and processor_config.json. |
| eval_7c9414f1a05b4d | smallzhangiscodeing | policy/iaiicas/manipulate_pipette and policy/iaiicas/pi05_overrides each lack both eval.sh and deploy_policy.yml. |
| eval_7b8c2870df9444 | SZU-VCC Synapse | policy/sample_poseplan_v1/frozen/RoboSynChallenge/policy/act lacks both eval.sh and deploy_policy.yml. The recursive adapter guard includes this nested frozen adapter. |
| eval_c7b2a7e327ea4d | DHU RoboLab | policy/robosyn_team/runtime lacks both eval.sh and deploy_policy.yml. Supersedes eval_fb417a4736d345. HF access passed independently. |
| eval_ed0b18afd0d445 | SEU MAI | policy/act lacks eval.sh; deploy_policy.yml exists. |
| eval_3b7f6832eca94f | Robo | Ten repository URLs were submitted instead of one complete policy/ repository URL. |

These were rechecked against the submitted GitHub trees using the official read account. Kaelio and Team Turbo return HTTP 404; this alone cannot distinguish an absent repository from a private repository hidden from that account. The private runtime audit includes exact paths and inspected commits. These are code-preparation blockers, not measured policy-quality failures or evidence of malicious code. Reviewers can inspect the recorded error in the first stage, send an issue notice deliberately and retry after participant follow-up. Safety guards and the separate formal evaluation gates were not relaxed to increase the success count. Future failure records include exact missing filenames and unsafe paths instead of opaque git archive exit codes.

## Remaining Acceptance

1. Assigned reviewers verify each legacy ten-task checkpoint mapping. Two current repositories return 404 and one request lists ten repositories rather than a single complete policy/ repository; organizers must obtain readable, conforming inputs.
2. The separate rendering agent installs genuine built-in reference samples and approved SSIM/PSNR thresholds, then runs a real GPU/container task through all 100 episodes and cloud registration. Offline/browser tests are not GPU evidence.
3. Check artifact storage sizing with a real task. 100 GiB is not a guarantee for every team: reserving 80 GiB for 28 x 10 x 100 episodes permits only about 2.93 MiB per episode including video/state/action. Do not delete or degrade evidence without an explicit retention decision.
4. Confirm invite acceptance by evaluator GitHub collaborators, dependency image preparation and checkpoint download credentials. Owner tokens never enter the participant container or prepared branch. Public/gated/organization-readable HF models work with the verified download account; individual private repositories may require a separate repo-scoped read token via a private organizer channel, not submission notes.

Mail uses Apps Script email recipient quotas, not Google Drive storage allowance. Rendering/storage checks and form submissions do not send mail; clicking Send issue email consumes recipient quota. No participant email is sent by the deployment/acceptance tests.
