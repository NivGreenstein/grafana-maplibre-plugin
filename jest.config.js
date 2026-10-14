// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const { grafanaESModules, nodeModulesToTransform } = require('./.config/jest/utils');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...require('./.config/jest.config'),
  // OpenLayers, MapLibre and their helpers ship ES modules only.
  transformIgnorePatterns: [
    nodeModulesToTransform([
      ...grafanaESModules,
      'ol',
      'rbush',
      'quickselect',
      'earcut',
      'color-space',
      'color-rgba',
      'color-parse',
      'color-name',
    ]),
  ],
};
