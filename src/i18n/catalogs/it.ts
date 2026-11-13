import type { Messages } from './index';

export const it: Messages = {
  'app.tagline': 'Sessioni di concentrazione per le tue attività.',
  'language.label': 'Lingua',
  'language.de': 'Deutsch',
  'language.en': 'English',
  'language.it': 'Italiano',
  'beta.title': 'Beta',
  'beta.intro':
    'Accedi con il tuo ID tester e la tua chiave personale per condividere i tuoi dati con la beta.',
  'beta.testerId': 'ID tester',
  'beta.key': 'Chiave personale',
  'beta.keyHint':
    "La tua chiave è un token GitHub a grana fine con solo «Contents: read/write» sull'unico repository dei dati beta. Resta su questo dispositivo, non viene mai esportata e viene cancellata quando esci.",
  'beta.signIn': 'Accedi',
  'beta.consent.title': 'Prima del tuo primo caricamento',
  'beta.consent.stored':
    "Salvato nel repository privato dei dati beta: il tuo account (testers/<id>/account.json: ID tester, nome, e-mail, lingua, data di creazione, ultimo accesso, browser/dispositivo, versione dell'app) e i tuoi dati di concentrazione (attività, sessioni, pause, interruzioni, monete, ricompense) con un riepilogo.",
  'beta.consent.evaluated':
    'Valutiamo come vengono usate sessioni, attività e ricompense, per migliorare {app}. Solo il team beta può leggere i dati.',
  'beta.consent.signOut':
    'Puoi uscire in qualsiasi momento: i caricamenti si fermano, i tuoi dati su questo dispositivo restano.',
  'beta.consent.accept': 'Accetto e accedo',
  'beta.consent.decline': 'Rifiuta',
  'beta.declined':
    'Senza il tuo consenso non viene inviato nulla. Puoi usare {app} come prima.',
  'beta.signedInAs': 'Accesso alla beta come',
  'beta.signOut': 'Esci',
  'beta.signedOut':
    'Uscito. I caricamenti sono fermi; i tuoi dati su questo dispositivo restano.',
  'beta.busy': 'Accesso in corso…',
  'beta.error.invalid-id':
    'Questo ID tester non è valido. Usa lettere minuscole, cifre e trattini.',
  'beta.error.bad-key':
    'Questa chiave non è stata accettata. Controlla la chiave e riprova; non è stato inviato nulla.',
  'beta.error.unknown-tester':
    'Non esiste un account beta con questo ID tester.',
  'beta.error.locked': 'Questo account beta è bloccato.',
  'beta.error.offline':
    'GitHub non è raggiungibile. Controlla la connessione e riprova.',
};
