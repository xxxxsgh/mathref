/**
 * Worker do sistema planet: malhas de chunk, features SDF, profundidade da
 * água e texturas procedurais. Os mesmos handlers rodam no thread principal
 * quando não há Worker (fallback do pool — ver handlers.js).
 */
import { serve } from '../../core/workerHost.js';
import { handlers } from './handlers.js';

serve(handlers);
