// @ts-nocheck
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true,
    },
    {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true,
    },
  ],
  plugins: [
    resolve({
      preferBuiltins: true,
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
    }),
  ],
  external: [
    '@saros-finance/dlmm-sdk',
    '@saros-finance/dlmm-sdk/dist/services',
    '@saros-finance/dlmm-sdk/dist/types',
    '@saros-finance/dlmm-sdk/dist/utils/price',
    '@solana/web3.js',
    'zod',
  ],
};
