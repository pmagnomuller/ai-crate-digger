import { Injectable } from '@nestjs/common';
import { RecordsService } from '../../records/records.service';

@Injectable()
export class GetPriceTool {
  constructor(private readonly recordsService: RecordsService) {}

  async run(args: { recordId: string }) {
    return this.recordsService.getPrice(args.recordId);
  }
}
