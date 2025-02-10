import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Logger } from '@nestjs/common';

const logger = new Logger('PapertrailTest');
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
