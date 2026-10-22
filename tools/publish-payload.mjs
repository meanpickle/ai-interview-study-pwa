/* Emits only files accepted by the publication boundary check. No credentials. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {publicFiles,root} from './check-public.mjs';
const args=process.argv.slice(2),batch=Number(args[0]||0),size=Number(args[1]||4),files=publicFiles();
if(!Number.isInteger(batch)||batch<0||!Number.isInteger(size)||size<1||size>8)throw new Error('Invalid batch');
const selected=files.slice(batch*size,(batch+1)*size);
console.log(JSON.stringify({total:files.length,batch,files:selected.map(name=>{const bytes=fs.readFileSync(path.join(root,name));const sha=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');return {path:name,encoding:'base64',content:bytes.toString('base64'),sha};})}));
