import { composeSafePlayerUiRender } from './player-ui-safe-render-pipeline.mjs';
const frame={lessonId:'RLS07-SMOKE',contentVersion:'rls07-smoke@1.0.0',sourceLane:'RLS-07',status:'ACTIVE',progress:{completedItems:0,totalItems:1,ratio:0},current:{itemId:'E01',kind:'READ_CHOOSE',prompt:'Alege.',answerable:true,requiresHumanReview:false,choices:['A','B'],correctAnswer:'A'},canComplete:false,speakingPending:[],replay:{code:'LEARNING_REPLAY_CONTIGUOUS_AND_SEMANTIC'}};
const out=composeSafePlayerUiRender(frame);
if(out.safeRenderModel.sourceLane!=='RLS-07'||out.safeRenderModel.actions.audio!==false||out.safeRenderModel.actions.speaking!==false||out.renderPlan.commands.some(x=>x.anchor==='#checkBtn'))throw new Error('RPM_S3_5_SAFE_RENDER_PIPELINE_SMOKE_FAIL');
console.log('RPM_S3_5_SAFE_RENDER_PIPELINE_SMOKE_PASS');
