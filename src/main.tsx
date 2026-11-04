import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { installApplicationLogging, reportError } from './logging/logging.ts';

// Order matters: later sheets override earlier ones.
import './styles/style.css';
import './styles/metrics.css';
import './styles/profiles.css';
import './styles/recovery.css';
import './styles/navigation.css';
import './styles/neon.css';
import './styles/layout.css';

installApplicationLogging();

createRoot(document.getElementById('root')!, {
  onUncaughtError: (error, info) =>
    reportError('react_uncaught_error', error, { componentStack: info.componentStack }),
  onRecoverableError: (error, info) =>
    reportError('react_recoverable_error', error, { componentStack: info.componentStack }),
}).render(<App />);
