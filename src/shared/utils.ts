/**
 * Shared utility functions for CSV parsing and player data handling
 */

import { POSITIONS, type PositionName } from './constants.js';
import type { Player, ModelData } from '../solver/types.js';

const TOTAL_SEASON_WEEKS = 7;

export function validateCSVForScenario(
  headers: string[],
  scenarioId: string
): { valid: boolean; error?: string } {
  const normalized = headers.map((h) => h.trim().toLowerCase());

  if (scenarioId === 'expected_active_skill' || scenarioId === 'expected_active_skill_mip') {
    const hasExperience = normalized.includes('experience');
    const hasAttendanceWeeks = normalized.includes('attendance_weeks');
    const hasPosition = normalized.includes('position');

    if (!hasExperience || !hasAttendanceWeeks || !hasPosition) {
      return {
        valid: false,
        error:
          'This scenario requires columns: name, experience, attendance_weeks, position',
      };
    }
    return { valid: true };
  }

  if (scenarioId === 'active_skill_plus') {
    const hasName = normalized.includes('name');
    const hasExperience = normalized.includes('experience');
    const hasAttendanceWeeks = normalized.includes('attendance_weeks');
    const hasPosition = normalized.includes('position');
    const hasCaptain = normalized.includes('captain');
    const hasFriendGroup = normalized.includes('friend_group_id');

    if (
      !hasName ||
      !hasExperience ||
      !hasAttendanceWeeks ||
      !hasPosition ||
      !hasCaptain ||
      !hasFriendGroup
    ) {
      return {
        valid: false,
        error:
          'This scenario requires columns: name, experience, attendance_weeks, position, captain, friend_group_id',
      };
    }

    return { valid: true };
  }

  if (scenarioId === 'with_positions' || scenarioId === 'balanced_positions') {
    const hasName = normalized.includes('name');
    const hasRating = normalized.includes('rating');
    const hasExperience = normalized.includes('experience');
    const hasPosition = normalized.includes('position');

    if (!hasName || (!hasRating && !hasExperience) || !hasPosition) {
      return {
        valid: false,
        error:
          'This scenario requires columns: name, rating (or experience), position',
      };
    }
    return { valid: true };
  }

  const hasName = normalized.includes('name');
  const hasRating = normalized.includes('rating');
  const hasExperience = normalized.includes('experience');

  if (!hasName || (!hasRating && !hasExperience)) {
    return {
      valid: false,
      error:
        'This scenario requires columns: name and rating (or experience). Position is optional for ratings_only and required for position-based scenarios.',
    };
  }

  return { valid: true };
}

/**
 * Parse CSV text into player data for MiniZinc models
 */
export function parseCSV(csvText: string): ModelData & { players: Player[] } {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header and one data row');
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const nameIdx = headers.indexOf('name');
  const ratingIdx = headers.indexOf('rating');
  const positionIdx = headers.indexOf('position');
  const experienceIdx = headers.indexOf('experience');
  const attendanceWeeksIdx = headers.indexOf('attendance_weeks');
  const captainIdx = headers.indexOf('captain');
  const friendGroupIdx = headers.indexOf('friend_group_id');

  if (nameIdx === -1) {
    throw new Error('CSV must contain a "name" column');
  }

  const hasNewFormat = experienceIdx !== -1 && attendanceWeeksIdx !== -1;
  const hasOldFormat = ratingIdx !== -1;

  if (!hasNewFormat && !hasOldFormat) {
    throw new Error(
      'CSV must contain either "rating" (old format) or "experience" and "attendance_weeks" (new format)'
    );
  }

  const players: Player[] = [];
  const ratings: number[] = [];
  const positions: string[] = [];
  const positionIndices: number[] = [];
  const experiences: number[] = [];
  const attendances: number[] = [];
  const isCaptain: number[] = [];
  const friendGroupIds: number[] = [];
  const highAttendanceFlags: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
    const values = line.split(',');
    if (values.length >= 2) {
      const name = values[nameIdx]?.trim() || `Player ${i}`;
      const positionRaw = positionIdx !== -1 ? values[positionIdx]?.trim()?.toLowerCase() : 'unknown';
      const position = (positionRaw || 'unknown') as PositionName;

      let rating: number;
      let experience: number | undefined;
      let attendanceWeeks: number | undefined;
      let attendanceProbability: number | undefined;
      let experienceCategory: Player['experienceCategory'];
      let attendanceCategory: Player['attendanceCategory'];
      let activeSkill: number | undefined;
      let playerIsCaptain: boolean | undefined;
      let playerFriendGroupId: number | undefined;
      let highAttendance: boolean | undefined;

      if (hasNewFormat) {
        const parsedExperience = parseInt(values[experienceIdx]?.trim(), 10);
        const parsedAttendanceWeeks = parseInt(values[attendanceWeeksIdx]?.trim(), 10);
        if (isNaN(parsedExperience) || isNaN(parsedAttendanceWeeks)) {
          continue;
        }

        experience = Math.max(1, Math.min(10, parsedExperience));
        attendanceWeeks = Math.max(0, Math.min(TOTAL_SEASON_WEEKS, parsedAttendanceWeeks));
        attendanceProbability = attendanceWeeks / TOTAL_SEASON_WEEKS;
        experienceCategory =
          experience <= 3 ? 'novice' : experience <= 7 ? 'intermediate' : 'veteran';
        attendanceCategory =
          attendanceProbability <= 3 / TOTAL_SEASON_WEEKS
            ? 'low'
            : attendanceProbability <= 5 / TOTAL_SEASON_WEEKS
              ? 'mid'
              : 'high';
        activeSkill = Number((experience * attendanceProbability).toFixed(2));
        rating = experience;

        const captainRaw = captainIdx >= 0 ? values[captainIdx]?.trim()?.toLowerCase() : '';
        playerIsCaptain = captainRaw === '1' || captainRaw === 'true' || captainRaw === 'yes';
        playerFriendGroupId = friendGroupIdx >= 0 ? parseInt(values[friendGroupIdx]?.trim(), 10) : 0;
        if (isNaN(playerFriendGroupId ?? 0)) {
          playerFriendGroupId = 0;
        }
        highAttendance = attendanceWeeks >= 6;

        experiences.push(experience * 10);
        attendances.push(Math.round(attendanceProbability * 100));
        isCaptain.push(playerIsCaptain ? 1 : 0);
        friendGroupIds.push(playerFriendGroupId ?? 0);
        highAttendanceFlags.push(highAttendance ? 1 : 0);
      } else {
        rating = parseInt(values[ratingIdx]?.trim(), 10);
        if (isNaN(rating)) {
          continue;
        }
      }

      const positionConfig = POSITIONS[position] || POSITIONS.unknown;
      players.push({
        name,
        rating,
        position,
        experience,
        attendanceWeeks,
        attendanceProbability,
        experienceCategory,
        attendanceCategory,
        activeSkill,
        isCaptain: playerIsCaptain,
        friendGroupId: playerFriendGroupId,
        highAttendance,
      });
      ratings.push(rating);
      positions.push(position);
      positionIndices.push(positionConfig.index);
    }
  }

  if (players.length === 0) {
    throw new Error('No valid player data found in CSV');
  }

  return {
    num_players: players.length,
    players,
    ratings,
    positions,
    position_indices: positionIndices,
    ...(hasNewFormat
      ? {
          experiences,
          attendances,
          is_captain: isCaptain,
          friend_group_ids: friendGroupIds,
          high_attendance_flags: highAttendanceFlags,
        }
      : {}),
  };
}

/**
 * Sort players by position (defense first, then midfield, then forward) then alphabetically by name
 */
export function sortPlayersByPosition(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    const posA = POSITIONS[a.position as PositionName]?.sortOrder ?? 99;
    const posB = POSITIONS[b.position as PositionName]?.sortOrder ?? 99;
    if (posA !== posB) return posA - posB;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Split players into teams based on assignment array
 */
export function splitIntoTeams(
  players: Player[],
  assignment: number[]
): { teamA: Player[]; teamB: Player[] } {
  const teamA: Player[] = [];
  const teamB: Player[] = [];

  assignment.forEach((team, idx) => {
    if (idx < players.length) {
      if (team === 0) {
        teamA.push(players[idx]);
      } else {
        teamB.push(players[idx]);
      }
    }
  });

  return { teamA, teamB };
}

/**
 * Count positions in a team
 */
export function countPositions(players: Player[]): Record<PositionName, number> {
  const counts: Record<string, number> = {
    forward: 0,
    midfield: 0,
    defense: 0,
    unknown: 0,
  };

  for (const player of players) {
    const pos = player.position?.toLowerCase() || 'unknown';
    if (pos in counts) {
      counts[pos]++;
    } else {
      counts.unknown++;
    }
  }

  return counts as Record<PositionName, number>;
}

/**
 * Calculate total rating for a team
 */
export function calculateTotalRating(players: Player[]): number {
  return players.reduce((sum, p) => sum + p.rating, 0);
}

/**
 * Format player for display
 */
export function formatPlayer(player: Player, index: number): string {
  return `  ${(index + 1).toString().padStart(2)}. ${player.name.padEnd(20)} | ${player.position.padEnd(8)} | Rating: ${player.rating}`;
}

/**
 * Format team summary for display
 */
export function formatTeamSummary(
  players: Player[],
  teamName: string,
  totalRating: number
): string {
  const sorted = sortPlayersByPosition(players);
  const lines = [`${teamName} (${totalRating} rating points):`];
  sorted.forEach((p, i) => lines.push(formatPlayer(p, i)));
  return lines.join('\n');
}
