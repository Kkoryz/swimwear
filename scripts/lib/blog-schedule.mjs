// How often a site publishes from its queue (site.json blogPublish): { days: "daily" | ["mon", "thu", ...], perDay }.
// A site that names nothing publishes one article on Tuesdays. The day is the UTC day the scheduled run starts on
// (deploy/github/blog-publish.yml runs once a day).

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DEFAULT_SCHEDULE = Object.freeze({ days: ['tue'], perDay: 1 });

export function blogSchedule(site = {}) {
  const schedule = { ...DEFAULT_SCHEDULE, ...(site.blogPublish ?? {}) };
  if (schedule.days !== 'daily' && !(Array.isArray(schedule.days) && schedule.days.length && schedule.days.every((day) => DAYS.includes(day)))) throw new Error(`site.json blogPublish.days must be "daily" or a list of ${DAYS.join(', ')}`);
  if (!Number.isInteger(schedule.perDay) || schedule.perDay < 1) throw new Error('site.json blogPublish.perDay must be a whole number of at least 1');
  return { days: schedule.days, perDay: schedule.perDay };
}

export const dueToday = (schedule, now = new Date()) => schedule.days === 'daily' || schedule.days.includes(DAYS[now.getUTCDay()]);
