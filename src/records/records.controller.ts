import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SearchRecordsDto } from './dto/search-records.dto';
import { RecordsService } from './records.service';

@Controller('records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Post('search')
  async search(@Body() dto: SearchRecordsDto) {
    return this.recordsService.search(dto);
  }

  @Get(':recordId/price')
  async getPrice(@Param('recordId') recordId: string) {
    return this.recordsService.getPrice(recordId);
  }

  @Get(':recordId/availability')
  async checkAvailability(@Param('recordId') recordId: string) {
    return this.recordsService.checkAvailability(recordId);
  }
}
