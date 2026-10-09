export const Role = Object.freeze({
  LEARNER: 'LEARNER',
  TEACHER: 'TEACHER',
  EMPLOYER: 'EMPLOYER',
  ADMIN: 'ADMIN'
});

export const Capability = Object.freeze({
  LEARN_USE: 'learn:use',
  LEARN_OWN_PROGRESS: 'learn:own_progress',
  SPEAKING_SUBMIT: 'speaking:submit',
  SPEAKING_REVIEW: 'speaking:review',
  TEACHER_VIEW: 'teacher:view',
  EMPLOYER_STATUS_VIEW: 'employer:status_view',
  REPORT_DOWNLOAD: 'report:download',
  ADMIN_CONTENT: 'admin:content',
  ADMIN_AUDIT: 'admin:audit'
});

const ROLE_CAPABILITIES = Object.freeze({
  [Role.LEARNER]: Object.freeze([
    Capability.LEARN_USE,
    Capability.LEARN_OWN_PROGRESS,
    Capability.SPEAKING_SUBMIT
  ]),
  [Role.TEACHER]: Object.freeze([
    Capability.TEACHER_VIEW,
    Capability.SPEAKING_REVIEW
  ]),
  [Role.EMPLOYER]: Object.freeze([
    Capability.EMPLOYER_STATUS_VIEW,
    Capability.REPORT_DOWNLOAD
  ]),
  [Role.ADMIN]: Object.freeze([
    Capability.ADMIN_CONTENT,
    Capability.ADMIN_AUDIT
  ])
});

export const ROUTES = Object.freeze({
  learn: Object.freeze({ id: 'learn', capability: Capability.LEARN_USE, stage: 'S2', live: true }),
  teacher: Object.freeze({ id: 'teacher', capability: Capability.TEACHER_VIEW, stage: 'S7', live: false }),
  employer: Object.freeze({ id: 'employer', capability: Capability.EMPLOYER_STATUS_VIEW, stage: 'S8', live: false }),
  admin: Object.freeze({ id: 'admin', capability: Capability.ADMIN_CONTENT, stage: 'S10+', live: false })
});

export function capabilitiesFor(role) {
  if (!Object.values(Role).includes(role)) throw new Error(`UNKNOWN_ROLE:${role}`);
  return ROLE_CAPABILITIES[role];
}

export function hasCapability(session, capability) {
  return !!session && capabilitiesFor(session.role).includes(capability);
}

export function createDevSession(role = Role.LEARNER, { subjectId = null, organisationId = 'dev-org' } = {}) {
  if (!Object.values(Role).includes(role)) throw new Error(`UNKNOWN_ROLE:${role}`);
  const session = {
    schemaVersion: 'rpm-session/v1',
    mode: 'DEV_MOCK_ONLY',
    subjectId: subjectId || `dev-${role.toLowerCase()}`,
    organisationId,
    role,
    scopes: Object.freeze([...capabilitiesFor(role)]),
    assurance: 'UNAUTHENTICATED_DEV_SIMULATION',
    expiresAt: null
  };
  assertSessionEnvelope(session);
  return Object.freeze(session);
}

export function assertSessionEnvelope(session) {
  if (!session || session.schemaVersion !== 'rpm-session/v1') {
    const err = new Error('SESSION_ENVELOPE_INVALID:SCHEMA');
    err.code = 'SESSION_ENVELOPE_INVALID';
    throw err;
  }
  if (!Object.values(Role).includes(session.role)) {
    const err = new Error('SESSION_ENVELOPE_INVALID:ROLE');
    err.code = 'SESSION_ENVELOPE_INVALID';
    throw err;
  }
  if (typeof session.subjectId !== 'string' || !session.subjectId.trim()) {
    const err = new Error('SESSION_ENVELOPE_INVALID:SUBJECT');
    err.code = 'SESSION_ENVELOPE_INVALID';
    throw err;
  }
  if (typeof session.organisationId !== 'string' || !session.organisationId.trim()) {
    const err = new Error('SESSION_ENVELOPE_INVALID:ORGANISATION');
    err.code = 'SESSION_ENVELOPE_INVALID';
    throw err;
  }
  if (session.mode !== 'DEV_MOCK_ONLY' || session.assurance !== 'UNAUTHENTICATED_DEV_SIMULATION') {
    const err = new Error('SESSION_ENVELOPE_INVALID:ASSURANCE');
    err.code = 'SESSION_ENVELOPE_INVALID';
    throw err;
  }
  return true;
}

export function accessScopeForSession(session) {
  assertSessionEnvelope(session);
  return Object.freeze({
    subjectId: session.subjectId,
    organisationId: session.organisationId,
    role: session.role
  });
}

export function sameTenant(scopeA, scopeB) {
  return !!scopeA && !!scopeB
    && scopeA.organisationId === scopeB.organisationId;
}

export function assertTenantBoundary(session, resourceOrganisationId) {
  assertSessionEnvelope(session);
  if (session.organisationId !== resourceOrganisationId) {
    const err = new Error('TENANT_BOUNDARY_DENIED');
    err.code = 'TENANT_BOUNDARY_DENIED';
    throw err;
  }
  return true;
}

export function routeDecision(routeId, session) {
  const route = ROUTES[routeId];
  if (!route) return Object.freeze({ allowed: false, code: 'ROUTE_NOT_FOUND', routeId });
  if (!session) return Object.freeze({ allowed: false, code: 'SESSION_REQUIRED', routeId });
  try { assertSessionEnvelope(session); }
  catch { return Object.freeze({ allowed: false, code: 'SESSION_INVALID', routeId }); }
  if (!hasCapability(session, route.capability)) return Object.freeze({ allowed: false, code: 'ROLE_FORBIDDEN', routeId });
  if (!route.live) return Object.freeze({ allowed: false, code: 'STAGE_NOT_OPEN', routeId, stage: route.stage });
  return Object.freeze({ allowed: true, code: 'ALLOW', routeId, stage: route.stage });
}

export function assertLearnerSession(session) {
  const d = routeDecision('learn', session);
  if (!d.allowed) {
    const err = new Error(`LEARNER_ACCESS_DENIED:${d.code}`);
    err.code = d.code;
    throw err;
  }
  return true;
}

// Deliberate privacy firewall. Employer access never inherits teacher/learner evidence scopes.
export function employerCanSee(capability) {
  return capabilitiesFor(Role.EMPLOYER).includes(capability);
}
