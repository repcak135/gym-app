import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router';
import { getActiveWorkout } from '../../data/workouts';
import { getSettings } from '../../data/settings';
import { isAndroid } from '../../audio/backgroundRest';
import RestBar, { RestEndBanner } from './RestBar';
import '../../pages/WorkoutPage.css';

/**
 * The rest timer on every other screen (Statystyki, Historia…) while a workout is on, above the
 * bottom nav. It is the same RestBar, so the end sound and "Koniec przerwy!" work there too.
 * Tapping the time goes back to the workout. The workout screen shows its own bar.
 */
export default function GlobalRest() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onWorkout = pathname.startsWith('/trening');
  const data = useLiveQuery(async () => {
    const workout = await getActiveWorkout();
    return workout ? { workout, settings: await getSettings() } : null;
  }, []);
  const [banner, setBanner] = useState<number | null>(null);
  const hide = useCallback(() => setBanner(null), []);

  if (onWorkout) return null;
  const workout = data?.workout;
  const settings = data?.settings;
  return (
    <>
      {workout && settings && (workout.restEndsAt !== undefined || workout.restEndedAt !== undefined) && (
        <div className="rest-global">
          <RestBar
            workoutId={workout.id}
            restEndsAt={workout.restEndsAt}
            restTotalSec={workout.restTotalSec}
            restEndedAt={workout.restEndedAt}
            preset={settings.restSoundPreset}
            ticks={settings.restTicks}
            vibration={settings.restVibration}
            background={!!settings.restBackgroundAudio && isAndroid()}
            onEnd={setBanner}
            onOpen={() => navigate('/trening')}
          />
        </div>
      )}
      {banner !== null && <RestEndBanner lateMs={banner} onDismiss={hide} />}
    </>
  );
}
