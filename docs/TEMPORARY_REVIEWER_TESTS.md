# Temporary Reviewer Tests

Temporary reviewers use the same workspace as evaluators. The `tester` role sees
its assigned requests and the normal stage prerequisites, but form edits,
checklists, commands and email tests remain browser-local. Reloading discards
those edits. Backend mutations and official result uploads for requests owned by
a tester are rejected. Tester accounts do not enter the evaluator balancing pool.

The organizer tool selects four prepared requests with ten passing checkpoint
checks and one blocked request from the specified evaluator. It backs up official
progress before changing ownership. It verifies the tester's five visible
requests and sends the invitation through the original Apps Script backend.
Tokens remain in the private runtime ledger and must not be committed or printed.

```sh
python tools/test_reviewer.py \
  --settings /path/to/prepare-settings.json \
  --email tester@example.com \
  --previous-email evaluator@example.com
```

To end the test and restore ownership, use the same private ledger:

```sh
python tools/test_reviewer.py \
  --settings /path/to/prepare-settings.json \
  --email tester@example.com \
  --restore
```

Restoration keeps legitimate code/checkpoint preparation updates made during the
test. It deactivates a tester with no remaining assignments. A changed submission
or a conflicting new owner requires organizer reconciliation rather than silently
restoring an old snapshot. Repeated assignment and restoration calls with the same
test ID are idempotent.
