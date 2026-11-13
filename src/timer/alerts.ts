import type { TimerView } from './cycle';

/** `mm:ss`, rounding up so a running phase never shows 00:00 before it ends. */
export function formatClock(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Tab title `mm:ss · task` while a phase runs, the app name otherwise (FR-108). */
export function tabTitle(
  view: Pick<TimerView, 'phase' | 'remainingMs'>,
  taskTitle: string,
  appName: string,
): string {
  if (view.phase === 'idle') return appName;
  const clock = formatClock(view.remainingMs);
  return taskTitle ? `${clock} · ${taskTitle}` : clock;
}

export interface NotificationAdapter {
  readonly permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  show(title: string, body?: string): void;
}

export interface Alerts {
  /** Sound plus, when permitted, a system notification (FR-104). Texts are already translated. */
  announce(title: string, body: string): void;
  /** Asks for notification permission; call from a user gesture (Start click). */
  prepare(): void;
}

export interface AlertsOptions {
  playSound?: () => void;
  notification?: NotificationAdapter;
}

export function createAlerts(options: AlertsOptions = {}): Alerts {
  const playSound = options.playSound ?? beep;
  const notification = options.notification ?? browserNotification();
  return {
    announce(title, body) {
      try {
        playSound();
      } catch {
        // No audio output available: title and notification still report the end.
      }
      if (notification?.permission === 'granted')
        notification.show(title, body);
    },
    prepare() {
      if (notification?.permission === 'default')
        void notification.requestPermission().catch(() => {});
      audio()
        ?.resume()
        .catch(() => {});
    },
  };
}

function browserNotification(): NotificationAdapter | undefined {
  if (typeof Notification === 'undefined') return undefined;
  return {
    get permission() {
      return Notification.permission;
    },
    requestPermission: () => Notification.requestPermission(),
    show: (title, body) => void new Notification(title, { body }),
  };
}

let ctx: AudioContext | undefined;
function audio(): AudioContext | undefined {
  if (ctx) return ctx;
  const Ctor = globalThis.AudioContext;
  if (!Ctor) return undefined;
  ctx = new Ctor();
  return ctx;
}

/** Two soft sine tones; synthesised so no audio file ships. */
function beep(): void {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime;
  for (const [i, freq] of [660, 880].entries()) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + i * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + i * 0.3 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.3 + 0.28);
    osc.connect(gain).connect(c.destination);
    osc.start(t0 + i * 0.3);
    osc.stop(t0 + i * 0.3 + 0.3);
  }
}
