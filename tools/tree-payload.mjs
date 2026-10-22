/* Emit bounded chunks of reviewed public source; never reads the parent workspace. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {publicFiles,root} from './check-public.mjs';
const files=publicFiles().map(name=>{
 const bytes=fs.readFileSync(path.join(root,name)),binary=/\.png$/i.test(name);
 const sha=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 return {path:name,binary,sha,content:binary?bytes.toString('base64'):bytes.toString('utf8')};
});
const payload=JSON.stringify({files}),size=12000;
if(process.argv[2]==='--info')console.log(JSON.stringify({files:files.length,chars:payload.length,chunks:Math.ceil(payload.length/size)}));
else{const i=Number(process.argv[2]);if(!Number.isInteger(i)||i<0)throw new Error('Invalid chunk');console.log(JSON.stringify({i,chunk:payload.slice(i*size,(i+1)*size)}));}
