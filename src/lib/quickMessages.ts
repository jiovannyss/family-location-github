/**
 * Predefined messages catalog. UI strictly Bulgarian.
 * Codes are stable — DO NOT rename without a data migration.
 * (`code` field is open string in DB → adding нови кодове не изисква migration.)
 */

export interface PredefinedQuestion {
  code: string;
  body: string;
  /** Predefined answer codes the recipient can choose from. */
  answers: PredefinedAnswer[];
}

export interface PredefinedAnswer {
  code: string;
  body: string;
}

const COMMON_OK_NEED: PredefinedAnswer[] = [
  { code: 'a_ok', body: 'Да, всичко е наред, благодаря!' },
  { code: 'a_busy', body: 'Зает съм, ще се свържа по-късно.' },
  { code: 'a_call_me', body: 'Свържи се с мен когато можеш.' },
];

export const QUICK_QUESTIONS: PredefinedQuestion[] = [
  {
    code: 'q_status',
    body: 'Всичко наред ли е?',
    answers: COMMON_OK_NEED,
  },
  {
    code: 'q_where',
    body: 'Къде си в момента?',
    answers: [
      { code: 'a_home', body: 'Вкъщи съм.' },
      { code: 'a_work', body: 'На работа/училище съм.' },
      { code: 'a_road', body: 'На път съм.' },
      { code: 'a_call_me', body: 'Свържи се с мен когато можеш.' },
    ],
  },
  {
    code: 'q_eta',
    body: 'Кога ще се прибереш?',
    answers: [
      { code: 'a_eta_15', body: 'След около 15 минути.' },
      { code: 'a_eta_30', body: 'След около 30 минути.' },
      { code: 'a_eta_1h', body: 'След около час.' },
      { code: 'a_eta_late', body: 'Ще закъснея.' },
    ],
  },
  {
    code: 'q_need',
    body: 'Имаш ли нужда от нещо?',
    answers: COMMON_OK_NEED,
  },
  {
    code: 'q_pickup',
    body: 'Може ли да ме вземеш?',
    answers: [
      { code: 'a_yes_now', body: 'Да, тръгвам сега.' },
      { code: 'a_yes_soon', body: 'Да, но след малко.' },
      { code: 'a_no', body: 'За съжаление, не мога сега.' },
    ],
  },
  {
    code: 'q_call_me',
    body: 'Свържи се с мен когато можеш.',
    answers: [
      { code: 'a_ack', body: 'Разбрано, ще се свържа.' },
      { code: 'a_busy', body: 'Зает съм, ще се свържа по-късно.' },
    ],
  },
  {
    code: 'q_arrived',
    body: 'Стигна ли вече?',
    answers: [
      { code: 'a_yes_arrived', body: 'Да, току-що пристигнах.' },
      { code: 'a_almost', body: 'Почти, остават няколко минути.' },
      { code: 'a_road', body: 'На път съм.' },
    ],
  },
  {
    code: 'q_thinking',
    body: 'Мисля за теб ❤️',
    answers: [
      { code: 'a_too', body: 'И аз за теб ❤️' },
      { code: 'a_thanks', body: 'Благодаря ти!' },
    ],
  },
];

export function getQuestionByCode(code: string): PredefinedQuestion | undefined {
  return QUICK_QUESTIONS.find((q) => q.code === code);
}
