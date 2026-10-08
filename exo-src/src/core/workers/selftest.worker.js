/** Worker de autoteste do núcleo (Workers.selfTest): soma e devolve um Float32Array transferido. */
import { serve, transfer } from '../workerHost.js';

serve({
  sum({ data, tag }) {
    let s = 0;
    for (let i = 0; i < data.length; i++) s += data[i];
    const echo = new Float32Array(data.length);
    echo.fill(tag);
    return transfer({ sum: s, tag, echo }, [echo.buffer]);
  },
});
