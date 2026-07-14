import assert from 'node:assert/strict';

const entries = await Promise.all([
  import('@frame-by-frame/core'),
  import('@frame-by-frame/core/video'),
  import('@frame-by-frame/core/canvas'),
  import('@frame-by-frame/core/types'),
]);

for (const entry of entries) {
  assert.deepEqual(Object.keys(entry), []);
}
