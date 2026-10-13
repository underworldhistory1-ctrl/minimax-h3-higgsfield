const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../web/lab-ui.js'),'utf8');
const normalize=vm.runInNewContext(source.match(/function restoredPreparationMode\(value\)\{[^\n]+\}/)[0]+';restoredPreparationMode');
test('reopening projects preserves automatic, AI and direct preparation choices',()=>{
 for(const value of ['auto','ai','native'])assert.equal(normalize(value),value);
});
test('old projects without preparation settings open with automatic formatting',()=>{
 for(const value of [undefined,null,'unknown'])assert.equal(normalize(value),'auto');
});
