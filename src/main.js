import { route } from './router.js';

window.addEventListener('popstate', route);
window.addEventListener('load', route);
