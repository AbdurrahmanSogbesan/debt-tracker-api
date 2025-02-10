import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Logger } from '@nestjs/common';

const logger = new Logger('PapertrailTest');
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    logger.log('This is an info log'); // Info log
    logger.warn('This is a warning log'); // Warning log
    logger.error('This is an error log'); // Error log
    return this.appService.getHello();
  }
}
