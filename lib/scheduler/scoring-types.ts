export enum RuleViolationType {
  CONSECUTIVE_BREAKS = "CONSECUTIVE_BREAKS",
  MIN_WORK_RULE_VIOLATION = "MIN_WORK_RULE_VIOLATION", // Covers B->W1->B and insufficient work
  CONSECUTIVE_TABLE_ASSIGNMENT = "CONSECUTIVE_TABLE_ASSIGNMENT",
  UNEVEN_BREAK_DISTRIBUTION = "UNEVEN_BREAK_DISTRIBUTION",
  TARGET_ROTATION_DEVIATION = "TARGET_ROTATION_DEVIATION",
  TARGET_BREAK_DEVIATION = "TARGET_BREAK_DEVIATION",
  TABLE_COVERAGE_GAP = "TABLE_COVERAGE_GAP", // When a table that should be active has no dealer
  DEALER_ON_UNAVAILABLE_TABLE = "DEALER_ON_UNAVAILABLE_TABLE", // Dealer assigned to a table they cannot work
  DEALER_DOUBLE_ASSIGNMENT = "DEALER_DOUBLE_ASSIGNMENT", // Dealer assigned to multiple work items (e.g. two tables) in one slot
  TABLE_COLLISION = "TABLE_COLLISION", // Multiple dealers assigned to the same table in the same slot
}

export interface ScheduleViolation {
  type: RuleViolationType;
  dealerId?: string; // Optional: some violations are schedule-wide (e.g. TABLE_COVERAGE_GAP)
  timeSlot?: string; // Time identifier (e.g., "00:00")
  slotIndex?: number; // Index of the slot
  cost: number;
  description: string;
  offendingEntity?: string; // e.g., table name for coverage gap, or second table for double assignment
}
