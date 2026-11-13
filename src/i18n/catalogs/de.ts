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
};
