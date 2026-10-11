# Submission Access and Policy Structure Audit

Date: October 11, 2026. This report checks actual submitted URLs using the authorized
GitHub `robosynchallenge` and HF `RoboSynChallenge` accounts. It does not execute
participant code or certify GPU evaluation results. No participant mail was sent.

## Persisted Preparation Results

After actual retries, the existing Sheet queue and refreshed local preview show
29 latest requests: 21 code-only validation branches ready, eight blocked, and
zero formal evaluation branches. The helper-entrypoint false positives for
IAII-CAS, SZU and DHU were fixed and their new private branches were pushed and
registered. Sny was successfully retried too. The persistent preparation service
is running with private tooling commit `41e749f`; 51 offline Python tests and the
existing backend/upload tests passed. The evaluator website branch was not
published publicly.

| Evaluation ID | Team | Remaining code-preparation blocker |
| --- | --- | --- |
| `eval_43db939c249046` | 115 | Submitted upstream OpenPI commit has no `policy/` tree. |
| `eval_1e815230feb54b` | Kaelio | Exact submitted repository still returns HTTP 404 with the official account; clone also fails. |
| `eval_21a30779b1b445` | Team Turbo | Exact submitted repository still returns HTTP 404 with the official account; clone also fails. |
| `eval_6a78fd0ef86b40` | RobotQQ | Documentation symlinks point to uncommitted `docs/source/` targets. |
| `eval_770795218d0441` | luminbot | HF cache `model.safetensors` points to an uncommitted weight blob. |
| `eval_3b7f6832eca94f` | Robo | Selected request still contains ten repository URLs, not the now-accessible consolidated repository URL. |
| `eval_ed0b18afd0d445` | SEU MAI | No `eval.sh` launcher inside the submitted policy tree. |
| `eval_1745e4e6bb874a` | Vulcan Dynamics | Root-level release package has no `policy/` tree. |

## Entrypoints

| Team | Verified entrypoint | Finding |
| --- | --- | --- |
| smallzhangiscodeing | `policy/iaiicas/eval.sh` | The parent has `deploy_policy.py` and `deploy_policy.yml`. `manipulate_pipette/` and `pi05_overrides/` contain helper adapters, not separate required launchers. |
| SZU-VCC Synapse | `policy/sample_poseplan_v1/eval.sh` | The nested frozen ACT adapter is a helper. The parent selects its special sample-loading route and delegates other tasks to its submitted `policy/act`. |
| DHU RoboLab | `policy/robosyn_team/eval.sh` | `runtime/deploy_policy.py` is a helper, not an independent launcher. |
| SEU MAI | `policy/act/deploy_policy.py` and `.yml` | No `eval.sh` exists anywhere in the inspected repository. This is not the same helper-entrypoint false positive. |
| Vulcan Dynamics | Repository-root `eval.sh`, `deploy_policy.py`, `.yml` | The repository is not a fork and has no `policy/`. Its launcher stages the adapter into a pinned official checkout under `policy/vulcan_act`; this is an independent release package, not proof that it replaces the official environment. Its submitted layout cannot be copied by the policy-only composer. |

The composer now accepts a configured adapter with a launcher at its own or a
parent directory inside `policy/`. Nested unconfigured adapters under an accepted
parent remain in the copied tree but are not listed as independent entrypoints.
An isolated adapter missing configuration or a launcher still fails. All files
outside the submitted `policy/` remain official, apart from generated receipts.

Code composition is not runtime certification. Two important dependency issues
remain visible in the submitted instructions:

- IAII-CAS explicitly requires the official `policy/pi05` beside its submission,
  and its shell launcher applies overrides there. The current entire-policy
  replacement does not automatically add missing official policy packages or
  apply shell-side mutations. Its runtime dependencies must be supplied in the
  policy environment before the controlled collector is used.
- DHU's policy launcher delegates to its repository-root `eval.sh`, which uses
  `run_eval.py` and `vendor/lerobot`. Their README describes GitHub as a source
  mirror and supplies a full runtime plus overlay on HF. The composer does not
  copy those non-policy files over the official environment. A reviewer must
  verify the adapter with the supplied runtime dependencies in the policy worker;
  merely producing a branch does not prove that its shell launcher can run.
- Sny's inspected README reports an `item_assembly` process exit of 139 during
  simulator teardown. That is the participant's own statement, not an organizer
  measurement. Successful access and composition do not certify that this has
  been fixed; the controlled runtime check must verify it.

## Symbolic Links

A Git symbolic link stores a target path, not the target's bytes. The old guard
rejected every symlink. It now preserves relative links whose final target is a
committed file inside `policy/`; absolute paths, escapes, cycles, missing targets,
directory links and submodules remain blocked. The manifest records link text,
and the official collector checks link identity, target containment and file
hashes before execution. No host files are followed or copied during preparation.

- RobotQQ: all 25 documentation links under `policy/smolvla/lerobot/src/lerobot/`
  point to omitted `policy/smolvla/lerobot/docs/source/` files. These are broken
  documentation links, not evidence of malicious code. Submit the missing docs
  or remove the unused links; they are not silently dropped from the policy tree.
- luminbot: three HF cache links resolve to committed config blobs. The
  `model.safetensors` link points to the missing blob
  `e990eb82fbf11b05b7813261196a2b841bdcf5a05f64396724a8987fa90504a3`.
  Allowing safe links alone cannot supply that missing weight. Include the weight
  through the declared HF/dependency download process, or remove the stale cache
  from the submitted source and document initialization.

## GitHub Permissions and Mail

Both current exact submitted repositories still return HTTP 404 to the verified
`robosynchallenge` read credential:

- Kaelio: `andreybavt/robosynchallenge-submission`, branch `baseline-v0`.
- Team Turbo: `khizirsiddiqui/RoboSynChallenge`.

GitHub 404 alone cannot distinguish a deleted/incorrect URL from a private
repository hidden by account or token permissions. Team Turbo's invitation email
exists, dated September 30. No Kaelio repository invitation was found in the
connected mailbox searches. Neither repository has a pending invitation in the
official account's current API list. The installed credential is not fine-grained
and its GitHub response includes the `repo` scope, so this is not a missing
fine-grained repository-selection checkbox. Confirm the exact URL and repository
collaborator membership for `robosynchallenge`; accepting an email is not an API
read-access test.

Sny's exact submitted repository currently returns HTTP 200. Its earlier raw
HTTP 404 is not evidence that this repository is currently inaccessible. The
invitation handler now handles a concurrent acceptance by verifying actual
repository access before proceeding; an inaccessible repository is never treated
as accepted.

Robo has a new invitation to `learn-more-1/robosyn-submission`, and API read access
to that consolidated repository now succeeds (HTTP 200), while the selected
Sheet request still lists ten separate repositories. The script must not replace
the registered source URL based on an invitation email; the participant must
submit the consolidated URL or the organizer must explicitly correct the request.

## HF Access

There are 29 latest eligible requests in the audited snapshot. Their declared
ten-task maps and legacy submitted HF links contain 46 distinct URLs. Checks of
repository metadata and file access returned 42 passes and the following four
failures. No large weight files were downloaded by this audit.

| Team | Submitted link | Finding |
| --- | --- | --- |
| smallzhangiscodeing | https://huggingface.co/asiazyh/iaii-cas-robosynchallenge-ckpt | HTTP 404 with the organizer credential: missing/hidden repository, revision or file; access not confirmed. |
| wangwangdui | https://huggingface.co/RoboSynChallenge | Organization profile, not a model repository URL. |
| Praxis | https://huggingface.co/koseke | User profile, not a model repository URL. |
| Owen | https://huggingface.co/owen1257173018 | User profile, not a model repository URL. |

The gated `puheliang/RoboSynChallenge-fmc3-no1-sim` passed with the shared account.
Team Turbo, RobotQQ, luminbot, SZU-VCC Synapse, SEU MAI, Vulcan Dynamics and DHU
RoboLab's submitted HF links passed. Passing one legacy repository link does not
confirm the ten-task mapping, correct weight selection, or runtime compatibility.
Only reviewer-confirmed task mappings become formal task access receipts. The
persistent preparer repeats access/version checks for changed mappings and the
final cutoff, without requiring an agent.
