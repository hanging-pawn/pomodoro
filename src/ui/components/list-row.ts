export interface ListRowOptions {
  /** Main text, already translated or user data. */
  title: string;
  /** Secondary line, e.g. «2 of 3 rounds» or «about 10:50»; a node for rich content (coin amounts). */
  meta?: string | Node;
  /** Right-hand content: a number, an icon button. */
  trailing?: Node;
  /** Makes the row selectable; the row then holds a full-width button. */
  onSelect?: () => void;
  /** `reward` = accent-coloured row between tasks (FR-603); `done` = struck, muted. */
  tone?: 'default' | 'reward' | 'done';
}

/** One row of a list (<li>); put rows into a <ul class="ui-list">. Min height 44 px (NFR-05). */
export function listRow(options: ListRowOptions): HTMLLIElement {
  const li = document.createElement('li');
  li.className = `ui-row ui-row--${options.tone ?? 'default'}`;

  const text = document.createElement('span');
  text.className = 'ui-row__text';
  const title = document.createElement('span');
  title.className = 'ui-row__title';
  title.textContent = options.title;
  text.append(title);
  if (options.meta) {
    const meta = document.createElement('span');
    meta.className = 'ui-row__meta';
    if (typeof options.meta === 'string') meta.textContent = options.meta;
    else meta.append(options.meta);
    text.append(meta);
  }

  if (options.onSelect) {
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'ui-row__select';
    select.append(text);
    select.addEventListener('click', options.onSelect);
    li.append(select);
  } else li.append(text);

  if (options.trailing) {
    const trailing = document.createElement('span');
    trailing.className = 'ui-row__trailing';
    trailing.append(options.trailing);
    li.append(trailing);
  }
  return li;
}
