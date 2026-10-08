const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarizeQueue}=require('../../web/h3/queue-ui.js');
const row=(id,metadata={})=>[1,id,{'secret':{inputs:{prompt:'PRIVATE PROMPT'}}},metadata,[]];
test('Idle and malformed queue rows are handled without inventing jobs',()=>{
  assert.deepEqual(summarizeQueue(null,null),{running:[],pending:[],total:0,ownStatus:'none',ownPosition:null,canCancelOwn:false,foreignCount:0});
  assert.equal(summarizeQueue({queue_running:[null,{},[],[1,42]],queue_pending:'invalid'},null).total,0);
});
test('Own queued job keeps waiting position separate from running jobs',()=>{
  const summary=summarizeQueue({queue_running:[row('foreign')],queue_pending:[row('studio',{h3_lab_job_id:'x'}),row('own')]},'own');
  assert.equal(summary.ownStatus,'pending');assert.equal(summary.ownPosition,2);assert.equal(summary.total,3);assert.equal(summary.canCancelOwn,true);assert.equal(summary.foreignCount,2);
  assert.deepEqual(summary.running[0],{own:false,phase:'running',position:null,label:'Other project'});
  assert.equal(summary.pending[0].label,'H3 Studio · other project');
});
test('Only exact prompt ID matches own running job and metadata remains private',()=>{
  const queue={queue_running:[row('owner',{h3_lab_request_id:'<script>bad</script>'})],queue_pending:[row('owner-suffix')]};
  assert.equal(summarizeQueue(queue,'owner').ownStatus,'running');
  const foreign=summarizeQueue(queue,'unrelated');assert.equal(foreign.canCancelOwn,false);assert.equal(foreign.ownStatus,'checking');
  assert.ok(!JSON.stringify(foreign).includes('PRIVATE PROMPT'));assert.ok(!JSON.stringify(foreign).includes('<script>'));
});
