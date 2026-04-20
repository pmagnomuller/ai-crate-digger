import { Injectable } from '@nestjs/common';
import { RecordsService } from '../../records/records.service';

@Injectable()
export class GetRecordDetailTool {
  constructor(private readonly recordsService: RecordsService) {}

  async run(args: { id: string }) {
    const record = await this.recordsService.findRecordDetailById(args.id);
    if (!record) {
      return { found: false as const, id: args.id };
    }
    return { found: true as const, record };
  }
}
