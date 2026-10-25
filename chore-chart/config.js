// The one file to edit when setting up the chart.
// Names, chores and looks below are placeholders.

export const CONFIG = {
  title: 'Chore Chart',

  // 0 = weeks start on Sunday, 1 = Monday.
  weekStartsOn: 0,

  // Any date in the week when chores[0] belongs to kids[0], chores[1] to kids[1], and so on.
  // Every new week each kid moves down to the next chore on the list.
  rotationStart: '2026-10-25',

  // Days between showers before the counter turns amber ("due"). One more day and it turns red.
  // A kid can have their own `showerEvery`.
  showerEvery: 2,

  // `id` is what the saved history is keyed on, so keep it stable once you start using the chart.
  // Looks:
  //   hair:   short | long | pigtails | ponytail | bun | curly
  //   emblem: star | heart | bolt | flower | none   (the picture on their shirt)
  //   extras: glasses, freckles, bow (a color)
  kids: [
    {
      id: 'kid1',
      name: 'Leo',
      color: '#2f6fdb',
      look: { skin: '#f1c7a2', hair: 'short', hairColor: '#5a3a22', shirt: '#2f6fdb', emblem: 'bolt' },
    },
    {
      id: 'kid2',
      name: 'Maya',
      color: '#e0457b',
      look: { skin: '#f1c7a2', hair: 'long', hairColor: '#3b2416', shirt: '#e0457b', emblem: 'heart', bow: '#ffd23f' },
    },
    {
      id: 'kid3',
      name: 'Nora',
      color: '#16a085',
      look: { skin: '#f1c7a2', hair: 'pigtails', hairColor: '#a8662f', shirt: '#16a085', emblem: 'flower', freckles: true },
    },
  ],

  // Main chores. These rotate between the kids every week.
  //   icon: dishes | trash | sweep | laundry | table | toys | plants | pet | vacuum | bed
  //   when: daily  (a check-off for each day)  |  weekly  (one check-off for the week)
  chores: [
    { id: 'dishes', name: 'Dishes', note: 'After dinner', icon: 'dishes', when: 'daily' },
    { id: 'trash', name: 'Trash & recycling', note: 'Bins out on trash night', icon: 'trash', when: 'weekly' },
    { id: 'tidy', name: 'Tidy the living room', note: 'Toys away before bed', icon: 'toys', when: 'daily' },
  ],

  // Chores every kid does every day. Not rotated. Leave the list empty to hide this section.
  everyone: [
    { id: 'bed', name: 'Make your bed', icon: 'bed', when: 'daily' },
  ],
};
