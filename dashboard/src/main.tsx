import {
  createRoot,
} from 'react-dom/client';

import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error( '[dashboard] root element not found' );
}

// React Dashboard Rendering
createRoot(rootElement).render(
  <App />,
);