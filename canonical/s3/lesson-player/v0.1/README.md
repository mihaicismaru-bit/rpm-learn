# RPM LEARN S3 — Lesson Player engine v0.1

Status: development branch, not production.

Purpose:
- derive a production Lesson Player view from the validated S2 event/replay model;
- emit answer/completion intents without bypassing EventStore sequencing or persistence;
- fail closed on replay corruption;
- keep adult curriculum gating on RLS-07/RLS-08/RLS-09;
- expose speaking as a human-review hold for the next audio/speaking workflow lane.

Non-goals in v0.1:
- no UX redesign;
- no final Romanian voice work;
- no microphone/media workflow;
- no Teacher OS review mutation;
- no compliance-time conversion;
- no certificate/legal validity;
- no production or real learner/employer data.

Canonical inheritance:
- S2 baseline is the promoted main build RPM-S2B-BROWSER-GATE-v2.6.1.
- Learning Engine != Compliance Engine.
