// electron-builder config for the self-update test: the normal config, but the
// update feed points at a local web server, and the version and output folder
// come from environment variables. Used only by scripts/ci/self-update-test.mjs.
const base = require('../../package.json').build

const version = process.env.SELFUPDATE_VERSION
const output = process.env.SELFUPDATE_OUT
if (!version || !output) throw new Error('Set SELFUPDATE_VERSION and SELFUPDATE_OUT')

module.exports = {
  ...base,
  extraMetadata: { version },
  directories: { ...base.directories, output },
  publish: [{ provider: 'generic', url: 'http://127.0.0.1:8765/' }]
}
