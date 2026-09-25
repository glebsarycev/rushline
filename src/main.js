// Entry point.
import { App } from './app.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function start() {
  const app = new App(document.getElementById('view'), document.getElementById('ui'));
  window.rushline = app;
  if (!webglAvailable()) {
    app.ui.showError('Rushline needs WebGL, which this browser has turned off. Try a current version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
    return;
  }
  app.init().catch((err) => {
    console.error(err);
    app.ui.showError('The game could not start: ' + (err && err.message ? err.message : err));
  });
}

const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start);
else start();
