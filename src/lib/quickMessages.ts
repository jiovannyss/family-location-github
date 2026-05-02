/**
 * Predefined messages catalog. UI strictly Bulgarian.
 * Codes are stable — DO NOT rename without a data migration.
 */

export interface PredefinedQuestion {
  code: 'q1' | 'q2' | 'q3';
  body: string;
  /** Predefined answer codes the recipient can choose from. */
  answers: PredefinedAnswer[];
}

export interface PredefinedAnswer {
  code: string;
  body: string;
}

export const QUICK_QUESTIONS: PredefinedQuestion[] = [
  {
    code: 'q1',
    body: 'Всичко наред ли е?',
    answers: [
      { code: 'a1_1', body: 'Да, всичко е наред, благодаря!' },
      { code: 'a1_2', body: 'Свържи се с мен когато можеш.' },
    ],
  },
  {
    code: 'q2',
    body: 'Имаш ли нужда от нещо?',
    answers: [
      { code: 'a2_1', body: 'Нямам нужда от нищо, благодаря!' },
      { code: 'a2_2', body: 'Свържи се с мен когато можеш.' },
    ],
  },
  {
    code: 'q3',
    body: 'Свържи се с мен когато можеш.',
    answers: [
      { code: 'a3_ack', body: 'Разбрано, ще се свържа.' },
    ],
  },
];

export function getQuestionByCode(code: string): PredefinedQuestion | undefined {
  return QUICK_QUESTIONS.find((q) => q.code === code);
}
