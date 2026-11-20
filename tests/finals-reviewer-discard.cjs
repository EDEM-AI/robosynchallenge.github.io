const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/../static/js/finals-reviewer.js', 'utf8');
const wait = () => new Promise(resolve => setImmediate(resolve));

async function scenario({role = 'evaluator', owner = 'reviewer@example.test', confirm = true, reject = false} = {}) {
  const listeners = {}, calls = [], confirmations = [];
  const attempts = ['success', 'failure', 'running', 'deleted'].map((status, i) => ({
    id: String(i + 1).repeat(32), task: 'handle_basket', slot: 1, status,
    reviewer: owner, uploaded: status === 'success' || status === 'failure', evidence: [],
  }));
  const job = {request_id: 'real_fixture', team_name: 'finalist_fixture',
    submission: {tasks: [], method_name: 'fixture'},
    review: {owner, platform_checks: {}, accepted: {}},
    progress: {steps: [], completed: 0, collected: 2},
    runtimes: [], assignments: [], attempts};
  const root = {innerHTML: '', addEventListener: (name, fn) => listeners[name] = fn, querySelector: () => null};
  const viewer = {email: 'reviewer@example.test', role};
  const sandbox = {
    document: {getElementById: () => root},
    sessionStorage: {getItem: () => JSON.stringify({...viewer, token: 'fixture'})},
    window: {ROBO_SYN_CONFIG: {API_BASE_URL: 'https://fixture.invalid'},
      confirm: text => { confirmations.push(text); return confirm; }},
    setInterval: () => null,
    fetch: async (_, req) => {
      const call = JSON.parse(req.body); calls.push(call);
      assert.ok(['finals_reviewer_list', 'finals_reviewer_discard'].includes(call.action));
      if (call.action === 'finals_reviewer_discard') {
        if (reject) return {ok: true, json: async () => ({ok: false, error: 'Attempt result changed. Refresh before discarding.'})};
        const attempt = attempts.find(a => a.id === call.body.attempt_id);
        attempt.status = 'deleted'; attempt.cleanup = {state: 'pending'};
      }
      return {ok: true, json: async () => ({ok: true, viewer, requests: [job], platforms: []})};
    },
  };
  vm.runInNewContext(source, sandbox);
  await wait();
  const click = (selector, dataset) => listeners.click({target: {closest: query => query === selector ? {dataset} : null}});
  click('[data-stage]', {stage: '3'});
  const editable = role === 'admin' || role === 'evaluator' && owner === viewer.email;
  assert.equal((root.innerHTML.match(/data-action="discard-attempt"/g) || []).length, editable ? 2 : 0);
  for (const attempt of attempts.slice(2)) {
    click('[data-action]', {action: 'discard-attempt', attempt: attempt.id});
  }
  assert.equal(confirmations.length, 0);
  click('[data-stage]', {stage: '4'});
  assert.equal((root.innerHTML.match(/data-action="discard-attempt"/g) || []).length, editable ? 2 : 0);
  click('[data-stage]', {stage: '3'});
  const target = attempts[1];
  click('[data-action]', {action: 'discard-attempt', attempt: target.id});
  // A second click while the mutation is pending must not submit twice.
  click('[data-action]', {action: 'discard-attempt', attempt: target.id});
  await wait();
  const mutations = calls.filter(c => c.action === 'finals_reviewer_discard');
  assert.equal(mutations.length, editable && confirm ? 1 : 0);
  assert.equal(attempts[0].status, 'success', 'same-slot sibling must remain intact');
  if (editable && confirm) {
    assert.deepEqual(mutations[0].body, {request_id: job.request_id, task: 'handle_basket',
      attempt_id: target.id, expected_status: 'failure',
      reason: 'Reviewer discarded this individual episode from the evaluation website.'});
    if (reject) {
      assert.equal(target.status, 'failure');
      assert.match(root.innerHTML, /Attempt result changed/);
    } else {
      assert.equal(target.status, 'deleted');
      assert.match(root.innerHTML, /storage cleanup queued/);
    }
  }
}

(async () => {
  await scenario();
  await scenario({role: 'admin', owner: 'someone@example.test'});
  await scenario({role: 'observer'});
  await scenario({owner: 'someone@example.test'});
  await scenario({confirm: false});
  await scenario({reject: true});
  console.log('Reviewer discard: exact attempt, both review stages, ownership, closed-only, cancellation, duplicate click, rejection and cleanup display passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
