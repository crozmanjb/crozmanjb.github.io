/** All flight blocks are 2.5 hours (150 minutes). */
export const BLOCK_DURATION_MIN = 150;

/** Latest start time (minutes from midnight) so the block still ends the same calendar day. */
export const MAX_BLOCK_START_MIN = 24 * 60 - BLOCK_DURATION_MIN;
