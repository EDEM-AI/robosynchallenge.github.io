/* Local-only Google service doubles. No network calls, Drive writes or real email. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = function paperPreview(directory) {
  const root = path.join(directory, 'papers');
  fs.mkdirSync(root, {recursive:true, mode:0o700});
  const blob = (bytes, type, name) => {
    const value = Buffer.from(bytes);
    return {getBytes:()=>Array.from(value), getDataAsString:()=>value.toString('utf8'), getName:()=>name};
  };
  function resolve(id) {
    const file = path.resolve(root, id);
    if (!file.startsWith(root + path.sep)) throw Error('Invalid preview path');
    return file;
  }
  function iterator(values) { let index=0; return {hasNext:()=>index<values.length, next:()=>values[index++]}; }
  function entry(id) {
    const file = resolve(id);
    return {getId:()=>id, getSize:()=>fs.statSync(file).size, getSharingAccess:()=> 'PRIVATE',
      getBlob:()=>blob(fs.readFileSync(file)),
      getFoldersByName:name=>iterator(fs.readdirSync(file).filter(n=>n===name && fs.statSync(path.join(file,n)).isDirectory()).map(n=>entry(id+'/'+n))),
      getFilesByName:name=>iterator(fs.readdirSync(file).filter(n=>n===name && fs.statSync(path.join(file,n)).isFile()).map(n=>entry(id+'/'+n))),
      createFolder:name=>{fs.mkdirSync(resolve(id+'/'+name),{mode:0o700});return entry(id+'/'+name);},
      createFile:value=>{const dest=id+'/'+value.getName();fs.writeFileSync(resolve(dest),Buffer.from(value.getBytes()),{flag:'wx',mode:0o600});return entry(dest);},
    };
  }
  for (const name of ['paper-preview','paper-test-preview','outbox']) fs.mkdirSync(resolve(name),{recursive:true,mode:0o700});
  return {
    Utilities:{Charset:{UTF_8:'utf8'}, DigestAlgorithm:{SHA_256:'sha256'},
      base64Decode:value=>Array.from(Buffer.from(value,'base64')), base64Encode:value=>Buffer.from(value).toString('base64'),
      base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'), newBlob:blob,
      computeDigest:(kind,bytes)=>Array.from(crypto.createHash(kind).update(Buffer.from(bytes)).digest())},
    DriveApp:{Access:{PRIVATE:'PRIVATE'}, getFolderById:entry, getFileById:entry},
    ScriptApp:{getOAuthToken:()=> 'local-preview-only'},
    UrlFetchApp:{fetch:(url, options)=>{
      if(url !== 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') throw Error('Unexpected preview URL');
      const mime=Buffer.from(JSON.parse(options.payload).raw,'base64url');
      const id=crypto.createHash('sha256').update(mime).digest('hex').slice(0,32);
      fs.writeFileSync(resolve('outbox/'+id+'.eml'),mime,{mode:0o600});
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({id})};
    }},
  };
};
