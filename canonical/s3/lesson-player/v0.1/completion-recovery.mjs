import { LessonPlayerSessionController, LessonPlayerSessionError } from './session-controller.mjs';

export const COMPLETION_RECOVERY_VERSION = 1;

function stableMastery(mastery = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(mastery)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([skill, value]) => [skill, Object.freeze({ ...(value || {}) })])
  ));
}

export function projectRecoveryState(view) {
  if (!view || typeof view !== 'object') throw new LessonPlayerSessionError('RECOVERY_VIEW_REQUIRED');
  return Object.freeze({
    recoveryVersion: COMPLETION_RECOVERY_VERSION,
    lessonId: view.lessonId,
    contentVersion: view.contentVersion,
    status: view.status,
    progress: Object.freeze({
      completedItems: Number(view.progress?.completedItems) || 0,
      totalItems: Number(view.progress?.totalItems) || 0,
      ratio: Number(view.progress?.ratio) || 0
    }),
    currentItemId: view.currentItem?.id ?? null,
    interactionKind: view.interaction?.kind ?? null,
    xp: Number(view.xp) || 0,
    activeMs: Number(view.activeMs) || 0,
    mastery: stableMastery(view.mastery),
    speakingPending: Object.freeze([...(view.speakingPending || [])]),
    canComplete: view.canComplete === true,
    integrityBlocked: view.status === 'INTEGRITY_BLOCKED',
    replayCode: view.replay?.code ?? null
  });
}

export class CompletionRecoverySession {
  constructor(options) {
    this.controller = new LessonPlayerSessionController(options);
  }

  async start() {
    const { eventStore, lesson } = this.controller;
    await eventStore.open();
    await eventStore.activateContent(lesson);
    const view = await this.controller.refresh();

    if (view.status === 'INTEGRITY_BLOCKED' || view.status === 'COMPLETED') {
      this.controller.started = true;
      return view;
    }
    return this.controller.start();
  }

  current() {
    return this.controller.current();
  }

  recoveryState() {
    return projectRecoveryState(this.current());
  }

  async answer(itemId, response) {
    const view = this.current();
    if (view.status === 'INTEGRITY_BLOCKED') {
      throw new LessonPlayerSessionError('RECOVERY_INTEGRITY_BLOCKED', { replay: view.replay });
    }
    return this.controller.answer(itemId, response);
  }

  async complete() {
    const view = this.current();
    if (view.status === 'INTEGRITY_BLOCKED') {
      throw new LessonPlayerSessionError('RECOVERY_INTEGRITY_BLOCKED', { replay: view.replay });
    }
    if (view.status === 'COMPLETED') return view;
    return this.controller.complete();
  }
}
