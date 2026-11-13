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
};
