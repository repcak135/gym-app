# Duplikaty w bazie ćwiczeń

Wygenerowane przez `node scripts/dedupe-exercises.ts` (2026-11-23).

Porównanie: znormalizowana nazwa (małe litery, bez interpunkcji, liczba pojedyncza, dowolna kolejność słów,
synonimy: pulldown/pull down, db/dumbbell, ez bar/ez-bar, lever/machine, smith/smith machine, one/single arm, „v. 2”
i „(plate loaded)” pomijane) + ten sam sprzęt + ten sam główny mięsień.

| | Liczba |
|---|---|
| Ćwiczenia przed scaleniem (free-exercise-db + własne x- + openGym) | 5110 |
| Grupy identyczne po normalizacji | 225 |
| Wpisy usunięte automatycznie (identyczne) | 273 |
| Pary podobne do przejrzenia | 138 |
| …uznane za to samo ćwiczenie (scalone) | 119 |
| …uznane za inny wariant (zostają osobno) | 19 |
| …nierozstrzygnięte (do decyzji w scripts/dedupe-review.json) | 0 |
| Wpisy usunięte łącznie (openGym i własne x-) | 379 |
| Duplikaty wewnątrz samej free-exercise-db (zostawione: oba mają zdjęcia i mogą być w planach) | 2 |
| Ćwiczeń po scaleniu | 4731 |

Zostaje jedno ćwiczenie na ruch: najpierw id z free-exercise-db (ma zdjęcia), potem własne x-, potem openGym.
Nazwy usuniętych wpisów (angielskie i polskie) są aliasami — wyszukiwanie i import znajdują je pod każdą nazwą.
Kto miał już w planie lub historii usunięty wpis, dostaje go przepięty na zachowane ćwiczenie (aktualizacja bazy).

## Przykłady scaleń

- **Air Bike** ← Air Bike V. 2
- **Alternating Floor Press** ← Kettlebell Alternating Press on Floor
- **Alternating Renegade Row** ← Kettlebell Alternating Renegade Row
- **Arnold Dumbbell Press** ← Dumbbell Arnold Press V. 2
- **Ball Leg Curl** ← Exercise Ball Leg Curl, Leg Curl (On Stability Ball)
- **Band Hip Adductions** ← Band Hip Adduction
- **Band Pull Apart** ← Resistance Band Pull Apart
- **Barbell Side Split Squat** ← Barbell Side Split Squat V. 2
- **Bench Press - With Bands** ← Band Bench Press
- **Bent-Arm Barbell Pullover** ← Barbell Bent Arm Pullover V. 2
- **Bent Press** ← Kettlebell Bent Press
- **Body Tricep Press** ← Triceps Press
- **Bodyweight Squat** ← Squat
- **Bosu Ball Cable Crunch With Side Bends** ← Cable Side Bend Crunch (Bosu Ball)
- **Box Squat** ← Barbell Box Squat
- **Cable Lying Triceps Extension** ← Cable Lying Triceps Extension V. 2
- **Calf Press** ← Lever Calf Press
- **Calf Raises - With Bands** ← Band Calf Raise, Resistance Band Calf Raise, Band Calf Raise V. 2, Band Calf Raise V. 3
- **Catch and Overhead Throw** ← Medicine Ball Catch and Overhead Throw
- **Chair Squat** ← Lever Chair Squat
- **Chest Push from 3 point stance** ← Medicine Ball Chest Push from 3 Point Stance
- **Chest Push (multiple response)** ← Medicine Ball Chest Push Multiple Response
- **Chest Push (single response)** ← Medicine Ball Chest Push Single Response
- **Chest Push with Run Release** ← Medicine Ball Chest Push with Run Release
- **Close-Grip Dumbbell Press** ← Dumbbell Close Grip Press V. 2

## Przykłady odrzucone przy przeglądzie (różne warianty)

- Lying Leg Raise ≠ Lying Full Leg Raise
- Lever Seated Crunch ≠ Lever Seated Full Crunch
- Lever Seated Left Side Crunch ≠ Lever Seated Right Side Crunch
- Bench Full Squat ≠ Bodyweight Bench Squat
- Barbell Full Squat ≠ Barbell Squat
- Barbell Full Squat ≠ Olympic Squat
- Barbell Full Squat ≠ Barbell Olympic Squat
- Barbell Squat ≠ Olympic Squat
- Barbell Squat ≠ Barbell Olympic Squat
- Zercher Squats ≠ Barbell Full Zercher Squat
