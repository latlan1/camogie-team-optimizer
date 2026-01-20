/**
 * Shared utility functions for CSV parsing and player data handling
 */

import { POSITIONS, type PositionName } from './constants.js';
import type { Player, ModelData } from '../solver/types.js';

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

  if (nameIdx === -1 || ratingIdx === -1) {
    throw new Error('CSV must contain "name" and "rating" columns');
  }

  const players: Player[] = [];
  const ratings: number[] = [];
  const positions: string[] = [];
  const positionIndices: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
    const values = line.split(',');
    if (values.length >= 2) {
      const name = values[nameIdx]?.trim() || `Player ${i}`;
      const rating = parseInt(values[ratingIdx]?.trim(), 10);
      const positionRaw = positionIdx !== -1 ? values[positionIdx]?.trim()?.toLowerCase() : 'unknown';
      const position = (positionRaw || 'unknown') as PositionName;

      if (!isNaN(rating)) {
        const positionConfig = POSITIONS[position] || POSITIONS.unknown;
        players.push({ name, rating, position });
        ratings.push(rating);
        positions.push(position);
        positionIndices.push(positionConfig.index);
      }
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
