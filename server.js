const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/version.json', (req, res) => {
  const configSource = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const match = configSource.match(/version:\s*'([^']+)'/);
  const version = match ? match[1] : 'unknown';
  res.set('Cache-Control', 'no-store');
  res.json({ version });
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
