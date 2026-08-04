import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'mon511-api', timestamp: new Date().toISOString() };
  }
}
