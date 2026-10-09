import assert from 'node:assert/strict';
import {
  Role, Capability, capabilitiesFor, createDevSession, routeDecision,
  assertLearnerSession, employerCanSee, assertSessionEnvelope,
  accessScopeForSession, sameTenant, assertTenantBoundary
} from './access.mjs';

const learner = createDevSession(Role.LEARNER);
const teacher = createDevSession(Role.TEACHER);
const employer = createDevSession(Role.EMPLOYER);
const admin = createDevSession(Role.ADMIN);

assert.equal(learner.schemaVersion, 'rpm-session/v1');
assert.equal(learner.mode, 'DEV_MOCK_ONLY');
assert.equal(learner.assurance, 'UNAUTHENTICATED_DEV_SIMULATION');
assert.equal(learner.organisationId, 'dev-org');
assert.equal(assertSessionEnvelope(learner), true);
assert.deepEqual(accessScopeForSession(learner), {subjectId:'dev-learner',organisationId:'dev-org',role:'LEARNER'});

assert.equal(routeDecision('learn', learner).code, 'ALLOW');
assert.equal(routeDecision('learn', teacher).code, 'ROLE_FORBIDDEN');
assert.equal(routeDecision('teacher', teacher).code, 'STAGE_NOT_OPEN');
assert.equal(routeDecision('employer', employer).code, 'STAGE_NOT_OPEN');
assert.equal(routeDecision('admin', admin).code, 'STAGE_NOT_OPEN');
assert.equal(routeDecision('missing', learner).code, 'ROUTE_NOT_FOUND');
assert.equal(routeDecision('learn', null).code, 'SESSION_REQUIRED');
assert.equal(routeDecision('learn', {...learner, subjectId:''}).code, 'SESSION_INVALID');
assert.equal(assertLearnerSession(learner), true);
assert.throws(() => assertLearnerSession(employer), /LEARNER_ACCESS_DENIED:ROLE_FORBIDDEN/);

assert.ok(capabilitiesFor(Role.LEARNER).includes(Capability.SPEAKING_SUBMIT));
assert.ok(!capabilitiesFor(Role.LEARNER).includes(Capability.SPEAKING_REVIEW));
assert.ok(capabilitiesFor(Role.TEACHER).includes(Capability.SPEAKING_REVIEW));
assert.ok(!capabilitiesFor(Role.TEACHER).includes(Capability.EMPLOYER_STATUS_VIEW));
assert.ok(employerCanSee(Capability.EMPLOYER_STATUS_VIEW));
assert.ok(!employerCanSee(Capability.LEARN_OWN_PROGRESS));
assert.ok(!employerCanSee(Capability.SPEAKING_REVIEW));
assert.ok(!employerCanSee(Capability.ADMIN_AUDIT));

const otherOrg = accessScopeForSession(createDevSession(Role.LEARNER,{subjectId:'dev-other',organisationId:'other-org'}));
assert.equal(sameTenant(accessScopeForSession(learner), accessScopeForSession(teacher)), true);
assert.equal(sameTenant(accessScopeForSession(learner), otherOrg), false);
assert.equal(assertTenantBoundary(learner,'dev-org'), true);
assert.throws(() => assertTenantBoundary(learner,'other-org'), /TENANT_BOUNDARY_DENIED/);

console.log('RPM_S2_ACCESS_TESTS_PASS role-matrix stage-gates privacy-firewall session-envelope tenant-boundary dev-session');
