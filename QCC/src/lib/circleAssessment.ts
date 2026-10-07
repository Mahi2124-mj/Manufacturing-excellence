// QC Circle Level Assessment — 100-item check sheet (Toyota Boshoku format).
// Two axes, five categories each, ten items each → 100 items.
//   X-axis = the circle's ABILITY
//   Y-axis = a positive & satisfying WORKPLACE
// Each item is a yes/no check. Per category the count (0–10) is the category level;
// the axis score is the average of its five category counts (0–10). The (X, Y) point
// is plotted on a maturity matrix to read the circle level (A → D).

export interface AssessCategory {
  code: string;
  name: string;
  items: string[];
}

export interface AssessAxis {
  key: 'x' | 'y';
  title: string;
  subtitle: string;
  categories: AssessCategory[];
}

export const CIRCLE_ASSESSMENT: AssessAxis[] = [
  {
    key: 'x',
    title: "Circle's Ability",
    subtitle: 'X-axis — problem-solving, tools, skills and improvement capability',
    categories: [
      {
        code: 'X-a',
        name: 'Basic concepts and problem-solving steps',
        items: [
          'Working with the mindset of "Quality First"',
          'Working with the mindset of "The next process is the customer"',
          'Ability to apply the "PDCA" cycle in works',
          'Able to improve and propose based on "Genchi Genbutsu"',
          'Able to improve and propose based on "Focus on Key Points"',
          'Working with the "5W1H" principle',
          'Working with consideration for "Standardization"',
          'Able to improve and propose based on "Stratification"',
          'Working with the mindset of "Recurrence prevention"',
          'Able to practice the problem-solving steps based on the above concepts',
        ],
      },
      {
        code: 'X-b',
        name: 'Operation of QC circle activities (Leadership)',
        items: [
          'Able to act according to their own responsibilities',
          'Able to create activity plans and documents related to activities',
          'Able to summarize and create activity reports',
          'Able to proactively engage in problem-solving',
          'Able to explain own ideas to other members',
          'Able to identify problems and define the scope of the topic',
          'Able to identify causes and verify them on-site',
          'Able to propose countermeasures for problems',
          'Able to verify countermeasure effectiveness and propose standardization',
          'Able to reflect on activities and give suggestions for next time',
        ],
      },
      {
        code: 'X-c',
        name: 'QC tools usage, summarize & present',
        items: [
          'Able to create and analyze "Graphs" suitable for the objective',
          'Able to create and analyze "Check sheets" suitable for the objective',
          'Able to create and analyze a "Pareto chart"',
          'Able to create a "Fishbone diagram" and analyze factors',
          'Able to create and analyze a "Matrix diagram"',
          'Able to create and analyze a "Histogram"',
          'Able to create a diagram and expand it to implementation methods',
          'Able to create the documents using QC Story',
          'Able to prepare a presentation and present results',
          'Able to teach the above tools/steps to others',
        ],
      },
      {
        code: 'X-d',
        name: "Specialized skills & member's multi-skill",
        items: [
          'Knows the work standard for the assigned tasks and processes',
          'Has necessary knowledge and skills for the assigned tasks',
          'Able to detect and report abnormalities in the processes',
          'Able to propose/improve to prevent recurrence in the processes',
          'Able to perform the tasks according to the standard work',
          'Can handle more than two tasks well and meet work standards',
          'Can handle more than three tasks well and meet work standards',
          'Has broad knowledge — understands >50% of the tasks in the group',
          'Studies all skills and knowledge needed for the team',
          'Can use their knowledge and skills to teach team members',
        ],
      },
      {
        code: 'X-e',
        name: 'Skills & ability to improve (Motivation)',
        items: [
          'Able to practice standard work for the responsible works',
          'Able to judge normal and abnormal conditions in the processes',
          'Able to identify Muda (the 7 wastes)',
          'Able to explain the basics of Just In Time',
          'Able to explain the basics of Jidoka',
          'Able to identify and explain the causes of variation',
          'Able to propose solutions to improve the causes of variation',
          'Able to write and submit creative (improvement) proposals',
          'Always motivated to improve the workplace',
          'Able to write excellent creative (improvement) proposals',
        ],
      },
    ],
  },
  {
    key: 'y',
    title: 'A positive & satisfying workplace',
    subtitle: 'Y-axis — teamwork, meetings, collaboration, motivation and 5S',
    categories: [
      {
        code: 'Y-a',
        name: 'Personal relationships and teamwork',
        items: [
          'Circle members can casually speak to each other',
          'Circle members can easily communicate with each other',
          'Circle members can help and consult with each other',
          'Actively participate in workplace recreation activities',
          'Able to cooperate with leaders and members in activities',
          'Circle members can work together with unity of purpose',
          'There is a strong sense of solidarity among members',
          'Goals are shared and members work together to achieve them',
          'Work and activities can proceed according to plan',
          'Able to have open, honest discussions and reach consensus',
        ],
      },
      {
        code: 'Y-b',
        name: 'QC Circle meeting implementation',
        items: [
          'Able to make planned preparations in advance for meetings',
          'Attend meetings punctually without being late',
          'Reliably carry out assigned roles',
          "Able to listen to other members' opinions",
          'Able to offer constructive opinions during meetings',
          'Able to speak honestly and openly',
          "Do not criticize others' opinions without reasons",
          'Able to discuss without being stubborn about own opinion',
          'Able to summarize meeting results clearly',
          'Able to understand results and help summarize them',
        ],
      },
      {
        code: 'Y-c',
        name: 'Collaboration with supervisors & departments',
        items: [
          'Able to report when prompted by the supervisor',
          'Able to consult when prompted by the supervisor',
          'Able to report/communicate/consult the supervisor freely',
          'Able to consult the supervisor when facing difficulties',
          'Proactively report task results to the supervisor',
          'Receive advice at each step and complete assigned tasks',
          'Able to utilize information from staff via the leader',
          'Able to coordinate activities with staff via the leader',
          'Able to utilize information from related depts via the leader',
          'Able to collaborate with related depts via the leader',
        ],
      },
      {
        code: 'Y-d',
        name: 'Motivation to improve knowledge & skills',
        items: [
          'Making efforts to learn own work quickly',
          'Having the intention to improve current problems',
          'Able to take actions to improve the current situation',
          'Able to cooperate to achieve goals',
          'Having the motivation to improve at the circle level',
          'Studying QC circles and work methods',
          'Actively asking questions and commenting in meetings',
          'Actively participating in study sessions and training',
          'Actively cooperating with challenging themes',
          'Share knowledge gained from training with other members',
        ],
      },
      {
        code: 'Y-e',
        name: '5S and compliance with workplace rules',
        items: [
          'Proactively greet others',
          'Proactively organize their own area',
          'Proactively arrange their own area',
          'Proactively clean their own area',
          'Able to maintain cleanliness of their own area',
          'Follow safety rules established in the workplace',
          'Follow environmental rules (such as waste separation)',
          'Follow work rules (attendance and leaving procedures)',
          'Follow traffic rules inside and outside the company',
          'Able to guide circle members in complying with rules',
        ],
      },
    ],
  },
];

// Maturity grade from the two axis averages (0–10 each).
export function circleLevel(xAvg: number, yAvg: number): { grade: string; label: string; color: string } {
  const s = (xAvg + yAvg) / 2;
  if (xAvg === 0 && yAvg === 0) return { grade: '—', label: 'Not started', color: '#94a3b8' };
  if (s >= 8.5) return { grade: 'A', label: 'Excellent — self-managing circle', color: '#16a34a' };
  if (s >= 7) return { grade: 'B', label: 'Good — capable, growing circle', color: '#2563eb' };
  if (s >= 5) return { grade: 'C', label: 'Developing — needs guidance', color: '#d97706' };
  return { grade: 'D', label: 'Early stage — needs strong support', color: '#dc2626' };
}
