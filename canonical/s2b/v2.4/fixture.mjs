export const lesson = {
  lessonId: 'RLS07-P0-HELP-01',
  contentVersion: 'rpm-rls07-p0-help-01@0.1.0',
  source: {
    lane: 'RLS-07',
    audience: '16+',
    level: 'preA1',
    artifactIds: [
      '1J6sxjzpdjR55iESlq8wtrJBldwUGGftJ4tASsYC8RD8',
      '1uKTISnCJqVN4mdICAN-TtXGYRpyAL_nAY7-CAk9PNsY',
      '1toH4pHdzoEFWePG1qiI22EetLkLIkntxv2-jB9HQH3A'
    ],
    sourceObserved: '2026-09-29'
  },
  title: 'Cer ajutor la curs',
  outcome: 'Recunoaște și folosește formule simple de solicitare a ajutorului.',
  items: [
    {
      id: 'E01', type: 'listen_choose', skill: 'listening_help', difficulty: 1,
      prompt: 'Ascultă și alege sensul.', audioText: 'Nu înțeleg.',
      choices: ['Nu înțeleg.', 'Am terminat.', 'Este corect?'], correctAnswer: 'Nu înțeleg.',
      feedbackCorrect: 'Corect.', feedbackRetry: 'Mai încearcă.', evidenceClass: 'listening_recognition'
    },
    {
      id: 'E02', type: 'scenario_choose', skill: 'functional_help', difficulty: 1,
      prompt: 'Profesorul vorbește prea repede. Ce spui?',
      choices: ['Mai încet, vă rog.', 'Am terminat.', 'Unde scriu?'], correctAnswer: 'Mai încet, vă rog.',
      feedbackCorrect: 'Da — ceri un ritm mai lent.', feedbackRetry: 'Alege formula pentru „prea repede”.', evidenceClass: 'functional_selection'
    },
    {
      id: 'E03', type: 'order_words', skill: 'phrase_construction', difficulty: 1,
      prompt: 'Pune cuvintele în ordine.', tokens: ['MAI', 'ÎNCET', 'VĂ', 'ROG'],
      scoringRule: { kind: 'all_of', answers: ['MAI', 'ÎNCET', 'VĂ', 'ROG'] },
      feedbackCorrect: 'Corect: MAI ÎNCET, VĂ ROG.', feedbackRetry: 'Ordinea începe cu MAI ÎNCET.', evidenceClass: 'phrase_construction'
    },
    {
      id: 'E04', type: 'listen_choose', skill: 'listening_intent', difficulty: 1,
      prompt: 'Ascultă și alege intenția.', audioText: 'Repetați, vă rog.',
      choices: ['Vreau să aud din nou.', 'Am terminat.', 'Vreau să scriu.'], correctAnswer: 'Vreau să aud din nou.',
      feedbackCorrect: 'Corect.', feedbackRetry: 'Formula cere repetarea.', evidenceClass: 'listening_intent'
    },
    {
      id: 'E05', type: 'scenario_choose', skill: 'functional_help', difficulty: 1,
      prompt: 'Nu știi unde trebuie să scrii. Ce spui?',
      choices: ['Unde scriu?', 'Este corect?', 'Am terminat.'], correctAnswer: 'Unde scriu?',
      feedbackCorrect: 'Corect.', feedbackRetry: 'Caută întrebarea despre locul de scriere.', evidenceClass: 'functional_language'
    },
    {
      id: 'E06', type: 'listen_repeat', skill: 'speaking_help', difficulty: 1,
      prompt: 'Ascultă și repetă: „Mai încet, vă rog.”', audioText: 'Mai încet, vă rog.',
      scoringRule: { kind: 'human_review' }, teacherReviewRequired: true,
      evidenceClass: 'speaking_submission'
    },
    {
      id: 'E07', type: 'read_choose', skill: 'reading_help', difficulty: 1,
      prompt: 'Vrei să verifici răspunsul. Ce spui?',
      choices: ['Este corect?', 'Nu înțeleg.', 'Am terminat.'], correctAnswer: 'Este corect?',
      feedbackCorrect: 'Corect.', feedbackRetry: 'Alege formula de verificare.', evidenceClass: 'reading_functional'
    },
    {
      id: 'E08', type: 'checkpoint', skill: 'help_checkpoint', difficulty: 2,
      prompt: 'Checkpoint: alege răspunsul potrivit pentru fiecare situație.',
      scenarios: [
        { text: 'Nu înțelegi.', choices: ['Nu înțeleg.', 'Am terminat.'], answer: 'Nu înțeleg.' },
        { text: 'Vrei să auzi din nou.', choices: ['Repetați, vă rog.', 'Este corect?'], answer: 'Repetați, vă rog.' },
        { text: 'Ai terminat sarcina.', choices: ['Am terminat.', 'Unde scriu?'], answer: 'Am terminat.' }
      ],
      scoringRule: { kind: 'min_correct', answers: ['Nu înțeleg.', 'Repetați, vă rog.', 'Am terminat.'], minCorrect: 2 },
      feedbackCorrect: 'Checkpoint trecut.', feedbackRetry: 'Refă itemii țintiți înainte de o nouă încercare.', evidenceClass: 'checkpoint'
    }
  ]
};
