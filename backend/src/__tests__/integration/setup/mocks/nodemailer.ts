// Stub — user.model.ts imports helpers/mail.js which requires nodemailer.
// Integration tests don't send email; this prevents the import chain from failing.
export const createTransport = () => ({
  sendMail: async () => ({ messageId: 'test' }),
});
export default { createTransport };
