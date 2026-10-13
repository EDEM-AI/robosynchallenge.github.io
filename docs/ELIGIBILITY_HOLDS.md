# Eligibility Holds

An organizer records an `invalid_pending_review` decision for one evaluation
request and its exact adopted participant commit. This is separate from GitHub/HF
access failures. The backend backs up progress and evidence, preserves branches,
and records the reason and pinned code references in `ReviewAdjudications`.

Held requests remain visible, but cannot record progress, upload results, retry
preparation or publish participant outcomes. Automatic preparation and maintenance
skip them. Assigned checkpoint downloads skip held requests without blocking other
requests. Existing correction forms cannot override a decision. Reply emails and
read-only review remain available.

```sh
python tools/adjudicate_requests.py --settings /path/to/prepare-settings.json \
  --plan /path/to/decision-plan.json --receipt /path/to/private/decision-receipt.json
```

The plan contains each evaluation ID, reviewed commit, reason, pinned evidence
URLs, subject and body. Recipient identity is resolved from the original backend.
All planned holds are applied before any mail is attempted. Notices use stable
message IDs, are logged in the existing evaluation mail history and do not create
correction links. Uncertain delivery must be checked before retrying.

Only an explicit organizer review can release a recorded hold:

```sh
python tools/adjudicate_requests.py --settings /path/to/prepare-settings.json \
  --plan /path/to/reviewed-decisions.json --receipt /path/to/private/decision-receipt.json \
  --release --reason "Organizer reviewed the additional evidence and approved release"
```

Use a plan containing only the decisions actually approved for release. Release
does not adopt new participant code or change any deadline. If the organizer also
authorizes different inputs, use the existing version/correction workflow after
release; its backup and invalidation checks still apply. No email reply, automatic
retry or evaluator checklist releases a hold.
