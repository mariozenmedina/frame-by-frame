import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    canvas: 'src/canvas.ts',
    index: 'src/index.ts',
    types: 'src/types.ts',
    video: 'src/video.ts',
  },
  attw: {
    level: 'error',
    profile: 'esm-only',
  },
  clean: true,
  dts: {
    sourcemap: true,
  },
  format: 'esm',
  minify: false,
  platform: 'browser',
  publint: {
    level: 'error',
  },
  sourcemap: true,
  target: 'es2022',
  treeshake: true,
  tsconfig: 'tsconfig.build.json',
});
