import assert from 'node:assert/strict';
import { composeSafePlayerUiRender, createSafeRenderCommandSessionPort } from './player-ui-safe-render-pipeline.mjs';

function frame(overrides={}) {
  return {
    lessonId:'RLS07-SMOKE',
    contentVersion:'rls07-smoke@1.0.0',
    sourceLane:'RLS-07',
    status:'ACTIVE',
    progress:{completedItems:0,totalItems:2,ratio:0},
    current:{itemId:'E01',kind:'READ_CHOOSE',prompt:'Alege.',answerable:true,requiresHumanReview:false,choices:['A','B'],correctAnswer:'A',internalScore:1},
    canComplete:false,
    speakingPending:[],
    replay:{code:'LEARNING_REPLAY_CONTIGUOUS_AND_SEMANTIC',internalEventIds:['hidden']},
    xp:999,
    activeMs:999999,
    ...overrides
  };
}

{
  const out=composeSafePlayerUiRender(frame());
  assert.equal(out.safeRenderModel.sourceLane,'RLS-07');
  assert.deepEqual(out.renderPlan.interaction,{kind:'ANSWER',enabled:true,readOnly:false});
  for(const key of ['xp','activeMs','replay']) assert.equal(key in out.safeRenderModel,false);
  for(const key of ['correctAnswer','internalScore']) assert.equal(key in out.safeRenderModel.current,false);
  assert.equal(out.renderPlan.commands.some(x=>x.anchor==='#checkBtn'||x.anchor==='#xp'||x.anchor==='#time'),false);
  assert.equal(out.safeRenderModel.actions.audio,false);
  assert.equal(out.safeRenderModel.actions.speaking,false);
}

{
  const out=composeSafePlayerUiRender(frame({
    status:'AWAITING_HUMAN_REVIEW',
    current:{itemId:'E02',kind:'LISTEN_REPEAT',prompt:'Repetă.',answerable:false,requiresHumanReview:true,audioText:'Mai încet, vă rog.'},
    speakingPending:['E02']
  }));
  assert.deepEqual(out.renderPlan.interaction,{kind:'NONE',enabled:false,readOnly:true});
}

{
  const ready=composeSafePlayerUiRender(frame({
    status:'READY_TO_COMPLETE',
    progress:{completedItems:2,totalItems:2,ratio:1},
    current:null,
    canComplete:true
  }));
  assert.deepEqual(ready.renderPlan.interaction,{kind:'COMPLETE',enabled:true,readOnly:false});
}

{
  const blocked=composeSafePlayerUiRender(frame({
    status:'INTEGRITY_BLOCKED',
    current:null,
    replay:{code:'REPLAY_SEQUENCE_GAP_OR_DUPLICATE',internalEventIds:['hidden']}
  }));
  assert.deepEqual(blocked.safeRenderModel.integrity,{blocked:true,code:'REPLAY_SEQUENCE_GAP_OR_DUPLICATE'});
  assert.equal('replay' in blocked.safeRenderModel,false);
  assert.deepEqual(blocked.renderPlan.interaction,{kind:'NONE',enabled:false,readOnly:true});
}

{
  const calls=[];
  const controller={
    start:async()=>{calls.push('start');return frame();},
    refresh:async()=>{calls.push('refresh');return frame();},
    answer:async()=>{calls.push('answer');return frame({progress:{completedItems:1,totalItems:2,ratio:0.5}});},
    complete:async()=>{calls.push('complete');return frame({status:'COMPLETED',progress:{completedItems:2,totalItems:2,ratio:1},current:null,canComplete:false});},
    internalWrite:async()=>{}
  };
  const port=createSafeRenderCommandSessionPort(controller);
  assert.deepEqual(Object.keys(port),['start','refresh','answer','complete']);
  assert.equal('internalWrite' in port,false);
  await port.start(); await port.refresh(); await port.answer('E01','A'); await port.complete();
  assert.deepEqual(calls,['start','refresh','answer','complete']);
}

console.log('RPM_S3_5_SAFE_RENDER_PIPELINE_SMOKE_PASS private-fields-stripped human-review-readonly completion-gated integrity-bounded narrow-session-port audio-speaking-deferred');
