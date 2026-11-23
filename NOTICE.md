# Notices

Gym is licensed under the GNU Affero General Public License v3.0 (see `LICENSE`).

## Exercise data

- **openGym exercise catalogue (text only)** — https://github.com/DuarteSantos8/openGym, `catalogue/exercises/` and the Polish
  translations in `catalogue/i18n/pl.json`, licensed under the GNU AGPL v3.0. Names, muscles, equipment and instructions were
  converted by `scripts/build-opengym.ts` into `src/data/exercises-og.json` (muscle and equipment words mapped to
  free-exercise-db's vocabulary, gym-irrelevant categories left out, exercises already in free-exercise-db merged).
  openGym marks part of its catalogue text as originating from ExerciseDB (`"textSource": "exercisedb"`); it is included here
  as distributed by openGym.
- **No openGym media is included or linked.** openGym's pictures and animations (`catalogue/media/`, © Gym visual) are licensed
  for openGym only and are not part of this project. Exercises from openGym show an equipment icon instead of a photo.
- **free-exercise-db** — https://github.com/yuhonas/free-exercise-db, released into the public domain under the Unlicense
  (exercise data in `src/data/exercise-db.json`; photos loaded from that repository).
- Polish tips (`src/data/tips-pl.json`), Polish translations of free-exercise-db instructions (`src/data/instructions-pl.json`)
  and the extra exercises in `src/data/exercises-extra.json` were written for this project.
