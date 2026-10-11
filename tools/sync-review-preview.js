#!/usr/bin/env node
// Read live preparation status into the local-only preview; never mutate jobs.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

async function main() {
  const [settingsFile, previewTokenFile] = process.argv.slice(2);
  if (!settingsFile || !previewTokenFile) throw new Error("Pass private preparer settings and the local preview token file.");
  const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(settings.api_url)) throw new Error("Use the original Apps Script deployment.");
  const credential = fs.lstatSync(settings.organizer_token_file);
  if (!credential.isFile() || credential.mode & 0o077) throw new Error("Organizer credential must be a private regular file.");
  const response = await fetch(settings.api_url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "reviewer_preparation_queue", reviewer_email: settings.organizer_email,
      reviewer_token: fs.readFileSync(settings.organizer_token_file, "utf8").trim() }), signal: AbortSignal.timeout(90000) });
  const snapshot = await response.json();
  if (!response.ok || !snapshot.ok || snapshot.reviewer?.role !== "admin") throw new Error("Could not read the authenticated preparation queue.");
  snapshot.captured_at = new Date().toISOString();
  const source = path.join(path.dirname(path.resolve(settingsFile)), "review-preview-source.json");
  const fd = fs.openSync(source, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(snapshot)); } finally { fs.closeSync(fd); }
  execFileSync(process.execPath, [path.join(__dirname, "generate-review-preview.js"), source, previewTokenFile], { stdio: "inherit" });
  console.log(JSON.stringify({ code_composed: snapshot.jobs.filter(job => job.code_bundle_commit).length,
    formal_prepared: snapshot.jobs.filter(job => job.bundle_commit).length,
    failed: snapshot.jobs.filter(job => job.preparation_status === "failed").length }));
}
main().catch(() => { console.error("Preview sync failed: check backend access and private settings. No credentials were logged."); process.exitCode = 1; });
