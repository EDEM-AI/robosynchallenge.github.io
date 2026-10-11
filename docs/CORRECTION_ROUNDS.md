# Participant Correction Rounds

Each successfully sent participant issue email opens a fresh response form.
There is no 24-hour response deadline or overall limit on correction rounds.
An answered form cannot be replayed; a newer issue email retires older active links.
Infrastructure-only emails and no-eligible-version appeals retain their existing handling.

Confirmation preserves the currently selected code, checkpoints and cutoff.
A correction requires an immutable GitHub commit URL and checkpoint URLs for all ten tasks.
It stays under the same evaluation ID, participant identity and assigned evaluator.

On correction, the backend clears code/HF checks and participant-dependent progress,
retains the machine environment test, supersedes old task evidence and commands,
and revokes old uploads. Responses are audited on their issue-email link rows.
The preparation worker then creates correction1, correction2 and later private branches;
branches and local clone paths are not overwritten. Reviewers see a warning to use
the current branch and pinned checkpoint index, not artifacts from a previous round.
The environment test script still validates its own software/reference fingerprint.

At the submission cutoff, the worker compares the final selected Git commit and
all ten HF revisions with the earlier validation receipt. If identical, completed
progress stays unchanged. If different, it writes a durable backup to
`ReviewProgressBackups` before resetting participant-dependent progress. The old
version receipt and task evidence are included. Each JSON snapshot is split into
numbered parts of at most 20,000 characters; group by backup ID, table and row key,
order by part, concatenate and parse JSON. No archive is deleted by this reset.
Backup failure aborts the reset. Repeated reconciliation is idempotent.

Deployment: pause the preparer; deploy Apps Script; invoke the admin-only
`reviewer_migrate_response_schema` action to append response-audit headers;
commit the private tools with a clean source tree; restart the preparer.
Legacy unanswered links ignore their old response deadline. Legacy answered links
stay closed until a new issue email is sent. Ordinary submission and version-selection
deadlines are unchanged; no-eligible-version disputes still need reviewer approval.
