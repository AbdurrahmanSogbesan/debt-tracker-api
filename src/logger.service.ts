import { Injectable, LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { Syslog } from 'winston-syslog';

@Injectable()
export class PapertrailLogger implements LoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
      }),
    ];

    // Only add Papertrail transport in production
    if (process.env.NODE_ENV === 'production') {
      const papertrailTransport = new Syslog({
        host: process.env.PAPERTRAIL_HOST,
        port: Number(process.env.PAPERTRAIL_PORT),
        protocol: 'udp',
        app_name: 'nestjs-app',
        level: 'debug',
        facility: 'local0',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ level, message, timestamp }) => {
            return `${timestamp} ${level}: ${message}`;
          }),
        ),
      });

      // Basic error handling for production debugging
      papertrailTransport.on('error', (err) => {
        console.error('Papertrail connection error:', err.message);
      });

      transports.push(papertrailTransport);
    }

    this.logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
          return `${timestamp} ${level}: ${message}`;
        }),
      ),
      transports,
    });
  }

  log(message: string) {
    this.logger.info(message);
  }

  error(message: string, trace?: string) {
    this.logger.error({ message, trace });
  }

  warn(message: string) {
    this.logger.warn(message);
  }

  debug?(message: string) {
    this.logger.debug(message);
  }
}
