import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './ThemeContext';
import { BrandingProvider } from './BrandingContext';
import { DialogProvider } from './components/Dialog';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrandingProvider>
        <App />
        <DialogProvider />
      </BrandingProvider>
    </ThemeProvider>
  </React.StrictMode>
);
