import type { Messages } from './index';

export const de: Messages = {
  'app.tagline': 'Fokusrunden für deine Aufgaben.',
  'language.label': 'Sprache',
  'language.de': 'Deutsch',
  'language.en': 'English',
  'language.it': 'Italiano',
  'beta.title': 'Beta',
  'beta.intro':
    'Melde dich mit deiner Tester-ID und deinem persönlichen Schlüssel an, um deine Daten mit der Beta zu teilen.',
  'beta.testerId': 'Tester-ID',
  'beta.key': 'Persönlicher Schlüssel',
  'beta.keyHint':
    'Dein Schlüssel ist ein fein granulierter GitHub-Token mit nur «Contents: read/write» auf das eine Beta-Daten-Repo. Er bleibt auf diesem Gerät, wird nie exportiert und beim Abmelden gelöscht.',
  'beta.signIn': 'Anmelden',
  'beta.consent.title': 'Vor deinem ersten Upload',
  'beta.consent.stored':
    'Gespeichert im privaten Beta-Daten-Repo: dein Konto (testers/<id>/account.json: Tester-ID, Name, E-Mail, Sprache, angelegt am, letzte Anmeldung, Browser/Gerät, App-Version) und deine Fokusdaten (Aufgaben, Fokusrunden, Pausen, Unterbrechungen, Coins, Belohnungen) mit einer Zusammenfassung.',
  'beta.consent.evaluated':
    'Wir werten aus, wie Fokusrunden, Aufgaben und Belohnungen genutzt werden, um {app} zu verbessern. Nur das Beta-Team kann die Daten lesen.',
  'beta.consent.signOut':
    'Du kannst dich jederzeit abmelden: Uploads hören auf, deine Daten auf diesem Gerät bleiben.',
  'beta.consent.accept': 'Zustimmen und anmelden',
  'beta.consent.decline': 'Ablehnen',
  'beta.declined':
    'Ohne deine Zustimmung wird nichts übertragen. Du kannst {app} wie bisher nutzen.',
  'beta.signedInAs': 'In der Beta angemeldet als',
  'beta.signOut': 'Abmelden',
  'beta.signedOut':
    'Abgemeldet. Die Uploads sind beendet; deine Daten auf diesem Gerät bleiben.',
  'beta.busy': 'Anmeldung läuft…',
  'beta.error.invalid-id':
    'Diese Tester-ID ist ungültig. Erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche.',
  'beta.error.bad-key':
    'Dieser Schlüssel wurde nicht akzeptiert. Prüfe den Schlüssel und versuche es nochmals; es wurde nichts übertragen.',
  'beta.error.unknown-tester': 'Zu dieser Tester-ID gibt es kein Beta-Konto.',
  'beta.error.locked': 'Dieses Beta-Konto ist gesperrt.',
  'beta.error.offline':
    'GitHub ist nicht erreichbar. Prüfe deine Verbindung und versuche es nochmals.',
  'sync.title': 'Sync zwischen Geräten',
  'sync.intro':
    'Optional: Halte deine Daten über dein eigenes privates GitHub-Repo auf allen Geräten gleich. Ohne Sync verlässt nichts dieses Gerät.',
  'sync.step1':
    'Lege auf GitHub ein neues privates Repository mit README an (z. B. pomo-data).',
  'sync.step2':
    'Settings → Developer settings → Fine-grained tokens → Generate new token. Repository access: «Only select repositories» mit nur diesem Repo. Permissions: «Contents: read/write», sonst nichts.',
  'sync.step3':
    'Gib das Repo als owner/name ein und füge den Token ein. Der Token bleibt auf diesem Gerät, wird nie exportiert und beim Trennen gelöscht.',
  'sync.repo': 'Repository (owner/name)',
  'sync.token': 'Token',
  'sync.connect': 'Verbinden',
  'sync.busy': 'Synchronisiere…',
  'sync.connectedTo': 'Synchronisiert mit',
  'sync.lastSync': 'Letzter Sync:',
  'sync.never': 'auf dieser Seite noch keiner',
  'sync.now': 'Jetzt synchronisieren',
  'sync.disconnect': 'Trennen',
  'sync.disconnected':
    'Getrennt. Der Token ist gelöscht; deine Daten auf diesem Gerät bleiben.',
  'sync.error.invalid-repo':
    'Gib das Repo als owner/name ein, z. B. anna/pomo-data.',
  'sync.error.bad-token':
    'Dieser Token wurde nicht akzeptiert. Prüfe ihn und versuche es nochmals.',
  'sync.error.no-access':
    'Der Token erreicht dieses Repo nicht. Prüfe den Repo-Namen und ob der Token «Contents: read/write» darauf hat.',
  'sync.error.empty-repo':
    'Das Repo ist leer. Lege auf GitHub ein README an und verbinde dich nochmals.',
  'sync.error.offline':
    'GitHub ist nicht erreichbar. Deine Änderungen bleiben hier und werden später synchronisiert.',
  'timer.title': 'Fokusrunde',
  'timer.start': 'Runde starten',
  'timer.abort': 'Abbrechen',
  'timer.pause': 'Pause',
  'timer.resume': 'Fortsetzen',
  'timer.skipBreak': 'Pause überspringen',
  'timer.task': 'Aufgabe',
  'timer.noTask': 'Keine Aufgabe',
  'timer.phase.idle': 'Bereit',
  'timer.phase.focus': 'Fokus',
  'timer.phase.paused': 'Pausiert',
  'timer.phase.short-break': 'Kurze Pause',
  'timer.phase.long-break': 'Lange Pause',
  'timer.progress': 'Fortschritt dieses Abschnitts',
  'timer.mode': 'Modus',
  'timer.mode.strict': 'Strikt (nur Abbrechen)',
  'timer.mode.flexible': 'Flexibel (Pause erlaubt)',
  'timer.abort.title': 'Diese Runde abbrechen?',
  'timer.abort.hint':
    'Eine abgebrochene Runde zählt nicht. Warum hörst du auf?',
  'timer.abort.internal': 'Eigene Ablenkung',
  'timer.abort.external': 'Von jemandem oder etwas unterbrochen',
  'timer.abort.keep': 'Weitermachen',
  'timer.notify.focus.title': 'Fokusrunde geschafft',
  'timer.notify.focus.body': 'Zeit für eine Pause.',
  'timer.notify.break.title': 'Pause vorbei',
  'timer.notify.break.body': 'Bereit für die nächste Runde.',
  'tasks.title': 'Aufgaben',
  'tasks.add.title': 'Titel',
  'tasks.add.project': 'Projekt (optional)',
  'tasks.add.estimate': 'Schätzung (Runden)',
  'tasks.add.submit': 'Aufgabe hinzufügen',
  'tasks.estimate.hint':
    'Grosse Aufgabe: Überlege, sie in kleinere aufzuteilen.',
  'tasks.confirm.title': 'Grosse Aufgabe speichern?',
  'tasks.confirm.body':
    'Diese Aufgabe hat {n} Runden. Aufgaben über 7 Runden gelingen aufgeteilt leichter.',
  'tasks.confirm.save': 'Trotzdem speichern',
  'tasks.confirm.back': 'Zurück',
  'tasks.empty': 'Noch keine Aufgaben. Füge oben deine erste hinzu.',
  'tasks.rounds': '{n} Runden',
  'tasks.edit': 'Bearbeiten',
  'tasks.edit.title': 'Aufgabe bearbeiten',
  'tasks.save': 'Speichern',
  'tasks.cancel': 'Abbrechen',
  'tasks.delete': 'Löschen',
  'tasks.addToday': 'Zu heute',
  'tasks.inToday': 'Heute geplant',
  'tasks.done': 'Erledigt',
  'tasks.error.empty-title': 'Gib einen Titel ein.',
  'tasks.error.invalid-estimate':
    'Die Schätzung muss eine ganze Zahl ab 1 sein.',
  'today.title': 'Heute',
  'today.empty': 'Nichts geplant. Füge Aufgaben aus der Liste unten hinzu.',
  'today.budget': 'Tagesbudget (Runden)',
  'today.budgetBar': 'Budget von heute',
  'today.summary': '{planned} von {budget} Runden geplant',
  'today.over': '{n} über Budget',
  'today.moveUp': 'Nach oben',
  'today.moveDown': 'Nach unten',
  'today.remove': 'Aus heute entfernen',
  'today.checkOff': 'Als erledigt markieren',
};
