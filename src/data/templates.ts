import { db } from './db';
import { getSettings } from './settings';
import type { Plan, PlanItem } from './types';

export interface TemplateItem {
  exerciseId: string;
  fallback?: string[];
  sets: number;
  repsMin: number;
  repsMax: number;
  targetSec?: number;
}
export interface TemplateDay {
  name: string;
  note: string;
  items: TemplateItem[];
}
export interface PlanTemplate {
  id: string;
  name: string;
  tagline: string;
  description: string[];
  days: TemplateDay[];
}

export const TEMPLATE_CREDIT = 'Inspirowane książką „Fundamenty Treningu Siłowego” (Michał Sakowski)';

const main = (exerciseId: string, fallback?: string[]): TemplateItem => ({
  exerciseId,
  ...(fallback ? { fallback } : {}),
  sets: 5,
  repsMin: 5,
  repsMax: 5,
});
const acc = (exerciseId: string, sets = 3, repsMin = 8, repsMax = 10, fallback?: string[]): TemplateItem => ({
  exerciseId,
  ...(fallback ? { fallback } : {}),
  sets,
  repsMin,
  repsMax,
});
const plank = (sets: number): TemplateItem => ({ exerciseId: 'Plank', sets, repsMin: 8, repsMax: 12, targetSec: 30 });

const FBW_TAGLINE = '3 treningi w tygodniu, całe ciało, na zmianę A i B';

const fbwDescription = (extra: string): string[] => [
  'Dla kogo: dla osób, które dopiero zaczynają na siłowni albo wracają po dłuższej przerwie.',
  'Jak często: 3 razy w tygodniu, z dniem odpoczynku pomiędzy (np. pon–śr–pt). Treningi A i B robisz na zmianę: w jednym tygodniu A-B-A, w kolejnym B-A-B. Aplikacja sama podpowie, który dzień jest następny.',
  'Na czym polega: każdy trening ćwiczy całe ciało. Najpierw trzy główne ćwiczenia po 5 serii po 5 powtórzeń, potem kilka mniejszych ćwiczeń po 3 serie.' +
    extra,
  'Jak zacząć: pierwsze treningi zrób lekko — nawet z samym gryfem — i skup się na technice. Przed głównym ćwiczeniem użyj przycisku „Dobierz rozgrzewkę”, a aplikacja zaproponuje lżejsze serie.',
  'Jak robić postępy: w głównych ćwiczeniach, gdy zrobisz wszystkie 5×5, następnym razem aplikacja zaproponuje trochę większy ciężar. W mniejszych ćwiczeniach najpierw dokładasz powtórzenia (do 10), potem ciężar. Gdy przez 3 treningi nic nie rośnie, zobaczysz propozycję, żeby zejść o ok. 10% i zbudować się od nowa.',
  'Wszystko możesz zmienić: po dodaniu to zwykły plan — zamienisz ćwiczenia, serie i przerwy.',
];

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'fbw-women',
    name: 'FBW dla początkujących — kobiety',
    tagline: FBW_TAGLINE,
    description: fbwDescription(' Dodatki mocniej angażują pośladki i nogi.'),
    days: [
      {
        name: 'A',
        note: 'Przysiad, wyciskanie, wiosłowanie + dodatki',
        items: [
          main('Barbell_Squat'),
          main('Barbell_Bench_Press_-_Medium_Grip'),
          main('Bent_Over_Barbell_Row'),
          acc('Side_Lateral_Raise'),
          acc('Barbell_Hip_Thrust', 3, 8, 10, ['x-dumbbell-hip-thrust']),
          acc('Cable_Crunch'),
          acc('Standing_Calf_Raises'),
        ],
      },
      {
        name: 'B',
        note: 'Martwy ciąg, wyciskanie nad głowę, podciąganie + dodatki',
        items: [
          main('Barbell_Deadlift'),
          main('Standing_Military_Press'),
          main('Chin-Up', ['Close-Grip_Front_Lat_Pulldown']),
          acc('Dumbbell_Rear_Lunge', 3, 8, 10, ['Crossover_Reverse_Lunge']),
          acc('Thigh_Abductor', 3, 8, 10, ['x-cable-hip-abduction']),
          plank(3),
          acc('Standing_Calf_Raises'),
        ],
      },
    ],
  },
  {
    id: 'fbw-men',
    name: 'FBW dla początkujących — mężczyźni',
    tagline: FBW_TAGLINE,
    description: fbwDescription(' Dodatki to m.in. ramiona i brzuch.'),
    days: [
      {
        name: 'A',
        note: 'Przysiad, wyciskanie, wiosłowanie + dodatki',
        items: [
          main('Barbell_Squat'),
          main('Barbell_Bench_Press_-_Medium_Grip'),
          main('Bent_Over_Barbell_Row'),
          acc('Side_Lateral_Raise'),
          acc('Barbell_Curl'),
          acc('Triceps_Pushdown'),
          acc('Cable_Crunch'),
          acc('Standing_Calf_Raises'),
        ],
      },
      {
        name: 'B',
        note: 'Martwy ciąg, wyciskanie nad głowę, podciąganie + dodatki',
        items: [
          main('Barbell_Deadlift'),
          main('Standing_Military_Press'),
          main('Chin-Up', ['Close-Grip_Front_Lat_Pulldown']),
          acc('Close-Grip_Barbell_Bench_Press'),
          acc('Dumbbell_Bicep_Curl'),
          plank(3),
          acc('Standing_Calf_Raises'),
        ],
      },
    ],
  },
  {
    id: 'intermediate-4',
    name: 'Plan 4-dniowy dla średnio zaawansowanych',
    tagline: '4 treningi w tygodniu: dzień siły, nogi, góra i lżejszy dzień całego ciała',
    description: [
      'Dla kogo: dla osób, które trenują już jakiś czas i ciężar przestał rosnąć z treningu na trening.',
      'Jak często: 4 razy w tygodniu, np. poniedziałek, środa, czwartek i sobota.',
      'Na czym polega: każdy dzień ma inne zadanie. Dzień 1 to siła — ciężko, mało powtórzeń (3–5). Dni 2 i 3 to budowa mięśni — średni ciężar, 8–10 powtórzeń; dzień 2 to nogi, dzień 3 górna część ciała. Dzień 4 jest lżejszy — więcej powtórzeń (12–15), żeby ciało odpoczęło, a mimo to pracowało.',
      'Ćwiczenia dodatkowe: na końcu dni są mniejsze ćwiczenia po 2 serie. Wymień je na te, które Tobie są potrzebne — np. więcej barków albo pośladków.',
      'Jak robić postępy: aplikacja przy każdej serii podpowie, czy dorzucić powtórzenie, czy ciężar. Ustaw w Ustawieniach, jak ciężko chcesz trenować, i oceniaj trudność serii — podpowiedź to uwzględni.',
      'Wszystko możesz zmienić: po dodaniu to zwykły plan — zamienisz ćwiczenia, serie i przerwy.',
    ],
    days: [
      {
        name: '1 — Siła (całe ciało)',
        note: 'Ciężko i krótko: 3–5 powtórzeń',
        items: [
          acc('Barbell_Squat', 4, 3, 5),
          acc('Barbell_Deadlift', 4, 3, 5),
          acc('Barbell_Bench_Press_-_Medium_Grip', 4, 3, 5),
          acc('Pullups', 4, 3, 5, ['Wide-Grip_Lat_Pulldown']),
          acc('Standing_Military_Press', 4, 3, 5),
          acc('Face_Pull', 2),
        ],
      },
      {
        name: '2 — Nogi',
        note: 'Średnio ciężko: 8–10 powtórzeń',
        items: [
          acc('Leg_Press', 4),
          acc('Romanian_Deadlift', 4),
          acc('Split_Squat_with_Dumbbells', 4, 8, 10),
          acc('Barbell_Hip_Thrust', 4),
          acc('Lying_Leg_Curls', 2),
          acc('Standing_Calf_Raises', 2),
          acc('Cable_Crunch', 2),
        ],
      },
      {
        name: '3 — Góra',
        note: 'Średnio ciężko: 8–10 powtórzeń',
        items: [
          acc('Barbell_Bench_Press_-_Medium_Grip', 4),
          acc('Wide-Grip_Lat_Pulldown', 4),
          acc('Dumbbell_Shoulder_Press', 4, 8, 10, ['Standing_Military_Press']),
          acc('Seated_Cable_Rows', 4),
          acc('Barbell_Curl', 2),
          acc('Triceps_Pushdown', 2),
          acc('Side_Lateral_Raise', 2),
          acc('Face_Pull', 2),
        ],
      },
      {
        name: '4 — Lżej (całe ciało)',
        note: 'Lżejszy ciężar, więcej powtórzeń: 12–15',
        items: [
          acc('Leg_Press', 2, 12, 15),
          acc('Incline_Dumbbell_Press', 2, 12, 15),
          acc('One-Arm_Dumbbell_Row', 2, 12, 15),
          acc('Side_Lateral_Raise', 2),
          acc('Reverse_Flyes', 2),
          acc('Lying_Leg_Curls', 2),
          plank(2),
        ],
      },
    ],
  },
];

function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Adds an editable copy of a template as a new plan; never changes the active plan. */
export async function createPlanFromTemplate(templateId: string): Promise<Plan> {
  const tpl = PLAN_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) throw new Error('Nie znaleziono szablonu');
  const settings = await getSettings();

  const wanted = new Set(tpl.days.flatMap((d) => d.items.flatMap((i) => [i.exerciseId, ...(i.fallback ?? [])])));
  const present = new Set((await db.exercises.bulkGet([...wanted])).filter((e) => e).map((e) => e!.id));

  const names = new Set((await db.plans.toArray()).map((p) => p.name));
  let name = tpl.name;
  for (let n = 2; names.has(name); n++) name = `${tpl.name} (${n})`;

  const plan: Plan = {
    id: crypto.randomUUID(),
    name,
    startedAt: todayLocal(),
    days: tpl.days.map((d) => ({
      id: crypto.randomUUID(),
      name: d.name,
      items: d.items.flatMap((it): PlanItem[] => {
        const exerciseId = [it.exerciseId, ...(it.fallback ?? [])].find((id) => present.has(id));
        if (!exerciseId) return [];
        return [
          {
            exerciseId,
            sets: it.sets,
            warmupSets: 0,
            repsMin: it.repsMin,
            repsMax: it.repsMax,
            restSec: settings.defaultRestSec,
            ...(it.targetSec !== undefined ? { targetSec: it.targetSec } : {}),
          },
        ];
      }),
    })),
  };
  await db.plans.add(plan);
  return plan;
}
