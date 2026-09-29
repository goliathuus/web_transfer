import './style.css';
import { App } from './ui/app';
import { mountBackdrop } from './ui/backdrop';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app introuvable');

mountBackdrop();

const app = new App(root);
void app.init();
