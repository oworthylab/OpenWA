export const SERVERLESS_ACCEPTANCE_ENV = 'SERVERLESS_ACCEPTANCE';

export const isServerlessAcceptanceEnabled = process.env[SERVERLESS_ACCEPTANCE_ENV] === 'true';

export const describeServerlessAcceptance = isServerlessAcceptanceEnabled ? describe : describe.skip;