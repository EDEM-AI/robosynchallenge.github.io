/* Reads credential JSON on a no-echo TTY; stores only token hashes. */
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const target=process.argv[2];
if(!target || !process.stdin.isTTY) throw Error('Provide private output path and a terminal');
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdout.write('Ready for private preview configuration (input hidden).\n');
let text='';
process.stdin.on('data',chunk=>{
  text+=chunk;
  if(text.includes('\u0003')) process.exit(130);
  if(!text.includes('\n') && !text.includes('\r')) return;
  try {
    const input=JSON.parse(text.trim());
    const value={...input,users:input.users.map(u=>{
      const {token,...publicFields}=u;
      return {...publicFields,token_sha256:crypto.createHash('sha256').update(token).digest('hex')};
    })};
    fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
    fs.writeFileSync(target,JSON.stringify(value,null,2),{mode:0o600});
    process.stdout.write('Private preview configuration saved; tokens not retained.\n');
    process.exit(0);
  } catch { process.stderr.write('Invalid private configuration.\n'); process.exit(1); }
});
