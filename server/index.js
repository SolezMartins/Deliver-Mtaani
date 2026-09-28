import { app } from './app.js';

const port = Number(process.env.PORT || 10000);
const host = '0.0.0.0';

app.listen(port, host, () => {
  console.log(`Deliver Mtaani listening on ${host}:${port}`);
});
