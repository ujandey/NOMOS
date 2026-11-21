import raw from '../../data/evaluated.json';
import { manifestSchema } from './contracts';

export const manifest = manifestSchema.parse(raw);
export const candidates = manifest.candidates;
