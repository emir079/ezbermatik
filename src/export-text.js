import { sceneStatus } from './query.js';

export const heading = sc => `${sc.no}) ${sc.title}`;

export const toText = sections => sections
  .map(s => [s.heading, ...s.blocks.map(b => b.type === 'line' ? `${b.speaker}: ${b.text}` : b.text)].join('\n'))
  .join('\n\n') + '\n';

export const sceneList = (script, name) => script.scenes
  .map(sc => ({ sc, st: sceneStatus(sc, name) }))
  .filter(x => x.st)
  .map(({ sc, st }) => ({ heading: heading(sc) + (st === 'maybe' ? ' — muhtemel' : ''), blocks: [] }));
