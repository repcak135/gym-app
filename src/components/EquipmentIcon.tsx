import { Cable, Dumbbell, PersonStanding, Weight } from 'lucide-react';

/** Stand-in for exercises without photos, chosen by equipment. */
export default function EquipmentIcon({ equipment, size }: { equipment: string | null; size: number }) {
  if (equipment === 'machine') return <Weight size={size} aria-hidden="true" />;
  if (equipment === 'cable') return <Cable size={size} aria-hidden="true" />;
  if (equipment === 'body only') return <PersonStanding size={size} aria-hidden="true" />;
  return <Dumbbell size={size} aria-hidden="true" />;
}
