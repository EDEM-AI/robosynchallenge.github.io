const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({window:{},URL});
vm.runInContext(fs.readFileSync(path.join(__dirname,"../static/js/hf-location.js"),"utf8"),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,"../apps-script/Code.gs"),"utf8"),context);
for (const input of ["owner/model", " owner/model ", "https://huggingface.co/owner/model/", "https://huggingface.co/owner/model/tree/"+"a".repeat(40)+"/ckpt/9999"]) {
  const frontend = context.window.normalizeHfLocation(input);
  const backend = vm.runInContext(`requiredHuggingFaceUrl_(${JSON.stringify(input)})`,context);
  assert.equal(frontend,backend);
}
for (const input of ["owner", "https://other.example/owner/model", "https://huggingface.co@other.example/owner/model", "https://huggingface.co/owner/model?token=secret", "https://huggingface.co/owner/model/tree/main/../private", "https://huggingface.co/owner/model/tree/main/%2e%2e/private", "https://huggingface.co:443/owner/model"]) {
  assert.throws(() => context.window.normalizeHfLocation(input));
  assert.throws(() => vm.runInContext(`requiredHuggingFaceUrl_(${JSON.stringify(input)})`,context));
}
console.log("HF locations: URL/repository ID normalization, revision preservation and unsafe input rejection passed.");
