/** Fired on `document` after any task or plan change so other views (the timer's task list) can reload. */
export const DATA_CHANGED = 'pomo:data-changed';

/** Fired on `document` with `detail` = task id when a view (the Horizon) picks the task of the next round (FR-607). */
export const PICK_TASK = 'pomo:pick-task';
