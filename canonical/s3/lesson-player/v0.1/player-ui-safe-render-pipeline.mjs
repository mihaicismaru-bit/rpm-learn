import { projectSafeRuntimeFrame, createSafePlayerUiSessionPort } from './player-ui-render-sanitizer.mjs';
import { buildPlayerUiRenderCommands } from './player-ui-render-commands.mjs';

export const PLAYER_UI_SAFE_RENDER_PIPELINE_VERSION = 1;

function composeSafeModel(safeRenderModel) {
  const renderPlan = buildPlayerUiRenderCommands(safeRenderModel);
  for (const field of ['sourceLane','status','lessonId','contentVersion']) {
    if (safeRenderModel[field] !== renderPlan[field]) throw new Error('UI_SAFE_PIPELINE_BINDING_MISMATCH:' + field);
  }
  if (safeRenderModel.sourceLane !== 'RLS-07') throw new Error('UI_SAFE_PIPELINE_SOURCE_LANE_BLOCKED');
  if (safeRenderModel.actions.audio !== false || safeRenderModel.actions.speaking !== false) {
    throw new Error('UI_SAFE_PIPELINE_DEFERRED_ACTION_ENABLED');
  }
  return Object.freeze({
    pipelineVersion: PLAYER_UI_SAFE_RENDER_PIPELINE_VERSION,
    safeRenderModel,
    renderPlan
  });
}

export function composeSafePlayerUiRender(runtimeFrame) {
  return composeSafeModel(projectSafeRuntimeFrame(runtimeFrame));
}

export function createSafeRenderCommandSessionPort(controller) {
  const safePort = createSafePlayerUiSessionPort(controller);
  const invoke = async (method, args) => composeSafeModel(await safePort[method](...args));
  return Object.freeze({
    start: (...args) => invoke('start', args),
    refresh: (...args) => invoke('refresh', args),
    answer: (...args) => invoke('answer', args),
    complete: (...args) => invoke('complete', args)
  });
}
