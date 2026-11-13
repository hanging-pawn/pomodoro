/** Source catalog: its keys define the message keys of every language. */
export const en = {
  'app.tagline': 'Focus rounds for your tasks.',
  'language.label': 'Language',
  'language.de': 'Deutsch',
  'language.en': 'English',
  'language.it': 'Italiano',
  'beta.title': 'Beta',
  'beta.intro':
    'Sign in with your tester ID and personal key to share your data with the beta.',
  'beta.testerId': 'Tester ID',
  'beta.key': 'Personal key',
  'beta.keyHint':
    'Your key is a fine-grained GitHub token with only «Contents: read/write» on the one beta data repo. It stays on this device, is never exported and is deleted when you sign out.',
  'beta.signIn': 'Sign in',
  'beta.consent.title': 'Before your first upload',
  'beta.consent.stored':
    'Stored in the private beta data repo: your account (testers/<id>/account.json: tester ID, name, e-mail, language, created, last login, browser/device, app version) and your focus data (tasks, focus rounds, breaks, interruptions, coins, rewards) with a summary.',
  'beta.consent.evaluated':
    'We evaluate how focus rounds, tasks and rewards are used, to improve {app}. Only the beta team can read the data.',
  'beta.consent.signOut':
    'You can sign out at any time: uploads stop, your data on this device stays.',
  'beta.consent.accept': 'Agree and sign in',
  'beta.consent.decline': 'Decline',
  'beta.declined':
    'Without your consent nothing is sent. You can use {app} as before.',
  'beta.signedInAs': 'Signed in to the beta as',
  'beta.signOut': 'Sign out',
  'beta.signedOut':
    'Signed out. Uploads have stopped; your data on this device stays.',
  'beta.busy': 'Signing in…',
  'beta.error.invalid-id':
    'This tester ID is not valid. Use lower-case letters, digits and hyphens.',
  'beta.error.bad-key':
    'This key was not accepted. Check the key and try again; nothing was sent.',
  'beta.error.unknown-tester': 'There is no beta account with this tester ID.',
  'beta.error.locked': 'This beta account is locked.',
  'beta.error.offline':
    'GitHub is not reachable. Check your connection and try again.',
};
