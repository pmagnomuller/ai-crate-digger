import { Injectable } from '@nestjs/common';
import { RecordsService } from '../../records/records.service';

@Injectable()
export class CheckAvailabilityTool {
  constructor(private readonly recordsService: RecordsService) {}

  async run(args: { recordId: string }) {
    return this.recordsService.checkAvailability(args.recordId);
  }
}
