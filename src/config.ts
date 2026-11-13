/** Single place for the user-facing product name (rename = one-line change). */
export const APP_NAME = 'pomo.pomo';

/** App version from package.json (written to the beta account, FR-502). */
export const APP_VERSION = __APP_VERSION__;

/**
 * Personal sync through the user's own GitHub repo (NFR-10). Off for now (Gianluca, 13.11.2026,
 * POMO-85): the beta account carries the data across devices. The code stays; `true` brings the
 * panel back.
 */
export const OWN_REPO_SYNC = false;
