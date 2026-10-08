import assert from 'node:assert/strict';
import {buildCertificateGateCandidate,requireCertificateIssuance,CertificateGateError} from './certificate-gate.mjs';

const validation={validationId:'val-final-1',validationKind:'FINAL',decision:'VALID',teacherId:'teacher-1',validatedAt:1000,validatedLearningTimeMs:2000,speakingPendingCount:0};
const provenance={lessonId:'lesson-1',contentVersion:'v1',masteryRuleVersion:'m1',masteryReplayHeadSeq:10,learningTimeLedgerVersion:1,learningTimeEntryCount:2,validationIds:['val-final-1']};
const base={organisationId:'org-1',learnerSubjectId:'learner-1',learnerStatus:'COMPLETED',progress:{completedItems:2,totalItems:2,ratio:1},validatedLearningTimeMs:2000,provenance,certificateAuthority:false,legalAuthority:false,complianceDecisionAuthority:false};
const reportsEvidencePack={reportsEvidenceVersion:1,finalLearningPathReport:{reportVersion:1,reportType:'FINAL_LEARNING_PATH_REPORT',status:'TEACHER_VALIDATED',...base,finalValidation:validation},certificateAuthority:false,legalAuthority:false,complianceDecisionAuthority:false};
const legalSimulation={simulationVersion:1,subjectId:'learner-1',organisationId:'org-1',sourceProvenance:'S6_REPLAY_VALIDATED',weekAttributionAuthority:false,weekAttributionStatus:'UNVERIFIED_SIMULATION_INPUT',legalBlueprintFinal:false,productionComplianceAuthority:false,certificateAuthority:false,legalClaim:false};

const a=buildCertificateGateCandidate({reportsEvidencePack,legalSimulation});
const b=buildCertificateGateCandidate({reportsEvidencePack:structuredClone(reportsEvidencePack),legalSimulation:structuredClone(legalSimulation)});
assert.deepEqual(a,b);
assert.equal(a.status,'LEGAL_APPROVAL_REQUIRED');
assert.equal(a.eligibility,'TECHNICAL_EVIDENCE_READY');
assert.equal(a.certificateIssuanceAuthority,false);
assert.equal(a.autoIssued,false);
assert.equal(a.certificateId,null);
assert.equal(a.issuedAt,null);
assert.equal(Object.isFrozen(a),true);

const reject=(fn,code)=>assert.throws(fn,e=>e instanceof CertificateGateError&&e.code===code,code);
reject(()=>buildCertificateGateCandidate({reportsEvidencePack:{...reportsEvidencePack,finalLearningPathReport:{...reportsEvidencePack.finalLearningPathReport,status:'HUMAN_VALIDATION_REQUIRED'}},legalSimulation}),'CERTIFICATE_HUMAN_FINAL_VALIDATION_REQUIRED');
reject(()=>buildCertificateGateCandidate({reportsEvidencePack,legalSimulation:{...legalSimulation,subjectId:'other'}}),'CERTIFICATE_SCOPE_MISMATCH');
reject(()=>buildCertificateGateCandidate({reportsEvidencePack,legalSimulation:{...legalSimulation,certificateAuthority:true}}),'CERTIFICATE_S10_AUTHORITY_CONTAMINATION');
reject(()=>buildCertificateGateCandidate({reportsEvidencePack,legalSimulation:{...legalSimulation,weekAttributionAuthority:true}}),'CERTIFICATE_WEEK_ATTRIBUTION_MUST_BE_UNVERIFIED');
reject(()=>buildCertificateGateCandidate({reportsEvidencePack,legalSimulation:{...legalSimulation,sourceProvenance:'CALLER_DECLARED'}}),'CERTIFICATE_S6_PROVENANCE_REQUIRED');
reject(()=>buildCertificateGateCandidate({reportsEvidencePack:{...reportsEvidencePack,finalLearningPathReport:{...reportsEvidencePack.finalLearningPathReport,finalValidation:{...validation,speakingPendingCount:1}}},legalSimulation}),'CERTIFICATE_FINAL_VALIDATION_INVALID');
reject(()=>requireCertificateIssuance(),'CERTIFICATE_FINAL_LEGAL_APPROVAL_REQUIRED');
console.log('RPM_S11_CERTIFICATE_GATE_PASS deterministic-candidate final-human-validation scope-bound s6-provenance week-unverified legal-deferred auto-issued-zero issuance-fail-closed');
