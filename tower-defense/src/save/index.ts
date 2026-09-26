// Stream E entry point: localStorage-backed save store (falls back to memory).
import type { CreateSaveStore } from '../core/interfaces';
import { createSaveStoreWithStorage, getBrowserStorage } from './storage';

export const createSaveStore: CreateSaveStore = () => createSaveStoreWithStorage(getBrowserStorage());
