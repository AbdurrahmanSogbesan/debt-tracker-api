export interface SendMailConfig {
  from?: string;
  recipients: string | string[];
  subject: string;
  text?: string;
  html?: string;
  template?: string;
  context?: any;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: string | Buffer;
    contentType?: string;
  }>;
}
