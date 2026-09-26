// Stream A entry point: the real simulation.
import type { CreateSimulation } from '../core/interfaces';
import { createSimulationWithOptions } from './simulation';

export const createSimulation: CreateSimulation = (events) => createSimulationWithOptions(events);

export { createSimulationWithOptions, type SimulationHandle, type SimulationOptions } from './simulation';
export { createSeededRng, type Rng } from './rng';
