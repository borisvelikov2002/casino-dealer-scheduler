import { RuleViolationType, type ScheduleViolation } from "./scoring-types";
import type { ScheduleData, DealerAssignment, TimeSlot, DealerWithTables } from "./types";

export const RuleCosts: { [key in RuleViolationType]: number } = {
  [RuleViolationType.CONSECUTIVE_BREAKS]: 1000,
  [RuleViolationType.MIN_WORK_RULE_VIOLATION]: 500,
  [RuleViolationType.TABLE_COVERAGE_GAP]: 1000,
  [RuleViolationType.CONSECUTIVE_TABLE_ASSIGNMENT]: 100,
  [RuleViolationType.TARGET_ROTATION_DEVIATION]: 50,
  [RuleViolationType.TARGET_BREAK_DEVIATION]: 50,
  [RuleViolationType.UNEVEN_BREAK_DISTRIBUTION]: 5, // Adjusted cost
  [RuleViolationType.DEALER_ON_UNAVAILABLE_TABLE]: 1500,
  [RuleViolationType.DEALER_DOUBLE_ASSIGNMENT]: 1500,
  [RuleViolationType.TABLE_COLLISION]: 1000, // Added cost
};

// import type { ScheduleData, DealerAssignment, TimeSlot, DealerWithTables } from "./types"; // Already imported above
// import type { ScheduleViolation } from "./scoring-types"; // Already imported above

const MAX_CONSECUTIVE_TABLE_ASSIGNMENTS = 2; // Example, can be configured
const MIN_SLOTS_FOR_SINGLE_TABLE_BREAK_RULE = 3; // Minimum slots before break if on single table variety

export function calculateScheduleScore(
  schedule: ScheduleData,
  dealers: DealerWithTables[],
  dealerAssignments: Record<string, DealerAssignment>,
  timeSlots: TimeSlot[],
  activeTables: string[], // List of table names that should be active/covered
): { score: number; violations: ScheduleViolation[] } {
  let score = 0;
  const violations: ScheduleViolation[] = [];

  // 1. TABLE_COVERAGE_GAP, TABLE_COLLISION, DEALER_DOUBLE_ASSIGNMENT (slot-based checks)
  timeSlots.forEach((ts, slotIndex) => {
    const assignmentsInSlot = schedule[ts.time] || {};
    const tablesAssignedInThisSlot = new Set<string>();
    const dealersWorkingThisSlot = new Set<string>();

    for (const dealerIdInSlot of Object.keys(assignmentsInSlot)) {
      const assignment = assignmentsInSlot[dealerIdInSlot];
      if (assignment && assignment !== "BREAK" && assignment !== "-") { // It's a table assignment
        // Check for TABLE_COLLISION
        if (tablesAssignedInThisSlot.has(assignment)) {
          const violation: ScheduleViolation = {
            type: RuleViolationType.TABLE_COLLISION,
            timeSlot: ts.time,
            slotIndex,
            cost: RuleCosts[RuleViolationType.TABLE_COLLISION],
            description: `Table ${assignment} double-booked (e.g. by ${dealerIdInSlot}) at ${ts.formattedTime}.`,
            offendingEntity: assignment,
          };
          violations.push(violation);
          score += violation.cost;
        }
        tablesAssignedInThisSlot.add(assignment);

        // Check for DEALER_DOUBLE_ASSIGNMENT (dealer working multiple tables)
        if (dealersWorkingThisSlot.has(dealerIdInSlot)) {
          // This means dealerIdInSlot was already found working another table in this same slot
          const violation: ScheduleViolation = {
            type: RuleViolationType.DEALER_DOUBLE_ASSIGNMENT,
            dealerId: dealerIdInSlot,
            timeSlot: ts.time,
            slotIndex,
            cost: RuleCosts[RuleViolationType.DEALER_DOUBLE_ASSIGNMENT],
            description: `Dealer ${dealerIdInSlot} assigned to multiple tables simultaneously at ${ts.formattedTime}.`,
            offendingEntity: dealerIdInSlot, // Or list the tables if easily accessible
          };
          violations.push(violation);
          score += violation.cost;
        }
        dealersWorkingThisSlot.add(dealerIdInSlot);
      }
    }

    // Check for TABLE_COVERAGE_GAP
    for (const table of activeTables) {
      if (!tablesAssignedInThisSlot.has(table)) {
        const violation: ScheduleViolation = {
          type: RuleViolationType.TABLE_COVERAGE_GAP,
          timeSlot: ts.time,
          slotIndex,
          cost: RuleCosts[RuleViolationType.TABLE_COVERAGE_GAP],
          description: `Table ${table} is not covered at ${ts.formattedTime}.`,
          offendingEntity: table,
        };
        violations.push(violation);
        score += violation.cost;
      }
    }
  });

  // 2. Dealer-specific violations
  for (const dealer of dealers) {
    const da = dealerAssignments[dealer.id];
    if (!da) continue;

    // TARGET_ROTATION_DEVIATION & TARGET_BREAK_DEVIATION
    const rotationDeviation = Math.abs(da.rotations - da.targetRotations);
    if (rotationDeviation > 0) {
      const violation: ScheduleViolation = {
        type: RuleViolationType.TARGET_ROTATION_DEVIATION,
        dealerId: dealer.id,
        cost: rotationDeviation * RuleCosts[RuleViolationType.TARGET_ROTATION_DEVIATION],
        description: `Dealer ${dealer.name} has ${da.rotations} rotations, target ${da.targetRotations}. Deviation: ${rotationDeviation}.`,
      };
      violations.push(violation);
      score += violation.cost;
    }

    const breakDeviation = Math.abs(da.breaks - da.targetBreaks);
    if (breakDeviation > 0) {
      const violation: ScheduleViolation = {
        type: RuleViolationType.TARGET_BREAK_DEVIATION,
        dealerId: dealer.id,
        cost: breakDeviation * RuleCosts[RuleViolationType.TARGET_BREAK_DEVIATION],
        description: `Dealer ${dealer.name} has ${da.breaks} breaks, target ${da.targetBreaks}. Deviation: ${breakDeviation}.`,
      };
      violations.push(violation);
      score += violation.cost;
    }

    // Iterate through schedule slots for this dealer for time-based violations
    let consecutiveTableCount = 0;
    let lastTableWorked: string | null = null;
    let slotsWorkedSinceLastBreak = 0; // Local tracking for min work rule
    let tablesWorkedSinceLastBreak = new Set<string>(); // Local tracking
    let previousSlotWasBreak = true; // Assume start of shift is like after a break

    for (let i = 0; i < timeSlots.length; i++) {
      const ts = timeSlots[i];
      const assignment = schedule[ts.time]?.[dealer.id];

      if (assignment && assignment !== "BREAK" && assignment !== "-") { // Work slot
        // DEALER_ON_UNAVAILABLE_TABLE
        if (!dealer.available_tables.includes(assignment)) {
          const violation: ScheduleViolation = {
            type: RuleViolationType.DEALER_ON_UNAVAILABLE_TABLE,
            dealerId: dealer.id,
            timeSlot: ts.time,
            slotIndex: i,
            cost: RuleCosts[RuleViolationType.DEALER_ON_UNAVAILABLE_TABLE],
            description: `Dealer ${dealer.name} assigned to unavailable table ${assignment} at ${ts.formattedTime}.`,
            offendingEntity: assignment,
          };
          violations.push(violation);
          score += violation.cost;
        }

        // CONSECUTIVE_TABLE_ASSIGNMENT
        if (lastTableWorked === assignment) {
          consecutiveTableCount++;
        } else {
          consecutiveTableCount = 1; // Reset to 1 for the new table
          lastTableWorked = assignment;
        }
        if (consecutiveTableCount > MAX_CONSECUTIVE_TABLE_ASSIGNMENTS) {
          const violation: ScheduleViolation = {
            type: RuleViolationType.CONSECUTIVE_TABLE_ASSIGNMENT,
            dealerId: dealer.id,
            timeSlot: ts.time,
            slotIndex: i,
            cost: RuleCosts[RuleViolationType.CONSECUTIVE_TABLE_ASSIGNMENT],
            description: `Dealer ${dealer.name} worked table ${assignment} ${consecutiveTableCount} times consecutively at ${ts.formattedTime}.`,
            offendingEntity: assignment,
          };
          violations.push(violation);
          score += violation.cost;
        }

        slotsWorkedSinceLastBreak++;
        tablesWorkedSinceLastBreak.add(assignment);
        previousSlotWasBreak = false;

      } else if (assignment === "BREAK") {
        // CONSECUTIVE_BREAKS
        if (previousSlotWasBreak && i > 0) { // Check i > 0 to ensure it's not just the first slot being a break
          const violation: ScheduleViolation = {
            type: RuleViolationType.CONSECUTIVE_BREAKS,
            dealerId: dealer.id,
            timeSlot: ts.time,
            slotIndex: i,
            cost: RuleCosts[RuleViolationType.CONSECUTIVE_BREAKS],
            description: `Dealer ${dealer.name} has consecutive breaks at ${timeSlots[i-1].formattedTime} and ${ts.formattedTime}.`,
          };
          violations.push(violation);
          score += violation.cost;
        }

        // MIN_WORK_RULE_VIOLATION
        if (i > 0 && !previousSlotWasBreak) { // Violated if it's a break, not first slot, and previous wasn't a break
          const isBWB = (i >= 2 && schedule[timeSlots[i-2].time]?.[dealer.id] === "BREAK");

          const minWorkConditionMet =
            (slotsWorkedSinceLastBreak === 1 && tablesWorkedSinceLastBreak.size === 1) ||
            (slotsWorkedSinceLastBreak >= 2 && tablesWorkedSinceLastBreak.size >= 2) ||
            slotsWorkedSinceLastBreak >= MIN_SLOTS_FOR_SINGLE_TABLE_BREAK_RULE;

          if (isBWB && slotsWorkedSinceLastBreak === 1) { // Specific B->W1->B
             const violation: ScheduleViolation = {
              type: RuleViolationType.MIN_WORK_RULE_VIOLATION,
              dealerId: dealer.id,
              timeSlot: ts.time,
              slotIndex: i,
              cost: RuleCosts[RuleViolationType.MIN_WORK_RULE_VIOLATION],
              description: `Dealer ${dealer.name} has B->W1->B violation ending with break at ${ts.formattedTime}. Worked ${slotsWorkedSinceLastBreak} slot(s) on ${tablesWorkedSinceLastBreak.size} table(s).`,
            };
            violations.push(violation);
            score += violation.cost;
          } else if (!minWorkConditionMet && slotsWorkedSinceLastBreak > 0) { // General insufficient work (but not B->B)
             const violation: ScheduleViolation = {
              type: RuleViolationType.MIN_WORK_RULE_VIOLATION,
              dealerId: dealer.id,
              timeSlot: ts.time,
              slotIndex: i,
              cost: RuleCosts[RuleViolationType.MIN_WORK_RULE_VIOLATION] / 2, // Lesser cost for general min work?
              description: `Dealer ${dealer.name} has insufficient work before break at ${ts.formattedTime}. Worked ${slotsWorkedSinceLastBreak} slot(s) on ${tablesWorkedSinceLastBreak.size} table(s).`,
            };
            violations.push(violation);
            score += violation.cost;
          }
        }

        slotsWorkedSinceLastBreak = 0;
        tablesWorkedSinceLastBreak.clear();
        previousSlotWasBreak = true;
        consecutiveTableCount = 0; // Reset for work after break
        lastTableWorked = null;     // Reset for work after break
      } else { // Empty slot, treat as non-work for consecutive counting
        consecutiveTableCount = 0;
        lastTableWorked = null;
        // For min work, if it's an empty slot, it doesn't reset `isFreshOffBreak` like a work slot would.
        // It also doesn't count as work. This state handling can be tricky.
        // Assuming empty slots are filled by breaks eventually by other functions.
        // If an empty slot is encountered, it means the dealer is not working or on break.
        // This shouldn't reset `previousSlotWasBreak` to false unless it's handled as a work-equivalent.
        // For now, if it's not WORK or BREAK, it doesn't contribute to work streak or break streak.
         previousSlotWasBreak = false; // If it's not explicitly a break, it breaks consecutive break chain for this check.
      }
    }
     // UNEVEN_BREAK_DISTRIBUTION
    if (da.breaks > 1 && da.breakPositions.length > 1) {
      const idealSpacing = timeSlots.length / (da.breaks + 1);
      let totalDeviation = 0;
      const actualSortedBreaks = [...da.breakPositions].sort((a, b) => a - b);

      for (let k = 0; k < actualSortedBreaks.length; k++) {
        const idealPosition = idealSpacing * (k + 1);
        totalDeviation += Math.abs(actualSortedBreaks[k] - idealPosition);
      }

      if (totalDeviation > da.breaks * (idealSpacing / 2) ) { // Only penalize if deviation is significant (e.g. > half an idealspacing per break on avg)
        const violation: ScheduleViolation = {
          type: RuleViolationType.UNEVEN_BREAK_DISTRIBUTION,
          dealerId: dealer.id,
          cost: Math.round(totalDeviation * RuleCosts[RuleViolationType.UNEVEN_BREAK_DISTRIBUTION]),
          description: `Dealer ${dealer.name} has uneven break distribution. Total deviation: ${totalDeviation.toFixed(2)}. Ideal spacing: ${idealSpacing.toFixed(2)}`,
        };
        violations.push(violation);
        score += violation.cost;
      }
    }
  }
  return { score, violations };
}
