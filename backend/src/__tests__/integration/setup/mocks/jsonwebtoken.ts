// Stub — user.model.ts imports helpers/token.js which requires jsonwebtoken.
// Integration tests don't exercise JWT; this prevents the import chain from failing.
export const sign = () => 'test-token';
export const verify = () => ({ id: 1 });
export const decode = () => null;
export default { sign, verify, decode };
