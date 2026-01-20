import express from 'express';
import { MiniZincService } from '../solver/service.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const app = express();
const port = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(resolve('public/index.html'));
});

app.post('/api/solve', async (req, res) => {
  try {
    const { solver = 'gecode', csvData } = req.body;

    // Fallback: if requested solver isn’t available in local install, suggest coinbc
    const preferredSolver = solver;

    if (!csvData) {
      return res.status(400).json({ error: 'CSV data is required' });
    }

    const service = new MiniZincService();
    await service.init({
      minizinc: process.env.MINIZINC_BIN || 'minizinc',
    });

    const modelCode = readFileSync(resolve('./models/team-assignment.mzn'), 'utf8');
    const data = parseCSV(csvData);

    if (!data.position_indices) {
      data.position_indices = data.positions.map((_, idx) => idx + 1);
    }

    const config = {
      solver,
      timeLimit: 10000,
    };

    const result = await service.solve(modelCode, data, config);

    res.json({
      solver,
      mode: service.getMode(),
      result,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Available solvers at /api/solvers`);
});

function parseCSV(csvText: string): any {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.trim());

  const players: any[] = [];
  const ratings: number[] = [];
  const positions: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= 2) {
      const player = values[0].trim();
      const rating = parseInt(values[1].trim(), 10);
      const position = values[2] ? values[2].trim() : 'unknown';

      if (!isNaN(rating)) {
        players.push(player);
        ratings.push(rating);
        positions.push(position);
      }
    }
  }

  return {
    num_players: players.length,
    players: players.map((p, i) => ({ name: p, rating: ratings[i], position: positions[i] })),
    ratings,
    positions,
  };
}
