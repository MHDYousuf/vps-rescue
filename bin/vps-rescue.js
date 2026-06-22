#!/usr/bin/env node
import('../dist/cli.js').catch((err) => {
  // eslint-disable-next-line no-console
  console.error('vps-rescue failed to start:', err);
  process.exit(1);
});
