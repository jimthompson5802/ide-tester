import { executeCLI } from './cli.js';

// Invoking this command is the operator's explicit request for one GUI qualification.
process.exitCode = await executeCLI(process.argv.slice(2), undefined, true);
