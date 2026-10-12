# Automatic evaluation preparation

Website, Apps Script and queue-maintenance code live on the website repository's `page` branch. The private evaluation runtime and all generated evaluation branches use `ZhaoRunyi/RoboSynChallenge_eval` **main** as their baseline.

The existing organizer service runs this entrypoint; no additional website server or agent is required:

```bash
python evaluation_tools/watch_preparation.py \
  --private-root /path/to/private/RoboSynChallenge_eval \
  --settings /path/to/private/prepare-settings.json
```

Use `--once` for one pass. Settings and credential files remain private (mode 0600), outside Git. The private checkout must be clean and on `main`.

Each pass checks legacy checkpoint source access independently of the still-required ten-task mapping, retries transient organizer transport failures with backoff, then invokes the existing queue preparer. Source access alone does not certify coverage of all ten tasks. Permission errors, missing model repositories and invalid policy trees remain visible for reviewer follow-up, not automatically guessed or repaired.

Baseline changes rebuild already composed branches using the original pinned participant policy and checkpoint revisions. The backend backs up affected progress before invalidation; each current request keeps its canonical `eval_xxxx` branch. Installation uses the existing `rsc-prepare.service`, with this script as its ExecStart; after updating source or the unit, reload and restart the service.
