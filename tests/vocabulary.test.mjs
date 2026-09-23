import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const items=JSON.parse(readFileSync(resolve(root,'content/rooms-and-furniture-level-2.json'),'utf8'));

test('the progressive activity has 20 distinct visual questions and four valid answers each',()=>{
 assert.equal(items.length,20);
 assert.equal(new Set(items.map(item=>item.answer)).size,20);
 assert.equal(items.filter(item=>item.image_url.startsWith('/rooms/')).length,10);
 assert.equal(items.filter(item=>item.image_url.startsWith('/furniture/')).length,10);
 for(const item of items){
  assert.ok(existsSync(resolve(root,'public',item.image_url.slice(1))),`missing illustration: ${item.image_url}`);
  assert.equal(item.choices.length,4);
  assert.equal(new Set(item.choices.map(word=>word.toLowerCase())).size,4);
  assert.ok(item.choices.includes(item.answer));
 }
});
