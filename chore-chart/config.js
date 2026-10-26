// The one file to edit when setting up the chart.
// The kids' looks below are guesses. Tune hair, skin and colors to match them.

export const CONFIG = {
  title: 'Chore Chart',

  // 0 = weeks start on Sunday, 1 = Monday.
  weekStartsOn: 0,

  // Days that get a box on the chart (0 = Sunday ... 6 = Saturday). Saturday is off.
  // A single chore can have its own `days`, e.g. homework on school days only: days: [0, 1, 2, 3, 4].
  days: [0, 1, 2, 3, 4, 5],

  // Any date in the week when chores[0] belongs to kids[0], chores[1] to kids[1], and so on.
  // Every new week each kid moves down to the next chore on the list.
  rotationStart: '2026-10-25',

  // A shower is due this many days after the last one (2 = every other night).
  // The counter turns amber on the due day and red after that. A kid can have their own `showerEvery`.
  showerEvery: 2,

  // `id` is what the saved history is keyed on, so keep it stable once you start using the chart.
  // Looks:
  //   hair:   short | long | pigtails | ponytail | bun | curly
  //   emblem: star | heart | bolt | flower | none   (the picture on their shirt)
  //   extras: glasses, freckles, bow (a color)
  kids: [
    {
      id: 'zamir',
      name: 'Zamir',
      color: '#2f6fdb',
      look: { skin: '#f1c7a2', hair: 'short', hairColor: '#5a3a22', shirt: '#2f6fdb', emblem: 'bolt' },
    },
    {
      id: 'meitav',
      name: 'Meitav',
      color: '#e0457b',
      look: { skin: '#f1c7a2', hair: 'long', hairColor: '#3b2416', shirt: '#e0457b', emblem: 'heart', bow: '#ffd23f' },
    },
    {
      id: 'raya',
      name: 'Raya',
      color: '#16a085',
      look: { skin: '#f1c7a2', hair: 'pigtails', hairColor: '#a8662f', shirt: '#16a085', emblem: 'flower', freckles: true },
    },
  ],

  // Weekly jobs. These rotate between the kids every week. A job's room goes with it.
  //   icon: dishes | trash | sweep | laundry | table | toys | plants | pet | dogout | vacuum | bed |
  //         backpack | homework | snacks | cleartable | cleanup | bottles | artroom | basement |
  //         brushteeth | floss
  //   when: daily  (a box for each day)  |  weekly  (one box for the week)
  chores: [
    { id: 'set-table', name: 'Set the table', icon: 'table', when: 'daily',
      room: { id: 'playroom', name: 'Tidy the playroom', icon: 'toys' } },
    { id: 'bottles', name: 'Wash water bottles', icon: 'bottles', when: 'daily',
      room: { id: 'basement', name: 'Tidy the basement', icon: 'basement' } },
    { id: 'sweep', name: 'Sweep the floor', icon: 'sweep', when: 'daily',
      room: { id: 'art-room', name: 'Tidy the art room', icon: 'artroom' } },
  ],

  // Chores every kid does every day. Not rotated.
  everyone: [
    { id: 'backpack', name: 'Unpack backpack', icon: 'backpack', when: 'daily' },
    { id: 'homework', name: 'Do homework', icon: 'homework', when: 'daily' },
    { id: 'snacks', name: 'Pack snacks', icon: 'snacks', when: 'daily' },
    { id: 'clear-table', name: 'Clear the table', icon: 'cleartable', when: 'daily' },
    { id: 'clean-up', name: 'Clean up after yourself', icon: 'cleanup', when: 'daily' },
    { id: 'brush-teeth', name: 'Brush teeth', icon: 'brushteeth', when: 'daily' },
    { id: 'floss', name: 'Floss', icon: 'floss', when: 'daily' },
  ],

  // The dog. Whoever lets her out taps their face under "Who let Bamba out?" and gets a paw point.
  // A second tap within `cooldownMinutes` of the last trip doesn't count, so nobody farms points.
  // Set `pet: null` to hide the dog bar.
  pet: {
    name: 'Bamba',
    cooldownMinutes: 10,
    look: { fur: '#d9a066', ears: '#9b6537' },
  },
};
