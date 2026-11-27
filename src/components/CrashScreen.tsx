import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../errors/reporter';

/**
 * A render crash shows this instead of an empty screen: the error for a screenshot, and a way out
 * to Start that skips the automatic jump back into the workout once (it may be what crashes).
 */
export default class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Banana Gym crash', error, info.componentStack);
    reportError(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const where = location.hash || '#/';
    return (
      <div className="crash" role="alert">
        <h1>Coś poszło nie tak</h1>
        <p>Twoje treningi są bezpieczne w telefonie. Zrób zrzut tego ekranu dla autora.</p>
        <pre className="crash__msg">
          {where}
          {'\n'}
          {String(error.message || error)}
          {'\n'}
          {(error.stack ?? '').split('\n').slice(0, 4).join('\n')}
        </pre>
        <button
          type="button"
          className="crash__btn"
          onClick={() => {
            try {
              sessionStorage.setItem('gym.noResume', '1');
            } catch {
              // private mode
            }
            location.replace(location.pathname + '#/');
            location.reload();
          }}
        >
          Wróć na Start
        </button>
      </div>
    );
  }
}
