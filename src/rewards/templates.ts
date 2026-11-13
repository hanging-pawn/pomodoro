/** Template rewards seeded on first start, per UI language (FR-408). Titles are user data once seeded. */
export const REWARD_TEMPLATES: Record<
  string,
  readonly { title: string; price: number }[]
> = {
  en: [
    { title: 'Coffee break', price: 40 },
    { title: 'Walk outside', price: 30 },
    { title: 'One episode', price: 80 },
    { title: 'Favourite snack', price: 50 },
    { title: 'Music session', price: 60 },
    { title: 'Lazy evening', price: 120 },
  ],
  de: [
    { title: 'Kaffeepause', price: 40 },
    { title: 'Spaziergang', price: 30 },
    { title: 'Eine Folge schauen', price: 80 },
    { title: 'Lieblingssnack', price: 50 },
    { title: 'Musikstunde', price: 60 },
    { title: 'Fauler Abend', price: 120 },
  ],
  it: [
    { title: 'Pausa caffè', price: 40 },
    { title: 'Passeggiata', price: 30 },
    { title: 'Un episodio', price: 80 },
    { title: 'Snack preferito', price: 50 },
    { title: 'Sessione di musica', price: 60 },
    { title: 'Serata pigra', price: 120 },
  ],
};

export function templatesFor(locale: string) {
  return REWARD_TEMPLATES[locale] ?? REWARD_TEMPLATES.en!;
}
