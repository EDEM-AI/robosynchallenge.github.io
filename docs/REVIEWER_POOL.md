# Evaluator Pool

The pool is the existing `Reviewers` table: only `role=evaluator` and
`active=true` accounts participate. Observer and organizer accounts are excluded.
Participant `Users`, submissions and team identities are never modified.

The persistent preparation worker invokes `reviewer_balance_pool` every polling
cycle, before code composition. It distributes the latest eligible request per
registered account by active request count. Completed requests keep their owner;
superseded requests do not count. New evaluators receive movable work, but a
code-stage checklist already started, a completed code handoff, saved evaluation
commands, archive uploads or task results lock that request to its current owner.
Pool removal does not interrupt locked local work; locked work outside the pool
is reported for organizer follow-up. Every ownership change is recorded in
`ReviewAssignments`. Repeated polls do not move balanced work unnecessarily.

Run these commands on the organizer host; never share the settings file:

```sh
python tools/reviewer_pool.py --settings /home/edemlab/challenge_ws/evaluation_system/.runtime/prepare-settings.json list
python tools/reviewer_pool.py --settings /home/edemlab/challenge_ws/evaluation_system/.runtime/prepare-settings.json add --email reviewer@example.com
python tools/reviewer_pool.py --settings /home/edemlab/challenge_ws/evaluation_system/.runtime/prepare-settings.json member --email reviewer@example.com --inactive
python tools/reviewer_pool.py --settings /home/edemlab/challenge_ws/evaluation_system/.runtime/prepare-settings.json balance
```

`add` creates a private persistent invitation receipt, provisions an evaluator
token, emails it using the existing HTML template and then balances the pool.
Retries reuse the same invitation; uncertain email delivery is not resent.
Existing observer/admin accounts cannot be converted with this command.

Initial policy requires two active evaluators before balancing, to preserve the
existing half-assignment while the second evaluator is being arranged. Enable
single-evaluator allocation only when explicitly wanted:

```sh
python tools/reviewer_pool.py --settings /home/edemlab/challenge_ws/evaluation_system/.runtime/prepare-settings.json policy --minimum-evaluators 1
```

Use `policy --minimum-evaluators 2 --pause` to pause automatic balancing without
revoking evaluator logins. The worker's `auto_assign` setting must also remain
enabled for automatic pool polling. All pool APIs require organizer credentials.

Explicit workspace refresh uses an authenticated fresh Sheets `values:batchGet`
snapshot, with header validation and a SpreadsheetApp fallback. No participant
or evaluator data is placed in a shared cross-request cache. Email-status refresh
uses the same queue snapshot rather than another round trip.
