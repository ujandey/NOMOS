import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import raw from '../data/evaluated.json';
import { manifestSchema } from './core/contracts';
import './styles.css';
import { App } from './App';

const evaluation = manifestSchema.safeParse(raw);
createRoot(document.getElementById('root')!).render(evaluation.success ? <App manifest={evaluation.data} /> :
  <main className="startup-error">
    <h1>Evaluation could not load</h1>
    <p>The bundled dataset failed validation. Reload the workbench or check the evaluation fixture with <code>npm run data:check</code>.</p>
    <button className="primary-button" onClick={() => location.reload()}>Reload workbench</button>
  </main>);
