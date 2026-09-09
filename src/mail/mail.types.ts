// No attachments field by design: the previous DTO exposed Nodemailer's `path`,
// letting a caller name any file on disk for the server to read and send.
export interface SendEmailOptions {
  recipients: string | string[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  template?: string;
  context?: Record<string, unknown>;
}
