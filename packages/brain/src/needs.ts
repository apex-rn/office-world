// Body needs — the pressure behind a real day (WORLD_PLAN §11.3). Nothing here picks an action: needs only rise
// with time and fall when the person does something that meets them; the mind reads them as first-person
// feelings ("I'm getting hungry") and decides itself. No timers, no scripted coffee breaks.
import type { Command } from '../../sim/src/world.js';
import type { Identity } from './identity.js';

export interface Needs {
  hunger: number; thirst: number; caffeine: number; bladder: number;
  /** tiredness of the mind after long focus (rest, a walk, a chat bring it down) */
  fatigue: number;
  /** wish to talk to someone */
  social: number;
  /** smokers only */
  nicotine: number;
}

export const freshNeeds = (): Needs => ({ hunger: 0.15, thirst: 0.2, caffeine: 0.3, bladder: 0.1, fatigue: 0, social: 0.2, nicotine: 0.2 });

/** Rise per hour, by person: a 4-coffee person gets the caffeine itch every ~3 h, a smoker wants a cigarette every ~2 h. */
export function rates(p: Identity): Needs {
  const cups = Math.max(0.5, p.habits.coffeePerDay);
  return {
    hunger: 0.16, thirst: 0.22, caffeine: cups / 12, bladder: 0.14, fatigue: 0.11, social: 0.28,
    nicotine: p.habits.smoker ? 0.4 : 0,
  };
}

export function tick(p: Identity, n: Needs, hours: number, working: boolean): Needs {
  const r = rates(p), c = (x: number) => Math.max(0, Math.min(1, x));
  return {
    hunger: c(n.hunger + r.hunger * hours), thirst: c(n.thirst + r.thirst * hours),
    caffeine: c(n.caffeine + r.caffeine * hours), bladder: c(n.bladder + r.bladder * hours),
    fatigue: c(n.fatigue + (working ? r.fatigue * 1.6 : -r.fatigue) * hours), social: c(n.social + r.social * hours),
    nicotine: c(n.nicotine + r.nicotine * hours),
  };
}

/** What an action does to the body (applied when the body accepted the command). */
export function satisfy(n: Needs, c: Command): Needs {
  const m = { ...n };
  const act = c.verb === 'use' ? String(c.action) : c.verb;
  switch (act) {
    case 'brew_coffee': m.caffeine = 0; m.thirst = Math.max(0, m.thirst - 0.4); m.bladder += 0.15; m.fatigue = Math.max(0, m.fatigue - 0.25); break;
    case 'take_food': case 'heat_food': m.hunger = 0; break;
    case 'take_drink': case 'fill_water': m.thirst = 0; m.bladder += 0.2; break;
    case 'consume': m.hunger = Math.max(0, m.hunger - 0.5); m.thirst = Math.max(0, m.thirst - 0.5); break;
    case 'use_toilet': m.bladder = 0; break;
    case 'smoke': m.nicotine = 0; m.social = Math.max(0, m.social - 0.2); m.fatigue = Math.max(0, m.fatigue - 0.15); break;
    case 'say': m.social = Math.max(0, m.social - 0.2); m.fatigue = Math.max(0, m.fatigue - 0.05); break;
    case 'read': case 'watch': m.fatigue = Math.max(0, m.fatigue - 0.3); break;
    case 'wait': if (c.verb === 'wait' && c.seconds >= 60) m.fatigue = Math.max(0, m.fatigue - 0.1); break;
  }
  m.bladder = Math.min(1, m.bladder);
  return m;
}

/** First-person body feelings worth mentioning, strongest first, with where to meet them. */
export function describe(n: Needs, smoker: boolean): string[] {
  const out: [number, string][] = [];
  const say = (v: number, mild: string, strong: string) => { if (v >= 0.55) out.push([v, v >= 0.8 ? strong : mild]); };
  say(n.bladder, 'I will need the toilet soon (wc.toilet1-3: use_toilet).', 'I really need the toilet now (wc.toilet1-3: use_toilet).');
  say(n.hunger, 'I am getting hungry (kitchen.fridge: take_food, kitchen.microwave: heat_food).', 'I am very hungry — time to eat (kitchen.fridge: take_food).');
  say(n.thirst, 'I am a bit thirsty (kitchen.water: fill_water).', 'I am really thirsty (kitchen.water: fill_water).');
  say(n.caffeine, 'I could use a coffee (kitchen.coffee: brew_coffee).', 'I badly want my coffee (kitchen.coffee: brew_coffee).');
  if (smoker) say(n.nicotine, 'I would like a cigarette on the balcony (balcony.ashtray: smoke).', 'I need a cigarette (balcony.ashtray: smoke).');
  say(n.fatigue, 'My focus is fading — a short break would help.', 'I am mentally drained — I need a real break.');
  say(n.social, 'I would like to talk to someone for a minute.', 'I have been alone with my work too long — I want to talk to a colleague.');
  return out.sort((a, b) => b[0] - a[0]).map(x => x[1]);
}

/** How pressing the strongest need is (0..1): a strong need wakes the mind even in the middle of focused work. */
export const urgency = (n: Needs, smoker: boolean): number =>
  Math.max(n.bladder, n.hunger, n.thirst, n.caffeine, smoker ? n.nicotine : 0, n.fatigue * 0.9, n.social * 0.8);
