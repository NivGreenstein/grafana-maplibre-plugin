import CopyWebpackPlugin from 'copy-webpack-plugin';
import path from 'path';
import type { Configuration } from 'webpack';
import { merge } from 'webpack-merge';
import grafanaConfig, { type Env } from './.config/webpack/webpack.config.ts';

const modules = path.resolve(process.cwd(), 'node_modules');
const fork = `${modules}/@nivgreen/maplibre-gl-js-crs84/dist`;

const config = async (env: Env): Promise<Configuration> => {
  const baseConfig = await grafanaConfig(env);
  return merge(baseConfig, {
    plugins: [
      // MapLibre's module worker and the chunk it shares with the main bundle, plus the RTL text plugin.
      new CopyWebpackPlugin({
        patterns: [
          { from: `${fork}/maplibre-gl-worker.mjs`, to: '.' },
          { from: `${fork}/maplibre-gl-shared.mjs`, to: '.' },
          { from: `${modules}/@mapbox/mapbox-gl-rtl-text/dist/mapbox-gl-rtl-text.js`, to: '.' },
        ],
      }),
    ],
  });
};

export default config;
