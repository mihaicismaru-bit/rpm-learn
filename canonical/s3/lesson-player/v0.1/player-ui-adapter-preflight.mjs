export const PLAYER_UI_ADAPTER_PREFLIGHT_VERSION = 2;

export const S3_5_PLAYER_UI_ADAPTER_PREFLIGHT = Object.freeze({
  status: 'PREFLIGHT_ONLY_S3_4_GATE_REQUIRED',
  baselineLock: 'RPM-UX-BASELINE-LOCK-01',
  productionIntegrationAllowed: false,
  mutatesDom: false,
  rawRuntimeFrameAccepted: false,
  requiredAnchors: Object.freeze({
    role: '#roleBadge',
    title: '#lessonTitle',
    progress: '#progress',
    xp: '#xp',
    activeTime: '#time',
    prompt: '#prompt',
    audio: '#audioBtn',
    exerciseBody: '#exerciseBody',
    feedback: '#feedback'
  }),
  legacySelectorGaps: Object.freeze([
    Object.freeze({
      selector: '#checkBtn',
      observedInLegacyApp: true,
      observedInBaselineHtml: false,
      policy: 'DO_NOT_REQUIRE_IN_S3_ADAPTER'
    })
  ]),
  inputContract: Object.freeze({
    safeRenderModel: Object.freeze([
      'sanitizerVersion',
      'projectionVersion',
      'status',
      'mode',
      'lessonId',
      'contentVersion',
      'sourceLane',
      'progress',
      'current',
      'speakingPending',
      'capabilities',
      'actions',
      'message',
      'integrity'
    ]),
    sessionPort: Object.freeze(['start', 'refresh', 'answer', 'complete'])
  }),
  sanitizerBoundary: Object.freeze({
    projector: 'projectSafeRuntimeFrame',
    sessionPortFactory: 'createSafePlayerUiSessionPort',
    sourceLane: 'RLS-07',
    audioEnabled: false,
    speakingEnabled: false
  }),
  statusPolicy: Object.freeze({
    ACTIVE: 'render-current-runtime-item',
    AWAITING_HUMAN_REVIEW: 'render-speaking-hold-readonly',
    READY_TO_COMPLETE: 'render-completion-action',
    COMPLETED: 'render-completed-readonly',
    INTEGRITY_BLOCKED: 'render-integrity-block-readonly'
  }),
  forbiddenResponsibilities: Object.freeze([
    'raw-runtime-frame-rendering',
    'direct-event-sequence-allocation',
    'direct-eventstore-write',
    'client-side-score-authority',
    'speaking-auto-approval',
    'validated-learning-time-conversion',
    'certificate-or-legal-validity',
    'final-romanian-voice-selection'
  ]),
  deferredLanes: Object.freeze({
    audioMechanics: 'S4.1',
    speakingSubmission: 'S4.2',
    humanReviewBridge: 'S4.3'
  })
});
