const WEEK_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_ORDER = new Map(WEEK_DAYS.map((day,index)=>[day,index]));

/**
 * Calculates a faculty member's scheduled load against their configured limits.
 *
 * Weekly capacity is the sum of the daily class limit, capped by usable timetable
 * slots, across at most maxWorkingDays of the faculty's available days. Period
 * availability excludes breaks, holidays supplied by the caller, and the
 * faculty member's unavailableSlots. Missing configuration is never guessed.
 */
export function calculateFacultyWorkloadCapacity({
  classes = 0,
  periods = 0,
  maxWorkingDays = 0,
  maxClassesPerDay = 0,
  availableDays = [],
  unavailableSlots = [],
  dailyMap = new Map(),
  usableSlots = []
} = {}) {
  const scheduledClasses = Math.max(0, Number(classes) || 0);
  const scheduledPeriods = Math.max(0, Number(periods) || 0);
  const workingDayLimit = Math.max(0, Number(maxWorkingDays) || 0);
  const dailyClassLimit = Math.max(0, Number(maxClassesPerDay) || 0);
  const capacityConfigured = workingDayLimit > 0 && dailyClassLimit > 0;
  const orderSlots = Array.isArray(usableSlots) ? usableSlots.filter(Boolean) : [];
  const scheduleDays = [...new Set(orderSlots.map(slot => String(slot.day || "")))]
    .filter(Boolean)
    .sort((a,b)=>(DAY_ORDER.get(a) ?? 99)-(DAY_ORDER.get(b) ?? 99));
  const facultyAvailableDays = Array.isArray(availableDays) && availableDays.length
    ? availableDays.map(String).filter(day => scheduleDays.includes(day))
    : scheduleDays;
  const blocked = new Set(Array.isArray(unavailableSlots) ? unavailableSlots : []);
  const periodsByDay = new Map();

  for (const day of facultyAvailableDays) {
    const count = orderSlots.filter(slot =>
      String(slot.day) === day &&
      !blocked.has(`${slot.day}|${slot.startTime}-${slot.endTime}`)
    ).length;
    periodsByDay.set(day,count);
  }

  const possibleDays = [...periodsByDay.entries()]
    .filter(([,count])=>count>0)
    .sort((a,b)=>b[1]-a[1]||(DAY_ORDER.get(a[0])??99)-(DAY_ORDER.get(b[0])??99));
  const availablePeriods = [...periodsByDay.values()].reduce((sum,count)=>sum+count,0);
  const capacityDays = capacityConfigured
    ? possibleDays.slice(0,Math.min(workingDayLimit,possibleDays.length))
    : [];
  const capacityClasses = capacityConfigured
    ? capacityDays.reduce((sum,[,slotCount])=>sum+Math.min(dailyClassLimit,slotCount),0)
    : null;
  const capacityUtilization = capacityClasses>0
    ? Number((scheduledClasses/capacityClasses*100).toFixed(1))
    : null;

  let loadStatus = "LIMITS_NOT_CONFIGURED";
  if (capacityConfigured) {
    if (!(capacityClasses>0)) loadStatus = "NO_AVAILABLE_CAPACITY";
    else if (scheduledClasses>capacityClasses) loadStatus = "OVER_CAPACITY";
    else if (capacityUtilization>=85) loadStatus = "NEAR_CAPACITY";
    else if (capacityUtilization<40) loadStatus = "LOW_UTILIZATION";
    else loadStatus = "WITHIN_CAPACITY";
  }

  const dailyBreakdown = WEEK_DAYS.map(day => {
    const current = dailyMap instanceof Map
      ? dailyMap.get(day)
      : Array.isArray(dailyMap) ? dailyMap.find(item=>item.day===day) : null;
    const dailyPeriods = Math.max(0,Number(current?.periods)||0);
    const dailyClasses = Math.max(0,Number(current?.classes)||0);
    const dayAvailablePeriods = periodsByDay.get(day)||0;
    const dailyCapacity = capacityConfigured && facultyAvailableDays.includes(day)
      ? Math.min(dailyClassLimit,dayAvailablePeriods)
      : null;
    const dailyUtilization = dailyCapacity>0
      ? Number((dailyClasses/dailyCapacity*100).toFixed(1))
      : null;
    return {
      day,
      classes:dailyClasses,
      periods:dailyPeriods,
      availablePeriods:dayAvailablePeriods,
      freePeriods:Math.max(0,dayAvailablePeriods-dailyPeriods),
      capacityClasses:dailyCapacity,
      capacityUtilization:dailyUtilization
    };
  });

  return {
    capacityConfigured,
    maxClassesPerDay:capacityConfigured?dailyClassLimit:null,
    maxWorkingDays:capacityConfigured?workingDayLimit:null,
    capacityClasses,
    capacityUtilization,
    loadStatus,
    availablePeriods,
    freePeriods:Math.max(0,availablePeriods-scheduledPeriods),
    dailyBreakdown
  };
}
