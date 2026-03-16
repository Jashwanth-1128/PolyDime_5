import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Handle client-side routing, return all requests to index.html
app.get('*', (req, res) => {
  const indexFile = path.join(__dirname, 'dist', 'index.html');
  res.sendFile(indexFile, (err) => {
    if (err) {
      console.error('Failed to send index.html:', err);
      if (!res.headersSent) {
        res.status(err.code === 'ENOENT' ? 404 : 500).send('Application not available');
      }
    }
  });
});

// Global error handler (prevents unhandled exceptions from crashing the app)
app.use((err, req, res, next) => {
  console.error('Uncaught server error:', err);
  if (!res.headersSent) {
    res.status(500).send('Internal server error');
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});